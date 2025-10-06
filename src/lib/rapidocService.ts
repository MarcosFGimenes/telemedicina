/**
 * Testes (Postman):
 * 1. Criar pagamento no Asaas e obter o paymentId.
 * 2. Confirmar pagamento no sandbox e aguardar status RECEIVED/CONFIRMED.
 * 3. GET /api/checkout/status/{paymentId} para validar o status.
 * 4. POST /api/checkout/finalizar com { paymentId, cpf } e verificar ensured.uuid.
 * 5. GET /api/rapidoc/beneficiaries/cpf/{cpf} para confirmar o beneficiário ativo.
 */

import axios, { AxiosRequestConfig } from 'axios';
import rapidoc from '@/lib/rapidoc';

export type BeneficiaryInput = {
  name: string;
  cpf: string;
  birthday?: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  paymentType?: string;
  serviceType?: string;
  holder?: string;
  general?: string;
};

const nextLogId = () => Math.random().toString(36).slice(2, 10);
const logDataPreview = (value: unknown) => {
  if (value == null) {
    return 'null';
  }

  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized.length > 400 ? `${serialized.slice(0, 400)}…` : serialized;
  } catch {
    return '[unserializable]';
  }
};

const buildBodySize = (value: unknown) => {
  if (value == null) {
    return 0;
  }

  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return Buffer.byteLength(serialized, 'utf8');
  } catch {
    return 0;
  }
};

const logRequest = (id: string, op: string, url: string, body?: unknown) => {
  const size = buildBodySize(body);
  console.info(`[rapidoc:srv:req:${id}] op=${op} url=${url} bodySize=${size}`);
};

const logResponse = (id: string, status: number, start: number) => {
  console.info(`[rapidoc:srv:res:${id}] status=${status} ms=${Date.now() - start}`);
};

const logError = (id: string, status: number | string, start: number, data: unknown) => {
  console.error(
    `[rapidoc:srv:err:${id}] status=${status} ms=${Date.now() - start} data=${logDataPreview(data)}`,
  );
};

export const sanitizeCPF = (cpf: string) => cpf.replace(/\D/g, '');

type HintedError = { hint?: string; status?: number };
const isHintedError = (value: unknown): value is HintedError =>
  typeof value === 'object' && value !== null && 'hint' in value;

const candidateDocument = (record: Record<string, unknown> | null | undefined) => {
  if (!record) {
    return undefined;
  }

  const possibleKeys = ['cpf', 'document', 'cpfCnpj', 'holder', 'documentNumber', 'cpfNumber'];
  for (const key of possibleKeys) {
    const value = record[key];
    if (typeof value === 'string') {
      const digits = sanitizeCPF(value);
      if (digits) {
        return digits;
      }
    }

    if (typeof value === 'object' && value !== null) {
      const nested = candidateDocument(value as Record<string, unknown>);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
};

const findBeneficiaryCandidate = (raw: unknown, cpfDigits: string) => {
  if (!raw) {
    return null;
  }

  const inspectRecord = (record: Record<string, unknown>) => {
    const document = candidateDocument(record);
    if (!document || document !== cpfDigits) {
      return null;
    }
    return record;
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'object' && entry !== null) {
        const match = inspectRecord(entry as Record<string, unknown>);
        if (match) {
          return match;
        }
      }
    }
    return null;
  }

  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.content)) {
      for (const entry of record.content) {
        if (typeof entry === 'object' && entry !== null) {
          const match = inspectRecord(entry as Record<string, unknown>);
          if (match) {
            return match;
          }
        }
      }
    }

    const directMatch = inspectRecord(record);
    if (directMatch) {
      return directMatch;
    }
  }

  return null;
};

