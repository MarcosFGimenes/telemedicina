import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import { getAsaasCustomer } from '@/lib/asaasService';
import { getPlan } from '@/lib/plansStore';
import { buildBeneficiaryPayload, type BeneficiaryUserRecord } from '@/lib/beneficiaryPayload';
import {
  rapidocCreateOrResolveUuid,
  sanitizeCPF,
  type RapidocBeneficiaryPayload,
} from '@/lib/rapidocService';
import {
  type AsaasPayment,
  type FinalizeRequestBody,
  type FinalizeResponseBody,
  PAYMENT_SUCCESS_STATUSES,
} from '@/types/checkout';

const SUCCESS_STATUS = new Set(PAYMENT_SUCCESS_STATUSES);

const jsonError = (
  hint: string,
  status: number,
  message: string,
  upstream: unknown = null,
) =>
  NextResponse.json(
    {
      hint,
      upstreamStatus: status,
      message,
      upstream: typeof upstream === 'string' ? upstream : upstream ?? null,
    },
    { status },
  );

const handleUpstreamError = (error: unknown, hint: string) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status && error.response.status !== 200 ? error.response.status : 500;
    const upstreamStatus = error.response?.status ?? 500;
    const upstreamData = error.response?.data;
    const upstreamObject =
      typeof upstreamData === 'object' && upstreamData !== null
        ? (upstreamData as Record<string, unknown>)
        : null;
    const upstreamError =
      upstreamObject && typeof upstreamObject.error === 'object' && upstreamObject.error !== null
        ? (upstreamObject.error as Record<string, unknown>)
        : null;
    const message =
      (upstreamObject?.message as string | undefined) ||
      (upstreamError?.message as string | undefined) ||
      error.message ||
      'unknown error';

    return NextResponse.json(
      {
        hint,
        upstreamStatus,
        message,
        upstream: typeof upstreamData === 'string' ? upstreamData : upstreamData ?? null,
      },
      { status },
    );
  }

  const message = error instanceof Error ? error.message : 'unknown error';
  return jsonError(hint, 500, message);
};

const assignIfMissing = (
  target: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  key: string,
  value: unknown,
) => {
  if (value == null || value === '') {
    return;
  }

  if (!existing || existing[key] == null || existing[key] === '') {
    target[key] = value;
  }
};

type HintedError = { hint?: string; status?: number; upstream?: unknown };
const isHintedError = (value: unknown): value is HintedError =>
  typeof value === 'object' && value !== null && 'hint' in value;

const fetchPayment = async (paymentId: string) => {
  const started = Date.now();
  console.info(`[checkout/finalizar] fetching payment ${paymentId}`);
  const response = await asaas.get(`/payments/${paymentId}`);
  console.info(
    `[checkout/finalizar] payment ${paymentId} loaded status=${response.data?.status ?? 'unknown'} ms=${Date.now() - started}`,
  );
  return response.data as AsaasPayment;
};

const loadAsaasCustomer = async (customerId: string) => {
  try {
    const started = Date.now();
    console.info(`[checkout/finalizar] fetching customer ${customerId}`);
    const customer = await getAsaasCustomer(customerId);
    console.info(
      `[checkout/finalizar] customer ${customerId} loaded ms=${Date.now() - started}`,
    );
    return customer;
  } catch (error) {
    console.error('[checkout/finalizar] failed to fetch customer', customerId, error);
    return null;
  }
};

const logRapidocAttempt = (payload: RapidocBeneficiaryPayload) => {
  console.info('[checkout/finalizar] rapidoc:create:start', {
    cpf: payload.cpf,
    name: payload.name,
    birthday: payload.birthday,
  });
};

const logRapidocSuccess = (result: { raw: unknown; uuid: string; created: boolean }) => {
  console.info('[checkout/finalizar] rapidoc:create:success', {
    uuid: result.uuid,
    created: result.created,
  });
  console.info('[checkout/finalizar] rapidoc:create:raw', result.raw);
};

const logRapidocFailure = (error: HintedError) => {
  console.error('[checkout/finalizar] rapidoc:create:error', {
    hint: error.hint ?? 'unknown',
    status: error.status ?? 500,
    upstream: error.upstream ?? null,
  });
};

