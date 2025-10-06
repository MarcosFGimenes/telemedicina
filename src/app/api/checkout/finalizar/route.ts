import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import { getAsaasCustomer } from '@/lib/asaasService';
import { buildBeneficiaryPayload, type BeneficiaryUserRecord } from '@/lib/beneficiaryPayload';
import { ensureBeneficiaryByCPF, reactivateBeneficiary } from '@/lib/rapidocService';
import {
  type FinalizeRequestBody,
  type FinalizeResponseBody,
  PAYMENT_SUCCESS_STATUSES,
  type AsaasPayment,
} from '@/types/checkout';

const digitsOnly = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const numeric = String(value).replace(/\D/g, '');
  return numeric || undefined;
};

const resolveEnsurePayload = (
  cpfDigits: string,
  user: Record<string, any> | null,
  customer: Awaited<ReturnType<typeof getAsaasCustomer>> | null,
): BeneficiaryInput => {
  const payload: BeneficiaryInput = {
    name: user?.name ?? customer?.name ?? 'Cliente Asaas',
    cpf: cpfDigits,
    paymentType: user?.paymentType ?? 'S',
    serviceType: user?.serviceType ?? 'GS',
    holder: digitsOnly(user?.holder ?? customer?.cpfCnpj ?? cpfDigits) ?? cpfDigits,
    general: user?.general ?? 'General purpose',
  };

  const email = user?.email ?? customer?.email ?? undefined;
  if (email) {
    payload.email = email;
  }

  const phone = digitsOnly(user?.phone ?? customer?.mobilePhone ?? null);
  if (phone) {
    payload.phone = phone;
  }

  const zipCode = digitsOnly(user?.zipCode ?? customer?.postalCode ?? null);
  if (zipCode) {
    payload.zipCode = zipCode;
  }

  const address = user?.address ?? customer?.address ?? undefined;
  if (address) {
    payload.address = address;
  }

  const city = user?.city ?? customer?.city ?? customer?.cityName ?? undefined;
  if (city) {
    payload.city = city;
  }

  const state = user?.state ?? customer?.state ?? undefined;
  if (state) {
    payload.state = state;
  }

  const birthday = user?.birthday ?? undefined;
  if (birthday) {
    payload.birthday = birthday;
  }

  return payload;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeRequestBody;
    const cpfDigits = (body.cpf || '').replace(/\D/g, '');
    const paymentId = body.paymentId?.trim();

    if (!cpfDigits || !paymentId) {
      return NextResponse.json({ error: 'cpf and paymentId are required' }, { status: 400 });
    }

    const paymentResponse = await asaas.get(`/payments/${paymentId}`);
    const payment = paymentResponse.data as AsaasPayment;
    const status = payment.status;
    const customerId = payment.customer;

    if (!PAYMENT_SUCCESS_STATUSES.includes(status as (typeof PAYMENT_SUCCESS_STATUSES)[number])) {
      return NextResponse.json<FinalizeResponseBody>(
        {
          ok: false,
          status,
        },
        { status: 409 },
      );
    }

    let asaasCustomer: Awaited<ReturnType<typeof getAsaasCustomer>> | null = null;

    if (customerId) {
      try {
        asaasCustomer = await getAsaasCustomer(customerId);
      } catch (error) {
        console.error('[checkout/finalizar] failed to load asaas customer', customerId, error);
      }
    }

    const snapshot = await db.collection('users').where('cpf', '==', cpfDigits).limit(1).get();

    let userRef = snapshot.empty ? null : snapshot.docs[0].ref;
    let user = snapshot.empty ? null : (snapshot.docs[0].data() as Record<string, any>);

    if (!userRef) {
      const createdPayload: Record<string, unknown> = {
        name: asaasCustomer?.name ?? payment.customer ?? 'Cliente Asaas',
        cpf: cpfDigits,
        email: asaasCustomer?.email ?? null,
        phone: asaasCustomer?.mobilePhone ?? null,
        zipCode: asaasCustomer?.postalCode ?? null,
        address: asaasCustomer?.address ?? null,
        city: asaasCustomer?.city ?? asaasCustomer?.cityName ?? null,
        state: asaasCustomer?.state ?? null,
        birthday: null,
        paymentType: null,
        serviceType: null,
        holder: asaasCustomer?.cpfCnpj ?? null,
        general: null,
        asaasCustomerId: customerId ?? null,
        status: 'pending',
        beneficiaryUuid: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await db.collection('users').add(createdPayload);
      userRef = created;
      user = createdPayload as Record<string, any>;
    }

    if (!userRef) {
      return NextResponse.json(
        { error: 'Usuário não encontrado para sincronizar com a Rapidoc.' },
        { status: 404 },
      );
    }

    const updates: Record<string, unknown> = {};

    if (customerId && (!user?.asaasCustomerId || user.asaasCustomerId !== customerId)) {
      updates.asaasCustomerId = customerId;
    }

    const assignIfMissing = (key: string, value: unknown) => {
      if (value == null || value === '') {
        return;
      }

      if (!user || user[key] == null || user[key] === '') {
        updates[key] = value;
      }
    };

    if (asaasCustomer) {
      assignIfMissing('name', asaasCustomer.name);
      assignIfMissing('email', asaasCustomer.email ?? null);
      assignIfMissing('phone', asaasCustomer.mobilePhone ?? null);
      assignIfMissing('zipCode', asaasCustomer.postalCode ?? null);
      assignIfMissing('address', asaasCustomer.address ?? null);
      assignIfMissing('city', asaasCustomer.city ?? asaasCustomer.cityName ?? null);
      assignIfMissing('state', asaasCustomer.state ?? null);
      assignIfMissing('holder', asaasCustomer.cpfCnpj ?? null);
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await userRef.update(updates);
      user = { ...(user ?? {}), ...updates } as Record<string, any>;
    }

    const ensurePayload = buildBeneficiaryPayload({
      cpf: cpfDigits,
      user: user as BeneficiaryUserRecord | null,
      customer: asaasCustomer,
    });
    const ensured = await ensureBeneficiaryByCPF(ensurePayload);

    if (ensured?.uuid) {
      try {
        await reactivateBeneficiary(ensured.uuid, ensurePayload);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const statusCode = error.response?.status ?? 502;
          const backend = error.response?.data ?? null;
          console.error('[checkout/finalizar] reactivate failed', ensured.uuid, statusCode, backend);
          return NextResponse.json(
            { error: 'Failed to reactivate beneficiary', backend },
            { status: statusCode },
          );
        }

        console.error('[checkout/finalizar] reactivate failed', ensured.uuid, error);
        return NextResponse.json(
          { error: 'Failed to reactivate beneficiary' },
          { status: 500 },
        );
      }

      await userRef.update({
        status: 'active',
        beneficiaryUuid: ensured.uuid,
        lastPaymentId: paymentId,
        updatedAt: new Date(),
      });
    }

    return NextResponse.json<FinalizeResponseBody>({
      ok: true,
      status,
      ensured,
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      const backend = error.response?.data ?? null;
      console.error('[checkout/finalizar] asaas error', status, backend);
      return NextResponse.json({ error: backend || 'Asaas error' }, { status });
    }

    console.error('[checkout/finalizar] unexpected error', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      { status: 500 },
    );
  }
}
