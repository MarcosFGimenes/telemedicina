import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import { digitsOnly } from '@/lib/beneficiaryPayload';
import { getPlan } from '@/lib/plansStore';
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

async function resolveCustomer(
  body: CheckoutRequestBody,
  cpfDigits: string,
  normalizedPaymentType: string,
  rapidocServiceType: string,
  planId: string,
  planName: string,
) {
  const normalizedBirthday = body.birthday?.trim() || null;
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

    assignIfChanged('paymentType', normalizedPaymentType);
    assignIfChanged('serviceType', rapidocServiceType);
    assignIfChanged('planName', planName);
    assignIfChanged('planId', planId);

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
    serviceType: rapidocServiceType,
    planName,
    planId,
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
    const name = body.name?.trim();
    const cpfDigits = (body.cpf || '').replace(/\D/g, '');
    const planIdFromRequest = (body.planId || body.serviceType || '').trim().toUpperCase();

    if (!billingType) {
      return NextResponse.json({ error: 'billingType is required' }, { status: 400 });
    }

    if (!name || !cpfDigits) {
      return NextResponse.json({ error: 'name and cpf are required' }, { status: 400 });
    }

    if (!planIdFromRequest) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    const plan = await getPlan(planIdFromRequest);
    if (!plan) {
      return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
    }

    const planValue = Number(plan.value);
    if (!Number.isFinite(planValue) || planValue <= 0) {
      return NextResponse.json({ error: 'Plano configurado com valor inválido' }, { status: 400 });
    }

    const normalizedPaymentType = (body.paymentType || 'A').trim().toUpperCase() === 'S' ? 'S' : 'A';
    const description = body.description?.trim() || plan.name;
    const dueDate = formatDate(body.dueDate);

    if (billingType === 'CREDIT_CARD') {
      if (!body.creditCard || !body.creditCardHolderInfo) {
        return NextResponse.json({ error: 'credit card data is required' }, { status: 400 });
      }
    }

    const { customerId, userRef } = await resolveCustomer(
      body,
      cpfDigits,
      normalizedPaymentType,
      (plan.serviceType || plan.id),
      plan.id,
      plan.name,
    );

    if (normalizedPaymentType === 'S') {
      const subscriptionPayload: Record<string, unknown> = {
        customer: customerId,
        billingType,
        value: planValue,
        description,
        cycle: 'MONTHLY',
        nextDueDate: dueDate,
      };

      const { data: subscription } = await asaas.post('/subscriptions', subscriptionPayload);

      await userRef.update({
        status: 'pending',
        lastSubscriptionId: subscription.id,
        planId: plan.id,
        planName: plan.name,
        paymentType: normalizedPaymentType,
        serviceType: (plan.serviceType || plan.id),
        updatedAt: new Date(),
      });

      const response: CheckoutResponse = {
        subscriptionId: subscription.id,
        status: subscription.status || 'PENDING',
        invoiceUrl: subscription.invoiceUrl ?? null,
        customerId,
        value: planValue,
        description,
      };

      return NextResponse.json(response);
    }

    const basePayload: Record<string, unknown> = {
      customer: customerId,
      billingType,
      value: planValue,
      description,
    };

    if (billingType === 'BOLETO' || billingType === 'PIX') {
      basePayload.dueDate = dueDate;
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
      planId: plan.id,
      planName: plan.name,
      paymentType: normalizedPaymentType,
      serviceType: (plan.serviceType || plan.id),
      updatedAt: new Date(),
    });

    const response: CheckoutResponse = {
      paymentId: payment.id,
      status: payment.status,
      invoiceUrl: payment.invoiceUrl ?? null,
      customerId,
      value: planValue,
      description,
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
