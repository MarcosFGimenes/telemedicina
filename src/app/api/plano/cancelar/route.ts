import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { endOfDay, isWeekend, lastDayOfMonth, subDays } from 'date-fns';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import {
  findCustomerByCpf,
  listPaymentsOfSubscription,
  listSubscriptionsByCustomer,
  updateSubscriptionStatus,
  type AsaasPaymentSummary,
  type AsaasSubscription,
} from '@/lib/asaasService';
import { rapidocFindByCpf } from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord } from '@/utils/beneficiary';
import { isValidCpf } from '@/utils/format';

const paidStatuses = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'RECEIVED_PIX']);
const pendingStatuses = new Set(['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS', 'AWAITING_CHARGEBACK_REVERSAL']);

type DependentSummary = {
  uuid: string;
  name?: string | null;
  cpf?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readHint = (error: unknown) => {
  if (isRecord(error) && typeof error.hint === 'string') {
    return error.hint;
  }
  return '';
};

const readMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'unexpected_error';

const readStatusCode = (error: unknown) => {
  if (isRecord(error) && typeof error.status === 'number') {
    return error.status;
  }
  return null;
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  return null;
};

const asRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
};

const hasAdminClaim = (decoded: DecodedIdToken & Record<string, unknown>) =>
  decoded.admin === true ||
  decoded.role === 'admin' ||
  decoded['custom:role'] === 'admin' ||
  decoded['x-admin'] === true;

const checkAdmin = async (decoded: DecodedIdToken & Record<string, unknown>) => {
  if (hasAdminClaim(decoded)) {
    return true;
  }
  const snap = await db.collection('users').where('authUid', '==', decoded.uid).limit(1).get();
  if (!snap.empty) {
    const data = snap.docs[0].data() as Record<string, unknown>;
    if (data.role === 'admin' || data.isAdmin === true) {
      return true;
    }
  }
  return false;
};

const requireAuth = async (req: NextRequest) => {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) {
    throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
  }
  const decoded = (await adminAuth.verifyIdToken(token)) as DecodedIdToken & Record<string, unknown>;
  return decoded;
};

const parseDueDateParts = (dueDate?: string) => {
  if (!dueDate) return null;
  const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }
  return { year, month, raw: dueDate };
};

const ensureCurrentMonthPaid = (
  payments: AsaasPaymentSummary[],
  reference: { year: number; month: number },
) => {
  let paid = false;
  let blocking: AsaasPaymentSummary | null = null;

  for (const payment of payments) {
    const parts = parseDueDateParts(payment.dueDate);
    if (!parts) {
      continue;
    }
    if (parts.year !== reference.year || parts.month !== reference.month) {
      continue;
    }
    const status = String(payment.status || '').toUpperCase();
    if (paidStatuses.has(status)) {
      paid = true;
      blocking = null;
      break;
    }
    if (!blocking) {
      blocking = payment;
    }
  }

  return { paid, blocking };
};

const lastBusinessDay = (reference: Date) => {
  let cursor = lastDayOfMonth(reference);
  while (isWeekend(cursor)) {
    cursor = subDays(cursor, 1);
  }
  return cursor;
};

const monthKey = (reference: Date) => `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}`;

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

const dependentNameKeys = ['name', 'fullName', 'beneficiaryName', 'dependentName', 'nome'];

const dependentCpfKeys = ['cpf', 'document', 'documentNumber', 'holder', 'holderCpf'];

const trimString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const pickStringFrom = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = trimString(record[key]);
    if (value) {
      return value;
    }
  }
  return '';
};

const unwrapNestedRecord = (record: Record<string, unknown>) => {
  for (const key of ['beneficiary', 'beneficiario', 'data', 'payload', 'result', 'item']) {
    const nested = record[key];
    if (isRecord(nested)) {
      return nested;
    }
  }
  return record;
};

const parseDependentRecord = (record: Record<string, unknown>): DependentSummary | null => {
  const flattened = unwrapNestedRecord(record);
  const uuid =
    pickStringFrom(flattened, dependentUuidKeys) ||
    pickStringFrom(record, dependentUuidKeys);
  if (!uuid) {
    return null;
  }
  const name = pickStringFrom(flattened, dependentNameKeys) || pickStringFrom(record, dependentNameKeys) || null;
  const cpfRaw = pickStringFrom(flattened, dependentCpfKeys) || pickStringFrom(record, dependentCpfKeys) || '';
  const cpfDigits = cpfRaw.replace(/\D/g, '') || null;
  return {
    uuid,
    name,
    cpf: cpfDigits,
  };
};

