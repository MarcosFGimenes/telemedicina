import rapidoc from '@/lib/rapidoc';
import { rapidocFindByCpf, sanitizeCPF } from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord, type BeneficiaryRecord } from '@/utils/beneficiary';

export const VALID_PAYMENT_TYPES = new Set(['S', 'A']);
export const VALID_SERVICE_TYPES = new Set(['G', 'P', 'GP', 'GS', 'GSP']);

type RapidocPlanRecord = Record<string, unknown>;

export type RapidocPlan = {
  uuid?: string;
  serviceType: string;
  name: string;
  description: string;
  isActive: boolean;
  raw: RapidocPlanRecord;
};

export type BeneficiarySummary = BeneficiaryRecord & {
  serviceType: string;
  paymentType: 'S' | 'A';
};

type PlansCache = {
  expiresAt: number;
  plans: RapidocPlan[];
};

const PLAN_CACHE_TTL = 1000 * 60 * 60 * 12; // 12 horas
let plansCache: PlansCache | null = null;

const PLAN_LIST_KEYS = ['content', 'items', 'data', 'results', 'plans'];

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const readBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'ativo', 'active', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'inativo', 'inactive', 'no'].includes(normalized)) return false;
  }
  return null;
};

const extractPlanRecords = (raw: unknown): RapidocPlanRecord[] => {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is RapidocPlanRecord => Boolean(item) && typeof item === 'object');
  }
  if (raw && typeof raw === 'object') {
    for (const key of PLAN_LIST_KEYS) {
      const nested = (raw as Record<string, unknown>)[key];
      if (Array.isArray(nested)) {
        return nested.filter((item): item is RapidocPlanRecord => Boolean(item) && typeof item === 'object');
      }
    }
  }
  return [];
};

const normalizePlan = (record: RapidocPlanRecord): RapidocPlan | null => {
  const serviceType =
    readString(record.serviceType) ||
    readString(record.code) ||
    readString(record.planCode) ||
    readString(record.id) ||
    readString(record.type);

  const normalizedServiceType = serviceType ? serviceType.toUpperCase() : '';
  if (!normalizedServiceType) {
    return null;
  }

  const name =
    readString(record.name) ||
    readString(record.planName) ||
    readString(record.title) ||
    normalizedServiceType;

  const description =
    readString(record.description) ||
    readString(record.planDescription) ||
    readString(record.details) ||
    '';

  const uuid =
    readString(record.uuid) ||
    readString(record.id) ||
    readString(record.planId) ||
    readString(record.externalId);

  const active =
    readBoolean(record.isActive) ??
    readBoolean(record.active) ??
    readBoolean(record.status) ??
    true;

  return {
    uuid: uuid || undefined,
    serviceType: normalizedServiceType,
    name: name || normalizedServiceType,
    description,
    isActive: active,
    raw: record,
  } satisfies RapidocPlan;
};

const dedupePlans = (plans: RapidocPlan[]): RapidocPlan[] => {
  const map = new Map<string, RapidocPlan>();
  plans.forEach((plan) => {
    const existing = map.get(plan.serviceType);
    if (!existing) {
      map.set(plan.serviceType, plan);
      return;
    }
    if (!existing.isActive && plan.isActive) {
      map.set(plan.serviceType, plan);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

export const fallbackPlanName = (serviceType: string): string => {
  switch (serviceType.toUpperCase()) {
    case 'G':
      return 'Generalista';
    case 'P':
      return 'Psicologia';
    case 'GP':
      return 'Generalista + Psicologia';
    case 'GS':
      return 'Generalista + Especialistas';
    case 'GSP':
      return 'Generalista + Especialistas + Psicologia';
    default:
      return '';
  }
};

export async function fetchPlans(options?: { force?: boolean }): Promise<RapidocPlan[]> {
  const force = options?.force ?? false;
  if (!force && plansCache && plansCache.expiresAt > Date.now()) {
    return plansCache.plans;
  }

  const { data } = await rapidoc.get('/tema/api/plans');
  const records = extractPlanRecords(data);
  const mapped = records
    .map((record) => normalizePlan(record))
    .filter((plan): plan is RapidocPlan => Boolean(plan));
  const deduped = dedupePlans(mapped);

  plansCache = { plans: deduped, expiresAt: Date.now() + PLAN_CACHE_TTL };
  return deduped;
}

export async function getPlanByServiceType(serviceType: string): Promise<RapidocPlan | null> {
  const normalized = serviceType.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  const plans = await fetchPlans();
  return plans.find((plan) => plan.serviceType === normalized) ?? null;
}

export async function fetchBeneficiaryByCpf(cpf: string): Promise<BeneficiarySummary> {
  const sanitized = sanitizeCPF(cpf);
  if (!sanitized) {
    const error = new Error('CPF obrigatório para consulta Rapidoc.');
    (error as { status?: number }).status = 400;
    throw error;
  }

  const raw = await rapidocFindByCpf(sanitized);
  if (!raw) {
    const error = new Error('Beneficiário não encontrado na Rapidoc.');
    (error as { status?: number }).status = 404;
    throw error;
  }

  const normalized = normalizeBeneficiaryRecord(raw as Record<string, unknown>, sanitized);
  const uuid = normalized.uuid?.trim();
  if (!uuid) {
    const error = new Error('Rapidoc retornou beneficiário sem identificador.');
    (error as { status?: number }).status = 502;
    throw error;
  }

  const serviceTypeRaw = String(normalized.serviceType || '').trim().toUpperCase();
  if (!VALID_SERVICE_TYPES.has(serviceTypeRaw)) {
    const error = new Error('Rapidoc retornou serviceType inválido ou ausente.');
    (error as { status?: number }).status = 502;
    (error as { hint?: string }).hint = 'invalid_service_type';
    throw error;
  }

  const paymentTypeRaw = String(normalized.paymentType || '').trim().toUpperCase();
  if (!VALID_PAYMENT_TYPES.has(paymentTypeRaw)) {
    const error = new Error('Rapidoc retornou paymentType inválido ou ausente.');
    (error as { status?: number }).status = 502;
    (error as { hint?: string }).hint = 'invalid_payment_type';
    throw error;
  }

  return {
    ...normalized,
    cpf: sanitizeCPF(normalized.cpf),
    serviceType: serviceTypeRaw,
    paymentType: paymentTypeRaw as 'S' | 'A',
    raw: normalized.raw ?? (raw as Record<string, unknown>),
  };
}

export function clearPlansCache() {
  plansCache = null;
}

