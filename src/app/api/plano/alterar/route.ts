import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import {
  ASAAS_PAID_STATUSES,
  ASAAS_PENDING_STATUSES,
  getAsaasSubscription,
  listPaymentsOfSubscription,
  updateAsaasSubscription,
} from '@/lib/asaasService';
import { getPlan } from '@/lib/plansStore';
import {
  rapidocFindByCpf,
  rapidocGetBeneficiary,
  rapidocUpdateBeneficiary,
} from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord } from '@/utils/beneficiary';

type PlanChangeTarget = {
  userId?: string;
  beneficiaryUuid?: string;
  cpf?: string;
};

type PlanChangeRequest = {
  newPlanId: string;
  updatePendingPayments?: boolean;
  reason?: string;
  target?: PlanChangeTarget;
};

const usersCollection = db.collection('users');
const planChangeLogs = db.collection('planChangeLogs');

const normalizeStatus = (value?: string) => String(value || '').toUpperCase();

const digitsOnly = (value?: string | null) => (value ?? '').replace(/\D/g, '');

const dependentUuidKeys = [
  'uuid',
  'id',
  'beneficiaryUuid',
  'beneficiaryId',
  'dependentUuid',
  'dependentId',
  'codigo',
  'code',
];

const dependentNestedKeys = ['beneficiary', 'beneficiario', 'dependente', 'dependent', 'data', 'payload', 'result', 'item'];

const dependentContainerKeys = [
  'items',
  'content',
  'dependents',
  'dependentes',
  'dependentsList',
  'dependentesList',
  'beneficiaries',
  'records',
  'results',
  'list',
  'children',
  'entries',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const trimString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const pickStringFrom = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = trimString(record[key]);
    if (value) {
      return value;
    }
  }
  return '';
};

const unwrapDependentRecord = (record: Record<string, unknown>) => {
  for (const key of dependentNestedKeys) {
    const nested = record[key];
    if (isRecord(nested)) {
      return nested;
    }
  }
  return record;
};

const extractDependentUuid = (record: Record<string, unknown>) => {
  const flattened = unwrapDependentRecord(record);
  const direct = pickStringFrom(flattened, dependentUuidKeys);
  if (direct) {
    return direct;
  }
  return pickStringFrom(record, dependentUuidKeys);
};

const collectDependentIdentifiers = async (options: {
  userData: Record<string, unknown>;
  beneficiaryUuid?: string | null;
}): Promise<{ uuids: string[]; docRefs: DocumentReference[] }> => {
  const { userData, beneficiaryUuid } = options;
  const uuids = new Set<string>();
  const docRefs = new Set<DocumentReference>();

  const add = (value?: string) => {
    const trimmed = trimString(value);
    if (!trimmed) {
      return;
    }
    if (beneficiaryUuid && trimmed === beneficiaryUuid) {
      return;
    }
    uuids.add(trimmed);
  };

  const collectFromValue = (value: unknown) => {
    if (!value) {
      return;
    }
    if (typeof value === 'string') {
      add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectFromValue(item);
      }
      return;
    }
    if (isRecord(value)) {
      const uuid = extractDependentUuid(value);
      if (uuid) {
        add(uuid);
      }
      for (const key of dependentContainerKeys) {
        if (key in value) {
          collectFromValue((value as Record<string, unknown>)[key]);
        }
      }
    }
  };

  collectFromValue(userData.dependentUuids);
  collectFromValue(userData.dependents);
  collectFromValue(userData.rapidocDependents);

  if (isRecord(userData.rapidocSnapshot)) {
    const snapshot = userData.rapidocSnapshot as Record<string, unknown>;
    collectFromValue(snapshot.dependents);
    collectFromValue(snapshot.dependentes);
    collectFromValue(snapshot.items);
    collectFromValue(snapshot.content);
    collectFromValue(snapshot.records);
    collectFromValue(snapshot.results);
  }

  const ownerUid = trimString(userData.authUid);
  if (ownerUid) {
    const snapshot = await db.collection('dependents').where('ownerUid', '==', ownerUid).get();
    for (const doc of snapshot.docs) {
      docRefs.add(doc.ref);
      const data = doc.data() as Record<string, unknown>;
      const uuid = trimString(data.uuid);
      if (uuid) {
        add(uuid);
      }
    }
  }

  return { uuids: Array.from(uuids), docRefs: Array.from(docRefs) };
};

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
  target?: PlanChangeTarget;
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

