import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import {
  ensureBeneficiaryByCPF,
  reactivateBeneficiary,
} from '@/lib/rapidocService';
import {
  type FinalizeRequestBody,
  type FinalizeResponseBody,
  PAYMENT_SUCCESS_STATUSES,
  type AsaasPayment,
} from '@/types/checkout';

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

    if (!PAYMENT_SUCCESS_STATUSES.includes(status as (typeof PAYMENT_SUCCESS_STATUSES)[number])) {
      return NextResponse.json<FinalizeResponseBody>(
        {
          ok: false,
          status,
        },
        { status: 409 },
      );
    }

    const snapshot = await db.collection('users').where('cpf', '==', cpfDigits).limit(1).get();

    let userRef = snapshot.empty ? null : snapshot.docs[0].ref;

    if (!userRef) {
      const created = await db.collection('users').add({
        name: payment.customer ?? 'Cliente Asaas',
        cpf: cpfDigits,
        email: null,
        phone: null,
        zipCode: null,
        address: null,
        city: null,
        state: null,
        asaasCustomerId: payment.customer ?? null,
        status: 'pending',
        beneficiaryUuid: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userRef = created;
    }

    const ensured = await ensureBeneficiaryByCPF({
      name: payment.customer ?? 'Cliente Asaas',
      cpf: cpfDigits,
    });

    if (ensured?.uuid) {
      try {
        await reactivateBeneficiary(ensured.uuid);
      } catch (error) {
        console.error('[checkout/finalizar] reactivate failed', ensured.uuid, error);
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
