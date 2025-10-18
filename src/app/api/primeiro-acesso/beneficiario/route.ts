import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { findAsaasCustomerByCpf, listAsaasPaymentsByCustomer, listAsaasSubscriptionsByCustomer } from '@/lib/asaasService';
import {
  rapidocCreateOrResolveUuid,
  rapidocFindByCpf,
  sanitizeCPF,
  type RapidocBeneficiaryPayload,
} from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord } from '@/utils/beneficiary';
import { isValidCpf } from '@/utils/format';

const toHint = (error: unknown) => {
  if (error && typeof error === 'object' && 'hint' in error && typeof (error as any).hint === 'string') {
    return (error as any).hint as string;
  }
  return '';
};

const normalizeBirthday = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    const maybeYear = Number(digits.slice(0, 4));
    if (maybeYear >= 1900 && maybeYear <= 2100) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }
    return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  }

  return trimmed;
};

const readBirthdayFromBody = (body: unknown) => {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  return (
    normalizeBirthday(record.birthday) ||
    normalizeBirthday(record.birthDate) ||
    normalizeBirthday(record.dateOfBirth) ||
    normalizeBirthday(record.dataNascimento) ||
    normalizeBirthday(record.data_nascimento)
  );
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cpfRaw = typeof body?.cpf === 'string' ? body.cpf : '';
    const cpf = sanitizeCPF(cpfRaw);

    if (!isValidCpf(cpf)) {
      return NextResponse.json({ error: 'invalid_cpf' }, { status: 400 });
    }

    // Endpoint Rapidoc: GET /beneficiaries/:cpf
    let found: Record<string, unknown> | null = null;
    let createdFlag = false;
    try {
      const resolved = await rapidocFindByCpf(cpf);
      if (resolved && typeof resolved === 'object') {
        found = resolved as Record<string, unknown>;
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        found = null;
      } else {
      const hint = toHint(error);
      if (hint === 'rapidoc-cpf-failed') {
        const message =
          (error instanceof Error && error.message) || 'Falha ao consultar o beneficiario no prontuario clinico.';
        return NextResponse.json({ error: 'lookup_failed', message }, { status: 502 });
      }
      throw error;
      }
    }

    if (!found) {
      let asaasCustomer: Awaited<ReturnType<typeof findAsaasCustomerByCpf>> | null = null;
      try {
        asaasCustomer = await findAsaasCustomerByCpf(cpf);
      } catch (error) {
        console.error('[primeiro-acesso][beneficiario][asaas][customer]', error);
        const message =
          (error instanceof Error && error.message) || 'Falha ao consultar o cliente na Asaas.';
        return NextResponse.json({ error: 'asaas_lookup_failed', message }, { status: 502 });
      }

      if (!asaasCustomer) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }

      let subscriptions: Awaited<ReturnType<typeof listAsaasSubscriptionsByCustomer>> = [];
      try {
        subscriptions = await listAsaasSubscriptionsByCustomer(asaasCustomer.id, { status: 'ACTIVE', limit: 50 });
      } catch (error) {
        console.error('[primeiro-acesso][beneficiario][asaas][subscriptions]', error);
        const message =
          (error instanceof Error && error.message) || 'Falha ao consultar assinaturas na Asaas.';
        return NextResponse.json({ error: 'asaas_lookup_failed', message }, { status: 502 });
      }

      const activeSubscriptions = subscriptions.filter((subscription) => {
        const status = String(subscription?.status ?? '').toUpperCase();
        return status === 'ACTIVE';
      });

      if (!activeSubscriptions.length) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }

      const subscriptionIds = activeSubscriptions.map((subscription) => subscription.id).filter(Boolean);

      let payments: Awaited<ReturnType<typeof listAsaasPaymentsByCustomer>> = [];
      try {
        payments = await listAsaasPaymentsByCustomer(asaasCustomer.id, { limit: 100 });
      } catch (error) {
        console.error('[primeiro-acesso][beneficiario][asaas][payments]', error);
        const message =
          (error instanceof Error && error.message) || 'Falha ao consultar pagamentos na Asaas.';
        return NextResponse.json({ error: 'asaas_lookup_failed', message }, { status: 502 });
      }

      const paidStatuses = new Set(['CONFIRMED', 'RECEIVED']);
      const hasPaidSubscription = payments.some((payment) => {
        const status = String(payment?.status ?? '').toUpperCase();
        if (!paidStatuses.has(status)) {
          return false;
        }

        if (!subscriptionIds.length) {
          return true;
        }

        const paymentSubscriptionId = payment.subscription || payment.subscriptionId || null;
        if (paymentSubscriptionId) {
          return subscriptionIds.includes(paymentSubscriptionId);
        }

        if (subscriptionIds.length === 1) {
          return true;
        }

        return false;
      });

      if (!hasPaidSubscription) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }

      const birthday = asaasCustomer.birthDate ? normalizeBirthday(asaasCustomer.birthDate) : null;
      const birthdayFromBody = readBirthdayFromBody(body);
      const resolvedBirthday = birthday || birthdayFromBody;

      if (!resolvedBirthday) {
        return NextResponse.json({ error: 'missing_birthday' }, { status: 400 });
      }

      const addressParts = [asaasCustomer.address, asaasCustomer.addressNumber, asaasCustomer.complement]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean);

      const payload: RapidocBeneficiaryPayload = {
        name: asaasCustomer.name,
        cpf,
        birthday: resolvedBirthday,
        phone: asaasCustomer.mobilePhone || asaasCustomer.phone || undefined,
        email: asaasCustomer.email || undefined,
        zipCode: asaasCustomer.postalCode || undefined,
        address: addressParts.length ? addressParts.join(', ') : asaasCustomer.address || undefined,
        city: asaasCustomer.cityName || asaasCustomer.city || undefined,
        state: asaasCustomer.state || undefined,
      };

      try {
        const ensured = await rapidocCreateOrResolveUuid(payload);
        createdFlag = ensured.created;
      } catch (error) {
        console.error('[primeiro-acesso][beneficiario][rapidoc][create]', error);
        const message =
          (error instanceof Error && error.message) || 'Falha ao criar beneficiario no prontuario clinico.';
        return NextResponse.json({ error: 'rapidoc_create_failed', message }, { status: 502 });
      }

      try {
        const created = await rapidocFindByCpf(cpf);
        if (created && typeof created === 'object') {
          found = created as Record<string, unknown>;
        }
      } catch (error) {
        console.error('[primeiro-acesso][beneficiario][rapidoc][post-lookup]', error);
        const message =
          (error instanceof Error && error.message) || 'Falha ao consultar beneficiario recém-criado no prontuario clinico.';
        return NextResponse.json({ error: 'rapidoc_lookup_failed', message }, { status: 502 });
      }

      if (!found) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
    }

    const beneficiary = normalizeBeneficiaryRecord(found, cpf);

    if (!beneficiary.uuid) {
      return NextResponse.json({ error: 'missing_uuid' }, { status: 502 });
    }

    return NextResponse.json({ beneficiary, rapidoc: found, created: createdFlag });
  } catch (error) {
    console.error('[primeiro-acesso][beneficiario]', error);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
