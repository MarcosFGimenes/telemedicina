import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import {
  ASAAS_PAID_STATUSES,
  ASAAS_PENDING_STATUSES,
  getAsaasSubscription,
  listPaymentsOfSubscription,
  type AsaasPaymentSummary,
} from '@/lib/asaasService';
import { getPlan } from '@/lib/plansStore';

const usersCollection = db.collection('users');

const normalizeStatus = (value?: string) => String(value || '').toUpperCase();

const digitsOnly = (value?: string | null) => (value ?? '').replace(/\D/g, '');

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
  const decoded = (await adminAuth.verifyIdToken(token)) as DecodedIdToken & Record<string, unknown>;
  return decoded;
};

const resolveUserSnapshot = async (options: {
  decoded: DecodedIdToken & Record<string, unknown>;
  isAdmin: boolean;
  userId?: string | null;
  beneficiaryUuid?: string | null;
  cpf?: string | null;
}) => {
  const { decoded, isAdmin } = options;
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

  if (options.userId) {
    const doc = await usersCollection.doc(options.userId).get();
    if (!doc.exists) {
      throw Object.assign(new Error('user-not-found'), { statusCode: 404 });
    }
    return doc;
  }

  if (options.beneficiaryUuid) {
    const snap = await usersCollection
      .where('beneficiaryUuid', '==', options.beneficiaryUuid)
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0];
    }
  }

  if (options.cpf) {
    const digits = digitsOnly(options.cpf);
    if (digits) {
      const snap = await usersCollection.where('cpf', '==', digits).limit(1).get();
      if (!snap.empty) {
        return snap.docs[0];
      }
    }
  }

  throw Object.assign(new Error('user-not-found'), { statusCode: 404 });
};

const buildBlockingSummary = (payments: AsaasPaymentSummary[]) => {
  return payments
    .filter((payment) => pendingStatus(payment.status))
    .map((payment) => ({
      id: payment.id,
      status: normalizeStatus(payment.status),
      dueDate: payment.dueDate ?? null,
      value: payment.value ?? null,
    }));
};

export async function GET(req: NextRequest) {
  try {
    const decoded = await ensureToken(req);
    const isAdmin = hasAdminClaim(decoded);

    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const beneficiaryUuid = url.searchParams.get('beneficiaryUuid');
    const cpfParam = url.searchParams.get('cpf');

    if (!isAdmin && (userId || beneficiaryUuid || cpfParam)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const userSnap = await resolveUserSnapshot({
      decoded,
      isAdmin,
      userId,
      beneficiaryUuid,
      cpf: cpfParam,
    });

    const userData = userSnap.data() || {};
    const asaasCustomerId = String(userData.asaasCustomerId || '').trim();

    let subscriptionId = String(userData.lastSubscriptionId || '').trim();
    if (!subscriptionId) {
      const subscriptions = Array.isArray(userData.subscriptionIds)
        ? userData.subscriptionIds
        : [];
      if (subscriptions.length > 0) {
        subscriptionId = String(subscriptions[0] || '').trim();
      }
    }

    if (!asaasCustomerId || !subscriptionId) {
      return NextResponse.json(
        {
          canChange: false,
          reason: 'subscription_not_found',
          message: 'Nenhuma assinatura ativa foi encontrada para este beneficiário.',
        },
        { status: 404 },
      );
    }

    let subscription;
    try {
      subscription = await getAsaasSubscription(subscriptionId);
    } catch (error) {
      console.error('[plan/change/status][asaas][subscription]', subscriptionId, error);
      return NextResponse.json(
        {
          canChange: false,
          reason: 'asaas_subscription_error',
          message: 'Não foi possível consultar a assinatura na Asaas.',
        },
        { status: 502 },
      );
    }

    let payments: AsaasPaymentSummary[] = [];
    try {
      payments = await listPaymentsOfSubscription(subscriptionId);
    } catch (error) {
      console.error('[plan/change/status][asaas][payments]', subscriptionId, error);
      return NextResponse.json(
        {
          canChange: false,
          reason: 'asaas_payments_error',
          message: 'Não foi possível consultar as cobranças desta assinatura.',
        },
        { status: 502 },
      );
    }

    const hasPaid = payments.some((payment) => paidStatus(payment.status));
    const blockingPayments = buildBlockingSummary(payments);
    const canChange = hasPaid && blockingPayments.length === 0;

    const storedServiceType = String(userData.serviceType || '').trim().toUpperCase() || null;
    const currentPlanIdRaw = String(userData.planId || storedServiceType || '').trim().toUpperCase();
    const currentPlanNameRaw = String(userData.planName || '').trim();
    let effectivePlanId = currentPlanIdRaw;
    let currentPlanName = currentPlanNameRaw;
    let currentPlanValue: number | null = null;
    let currentPlanServiceType: string | null = storedServiceType;
    let currentPlanDescription: string | null = typeof userData.planDescription === 'string' ? String(userData.planDescription).trim() : null;

    if (currentPlanIdRaw) {
      try {
        const plan = await getPlan(currentPlanIdRaw);
        if (plan) {
          effectivePlanId = plan.id;
          currentPlanName = plan.name;
          currentPlanValue = plan.value;
          currentPlanServiceType = plan.serviceType || plan.id;
          currentPlanDescription = plan.description || null;
        }
      } catch (error) {
        console.warn('[plan/change/status][plan]', currentPlanIdRaw, error);
      }
    }

    if (currentPlanValue == null && typeof subscription?.value === 'number') {
      currentPlanValue = subscription.value;
    }
    if (currentPlanValue == null && typeof userData.planValue === 'number') {
      currentPlanValue = Number(userData.planValue);
    }

    const beneficiaryUuidStored =
      beneficiaryUuid ||
      (typeof userData.beneficiaryUuid === 'string' ? userData.beneficiaryUuid.trim() : '');

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
      currentPlanId: effectivePlanId || null,
      currentPlanName: currentPlanName || null,
      currentPlanValue,
      currentPlanServiceType,
      currentPlanDescription,
      subscriptionStatus: subscription?.status ?? null,
      nextDueDate: subscription?.nextDueDate ?? null,
      beneficiaryUuid: beneficiaryUuidStored || null,
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
      console.error('[plan/change/status]', error);
    }
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
