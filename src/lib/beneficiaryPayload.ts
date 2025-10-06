import type { getAsaasCustomer } from '@/lib/asaasService';
import type { BeneficiaryInput } from '@/lib/rapidocService';

export type BeneficiaryUserRecord = {
  name?: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  zipCode?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  birthday?: string | null;
  paymentType?: string | null;
  serviceType?: string | null;
  holder?: string | null;
  general?: string | null;
};

export const digitsOnly = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const numeric = String(value).replace(/\D/g, '');
  return numeric || undefined;
};

type AsaasCustomer = Awaited<ReturnType<typeof getAsaasCustomer>>;

type BuildPayloadArgs = {
  cpf: string;
  user?: BeneficiaryUserRecord | null;
  customer?: AsaasCustomer | null;
};

export const buildBeneficiaryPayload = ({
  cpf,
  user,
  customer,
}: BuildPayloadArgs): BeneficiaryInput => {
  const cpfDigits = digitsOnly(cpf) ?? cpf;
  const normalizeUpper = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed.toUpperCase() : undefined;
  };

  const payload: BeneficiaryInput = {
    name: user?.name ?? customer?.name ?? 'Cliente Asaas',
    cpf: cpfDigits,
    paymentType: normalizeUpper(user?.paymentType) ?? 'S',
    serviceType: normalizeUpper(user?.serviceType) ?? 'GS',
    holder: digitsOnly(user?.holder ?? customer?.cpfCnpj ?? cpfDigits) ?? cpfDigits,
    general: user?.general?.trim() || 'General purpose',
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

  const birthday = user?.birthday?.trim() ?? undefined;
  if (birthday) {
    payload.birthday = birthday;
  }

  return payload;
};
