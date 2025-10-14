import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import {
  ASAAS_PAID_STATUSES,
  ASAAS_PENDING_STATUSES,
  getAsaasSubscription,
  listPaymentsOfSubscription,
} from '@/lib/asaasService';

const usersCollection = db.collection('users');

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
  userId?: string | null;
  beneficiaryUuid?: string | null;
  cpf?: string | null;
}) => {
  const { decoded, isAdmin, userId, beneficiaryUuid, cpf } = options;

  if (!isAdmin) {
    let snap = await usersCollection.where('authUid', '==', decoded.uid).limit(1).get();
    if (snap.empty && decoded.email) {
      snap = await usersCollection.where('email', '==', decoded.email).limit(1).get();
    }
    if (snap.empty) {
      throw Object.assign(new Error('user-not-found'), { statusCode: 404 });
    }
    return snap.docs[0];
  }

  if (userId) {
    const doc = await usersCollection.doc(userId).get();
    if (!doc.exists) {
      throw Object.assign(new Error('user-not-found'), { statusCode: 404 });
    }
    return doc;
  }

  if (beneficiaryUuid) {
    const snap = await usersCollection
      .where('beneficiaryUuid', '==', beneficiaryUuid)
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0];
    }
  }

  if (cpf) {
    const digits = digitsOnly(cpf);
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

export async function GET(req: NextRequest) {
  try {
    const decoded = await ensureToken(req);
    const isAdmin = hasAdminClaim(decoded);

    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const beneficiaryUuid = url.searchParams.get('beneficiaryUuid');
    const cpf = url.searchParams.get('cpf');

    if (!isAdmin && (userId || beneficiaryUuid || cpf)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const userSnap = await resolveUserSnapshot({ decoded, isAdmin, userId, beneficiaryUuid, cpf });
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
          canChange: false,
          reason: 'subscription_not_found',
          message: 'Não encontramos uma assinatura ativa para este beneficiário.',
        },
        { status: 404 },
      );
    }

    let subscription;
    try {
      subscription = await getAsaasSubscription(subscriptionId);
    } catch (error) {
      console.error('[payment/change/status][subscription]', subscriptionId, error);
      return NextResponse.json(
        {
          canChange: false,
          reason: 'asaas_subscription_error',
          message: 'Não foi possível consultar a assinatura na Asaas.',
        },
        { status: 502 },
      );
    }

    let payments: any[] = [];
    try {
      payments = await listPaymentsOfSubscription(subscriptionId);
    } catch (error) {
      console.error('[payment/change/status][payments]', subscriptionId, error);
      return NextResponse.json(
        {
          canChange: false,
          reason: 'asaas_payments_error',
          message: 'Não foi possível consultar as cobranças na Asaas.',
        },
        { status: 502 },
      );
    }

    const hasPaid = payments.some((payment) => paidStatus(payment.status));
    const blockingPayments = summarizeBlocking(payments);
    const canChange = hasPaid && blockingPayments.length === 0;

    const subscriptionBillingType = subscription?.billingType
      ? String(subscription.billingType).toUpperCase()
      : null;
    const storedPaymentType = typeof userData.paymentType === 'string'
      ? String(userData.paymentType).toUpperCase()
      : null;

    return NextResponse.json({
      canChange,
      reason: canChange
        ? null
        : !hasPaid
        ? 'no_paid_invoice'
        : 'pending_invoices',
      hasPaidInvoice: hasPaid,
      blockingPayments,
      subscriptionId,
      customerId: asaasCustomerId,
      currentBillingType: subscriptionBillingType || storedPaymentType || null,
      subscriptionStatus: subscription?.status ?? null,
      nextDueDate: subscription?.nextDueDate ?? null,
      availableBillingTypes: ['PIX', 'BOLETO', 'CREDIT_CARD'],
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
      console.error('[payment/change/status]', error);
    }
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
