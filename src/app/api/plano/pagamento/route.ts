import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import {
  ASAAS_PAID_STATUSES,
  ASAAS_PENDING_STATUSES,
  getAsaasSubscription,
  listPaymentsOfSubscription,
  updateAsaasSubscription,
} from '@/lib/asaasService';

const usersCollection = db.collection('users');
const paymentLogs = db.collection('paymentMethodChangeLogs');

const digitsOnly = (value?: string | null) => (value ?? '').replace(/\D/g, '');
const normalizeStatus = (value?: string) => String(value || '').toUpperCase();
const paidStatus = (status?: string) => ASAAS_PAID_STATUSES.has(normalizeStatus(status));
const pendingStatus = (status?: string) => ASAAS_PENDING_STATUSES.has(normalizeStatus(status));

const hasAdminClaim = (decoded: DecodedIdToken & Record<string, unknown>) =>
  decoded.admin === true ||
  decoded.role === 'ADMIN' ||
  decoded.role === 'admin' ||
  decoded['custom:role'] === 'admin' ||
  decoded['x-admin'] === true;

const ensureToken = async (req: NextRequest) => {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) {
    throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
  }
  return (await adminAuth.verifyIdToken(token)) as DecodedIdToken & Record<string, unknown>;
};

const resolveUserSnapshot = async (options: {
  decoded: DecodedIdToken & Record<string, unknown>;
  isAdmin: boolean;
  target?: { userId?: string | null; beneficiaryUuid?: string | null; cpf?: string | null } | null;
}) => {
  const { decoded, isAdmin, target } = options;
  if (!isAdmin || !target) {
    let snap = await usersCollection.where('authUid', '==', decoded.uid).limit(1).get();
    if (snap.empty && decoded.email) {
      snap = await usersCollection.where('email', '==', decoded.email).limit(1).get();
    }
    if (snap.empty) {
      throw Object.assign(new Error('user-not-found'), { statusCode: 404 });
    }
    return snap.docs[0];
  }

  if (target.userId) {
    const doc = await usersCollection.doc(target.userId).get();
    if (!doc.exists) {
      throw Object.assign(new Error('user-not-found'), { statusCode: 404 });
    }
    return doc;
  }

  if (target.beneficiaryUuid) {
    const snap = await usersCollection
      .where('beneficiaryUuid', '==', target.beneficiaryUuid)
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0];
    }
  }

  if (target.cpf) {
    const digits = digitsOnly(target.cpf);
    if (digits) {
      const snap = await usersCollection.where('cpf', '==', digits).limit(1).get();
      if (!snap.empty) {
        return snap.docs[0];
      }
    }
  }

  throw Object.assign(new Error('user-not-found'), { statusCode: 404 });
};

const summarizeBlocking = (payments: any[]) =>
  payments
    .filter((payment) => pendingStatus(payment.status))
    .map((payment) => ({
      id: payment.id,
      status: normalizeStatus(payment.status),
      dueDate: payment.dueDate ?? null,
      value: payment.value ?? null,
    }));

const ALLOWED_BILLING_TYPES = new Set(['PIX', 'BOLETO', 'CREDIT_CARD']);

