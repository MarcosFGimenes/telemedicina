import axios from 'axios';

const RAPIDOC_BASE_URL = (process.env.RAPIDOC_BASE_URL ?? '').trim();
const RAPIDOC_TOKEN = (process.env.RAPIDOC_TOKEN ?? '').trim();
const RAPIDOC_CLIENT_ID = (process.env.RAPIDOC_CLIENT_ID ?? '').trim();

if (!RAPIDOC_BASE_URL) {
  throw new Error('RAPIDOC_BASE_URL is not defined');
}

const rapidoc = axios.create({
  baseURL: RAPIDOC_BASE_URL,
  timeout: 30000,
});

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

export async function rapidocFindByCpf(cpf: string): Promise<RapidocRecord | null> {
  const clean = onlyDigits(cpf);
  if (!clean) {
    return null;
  }
  // Endpoint v2 por CPF via path param
  const { data } = await rapidoc.get(`/beneficiaries/${clean}`);
  if (isRecord(data)) return data;
  // fallback para listagem com filtro, caso ambiente retorne envelope diferente
  const list = extractList(data);
  const found = matchByCpf(list, clean);
  return found ?? null;
}

export async function rapidocListBeneficiaries(params?: Record<string, string | number | undefined>) {
  const query = params ?? {};
  // Endpoint Rapidoc: GET /beneficiaries
  const { data } = await rapidoc.get('/beneficiaries', { params: query });
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

const readMessage = (raw: unknown) => {
  if (!isRecord(raw)) {
    return '';
  }
  const message = raw.message ?? (isRecord(raw.error) ? raw.error.message : raw.error);
  return typeof message === 'string' ? message : '';
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

  throw asHintedError('rapidoc-ensure: Beneficiário sem identificador retornado', created.raw);
}

export async function getBeneficiaryByCPF(cpf: string) {
  const clean = sanitizeCPF(cpf);
  const found = await rapidocFindByCpf(clean);
  if (found) {
    return found;
  }
  const error = new Error('Beneficiário não encontrado');
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