const ensureBeneficiaryUuid = async (userData: Record<string, unknown>) => {
  const stored =
    typeof userData.beneficiaryUuid === 'string' ? userData.beneficiaryUuid.trim() : '';
  if (stored) {
    return stored;
  }

  const cpf = digitsOnly(
    typeof userData.cpf === 'string' ? userData.cpf : typeof userData.document === 'string' ? userData.document : '',
  );
  if (!cpf) {
    return '';
  }

  try {
    const record = await rapidocFindByCpf(cpf);
    if (record && typeof record.uuid === 'string') {
      return record.uuid.trim();
    }
  } catch (error) {
    console.warn('[plan/change] unable to resolve beneficiary uuid by cpf', error);
  }

  return '';
};

const buildRapidocPayload = (
  existing: Record<string, unknown> | null,
  overrides: Record<string, unknown>,
  fallbackCpf: string,
) => {
  if (!existing) {
    const payload: Record<string, unknown> = { ...overrides };
    if (fallbackCpf) {
      payload.cpf = fallbackCpf;
    }
    return payload;
  }

  const normalized = normalizeBeneficiaryRecord(existing, fallbackCpf);
  const payload: Record<string, unknown> = {
    name: normalized.name,
    birthday: normalized.birthday || null,
    phone: normalized.phone || null,
    email: normalized.email || null,
    zipCode: normalized.zipCode || null,
    address: normalized.address || null,
    city: normalized.city || null,
    state: normalized.state || null,
    paymentType: normalized.paymentType || overrides.paymentType || 'S',
    serviceType: overrides.serviceType,
    holder: overrides.holder || normalized.raw?.holder || fallbackCpf || null,
    general: overrides.general || normalized.raw?.general || null,
  };

  if (fallbackCpf) {
    payload.cpf = fallbackCpf;
  }

  return payload;
};

