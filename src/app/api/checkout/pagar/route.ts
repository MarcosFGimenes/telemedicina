import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { db } from '@/lib/firebaseAdmin';
import { digitsOnly } from '@/lib/beneficiaryPayload';
import { getPlan } from '@/lib/plansStore';
import { type CheckoutRequestBody, type CheckoutResponse, type BillingType } from '@/types/checkout';

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

const CHECKOUT_ITEM_IMAGE_BASE64 = (process.env.ASAAS_CHECKOUT_ITEM_IMAGE_BASE64 ?? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==').trim();
const DEFAULT_ADDRESS_NUMBER = 'SN';
const DEFAULT_PROVINCE = 'Centro';
const cityCache = new Map<string, number>();

type CheckoutBillingType = Exclude<BillingType, 'UNDEFINED'>;

const resolveCheckoutBillingTypes = (value: BillingType): CheckoutBillingType[] => {
  switch (value) {
    case 'CREDIT_CARD':
      return ['CREDIT_CARD'];
    case 'PIX':
      return ['PIX'];
    case 'BOLETO':
      return ['BOLETO'];
    default:
      return ['PIX', 'BOLETO'];
  }
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const buildCityCacheKey = (city: string, state?: string | null) =>
  `${normalizeText(city)}|${state ? state.trim().toUpperCase() : ''}`;

const compactObject = <T extends Record<string, unknown>>(input: T) =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

async function resolveCityId(cityName?: string | null, state?: string | null): Promise<number | null> {
  if (!cityName) {
    return null;
  }

  const cacheKey = buildCityCacheKey(cityName, state);
  if (cityCache.has(cacheKey)) {
    return cityCache.get(cacheKey)!;
  }

  try {
    const params: Record<string, string> = { name: cityName };
    if (state) {
      params.state = state.trim().toUpperCase();
    }

    const { data } = await asaas.get('/cities', { params });
    const list = Array.isArray(data?.data) ? data.data : [];
    if (list.length === 0) {
      return null;
    }

    const normalized = normalizeText(cityName);
    const match =
      list.find((entry: any) => {
        const entryName = typeof entry?.name === 'string' ? normalizeText(entry.name) : '';
        const sameName = entryName === normalized;
        const sameState = state ? String(entry?.state || '').toUpperCase() === state.trim().toUpperCase() : true;
        return sameName && sameState;
      }) ?? list[0];

    const id = typeof match?.id === 'number' ? match.id : null;
    if (id) {
      cityCache.set(cacheKey, id);
      return id;
    }
  } catch (error) {
    console.warn('[checkout/pagar] failed to resolve city id', cityName, state, error);
  }

  return null;
}

const buildCustomerPayload = (
  body: CheckoutRequestBody,
  cpfDigits: string,
  normalizedPhone: string | null,
  normalizedZip: string | null,
  cityId: number | null,
  cityName: string,
  state: string,
) => {
  const fallbackPhone = body.phone ? digitsOnly(body.phone) || body.phone.trim() : undefined;
  const phone = normalizedPhone ?? fallbackPhone;
  const addressNumber = body.addressNumber?.trim() || DEFAULT_ADDRESS_NUMBER;
  const province = body.neighborhood?.trim() || cityName || DEFAULT_PROVINCE;

  return compactObject({
    name: body.name?.trim(),
    cpfCnpj: cpfDigits,
    email: body.email?.trim(),
    phone,
    mobilePhone: normalizedPhone ?? undefined,
    postalCode: normalizedZip ?? undefined,
    address: body.address?.trim(),
    addressNumber,
    complement: body.addressComplement?.trim() || undefined,
    province,
    city: cityId ?? undefined,
    cityName,
    state,
  });
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
  const normalizedCityName = body.city?.trim();
  const normalizedState = body.state?.trim();

  if (!normalizedCityName || !normalizedState) {
    const error = new Error('Cidade e estado sao obrigatorios para gerar o checkout.');
    (error as { status?: number }).status = 400;
    throw error;
  }

  const cityId = await resolveCityId(normalizedCityName, normalizedState);
  if (!cityId) {
    const error = new Error('Cidade informada nao foi encontrada no cadastro da Asaas.');
    (error as { status?: number }).status = 400;
    throw error;
  }

  const customerPayload = buildCustomerPayload(
    body,
    cpfDigits,
    normalizedPhone,
    normalizedZip,
    cityId,
    normalizedCityName,
    normalizedState,
  );

  const snapshot = await db.collection('users').where('cpf', '==', cpfDigits).limit(1).get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const data = doc.data();
    let customerId: string | undefined = data.asaasCustomerId;

    const updates: Record<string, unknown> = {};

    if (!customerId) {
      const { data: createdCustomer } = await asaas.post('/customers', customerPayload);
      customerId = createdCustomer.id;
      await doc.ref.update({ asaasCustomerId: customerId, updatedAt: new Date() });
    } else {
      await asaas.put(`/customers/${customerId}`, customerPayload);
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
    assignIfChanged('city', normalizedCityName);
    assignIfChanged('state', normalizedState);
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

  const { data: createdCustomer } = await asaas.post('/customers', customerPayload);

  const createdRef = await db.collection('users').add({
    name: body.name,
    cpf: cpfDigits,
    email: body.email || null,
    phone: normalizedPhone || null,
    zipCode: normalizedZip || null,
    address: body.address || null,
    city: normalizedCityName || null,
    state: normalizedState || null,
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
      return NextResponse.json({ error: 'Plano nao encontrado' }, { status: 404 });
    }

    const planValue = Number(plan.value);
    if (!Number.isFinite(planValue) || planValue <= 0) {
      return NextResponse.json({ error: 'Plano configurado com valor invalido' }, { status: 400 });
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

    const normalizedBillingType = (typeof billingType === 'string'
      ? (billingType.toUpperCase() as BillingType)
      : 'UNDEFINED') as BillingType;
    const billingTypes = resolveCheckoutBillingTypes(normalizedBillingType);

    const chargeTypes = normalizedPaymentType === 'S' ? ['RECURRENT'] : ['DETACHED'];

    const minutesToExpireEnv = process.env.ASAAS_CHECKOUT_EXPIRES_MINUTES;
    const parsedMinutes = minutesToExpireEnv ? Number(minutesToExpireEnv) : NaN;
    const minutesToExpire =
      Number.isFinite(parsedMinutes) && parsedMinutes > 0
        ? Math.max(10, Math.min(1440, Math.trunc(parsedMinutes)))
        : undefined;

    const inferBaseUrl = () => {
      const configured = process.env.ASAAS_CHECKOUT_BASE_URL?.trim();
      if (configured) return configured.replace(/\/+$/, '');
      const originHeader = request.headers.get('origin');
      if (originHeader) return originHeader.replace(/\/+$/, '');
      const publicUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        process.env.APP_BASE_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      return publicUrl ? publicUrl.replace(/\/+$/, '') : null;
    };

    const baseUrl = inferBaseUrl();

    const successUrl = (process.env.ASAAS_CHECKOUT_SUCCESS_URL ?? (baseUrl ? `${baseUrl}/assinante/checkout/sucesso` : '')).trim();
    const cancelUrl = (process.env.ASAAS_CHECKOUT_CANCEL_URL ?? (baseUrl ? `${baseUrl}/assinante/checkout/cancelado` : '')).trim();
    const expiredUrl = (process.env.ASAAS_CHECKOUT_EXPIRED_URL ?? (baseUrl ? `${baseUrl}/assinante/checkout/expirado` : '')).trim();

    if (!successUrl || !cancelUrl || !expiredUrl) {
      return NextResponse.json(
        { error: 'Configuracao de redirecionamento do checkout indisponivel.' },
        { status: 500 },
      );
    }

    const callback = { successUrl, cancelUrl, expiredUrl };

    const checkoutItems = [
      {
        name: plan.name.slice(0, 30),
        description: (plan.description ?? plan.name).slice(0, 150),
        quantity: 1,
        value: Number(planValue.toFixed(2)),
        imageBase64: CHECKOUT_ITEM_IMAGE_BASE64,
        externalReference: plan.serviceType,
      },
    ];

    const checkoutPayload = compactObject({
      name: plan.name.slice(0, 50),
      description,
      customer: customerId,
      billingTypes,
      chargeTypes,
      value: Number(planValue.toFixed(2)),
      externalReference: userRef.id,
      minutesToExpire,
      callback,
      items: checkoutItems,
      subscription: chargeTypes.includes('RECURRENT')
        ? {
            cycle: 'MONTHLY',
            nextDueDate: dueDate,
          }
        : undefined,
      installment: chargeTypes.includes('DETACHED') ? { maxInstallmentCount: 1 } : undefined,
    });

    const { data: checkout } = await asaas.post('/checkouts', checkoutPayload);

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
      checkout?.link,
      checkout?.url,
      checkout?.checkoutUrl,
      checkout?.sessionUrl,
      checkout?.data?.url,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const primaryLink = explicitUrlCandidates[0]?.trim() || '';
    const checkoutUrl =
      primaryLink || (checkoutId ? `https://sandbox.asaas.com/checkoutSession/show/${checkoutId}` : '');
    const minutesToExpireResponse =
      typeof checkout?.minutesToExpire === 'number' ? checkout.minutesToExpire : undefined;

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
      checkoutLink: primaryLink || undefined,
      minutesToExpire: minutesToExpireResponse,
      customerId,
      value: Number(planValue.toFixed(2)),
      description,
      paymentType: normalizedPaymentType,
      planId: plan.serviceType,
      chargeType: chargeTypes[0],
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const hintedStatus = (error as { status?: number }).status;
    if (typeof hintedStatus === 'number' && hintedStatus > 0) {
      const message = error instanceof Error && error.message ? error.message : 'Unexpected error';
      return NextResponse.json({ error: message }, { status: hintedStatus });
    }

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