const normalizeDependentList = (value: unknown): DependentSummary[] => {
  const list = asRecordArray(value);
  const parsed = list
    .map((item) => parseDependentRecord(item))
    .filter((item): item is DependentSummary => Boolean(item?.uuid));
  return parsed;
};

const mergeDependents = (lists: DependentSummary[][]): DependentSummary[] => {
  const merged = new Map<string, DependentSummary>();
  for (const list of lists) {
    for (const entry of list) {
      if (!entry.uuid) {
        continue;
      }
      const existing = merged.get(entry.uuid);
      if (!existing) {
        merged.set(entry.uuid, entry);
        continue;
      }
      const name = existing.name || entry.name || null;
      const cpf = existing.cpf || entry.cpf || null;
      if (name !== existing.name || cpf !== existing.cpf) {
        merged.set(entry.uuid, { uuid: entry.uuid, name, cpf });
      }
    }
  }
  return Array.from(merged.values());
};

const fetchOwnerDependents = async (ownerUid: string | null): Promise<DependentSummary[]> => {
  if (!ownerUid) {
    return [];
  }
  const snapshot = await db.collection('dependents').where('ownerUid', '==', ownerUid).get();
  const items: DependentSummary[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const uuid = trimString(data?.uuid);
    if (!uuid) {
      continue;
    }
    const name = trimString(data?.name) || null;
    const cpfRaw = trimString(data?.cpf);
    const cpf = cpfRaw ? cpfRaw.replace(/\D/g, '') : null;
    items.push({ uuid, name, cpf });
  }
  return items;
};

