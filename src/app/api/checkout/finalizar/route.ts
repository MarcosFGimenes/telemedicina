/**
 * Testes (Postman):
 * 1. Criar pagamento no Asaas e obter o paymentId.
 * 2. Confirmar pagamento no sandbox e aguardar status RECEIVED/CONFIRMED.
 * 3. GET /api/checkout/status/{paymentId} para validar o status.
 * 4. POST /api/checkout/finalizar com { paymentId, cpf } e verificar ensured.uuid.
 * 5. GET /api/rapidoc/beneficiaries/cpf/{cpf} para confirmar o beneficiário ativo.
 */

import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import { getAsaasCustomer } from '@/lib/asaasService';
import { buildBeneficiaryPayload, type BeneficiaryUserRecord } from '@/lib/beneficiaryPayload';
import {
  ensureBeneficiaryByCPF,
  reactivateBeneficiary,
  sanitizeCPF,
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

type HintedError = { hint?: string; status?: number };
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

  if (providedCpf && providedCpf.length !== 11) {
    return jsonError('cpf_invalid', 400, 'CPF deve conter 11 dígitos.', { cpf: providedCpf });
  }

  let payment: AsaasPayment | null = null;
  let paymentStatus: string | undefined;
  let customerId: string | undefined;

  if (paymentId) {
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
  }

  let cpfDigits = providedCpf;
  let asaasCustomer: Awaited<ReturnType<typeof getAsaasCustomer>> | null = null;

  if (!cpfDigits && payment && customerId) {
    asaasCustomer = await loadAsaasCustomer(customerId);
    cpfDigits = sanitizeCPF(asaasCustomer?.cpfCnpj ?? '');
  }

  if (!cpfDigits && payment && typeof payment.cpfCnpj === 'string') {
    cpfDigits = sanitizeCPF(payment.cpfCnpj);
  }

  if (!cpfDigits && customerId && !asaasCustomer) {
    asaasCustomer = await loadAsaasCustomer(customerId);
    cpfDigits = sanitizeCPF(asaasCustomer?.cpfCnpj ?? '');
  }

  if (!cpfDigits || cpfDigits.length !== 11) {
    return jsonError('missing_cpf_source', 400, 'Não foi possível identificar o CPF do pagador.');
  }

  if (!asaasCustomer && customerId) {
    asaasCustomer = await loadAsaasCustomer(customerId);
  }

  const paymentDocRef = paymentId ? db.collection('payments').doc(paymentId) : null;
  if (paymentDocRef) {
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

  let ensured;
  try {
    ensured = await ensureBeneficiaryByCPF(ensurePayload);
  } catch (error) {
    console.error('[checkout/finalizar] ensure beneficiary failed', cpfDigits, error);
    if (isHintedError(error)) {
      return jsonError(error.hint ?? 'rapidoc-error', error.status ?? 500, 'Não foi possível garantir o beneficiário.', error);
    }
    return handleUpstreamError(error, 'rapidoc-ensure');
  }

  if (!ensured?.uuid) {
    return jsonError('rapidoc-ensure', 500, 'Beneficiário sem identificador retornado.');
  }

  try {
    await reactivateBeneficiary(ensured.uuid);
  } catch (error) {
    if (axios.isAxiosError(error) && [409, 422].includes(error.response?.status ?? 0)) {
      console.info('[checkout/finalizar] reactivate ignored status', error.response?.status);
    } else {
      console.error('[checkout/finalizar] reactivate failed', ensured.uuid, error);
      return handleUpstreamError(error, 'rapidoc-reactivate');
    }
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

    if (paymentId) {
      updates.lastPaymentId = paymentId;
    }

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

  if (paymentDocRef) {
    const docPayload: Record<string, unknown> = {
      processed: true,
      processedAt: new Date(),
      cpf: cpfDigits,
      beneficiaryUuid: ensured.uuid,
      beneficiaryCreated: Boolean(ensured.created),
      status: resolvedStatus,
    };

    await paymentDocRef.set(docPayload, { merge: true });
  }

  console.info(
    `[checkout/finalizar] completed in ${Date.now() - started}ms payment=${paymentId ?? 'none'} ensured=${ensured.uuid}`,
  );

  return NextResponse.json<FinalizeResponseBody>({
    ok: true,
    status: resolvedStatus,
    ensured: { uuid: ensured.uuid, created: Boolean(ensured.created) },
  });
}
