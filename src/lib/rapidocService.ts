import axios from 'axios';

const DEFAULT_API_PREFIX = '/tema/api';
const ABSOLUTE_URL_REGEX = /^https?:\/\//i;

const rawBaseUrl = (process.env.RAPIDOC_BASE_URL ?? '').trim();
const RAPIDOC_TOKEN = (process.env.RAPIDOC_TOKEN ?? '').trim();
const RAPIDOC_CLIENT_ID = (process.env.RAPIDOC_CLIENT_ID ?? '').trim();

if (!rawBaseUrl) {
  throw new Error('RAPIDOC_BASE_URL is not defined');
}

let normalizedRawBaseUrl = rawBaseUrl;
if (normalizedRawBaseUrl.startsWith('http://')) {
  normalizedRawBaseUrl = normalizedRawBaseUrl.replace(/^http:\/\//, 'https://');
}

const parsedBaseUrl = (() => {
  try {
    return new URL(normalizedRawBaseUrl);
  } catch {
    throw new Error(`Invalid RAPIDOC_BASE_URL: ${normalizedRawBaseUrl}`);
  }
})();

const baseURL = `${parsedBaseUrl.protocol}//${parsedBaseUrl.host}`;
const parsedPathname = parsedBaseUrl.pathname.replace(/\/+$/, '');
const apiPrefix =
  parsedPathname && parsedPathname !== '/' ? parsedPathname : DEFAULT_API_PREFIX;

const rapidoc = axios.create({
  baseURL,
  timeout: 30000,
});

const ensureLeadingSlash = (value: string) => {
  if (!value) {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
};

const ensureApiPrefix = (value?: string | null) => {
  if (!value) {
    return apiPrefix;
  }

  if (ABSOLUTE_URL_REGEX.test(value)) {
    return value;
  }

  const normalized = ensureLeadingSlash(String(value).trim());
  const normalizedPrefix = apiPrefix === '/' ? '' : apiPrefix;

  if (!normalizedPrefix) {
    return normalized;
  }

  if (normalized === '/') {
    return normalizedPrefix;
  }

  if (normalized.startsWith(normalizedPrefix)) {
    return normalized;
  }

  const prefix = normalizedPrefix.endsWith('/')
    ? normalizedPrefix.slice(0, -1)
    : normalizedPrefix;

  const path = normalized === '/' ? '' : normalized;
  return `${prefix}${path}`;
};

rapidoc.defaults.headers.common.Accept = 'application/json';
if (RAPIDOC_TOKEN) {
  rapidoc.defaults.headers.common.Authorization = `Bearer ${RAPIDOC_TOKEN}`;
}
if (RAPIDOC_CLIENT_ID) {
  rapidoc.defaults.headers.common.clientId = RAPIDOC_CLIENT_ID;
}
rapidoc.defaults.headers.post['Content-Type'] = 'application/vnd.rapidoc.tema-v2+json';
rapidoc.defaults.headers.put['Content-Type'] = 'application/vnd.rapidoc.tema-v2+json';
rapidoc.defaults.headers.patch['Content-Type'] = 'application/vnd.rapidoc.tema-v2+json';

rapidoc.interceptors.request.use((config) => {
  const isAbsoluteUrl = typeof config.url === 'string' && ABSOLUTE_URL_REGEX.test(config.url);
  if (!isAbsoluteUrl) {
    config.url = ensureApiPrefix(config.url);
  }
  config.baseURL = baseURL;
  return config;
});

export const onlyDigits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
export const sanitizeCPF = (cpf: string) => onlyDigits(cpf);

export type RapidocBeneficiaryPayload = {
  name: string;
  cpf: string;
  birthday: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  paymentType?: 'S' | 'A';
  serviceType?: 'G' | 'P' | 'GP' | 'GS' | 'GSP';
  holder?: string;
  general?: string;
};

type RapidocRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RapidocRecord =>
  typeof value === 'object' && value !== null;

const extractList = (raw: unknown): RapidocRecord[] => {
  if (Array.isArray(raw)) {
    return raw.filter(isRecord);
  }
  if (isRecord(raw) && Array.isArray(raw.content)) {
    return raw.content.filter(isRecord);
  }
  if (isRecord(raw) && Array.isArray(raw.items)) {
    return raw.items.filter(isRecord);
  }
  if (isRecord(raw) && Array.isArray(raw.beneficiaries)) {
    return raw.beneficiaries.filter(isRecord);
  }
  return [];
};

export const extractBeneficiaries = extractList;

const readDigits = (value: unknown) => (typeof value === 'string' ? onlyDigits(value) : '');

const matchByCpf = (list: RapidocRecord[], cpf: string) => {
  const digits = onlyDigits(cpf);
  return (
    list.find((entry) => readDigits(entry.cpf) === digits || readDigits(entry.document) === digits) ??
    null
  );
};

const nestedRecordKeys = ['beneficiary', 'beneficiario', 'data', 'payload', 'result', 'item'];

const normalizeForMatch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const readMessage = (raw: unknown) => {
  if (!isRecord(raw)) {
    return '';
  }
  const message = raw.message ?? (isRecord(raw.error) ? raw.error.message : raw.error);
  return typeof message === 'string' ? message : '';
};

const unwrapSingleRecord = (raw: unknown): RapidocRecord | null => {
  if (isRecord(raw)) {
    for (const key of nestedRecordKeys) {
      const nested = raw[key];
      if (isRecord(nested)) {
        return nested;
      }
    }
    return raw;
  }
  return null;
};

const isExplicitNotFound = (raw: unknown) => {
  if (!isRecord(raw)) return false;
  if (raw.success === false) {
    const message = normalizeForMatch(readMessage(raw));
    return message.includes('nao encontrado') || message.includes('beneficiario nao localizado');
  }
  return false;
};

const ensureBeneficiaryRecord = (raw: unknown, cpf: string): RapidocRecord | null => {
  const nested = unwrapSingleRecord(raw);
  if (nested && (readDigits(nested.cpf) || readDigits(nested.document))) {
    return nested;
  }
  const list = extractList(raw);
  if (list.length) {
    const match = matchByCpf(list, cpf);
    if (match) return match;
    if (list.length === 1) return list[0];
  }
  return null;
};

export async function rapidocFindByCpf(cpf: string): Promise<RapidocRecord | null> {
  const clean = onlyDigits(cpf);
  if (!clean) {
    return null;
  }
  // Endpoint v2 por CPF via path param
  const { data } = await rapidoc.get(`/beneficiaries/${clean}`);
  if (isExplicitNotFound(data)) {
    return null;
  }
  if (isRecord(data) && data.success === false) {
    const message = readMessage(data) || 'Rapidoc CPF lookup failed';
    const error = new Error(message) as RapidocHintedError;
    error.hint = 'rapidoc-cpf-failed';
    error.status = 502;
    error.upstream = data;
    throw error;
  }
  const found = ensureBeneficiaryRecord(data, clean);
  return found;
}

export async function rapidocListBeneficiaries(params?: Record<string, string | number | undefined>) {
  const query = params ?? {};
  // Endpoint Rapidoc: GET /beneficiaries
  const { data } = await rapidoc.get('/beneficiaries', { params: query });
  if (isExplicitNotFound(data)) {
    return [];
  }
  if (isRecord(data) && data.success === false) {
    const message = readMessage(data) || 'Rapidoc list query failed';
    const error = new Error(message);
    (error as RapidocHintedError).hint = 'rapidoc-list-failed';
    (error as RapidocHintedError).status = 502;
    (error as RapidocHintedError).upstream = data;
    throw error;
  }
  return extractList(data);
}

export type RapidocPostResult = { uuid?: string; raw: unknown; error?: unknown };

export async function rapidocPostBeneficiary(one: RapidocBeneficiaryPayload): Promise<RapidocPostResult> {
  const body = [
    {
      ...one,
      cpf: onlyDigits(one.cpf),
      phone: one.phone ? onlyDigits(one.phone) : undefined,
      zipCode: one.zipCode ? onlyDigits(one.zipCode) : undefined,
      holder: one.holder ? onlyDigits(one.holder) : undefined,
    },
  ];

  try {
    const { data } = await rapidoc.post('/beneficiaries', body);
    return { uuid: undefined, raw: data };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return { uuid: undefined, raw: error.response.data, error };
    }
    throw error;
  }
}

export type RapidocEnsureResult = { uuid: string; created: boolean; raw: unknown };

type RapidocHintedError = Error & { hint?: string; status?: number; upstream?: unknown };

const asHintedError = (message: string, raw: unknown): RapidocHintedError => {
  const error = new Error(message) as RapidocHintedError;
  error.hint = 'rapidoc-ensure';
  error.status = 502;
  error.upstream = raw;
  return error;
};

const hasEmptyBeneficiaries = (raw: unknown) => {
  if (!isRecord(raw)) {
    return false;
  }
  const { beneficiaries } = raw;
  return Array.isArray(beneficiaries) && beneficiaries.length === 0;
};

export async function rapidocCreateOrResolveUuid(
  payload: RapidocBeneficiaryPayload,
): Promise<RapidocEnsureResult> {
  const created = await rapidocPostBeneficiary(payload);
  const candidateList = extractList(created.raw);
  if (Array.isArray(candidateList) && candidateList.length > 0) {
    const match = matchByCpf(candidateList, payload.cpf) ?? candidateList[0];
    const identifier = (match?.uuid ?? match?.id) as string | undefined;
    if (identifier) {
      return { uuid: String(identifier), created: true, raw: created.raw };
    }
  }

  const message = readMessage(created.raw);
  if (isRecord(created.raw) && created.raw.success === false && /cpf.*utilizado/i.test(message)) {
    const existing = await rapidocFindByCpf(payload.cpf);
    if (existing?.uuid) {
      return { uuid: String(existing.uuid), created: false, raw: created.raw };
    }
  }

  if (hasEmptyBeneficiaries(created.raw)) {
    const existing = await rapidocFindByCpf(payload.cpf);
    if (existing?.uuid) {
      return { uuid: String(existing.uuid), created: false, raw: created.raw };
    }
  }

  const fallback = await rapidocFindByCpf(payload.cpf);
  if (fallback?.uuid) {
    return { uuid: String(fallback.uuid), created: false, raw: created.raw };
  }

  throw asHintedError('rapidoc-ensure: Beneficiario sem identificador retornado', created.raw);
}

export async function getBeneficiaryByCPF(cpf: string) {
  const clean = sanitizeCPF(cpf);
  const found = await rapidocFindByCpf(clean);
  if (found) {
    return found;
  }
  const error = new Error('Beneficiario nao encontrado');
  (error as RapidocHintedError).hint = 'rapidoc-cpf-not-found';
  (error as RapidocHintedError).status = 404;
  throw error;
}

export async function ensureBeneficiaryByCPF(payload: RapidocBeneficiaryPayload) {
  const ensured = await rapidocCreateOrResolveUuid(payload);
  return { uuid: ensured.uuid, created: ensured.created, raw: ensured.raw };
}

export async function reactivateBeneficiary(uuid: string) {
  const { data } = await rapidoc.put(`/beneficiaries/${uuid}/reactivate`, {});
  return data;
}

export async function deactivateBeneficiary(uuid: string) {
  const { data } = await rapidoc.delete(`/beneficiaries/${uuid}`);
  return data;
}