const extractIdentifier = (record: Record<string, unknown> | null | undefined) => {
  if (!record) {
    return undefined;
  }

  const candidateKeys = ['uuid', 'id', 'beneficiaryUuid', 'identifier'];
  for (const key of candidateKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const attemptGet = async <T>(op: string, url: string, config?: AxiosRequestConfig<unknown>): Promise<T> => {
  const id = nextLogId();
  const start = Date.now();
  const requestPayload: unknown = config?.data ?? config?.params ?? null;
  logRequest(id, op, url, requestPayload);

  try {
    const response = await rapidoc.get<T>(url, config);
    logResponse(id, response.status, start);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 'ERR';
      logError(id, status, start, error.response?.data ?? error.message);
    } else {
      logError(id, 'ERR', start, error instanceof Error ? error.message : error);
    }

    throw error;
  }
};

export async function getBeneficiaryByCPF(cpf: string) {
  const digits = sanitizeCPF(cpf);

  try {
    const data = await attemptGet('getByCPF', '/beneficiaries', { params: { cpf: digits } });
    const match = findBeneficiaryCandidate(data, digits);
    if (match) {
      return match;
    }
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 404) {
      throw error;
    }
  }

  throw { status: 404, hint: 'rapidoc-cpf-not-found' } satisfies HintedError;
}

export async function createBeneficiaryOne(payload: BeneficiaryInput) {
  const id = nextLogId();
  const start = Date.now();
  const url = '/beneficiaries';
  const digits = sanitizeCPF(payload.cpf);
  const normalizedPayload: BeneficiaryInput = {
    ...payload,
    cpf: digits,
    phone: payload.phone ? payload.phone.replace(/\D/g, '') : undefined,
    zipCode: payload.zipCode ? payload.zipCode.replace(/\D/g, '') : undefined,
    holder: payload.holder ? payload.holder.replace(/\D/g, '') : undefined,
  };
  logRequest(id, 'create', url, [normalizedPayload]);

  try {
    const response = await rapidoc.post(url, [normalizedPayload], {
      headers: { 'Content-Type': 'application/vnd.rapidoc.tema-v2+json' },
    });
    logResponse(id, response.status, start);
    const rawData = response.data as
      | Array<Record<string, unknown>>
      | { content?: Array<Record<string, unknown>> }
      | Record<string, unknown>
      | undefined;
    const match = findBeneficiaryCandidate(rawData, digits);
    const uuid = extractIdentifier(match ?? null);
    return { uuid, raw: response.data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 'ERR';
      logError(id, status, start, error.response?.data ?? error.message);
    } else {
      logError(id, 'ERR', start, error instanceof Error ? error.message : error);
    }
    throw error;
  }
}

export async function ensureBeneficiaryByCPF(payload: BeneficiaryInput) {
  const digits = sanitizeCPF(payload.cpf);
  try {
    const existing = await getBeneficiaryByCPF(digits);
    const uuid = extractIdentifier(existing as Record<string, unknown>);
    if (!uuid) {
      throw { status: 404, hint: 'rapidoc-cpf-not-found' } satisfies HintedError;
    }
    return { uuid, created: false, raw: existing };
  } catch (error) {
    if (isHintedError(error) && error.hint === 'rapidoc-cpf-not-found') {
      const { uuid, raw } = await createBeneficiaryOne(payload);
      if (!uuid) {
        throw new Error('rapidoc-ensure: Beneficiário sem identificador retornado');
      }
      return { uuid, created: true, raw };
    }
    throw error;
  }
}

export async function reactivateBeneficiary(uuid: string) {
  const id = nextLogId();
  const start = Date.now();
  const url = `/beneficiaries/${uuid}/reactivate`;
  logRequest(id, 'reactivate', url, {});

  try {
    const response = await rapidoc.put(url, {});
    logResponse(id, response.status, start);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 'ERR';
      logError(id, status, start, error.response?.data ?? error.message);
      if (status === 409 || status === 422) {
        return error.response?.data;
      }
    } else {
      logError(id, 'ERR', start, error instanceof Error ? error.message : error);
    }

    throw error;
  }
}
