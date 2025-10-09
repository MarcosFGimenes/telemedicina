type RapidocRecord = Record<string, unknown>;

export type BeneficiaryRecord = {
  uuid: string;
  cpf: string;
  name: string;
  birthday?: string | null;
  phone?: string | null;
  email?: string | null;
  zipCode?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  serviceType?: string | null;
  paymentType?: string | null;
  isActive?: boolean | null;
  clientId?: string | null;
  dependents?: RapidocRecord[] | null;
  plans?: RapidocRecord[] | null;
  raw?: RapidocRecord;
};

const isRecord = (value: unknown): value is RapidocRecord =>
  typeof value === 'object' && value !== null;

const nestedRecordKeys = ['beneficiary', 'beneficiario', 'data', 'payload', 'result', 'item'];

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

const pickBoolean = (record: RapidocRecord, keys: string[]): boolean | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'ativo', 'active'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'inativo', 'inactive'].includes(normalized)) {
        return false;
      }
    }
  }
  return null;
};

const pickRecordArray = (record: RapidocRecord, keys: string[]): RapidocRecord[] | null => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const filtered = value.filter(isRecord);
      if (filtered.length) {
        return filtered;
      }
    }
  }
  return null;
};

const sanitizeCpf = (value: string) => value.replace(/\D/g, '');

const maybeWithLeadingZeros = (value: string) => {
  if (value.length === 10) {
    return `0${value}`;
  }
  return value;
};

const unwrapRecord = (record: RapidocRecord): RapidocRecord => {
  for (const key of nestedRecordKeys) {
    const nested = record[key];
    if (isRecord(nested)) {
      return nested;
    }
  }
  return record;
};

export function normalizeBeneficiaryRecord(
  raw: RapidocRecord,
  fallbackCpf: string,
): BeneficiaryRecord {
  const source = unwrapRecord(raw);

  const uuid =
    pickString(source, ['uuid', 'id', 'beneficiaryUuid', 'beneficiaryId']) ||
    pickString(raw, ['uuid', 'id', 'beneficiaryUuid', 'beneficiaryId']) ||
    pickString(source, ['codigo', 'code']) ||
    pickString(raw, ['codigo', 'code']);

  const cpf = sanitizeCpf(
    pickString(source, ['cpf', 'document', 'documentNumber', 'holder']) ||
      pickString(raw, ['cpf', 'document', 'documentNumber', 'holder']) ||
      fallbackCpf,
  );

  const name =
    pickString(source, ['name', 'fullName', 'beneficiaryName', 'nome']) ||
    pickString(raw, ['name', 'fullName', 'beneficiaryName', 'nome']) ||
    'Beneficiario sem nome';

  const birthday =
    pickDate(source, ['birthday', 'birthDay', 'birthDate', 'dateOfBirth']) ||
    pickDate(raw, ['birthday', 'birthDay', 'birthDate', 'dateOfBirth']);

  const phone =
    pickString(source, ['phone', 'mobile', 'cellphone', 'cellPhone', 'phoneNumber']) ||
    pickString(raw, ['phone', 'mobile', 'cellphone', 'cellPhone', 'phoneNumber']) ||
    null;

  const email =
    pickString(source, ['email', 'login', 'contactEmail']) ||
    pickString(raw, ['email', 'login', 'contactEmail']) ||
    null;

  const zipCode =
    pickString(source, ['zipCode', 'cep']) || pickString(raw, ['zipCode', 'cep']) || null;

  const address =
    pickString(source, ['address', 'logradouro', 'endereco']) ||
    pickString(raw, ['address', 'logradouro', 'endereco']) ||
    null;

  const city =
    pickString(source, ['city', 'cidade']) || pickString(raw, ['city', 'cidade']) || null;

  const state =
    pickString(source, ['state', 'estado', 'uf']) || pickString(raw, ['state', 'estado', 'uf']) || null;

  const serviceType =
    pickString(source, ['serviceType', 'service_type']) ||
    pickString(raw, ['serviceType', 'service_type']) ||
    null;

  const paymentType =
    pickString(source, ['paymentType', 'payment_type']) ||
    pickString(raw, ['paymentType', 'payment_type']) ||
    null;

  const isActive =
    pickBoolean(source, ['isActive', 'active']) ?? pickBoolean(raw, ['isActive', 'active']);

  const plans = pickRecordArray(source, ['plans']) || pickRecordArray(raw, ['plans']);
  const dependents =
    pickRecordArray(source, ['dependents', 'dependentes']) ||
    pickRecordArray(raw, ['dependents', 'dependentes']);

  const fallbackCode =
    pickString(source, ['codigo', 'code']) || pickString(raw, ['codigo', 'code']) || '';

  return {
    uuid: uuid || `${cpf}-${maybeWithLeadingZeros(fallbackCode)}`,
    cpf,
    name,
    birthday,
    phone,
    email,
    zipCode,
    address,
    city,
    state,
    serviceType,
    paymentType,
    isActive: typeof isActive === 'boolean' ? isActive : null,
    clientId:
      pickString(source, ['clientId', 'client_id']) ||
      pickString(raw, ['clientId', 'client_id']) ||
      null,
    dependents: dependents || null,
    plans: plans || null,
    raw: source,
  };
}
