import type { getAsaasCustomer } from '@/lib/asaasService';
import type { RapidocBeneficiaryPayload } from '@/lib/rapidocService';

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

const onlyDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');
export const digitsOnly = (value?: string | null) => onlyDigits(value);

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
}: BuildPayloadArgs): RapidocBeneficiaryPayload => {
  const cpfDigits = onlyDigits(cpf);
  const resolveName = () => {
    if (user?.name) return user.name;
    if (customer?.name) return customer.name;
    const first = customer?.firstName ?? '';
    const last = customer?.lastName ?? '';
    return `${first} ${last}`.trim() || 'Cliente Asaas';
  };

  const birthday = (user?.birthday ?? customer?.birthDate ?? customer?.birthday ?? '').slice(0, 10);

  const payload: RapidocBeneficiaryPayload = {
    name: resolveName(),
    cpf: cpfDigits,
    birthday,
    phone: onlyDigits(user?.phone ?? customer?.mobilePhone ?? customer?.phone ?? ''),
    email: user?.email ?? customer?.email ?? undefined,
    zipCode: onlyDigits(user?.zipCode ?? customer?.postalCode ?? ''),
    address: [
      user?.address ?? customer?.address ?? '',
      customer?.addressNumber ?? '',
      customer?.complement ?? '',
    ]
      .filter((part) => part && String(part).trim().length > 0)
      .join(', ')
      .trim() || undefined,
    city: user?.city ?? customer?.cityName ?? customer?.city ?? undefined,
    state: user?.state ?? customer?.state ?? undefined,
    paymentType: 'S',
    serviceType: (() => {
      const raw = (user?.serviceType ?? '').toString().trim().toUpperCase();
      return raw || 'GS';
    })(),
    holder: onlyDigits(user?.holder ?? customer?.cpfCnpj ?? cpfDigits) || undefined,
    general: user?.general?.trim() || `asaasPayment:${customer?.id ?? ''}`,
  };

  if (!payload.phone) {
    delete payload.phone;
  }
  if (!payload.zipCode) {
    delete payload.zipCode;
  }
  if (!payload.holder) {
    delete payload.holder;
  }
  if (!payload.address) {
    delete payload.address;
  }
  if (!payload.email) {
    delete payload.email;
  }

  return payload;
};
