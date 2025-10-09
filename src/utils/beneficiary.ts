export type BeneficiaryRecord = {
  uuid: string;
  cpf: string;
  name: string;
  birthday?: string | null;
  phone?: string | null;
  email?: string | null;
};

type RapidocRecord = Record<string, unknown>;

const pickString = (record: RapidocRecord, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const pickDate = (record: RapidocRecord, keys: string[]): string | null => {
  const raw = pickString(record, keys);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    return `${year}-${month}-${day}`;
  }
  return raw;
};

const sanitizeCpf = (value: string) => value.replace(/\D/g, '');

const maybeWithLeadingZeros = (value: string) => {
  if (value.length === 10) {
    return `0${value}`;
  }
  return value;
};

export function normalizeBeneficiaryRecord(
  raw: RapidocRecord,
  fallbackCpf: string,
): BeneficiaryRecord {
  const uuid =
    pickString(raw, ['uuid', 'id', 'beneficiaryUuid', 'beneficiaryId']) ||
    pickString(raw, ['codigo', 'code']);

  const cpf = sanitizeCpf(
    pickString(raw, ['cpf', 'document', 'documentNumber', 'holder']) || fallbackCpf,
  );

  const name =
    pickString(raw, ['name', 'fullName', 'beneficiaryName', 'nome']) || 'Beneficiário sem nome';

  const birthday = pickDate(raw, ['birthday', 'birthDay', 'birthDate', 'dateOfBirth']);

  const phone =
    pickString(raw, ['phone', 'mobile', 'cellphone', 'cellPhone', 'phoneNumber']) || null;

  const email = pickString(raw, ['email', 'login', 'contactEmail']) || null;

  return {
    uuid: uuid || `${cpf}-${maybeWithLeadingZeros(pickString(raw, ['codigo', 'code']) || '')}`,
    cpf,
    name,
    birthday,
    phone,
    email,
  };
}