export async function POST(req: NextRequest) {
  let decoded: DecodedIdToken & Record<string, unknown>;
  try {
    decoded = await requireAuth(req);
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode || 401;
    return NextResponse.json({ error: 'unauthorized' }, { status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const rawCpf = typeof body?.cpf === 'string' ? body.cpf : '';
  const cpfDigits = rawCpf.replace(/\D/g, '');
  const rawBeneficiaryUuid = typeof body?.beneficiaryUuid === 'string' ? body.beneficiaryUuid : '';
  const beneficiaryUuidFromBody = rawBeneficiaryUuid.trim();

  if (rawCpf && !isValidCpf(cpfDigits)) {
    return NextResponse.json({ error: 'invalid_cpf' }, { status: 400 });
  }

  const users = db.collection('users');
  let userSnap = cpfDigits
    ? await users.where('cpf', '==', cpfDigits).limit(1).get()
    : null;

  if ((!userSnap || userSnap.empty) && beneficiaryUuidFromBody) {
    userSnap = await users.where('beneficiaryUuid', '==', beneficiaryUuidFromBody).limit(1).get();
  }

  if (!userSnap || userSnap.empty) {
    userSnap = await users.where('authUid', '==', decoded.uid).limit(1).get();
    if (userSnap.empty && decoded.email) {
      userSnap = await users.where('email', '==', decoded.email).limit(1).get();
    }
  }

  if (!userSnap || userSnap.empty) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  const userDoc = userSnap.docs[0];
  const userData = userDoc.data() as Record<string, unknown>;
  const userId = userDoc.id;

  const ownerUid = typeof userData.authUid === 'string' ? userData.authUid : null;
  const isOwner = ownerUid ? ownerUid === decoded.uid : false;
  if (!isOwner) {
    const allowed = await checkAdmin(decoded).catch(() => false);
    if (!allowed) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  let resolvedCpf = cpfDigits;
  if (!resolvedCpf && typeof userData.cpf === 'string') {
    resolvedCpf = userData.cpf.replace(/\D/g, '');
  }

  if (!resolvedCpf || !isValidCpf(resolvedCpf)) {
    return NextResponse.json({ error: 'invalid_cpf' }, { status: 400 });
  }

  let beneficiaryRecord: Record<string, unknown> | null = null;
  try {
    const found = await rapidocFindByCpf(resolvedCpf);
    if (found && typeof found === 'object') {
      beneficiaryRecord = found as Record<string, unknown>;
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      beneficiaryRecord = null;
    } else {
      const hint = readHint(error);
      const status = readStatusCode(error) || 502;
      const message = readMessage(error);
      if (hint === 'rapidoc-cpf-failed') {
        return NextResponse.json({ error: 'rapidoc_lookup_failed', message }, { status });
      }
      console.error('[plano/cancelar][rapidoc]', error);
      return NextResponse.json({ error: 'rapidoc_lookup_failed', message }, { status });
    }
  }

  if (!beneficiaryRecord) {
    return NextResponse.json({ error: 'beneficiary_not_found' }, { status: 404 });
  }

  const normalizedBeneficiary = normalizeBeneficiaryRecord(beneficiaryRecord, resolvedCpf);
  const beneficiaryUuid = normalizedBeneficiary.uuid?.trim();

  if (!beneficiaryUuid) {
    return NextResponse.json({ error: 'beneficiary_missing_uuid' }, { status: 409 });
  }

  if (beneficiaryUuidFromBody && beneficiaryUuidFromBody !== beneficiaryUuid) {
    return NextResponse.json({ error: 'beneficiary_mismatch' }, { status: 409 });
  }

  const storedBeneficiaryUuid =
    typeof userData.beneficiaryUuid === 'string' ? userData.beneficiaryUuid.trim() : '';

  const rapidocDependents = normalizeDependentList(normalizedBeneficiary.dependents);
  const storedRapidocDependents = normalizeDependentList(userData['rapidocDependents']);
  const storedDependents = normalizeDependentList(userData['dependents']);
  const linkedDependentUuids: DependentSummary[] = Array.isArray(userData['dependentUuids'])
    ? (userData['dependentUuids'] as unknown[])
        .map((value) => trimString(value))
        .filter(Boolean)
        .map((uuid) => ({ uuid }))
    : [];
  let ownerDependents: DependentSummary[] = [];
  try {
    ownerDependents = await fetchOwnerDependents(ownerUid);
  } catch (error) {
    console.error('[plano/cancelar][dependents][firestore]', error);
  }
  const allDependents = mergeDependents([
    rapidocDependents,
    storedRapidocDependents,
    storedDependents,
    linkedDependentUuids,
    ownerDependents,
  ]);

  const cancellationRaw = isRecord(userData.planCancellation)
    ? (userData.planCancellation as Record<string, unknown>)
    : null;
  const cancellationStatus =
    typeof cancellationRaw?.status === 'string' ? cancellationRaw.status.trim().toLowerCase() : '';

  if (cancellationStatus === 'scheduled') {
    const effective = toDate(cancellationRaw?.effectiveDate) ?? toDate(cancellationRaw?.runAt);
    return NextResponse.json(
      {
        ok: true,
        alreadyScheduled: true,
        effectiveDate: effective ? effective.toISOString() : null,
        message: 'O cancelamento já está agendado e será efetivado no fim do mês.',
      },
      { status: 200 },
    );
  }

  if (cancellationStatus === 'completed') {
    return NextResponse.json({ error: 'already_cancelled' }, { status: 409 });
  }

  let asaasCustomerId = '';
  let asaasCustomer: Awaited<ReturnType<typeof findCustomerByCpf>> | null = null;
  try {
    asaasCustomer = await findCustomerByCpf(resolvedCpf);
  } catch (error) {
    console.error('[plano/cancelar][asaas][customer]', error);
    const message = readMessage(error);
    return NextResponse.json({ error: 'asaas_lookup_failed', message }, { status: 502 });
  }

  if (asaasCustomer) {
    asaasCustomerId = asaasCustomer.id;
  } else if (typeof userData.asaasCustomerId === 'string') {
    asaasCustomerId = userData.asaasCustomerId.trim();
  }

  if (!asaasCustomerId) {
    return NextResponse.json({ error: 'asaas_customer_not_found' }, { status: 404 });
  }

  let subscriptions: AsaasSubscription[] = [];
  try {
    subscriptions = await listSubscriptionsByCustomer(asaasCustomerId, 'ACTIVE');
  } catch (error) {
    console.error('[plano/cancelar][asaas][subscriptions]', error);
    const message = readMessage(error);
    return NextResponse.json({ error: 'asaas_subscriptions_failed', message }, { status: 502 });
  }

  const activeSubscriptions = subscriptions.filter(
    (subscription) => String(subscription?.status || '').toUpperCase() === 'ACTIVE',
  );

  if (!activeSubscriptions.length) {
    return NextResponse.json({ error: 'no_active_subscription' }, { status: 404 });
  }

  let subscriptionPayments: { subscription: AsaasSubscription; payments: AsaasPaymentSummary[] }[] = [];
  try {
    subscriptionPayments = await Promise.all(
      activeSubscriptions.map(async (subscription) => ({
        subscription,
        payments: await listPaymentsOfSubscription(subscription.id),
      })),
    );
  } catch (error) {
    console.error('[plano/cancelar][asaas][payments]', error);
    const message = readMessage(error);
    return NextResponse.json({ error: 'asaas_payments_failed', message }, { status: 502 });
  }

  const now = new Date();
  const reference = { year: now.getFullYear(), month: now.getMonth() + 1 };

  for (const entry of subscriptionPayments) {
    const { paid, blocking } = ensureCurrentMonthPaid(entry.payments, reference);
    if (!paid) {
      const status = String(blocking?.status || '').toUpperCase() || 'PENDING';
      const dueDate = blocking?.dueDate || null;
      const blockingStatus = pendingStatuses.has(status) ? status : status || 'PENDING';
      const message = dueDate
        ? `A fatura com vencimento em ${dueDate} está com status ${blockingStatus}. Pague-a antes de solicitar o cancelamento.`
        : 'Não encontramos uma fatura paga para o mês corrente. Efetue o pagamento antes de solicitar o cancelamento.';
      return NextResponse.json(
        {
          error: 'invoice_pending',
          subscriptionId: entry.subscription.id,
          dueDate,
          status: blockingStatus,
          message,
        },
        { status: 409 },
      );
    }
  }

  let suspended: AsaasSubscription[] = [];
  try {
    suspended = await Promise.all(
      activeSubscriptions.map((subscription) => updateSubscriptionStatus(subscription.id, 'INACTIVE')),
    );
  } catch (error) {
    console.error('[plano/cancelar][asaas][suspend]', error);
    const message = readMessage(error);
    return NextResponse.json({ error: 'asaas_suspend_failed', message }, { status: 502 });
  }

  const subscriptionIds = activeSubscriptions.map((subscription) => subscription.id);
  const subscriptionSnapshots = activeSubscriptions.map((subscription) => {
    const updated = suspended.find((item) => item.id === subscription.id);
    return {
      id: subscription.id,
      previousStatus: subscription.status,
      currentStatus: updated?.status ?? 'INACTIVE',
    };
  });

  const effectiveDay = endOfDay(lastBusinessDay(now));
  const requestedAt = now;
  const referenceKey = monthKey(now);

  const dependentActions = allDependents.map((dependent) => ({
    uuid: dependent.uuid,
    action: 'DELETE',
    endpoint: `/beneficiaries/${dependent.uuid}`,
    name: dependent.name ?? null,
    cpf: dependent.cpf ?? null,
  }));

  const tasks = db.collection('planCancellationTasks');
  const taskPayload: Record<string, unknown> = {
    userId,
    userUid: ownerUid || decoded.uid,
    cpf: resolvedCpf,
    beneficiaryUuid,
    subscriptionIds,
    customerId: asaasCustomerId,
    status: 'pending',
    runAt: effectiveDay,
    executeAfter: effectiveDay,
    requestedAt,
    updatedAt: requestedAt,
    rapidoc: {
      action: 'DELETE',
      endpoint: `/beneficiaries/${beneficiaryUuid}`,
    },
  };

  if (dependentActions.length) {
    taskPayload.rapidocDependents = dependentActions;
    taskPayload.dependentUuids = dependentActions.map((dependent) => dependent.uuid);
  }

  let taskId = typeof cancellationRaw?.taskId === 'string' ? cancellationRaw.taskId.trim() : '';

  if (taskId) {
    await tasks.doc(taskId).set(taskPayload, { merge: true });
  } else {
    const createdTask = await tasks.add({ ...taskPayload, createdAt: requestedAt });
    taskId = createdTask.id;
  }

  const userUpdates: Record<string, unknown> = {
    updatedAt: requestedAt,
    planCancellation: {
      status: 'scheduled',
      requestedAt,
      effectiveDate: effectiveDay,
      runAt: effectiveDay,
      monthReference: referenceKey,
      asaasCustomerId,
      subscriptionIds,
      subscriptions: subscriptionSnapshots,
      taskId,
      beneficiaryUuid,
      cpf: resolvedCpf,
    },
  };

  if (dependentActions.length) {
    userUpdates.planCancellation = {
      ...(userUpdates.planCancellation as Record<string, unknown>),
      dependents: dependentActions,
      dependentUuids: dependentActions.map((dependent) => dependent.uuid),
    };
  }

  if (!storedBeneficiaryUuid && beneficiaryUuid) {
    userUpdates.beneficiaryUuid = beneficiaryUuid;
  }

  if (!userData.asaasCustomerId && asaasCustomerId) {
    userUpdates.asaasCustomerId = asaasCustomerId;
  }

  await userDoc.ref.set(userUpdates, { merge: true });

  return NextResponse.json({
    ok: true,
    status: 'scheduled',
    effectiveDate: effectiveDay.toISOString(),
    message: 'Seu plano permanecerá ativo até o último dia útil do mês. Após essa data, o beneficiário será inativado.',
  });
}
