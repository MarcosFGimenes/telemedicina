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
  } catch (_error) {
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
  } catch (_error) {
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
  const attempts: Array<() => Promise<unknown>> = [
    () => attemptGet('getByCPF', `/beneficiaries/cpf/${digits}`),
    () => attemptGet('getByCPF', '/beneficiaries', { params: { cpf: digits } }),
    () => attemptGet('getByCPF', `/beneficiaries/document/${digits}`),
  ];

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      if (Array.isArray(data)) {
        return data[0];
      }
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        continue;
      }
      throw error;
    }
  }

  throw { status: 404, hint: 'rapidoc-cpf-not-found' } satisfies HintedError;
}

export async function createBeneficiaryOne(payload: BeneficiaryInput) {
  const id = nextLogId();
  const start = Date.now();
  const url = '/beneficiaries';
  logRequest(id, 'create', url, [payload]);

  try {
    const response = await rapidoc.post(url, [payload]);
    logResponse(id, response.status, start);
    const data = Array.isArray(response.data) ? response.data[0] : response.data;
    const uuid = data?.uuid ?? data?.id;
    return { uuid, raw: data };
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
  try {
    const existing = await getBeneficiaryByCPF(payload.cpf);
    const uuid = existing?.uuid ?? existing?.id;
    return { uuid, created: false, raw: existing };
  } catch (error) {
    if (isHintedError(error) && error.hint === 'rapidoc-cpf-not-found') {
      const { uuid, raw } = await createBeneficiaryOne(payload);
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
