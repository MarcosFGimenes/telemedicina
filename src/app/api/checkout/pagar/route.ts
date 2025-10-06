import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import { digitsOnly } from '@/lib/beneficiaryPayload';
import {
  type AsaasPayment,
  type AsaasPixQrCode,
  type CheckoutRequestBody,
  type CheckoutResponse,
  PAYMENT_SUCCESS_STATUSES,
} from '@/types/checkout';

const formatDate = (value?: string) => {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

async function resolveCustomer(body: CheckoutRequestBody, cpfDigits: string) {
  const normalizedBirthday = body.birthday?.trim() || null;
  const paymentTypeFromRequest = body.paymentType?.trim().toUpperCase();
  const serviceTypeFromRequest = body.serviceType?.trim().toUpperCase();
  const normalizedPaymentType = paymentTypeFromRequest || 'S';
  const normalizedServiceType = serviceTypeFromRequest || 'GS';
  const normalizedHolder = digitsOnly(body.holder) || null;
  const normalizedGeneral = body.general?.trim() || null;
  const normalizedPhone = body.mobilePhone ? digitsOnly(body.mobilePhone) || body.mobilePhone : null;
  const normalizedZip = body.zipCode ? digitsOnly(body.zipCode) || body.zipCode : null;

  const snapshot = await db.collection('users').where('cpf', '==', cpfDigits).limit(1).get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const data = doc.data();
    let customerId: string | undefined = data.asaasCustomerId;

    const updates: Record<string, unknown> = {};

    if (!customerId) {
      const { data: createdCustomer } = await asaas.post('/customers', {
        name: body.name,
        cpfCnpj: cpfDigits,
        email: body.email,
        mobilePhone: normalizedPhone ?? body.mobilePhone,
        postalCode: normalizedZip ?? body.zipCode,
        address: body.address,
        city: body.city,
        state: body.state,
      });
      customerId = createdCustomer.id;
      await doc.ref.update({ asaasCustomerId: customerId, updatedAt: new Date() });
    }

    const assignIfChanged = (key: string, value: unknown) => {
      if (value == null || value === '') {
        return;
      }

      if (data[key] !== value) {
        updates[key] = value;
      }
    };

    assignIfChanged('name', body.name);
    assignIfChanged('email', body.email ?? null);
    assignIfChanged('phone', normalizedPhone ?? null);
    assignIfChanged('zipCode', normalizedZip ?? null);
    assignIfChanged('address', body.address ?? null);
    assignIfChanged('city', body.city ?? null);
    assignIfChanged('state', body.state ?? null);
    assignIfChanged('birthday', normalizedBirthday);

    if (paymentTypeFromRequest) {
      assignIfChanged('paymentType', normalizedPaymentType);
    }

    if (serviceTypeFromRequest) {
      assignIfChanged('serviceType', normalizedServiceType);
    }

    if (normalizedHolder) {
      assignIfChanged('holder', normalizedHolder);
    } else if (!data.holder) {
      const fallbackHolder = digitsOnly(body.cpf);
      if (fallbackHolder) {
        assignIfChanged('holder', fallbackHolder);
      }
    }

    if (normalizedGeneral) {
      assignIfChanged('general', normalizedGeneral);
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await doc.ref.update(updates);
    }

    return { customerId: customerId!, userRef: doc.ref };
  }

  const { data: createdCustomer } = await asaas.post('/customers', {
    name: body.name,
    cpfCnpj: cpfDigits,
    email: body.email,
    mobilePhone: normalizedPhone ?? body.mobilePhone,
    postalCode: normalizedZip ?? body.zipCode,
    address: body.address,
    city: body.city,
    state: body.state,
  });

  const createdRef = await db.collection('users').add({
    name: body.name,
    cpf: cpfDigits,
    email: body.email || null,
    phone: normalizedPhone || null,
    zipCode: normalizedZip || null,
    address: body.address || null,
    city: body.city || null,
    state: body.state || null,
    birthday: normalizedBirthday,
    paymentType: normalizedPaymentType,
    serviceType: normalizedServiceType,
    holder: normalizedHolder || digitsOnly(body.cpf) || null,
    general: normalizedGeneral,
    asaasCustomerId: createdCustomer.id,
    status: 'pending',
    beneficiaryUuid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { customerId: createdCustomer.id as string, userRef: createdRef };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckoutRequestBody;
    const billingType = body.billingType;
    const value = Number(body.value || 0);
    const name = body.name?.trim();
    const cpfDigits = (body.cpf || '').replace(/\D/g, '');

    if (!billingType) {
      return NextResponse.json({ error: 'billingType is required' }, { status: 400 });
    }

    if (!name || !cpfDigits) {
      return NextResponse.json({ error: 'name and cpf are required' }, { status: 400 });
    }

    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'value must be greater than zero' }, { status: 400 });
    }

    if (billingType === 'CREDIT_CARD') {
      if (!body.creditCard || !body.creditCardHolderInfo) {
        return NextResponse.json({ error: 'credit card data is required' }, { status: 400 });
      }
    }

    const { customerId, userRef } = await resolveCustomer(body, cpfDigits);

    const basePayload: Record<string, unknown> = {
      customer: customerId,
      billingType,
      value,
      description: body.description ?? undefined,
    };

    if (billingType === 'BOLETO') {
      basePayload.dueDate = formatDate(body.dueDate);
    }

    if (billingType === 'PIX') {
      basePayload.dueDate = formatDate(body.dueDate);
    }

    if (billingType === 'CREDIT_CARD') {
      basePayload.creditCard = body.creditCard;
      basePayload.creditCardHolderInfo = body.creditCardHolderInfo;
    }

    const paymentResponse = await asaas.post('/payments', basePayload);
    const payment = paymentResponse.data as AsaasPayment;

    await userRef.update({
      status: PAYMENT_SUCCESS_STATUSES.includes(payment.status as (typeof PAYMENT_SUCCESS_STATUSES)[number]) ? 'active' : 'pending',
      lastPaymentId: payment.id,
      updatedAt: new Date(),
    });

    const response: CheckoutResponse = {
      paymentId: payment.id,
      status: payment.status,
      invoiceUrl: payment.invoiceUrl ?? null,
      customerId,
    };

    if (billingType === 'PIX') {
      try {
        const pixResponse = await asaas.get(`/payments/${payment.id}/pixQrCode`);
        const pixData = pixResponse.data as AsaasPixQrCode;
        response.pix = {
          encodedImage: pixData.encodedImage,
          payload: pixData.payload,
          expirationDate: pixData.expirationDate ?? null,
        };
      } catch (error) {
        console.error('[checkout/pagar] pixQrCode error', payment.id, error);
        response.pix = null;
      }
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      const backend = error.response?.data ?? null;
      console.error('[checkout/pagar] asaas error', status, backend);
      return NextResponse.json({ error: backend || 'Asaas error' }, { status });
    }

    console.error('[checkout/pagar] unexpected error', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error',
      },
      { status: 500 },
    );
  }
}