export async function POST(request: NextRequest) {
  const started = Date.now();
  console.info('[checkout/finalizar] received request');

  let body: FinalizeRequestBody = {};
  try {
    body = ((await request.json()) ?? {}) as FinalizeRequestBody;
  } catch (error) {
    console.warn('[checkout/finalizar] body parse failed, assuming empty', error);
    body = {};
  }

  const paymentId = body.paymentId?.trim();
  const providedCpf = body.cpf ? sanitizeCPF(body.cpf) : undefined;

  if (!paymentId) {
    return jsonError('payment_missing', 400, 'paymentId é obrigatório.');
  }

  if (providedCpf && providedCpf.length !== 11) {
    return jsonError('cpf_invalid', 400, 'CPF deve conter 11 dígitos.', { cpf: providedCpf });
  }

  let payment: AsaasPayment | null = null;
  let paymentStatus: string | undefined;
  let customerId: string | undefined;

  try {
    payment = await fetchPayment(paymentId);
    paymentStatus = payment.status;
    customerId = typeof payment.customer === 'string' ? payment.customer : undefined;

    if (paymentStatus && !SUCCESS_STATUS.has(paymentStatus as (typeof PAYMENT_SUCCESS_STATUSES)[number])) {
      return jsonError('payment_not_confirmed', 409, 'Pagamento ainda não confirmado.', {
        status: paymentStatus,
      });
    }
  } catch (error) {
    console.error('[checkout/finalizar] error loading payment', paymentId, error);
    return handleUpstreamError(error, 'asaas-payment');
  }

  let cpfDigits = providedCpf;
  let asaasCustomer: Awaited<ReturnType<typeof getAsaasCustomer>> | null = null;

  if (!cpfDigits && payment?.customer && typeof payment.customer === 'string') {
    asaasCustomer = await loadAsaasCustomer(payment.customer);
    cpfDigits = sanitizeCPF(asaasCustomer?.cpfCnpj ?? '');
  }

  if (!cpfDigits && typeof payment?.cpfCnpj === 'string') {
    cpfDigits = sanitizeCPF(payment.cpfCnpj);
  }

  if (!cpfDigits && payment?.customer && typeof payment.customer === 'string' && !asaasCustomer) {
    asaasCustomer = await loadAsaasCustomer(payment.customer);
    cpfDigits = sanitizeCPF(asaasCustomer?.cpfCnpj ?? '');
  }

  if (!cpfDigits || cpfDigits.length !== 11) {
    return jsonError('missing_cpf_source', 400, 'Não foi possível identificar o CPF do pagador.');
  }

  if (!asaasCustomer && customerId) {
    asaasCustomer = await loadAsaasCustomer(customerId);
  }

  const paymentDocRef = db.collection('payments').doc(paymentId);
  try {
    const existingDoc = await paymentDocRef.get();
    if (existingDoc.exists) {
      const data = existingDoc.data() ?? {};
      if (data.processed) {
        console.info(`[checkout/finalizar] idempotent hit payment=${paymentId}`);
        return NextResponse.json<FinalizeResponseBody>({
          ok: true,
          status: (data.status as string) ?? paymentStatus ?? 'CONFIRMED',
          ensured: data.beneficiaryUuid
            ? { uuid: data.beneficiaryUuid as string, created: Boolean(data.beneficiaryCreated) }
            : null,
        });
      }
    }
  } catch (error) {
    console.error('[checkout/finalizar] failed to load payment doc', paymentId, error);
  }

  const usersCollection = db.collection('users');
  let userSnapshot = await usersCollection.where('cpf', '==', cpfDigits).limit(1).get();
  if (userSnapshot.empty && customerId) {
    userSnapshot = await usersCollection.where('asaasCustomerId', '==', customerId).limit(1).get();
  }

  let userRef = userSnapshot.empty ? null : userSnapshot.docs[0].ref;
  let userData = userSnapshot.empty ? null : (userSnapshot.docs[0].data() as Record<string, unknown>);

  if (!userRef) {
    const createdPayload: Record<string, unknown> = {
      cpf: cpfDigits,
      asaasCustomerId: customerId ?? null,
      status: 'pending',
      beneficiaryUuid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const created = await usersCollection.add(createdPayload);
    userRef = created;
    userData = createdPayload;
  }

  const ensurePayload = buildBeneficiaryPayload({
    cpf: cpfDigits,
    user: (userData as BeneficiaryUserRecord | null) ?? null,
    customer: asaasCustomer,
  });

  try {
    const candidatePlanId = String((userData as Record<string, unknown> | null)?.planId || '').trim().toUpperCase();
    if (candidatePlanId) {
      const plan = await getPlan(candidatePlanId);
      const serviceType = plan?.serviceType || plan?.id || '';
      if (serviceType) {
        ensurePayload.serviceType = serviceType as any;
      }
    }
  } catch (err) {
    // non-fatal: fallback to existing payload serviceType
  }

  logRapidocAttempt(ensurePayload);

  let ensured;
  try {
    ensured = await rapidocCreateOrResolveUuid(ensurePayload);
    logRapidocSuccess(ensured);
  } catch (error) {
    if (isHintedError(error)) {
      logRapidocFailure(error);
      const status = error.status ?? 502;
      return jsonError(error.hint ?? 'rapidoc-error', status, 'Não foi possível garantir o beneficiário.', error);
    }
    console.error('[checkout/finalizar] ensure beneficiary failed', cpfDigits, error);
    return handleUpstreamError(error, 'rapidoc-ensure');
  }

  if (!ensured?.uuid) {
    return jsonError('rapidoc-ensure', 502, 'Beneficiário sem identificador retornado.', ensured?.raw ?? null);
  }

  if (userRef) {
    const updates: Record<string, unknown> = {
      status: 'active',
      beneficiaryUuid: ensured.uuid,
      updatedAt: new Date(),
    };

    if (customerId) {
      updates.asaasCustomerId = customerId;
    }

    updates.lastPaymentId = paymentId;

    if (asaasCustomer) {
      assignIfMissing(updates, userData, 'name', asaasCustomer.name);
      assignIfMissing(updates, userData, 'email', asaasCustomer.email ?? null);
      assignIfMissing(updates, userData, 'phone', asaasCustomer.mobilePhone ?? null);
      assignIfMissing(updates, userData, 'zipCode', asaasCustomer.postalCode ?? null);
      assignIfMissing(updates, userData, 'address', asaasCustomer.address ?? null);
      assignIfMissing(updates, userData, 'city', asaasCustomer.city ?? asaasCustomer.cityName ?? null);
      assignIfMissing(updates, userData, 'state', asaasCustomer.state ?? null);
      assignIfMissing(updates, userData, 'holder', asaasCustomer.cpfCnpj ?? null);
    }

    await userRef.set(updates, { merge: true });
    userData = { ...(userData ?? {}), ...updates };
  }

  const resolvedStatus = paymentStatus ?? 'CONFIRMED';

  const docPayload: Record<string, unknown> = {
    processed: true,
    processedAt: new Date(),
    cpf: cpfDigits,
    beneficiaryUuid: ensured.uuid,
    beneficiaryCreated: Boolean(ensured.created),
    status: resolvedStatus,
    billingType: payment?.billingType ?? null,
    value: payment?.value ?? null,
    invoiceUrl: payment?.invoiceUrl ?? null,
    customerId: customerId ?? (typeof payment?.customer === 'string' ? payment?.customer : null),
  };

  await paymentDocRef.set(docPayload, { merge: true });

  console.info(
    `[checkout/finalizar] completed in ${Date.now() - started}ms payment=${paymentId} ensured=${ensured.uuid}`,
  );

  // Cria assinatura mensal automática (apenas uma vez por usuário)
  try {
    if (userRef && SUCCESS_STATUS.has(resolvedStatus as any) && customerId && (!userData || !userData.asaasSubscriptionId)) {
      const subBody: Record<string, unknown> = {
        customer: customerId,
        billingType: payment?.billingType || 'PIX',
        value: payment?.value || 0,
        cycle: 'MONTHLY',
      };
      // Define próxima data igual +30 dias a partir de hoje
      const next = new Date();
      next.setDate(next.getDate() + 30);
      const yyyy = next.getFullYear();
      const mm = String(next.getMonth() + 1).padStart(2, '0');
      const dd = String(next.getDate()).padStart(2, '0');
      (subBody as any).nextDueDate = `${yyyy}-${mm}-${dd}`;

      const created = await asaas.post('/subscriptions', subBody);
      const subscriptionId = created?.data?.id as string | undefined;
      if (subscriptionId) {
        await userRef.set({ asaasSubscriptionId: subscriptionId, updatedAt: new Date() }, { merge: true });
      }
    }
  } catch (error) {
    console.error('[checkout/finalizar] failed to create subscription', { customerId, paymentId }, error);
  }

  return NextResponse.json<FinalizeResponseBody>({
    ok: true,
    status: resolvedStatus,
    ensured: { uuid: ensured.uuid, created: Boolean(ensured.created) },
  });
}