export async function POST(req: NextRequest) {
  try {
    const decoded = await ensureToken(req);
    const isAdmin = hasAdminClaim(decoded);
    const body = (await req.json()) as {
      newBillingType?: string;
      target?: { userId?: string; beneficiaryUuid?: string; cpf?: string } | null;
    };

    const newBillingTypeRaw = (body.newBillingType || '').trim().toUpperCase();
    if (!newBillingTypeRaw) {
      return NextResponse.json({ error: 'newBillingType is required' }, { status: 400 });
    }
    if (!ALLOWED_BILLING_TYPES.has(newBillingTypeRaw)) {
      return NextResponse.json({ error: 'billing_type_not_supported' }, { status: 400 });
    }

    if (!isAdmin && body.target) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const userSnap = await resolveUserSnapshot({ decoded, isAdmin, target: body.target ?? null });
    const userData = userSnap.data() || {};

    let subscriptionId = String(userData.lastSubscriptionId || '').trim();
    if (!subscriptionId) {
      const subscriptions = Array.isArray(userData.subscriptionIds)
        ? userData.subscriptionIds
        : [];
      if (subscriptions.length > 0) {
        subscriptionId = String(subscriptions[0] || '').trim();
      }
    }
    const asaasCustomerId = String(userData.asaasCustomerId || '').trim();

    if (!subscriptionId || !asaasCustomerId) {
      return NextResponse.json(
        {
          error: 'subscription_not_found',
          message: 'Não foi possível localizar uma assinatura ativa.',
        },
        { status: 404 },
      );
    }

    let subscription;
    try {
      subscription = await getAsaasSubscription(subscriptionId);
    } catch (error) {
      console.error('[payment/change][subscription]', subscriptionId, error);
      return NextResponse.json(
        {
          error: 'asaas_subscription_error',
          message: 'Não foi possível consultar a assinatura na Asaas.',
        },
        { status: 502 },
      );
    }

    let payments: any[] = [];
    try {
      payments = await listPaymentsOfSubscription(subscriptionId);
    } catch (error) {
      console.error('[payment/change][payments]', subscriptionId, error);
      return NextResponse.json(
        {
          error: 'asaas_payments_error',
          message: 'Não foi possível consultar as cobranças na Asaas.',
        },
        { status: 502 },
      );
    }

    const hasPaid = payments.some((payment) => paidStatus(payment.status));
    const blockingInvoices = summarizeBlocking(payments);
    if (!hasPaid) {
      return NextResponse.json(
        {
          error: 'no_paid_invoice',
          message:
            'É necessário possuir ao menos uma cobrança paga antes de alterar a forma de pagamento.',
        },
        { status: 409 },
      );
    }
    if (blockingInvoices.length > 0) {
      return NextResponse.json(
        {
          error: 'pending_invoices',
          message: 'Existem cobranças pendentes. Regularize-as para liberar a alteração.',
          blockingInvoices,
        },
        { status: 409 },
      );
    }

    const currentBillingType = subscription?.billingType
      ? String(subscription.billingType).toUpperCase()
      : typeof userData.paymentType === 'string'
      ? String(userData.paymentType).toUpperCase()
      : null;

    if (currentBillingType === newBillingTypeRaw) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        message: 'A forma de pagamento selecionada já está ativa.',
        billingType: currentBillingType,
      });
    }

    if (newBillingTypeRaw === 'CREDIT_CARD' && currentBillingType !== 'CREDIT_CARD') {
      return NextResponse.json(
        {
          error: 'credit_card_not_supported',
          message: 'Para ativar cobranças por cartão, entre em contato com o suporte.',
        },
        { status: 409 },
      );
    }

    try {
      await updateAsaasSubscription(subscriptionId, {
        billingType: newBillingTypeRaw,
        updatePendingPayments: true,
        creditCardToken: null,
        creditCard: null,
      });
    } catch (error) {
      console.error('[payment/change][asaas/update]', subscriptionId, error);
      return NextResponse.json(
        {
          error: 'asaas_update_failed',
          message: 'Não foi possível atualizar a assinatura na Asaas.',
        },
        { status: 502 },
      );
    }

    const updates: Record<string, unknown> = {
      paymentType: newBillingTypeRaw,
      billingType: newBillingTypeRaw,
      lastPaymentMethodChangeAt: new Date(),
      lastPaymentMethodChangeBy: decoded.uid,
      updatedAt: new Date(),
    };
    await userSnap.ref.update(updates);

    try {
      await paymentLogs.add({
        userId: userSnap.id,
        subscriptionId,
        customerId: asaasCustomerId,
        previousBillingType: currentBillingType || null,
        newBillingType: newBillingTypeRaw,
        blockingInvoices,
        changedByUid: decoded.uid,
        changedByEmail: decoded.email || null,
        changedByRole: isAdmin ? 'admin' : 'subscriber',
        changedAt: new Date(),
      });
    } catch (error) {
      console.warn('[payment/change][log]', error);
    }

    return NextResponse.json({
      ok: true,
      billingType: newBillingTypeRaw,
      message: `Forma de pagamento atualizada com sucesso. As próximas cobranças virão via ${newBillingTypeRaw}.`,
    });
  } catch (error: any) {
    const statusCode =
      typeof error?.statusCode === 'number'
        ? error.statusCode
        : typeof error?.status === 'number'
        ? error.status
        : 500;
    const message =
      typeof error?.message === 'string' && error.message ? error.message : 'unexpected_error';
    if (statusCode >= 500) {
      console.error('[payment/change]', error);
    }
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