const syncDependentServiceTypes = async (options: {
  dependentUuids: string[];
  serviceType: string;
  paymentType?: string;
  holderDigits?: string;
  generalInfo?: string;
}) => {
  const { dependentUuids, serviceType, paymentType, holderDigits, generalInfo } = options;
  const failures: { uuid: string; reason: string }[] = [];

  for (const uuid of dependentUuids) {
    try {
      const existing = await rapidocGetBeneficiary(uuid);
      if (!existing) {
        continue;
      }
      const fallbackCpf = digitsOnly(
        typeof (existing as any).cpf === 'string'
          ? (existing as any).cpf
          : typeof (existing as any).document === 'string'
          ? (existing as any).document
          : '',
      );
      const payload = buildRapidocPayload(
        existing,
        {
          serviceType,
          paymentType: paymentType || undefined,
          holder: holderDigits || undefined,
          general: generalInfo || undefined,
        },
        fallbackCpf,
      );
      await rapidocUpdateBeneficiary(uuid, payload);
    } catch (error) {
      failures.push({
        uuid,
        reason: error instanceof Error && error.message ? error.message : 'unknown_error',
      });
      console.error('[plan/change][dependents][rapidoc]', uuid, error);
    }
  }

  return { failures };
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

export async function POST(req: NextRequest) {
  try {
    const decoded = await ensureToken(req);
    const isAdmin = hasAdminClaim(decoded);
    const body = (await req.json()) as PlanChangeRequest;

    const target = body.target;
    if (!isAdmin && target) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const newPlanId = (body.newPlanId || '').trim().toUpperCase();
    if (!newPlanId) {
      return NextResponse.json({ error: 'newPlanId is required' }, { status: 400 });
    }

    const plan = await getPlan(newPlanId);
    if (!plan) {
      return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
    }
    const planServiceType = plan.serviceType || plan.id;

    const userSnap = await resolveUserSnapshot({ decoded, isAdmin, target });
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
        { error: 'subscription_not_found', message: 'Não foi possível localizar uma assinatura ativa.' },
        { status: 404 },
      );
    }

    const previousPlanId = String(userData.planId || '').trim().toUpperCase();
    const previousPlanName = String(userData.planName || '').trim();
    const previousPlanServiceType = String(userData.serviceType || '').trim().toUpperCase() || null;

    if (previousPlanId === plan.id) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        message: 'O plano selecionado já está ativo para este beneficiário.',
      });
    }

    let subscription;
    try {
      subscription = await getAsaasSubscription(subscriptionId);
    } catch (error) {
      console.error('[plan/change][asaas][subscription]', subscriptionId, error);
      return NextResponse.json(
        { error: 'asaas_subscription_error', message: 'Falha ao consultar assinatura atual.' },
        { status: 502 },
      );
    }

    let payments = [];
    try {
      payments = await listPaymentsOfSubscription(subscriptionId);
    } catch (error) {
      console.error('[plan/change][asaas][payments]', subscriptionId, error);
      return NextResponse.json(
        { error: 'asaas_payments_error', message: 'Não foi possível consultar as cobranças do plano.' },
        { status: 502 },
      );
    }

    const hasPaid = payments.some((payment) => paidStatus(payment.status));
    const blockingInvoices = summarizeBlocking(payments);
    if (!hasPaid) {
      return NextResponse.json(
        {
          error: 'no_paid_invoice',
          message: 'É necessário possuir ao menos uma cobrança paga antes de trocar o plano.',
        },
        { status: 409 },
      );
    }
    if (blockingInvoices.length > 0) {
      return NextResponse.json(
        {
          error: 'pending_invoices',
          message: 'Existem cobranças pendentes. Regularize-as antes de alterar o plano.',
          blockingInvoices,
        },
        { status: 409 },
      );
    }

    const updatePendingPayments = body.updatePendingPayments !== false;
    let updatedSubscription;
    try {
      updatedSubscription = await updateAsaasSubscription(subscriptionId, {
        value: plan.value,
        description: plan.name,
        nextDueDate: subscription?.nextDueDate,
        updatePendingPayments,
      });
    } catch (error) {
      console.error('[plan/change][asaas][update]', subscriptionId, error);
      return NextResponse.json(
        { error: 'asaas_update_failed', message: 'Falha ao atualizar a assinatura na Asaas.' },
        { status: 502 },
      );
    }

    const beneficiaryUuid =
      (typeof userData.beneficiaryUuid === 'string' ? userData.beneficiaryUuid.trim() : '') ||
      (target?.beneficiaryUuid ?? '') ||
      (await ensureBeneficiaryUuid(userData));

    const cpfDigits = digitsOnly(
      typeof userData.cpf === 'string'
        ? userData.cpf
        : typeof target?.cpf === 'string'
        ? target?.cpf
        : decoded?.cpf,
    );

    const paymentType = String(userData.paymentType || '').trim().toUpperCase();
    const holderDigits = digitsOnly(
      typeof userData.holder === 'string'
        ? userData.holder
        : typeof userData.document === 'string'
        ? userData.document
        : cpfDigits,
    );
    const generalInfo = typeof userData.general === 'string' ? userData.general : '';

    let dependentUuids: string[] = [];
    let dependentDocRefs: DocumentReference[] = [];
    try {
      const collected = await collectDependentIdentifiers({ userData, beneficiaryUuid });
      dependentUuids = collected.uuids;
      dependentDocRefs = collected.docRefs;
    } catch (error) {
      console.warn('[plan/change][dependents][collect]', error);
    }

    if (beneficiaryUuid) {
      try {
        const existing = await rapidocGetBeneficiary(beneficiaryUuid);
        const rapidocPayload = buildRapidocPayload(
          existing,
          {
            serviceType: planServiceType,
            paymentType: paymentType || undefined,
            holder: holderDigits || undefined,
            general: generalInfo || undefined,
          },
          cpfDigits,
        );
        await rapidocUpdateBeneficiary(beneficiaryUuid, rapidocPayload);
      } catch (error) {
        console.error('[plan/change][rapidoc][update]', beneficiaryUuid, error);
        return NextResponse.json(
          { error: 'rapidoc_update_failed', message: 'Não foi possível atualizar o beneficiário no prontuario clinico.' },
          { status: 502 },
        );
      }
    }

    if (planServiceType && dependentUuids.length) {
      const { failures } = await syncDependentServiceTypes({
        dependentUuids,
        serviceType: planServiceType,
        paymentType: paymentType || undefined,
        holderDigits: holderDigits || undefined,
        generalInfo: generalInfo || undefined,
      });
      if (failures.length) {
        return NextResponse.json(
          {
            error: 'dependent_update_failed',
            message: 'Não foi possível atualizar os dependentes no prontuario clinico.',
            failedDependents: failures,
          },
          { status: 502 },
        );
      }
    }

    const changeTimestamp = new Date();

    if (planServiceType && dependentDocRefs.length) {
      const syncResults = await Promise.allSettled(
        dependentDocRefs.map((ref) =>
          ref.set({ serviceType: planServiceType, planServiceType, updatedAt: changeTimestamp }, { merge: true }),
        ),
      );
      syncResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn('[plan/change][dependents][firestore]', dependentDocRefs[index].path, result.reason);
        }
      });
    }

    const updates: Record<string, unknown> = {
      planId: plan.id,
      planName: plan.name,
      planDescription: plan.description || '',
      serviceType: planServiceType,
      planServiceType,
      lastPlanChangeAt: changeTimestamp,
      lastPlanChangeBy: decoded.uid,
      planValue: plan.value,
      updatedAt: changeTimestamp,
    };

    if (planServiceType && dependentUuids.length) {
      updates.dependentServiceTypeSyncedAt = changeTimestamp;
      updates.dependentServiceTypeCount = dependentUuids.length;
    }

    await userSnap.ref.update(updates);

    try {
      await planChangeLogs.add({
        userId: userSnap.id,
        beneficiaryUuid: beneficiaryUuid || null,
        previousPlanId: previousPlanId || null,
        previousPlanName: previousPlanName || null,
        previousPlanServiceType,
        previousPlanValue: typeof userData.planValue === 'number' ? userData.planValue : null,
        newPlanId: plan.id,
        newPlanName: plan.name,
        newPlanServiceType: planServiceType,
        newPlanValue: plan.value,
        updatePendingPayments,
        subscriptionId,
        customerId: asaasCustomerId,
        changedByUid: decoded.uid,
        changedByEmail: decoded.email || null,
        changedByRole: isAdmin ? 'admin' : 'subscriber',
        changedAt: changeTimestamp,
        reason: body.reason || null,
        dependentSyncCount: dependentUuids.length,
      });
    } catch (error) {
      console.warn('[plan/change][log]', error);
    }

    return NextResponse.json({
      ok: true,
      subscriptionId,
      plan: { id: plan.id, serviceType: planServiceType, name: plan.name, value: plan.value },
      message: 'Plano atualizado com sucesso. As próximas cobranças refletirão o novo valor.',
      subscriptionStatus: updatedSubscription?.status ?? null,
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
      console.error('[plan/change]', error);
    }
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
