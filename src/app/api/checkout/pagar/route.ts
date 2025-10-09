import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import { digitsOnly } from '@/lib/beneficiaryPayload';
import { getPlan } from '@/lib/plansStore';
import { type CheckoutRequestBody, type CheckoutResponse } from '@/types/checkout';

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
  normalizedServiceType: string,
  planName: string,
  planMaxDependents: number | null,
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
    assignIfChanged('serviceType', normalizedServiceType);
    assignIfChanged('planName', planName);
    assignIfChanged('planId', normalizedServiceType);
    if (planMaxDependents !== null) {
      assignIfChanged('maxDependents', planMaxDependents);
    } else if (data.maxDependents !== undefined) {
      updates.maxDependents = null;
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
    planName,
    planId: normalizedServiceType,
    maxDependents: planMaxDependents,
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

    const { customerId, userRef } = await resolveCustomer(
      body,
      cpfDigits,
      normalizedPaymentType,
      plan.serviceType,
      plan.name,
      plan.maxDependents ?? null,
    );

    const paymentMethods: string[] = (() => {
      switch (billingType) {
        case 'PIX':
        case 'BOLETO':
        case 'CREDIT_CARD':
          return [billingType];
        default:
          return ['PIX', 'BOLETO', 'CREDIT_CARD'];
      }
    })();

    const chargeTypes = normalizedPaymentType === 'S' ? ['RECURRENT'] : ['INSTALLMENT'];

    const checkoutPayload: Record<string, unknown> = {
      customer: customerId,
      billingType,
      description,
      chargeTypes,
      paymentMethods,
      value: planValue,
      externalReference: userRef.id,
      customerData: {
        name: body.name,
        cpfCnpj: cpfDigits,
        email: body.email,
        mobilePhone: body.mobilePhone,
        phone: body.mobilePhone,
        postalCode: body.zipCode,
        address: body.address,
        city: body.city,
        state: body.state,
      },
    };

    if (normalizedPaymentType === 'S') {
      checkoutPayload.subscription = {
        cycle: 'MONTHLY',
        value: planValue,
        description,
        nextDueDate: dueDate,
      };
    } else {
      checkoutPayload.dueDate = dueDate;
      checkoutPayload.installmentOptions = { numberOfInstallments: 1 };
    }

    const { data: checkout } = await asaas.post('/checkout', checkoutPayload);

    const checkoutIdCandidates = [
      checkout?.id,
      checkout?.checkoutId,
      checkout?.sessionId,
      checkout?.session?.id,
      checkout?.data?.id,
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value);
    const checkoutId = checkoutIdCandidates[0] || '';
    const explicitUrlCandidates = [
      checkout?.url,
      checkout?.checkoutUrl,
      checkout?.sessionUrl,
      checkout?.data?.url,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const checkoutUrl =
      explicitUrlCandidates[0]?.trim() ||
      (checkoutId ? `https://asaas.com/checkoutSession/show?id=${checkoutId}` : '');

    await userRef.update({
      status: 'pending-checkout',
      lastCheckoutId: checkoutId || null,
      planId: plan.serviceType,
      planName: plan.name,
      paymentType: normalizedPaymentType,
      serviceType: plan.serviceType,
      maxDependents: plan.maxDependents ?? null,
      updatedAt: new Date(),
    });

    const response: CheckoutResponse = {
      status: 'PENDING',
      checkoutId: checkoutId || undefined,
      checkoutUrl: checkoutUrl || undefined,
      customerId,
      value: planValue,
      description,
      paymentType: normalizedPaymentType,
      planId: plan.serviceType,
      chargeType: chargeTypes[0],
    };

    return NextResponse.json(response, { status: 201 });
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
