import rapidoc from '@/lib/rapidoc';
import { rapidocFindByCpf, sanitizeCPF } from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord, type BeneficiaryRecord } from '@/utils/beneficiary';

export const VALID_PAYMENT_TYPES = new Set(['S', 'A']);
export const VALID_SERVICE_TYPES = new Set(['G', 'P', 'GP', 'GS', 'GSP']);

type RapidocPlanRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RapidocPlanRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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
    if (['true', '1', 'ativo', 'active', 'yes', 'a', 'enabled', 'ativo(a)'].includes(normalized)) return true;
    if (['false', '0', 'inativo', 'inactive', 'no', 'i', 'disabled', 'inativo(a)'].includes(normalized)) return false;
  }
  return null;
};

const looksLikePlan = (record: RapidocPlanRecord) => {
  const directKeys = [
    'serviceType',
    'service_type',
    'code',
    'planCode',
    'plan_code',
    'planId',
    'plan_id',
    'planName',
    'plan_name',
    'name',
  ];

  return directKeys.some((key) => typeof record[key] === 'string');
};

const extractPlanRecords = (raw: unknown): RapidocPlanRecord[] => {
  const results: RapidocPlanRecord[] = [];
  const visited = new WeakSet<object>();

  const traverse = (value: unknown, depth: number) => {
    if (!value || depth > 6) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (isRecord(item)) {
          if (looksLikePlan(item)) {
            results.push(item);
          }
          traverse(item, depth + 1);
        } else {
          traverse(item, depth + 1);
        }
      });
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    if (looksLikePlan(value)) {
      results.push(value);
    }

    Object.entries(value).forEach(([key, nested]) => {
      const normalizedKey = key.toLowerCase();
      const shouldDive =
        depth < 3 || PLAN_LIST_KEYS.some((candidate) => normalizedKey.includes(candidate.toLowerCase()));
      if (shouldDive) {
        traverse(nested, depth + 1);
      }
    });
  };

  traverse(raw, 0);

  return Array.from(new Set(results));
};

const readNestedString = (
  record: RapidocPlanRecord,
  keys: readonly string[],
  depth = 0,
  visited = new WeakSet<object>(),
): string => {
  if (!record || depth > 6 || visited.has(record)) {
    return '';
  }
  visited.add(record);

  for (const key of keys) {
    const value = record[key];
    const direct = readString(value);
    if (direct) {
      return direct;
    }
    if (isRecord(value)) {
      const nested = readNestedString(value, keys, depth + 1, visited);
      if (nested) {
        return nested;
      }
    }
  }

  return '';
};

const normalizePlan = (record: RapidocPlanRecord): RapidocPlan | null => {
  const serviceType =
    readString(record.serviceType) ||
    readString(record.code) ||
    readString(record.planCode) ||
    readString(record.plan_code) ||
    readString(record.service_type) ||
    readString(record.serviceCode) ||
    readString(record.service_code) ||
    readString(record.id) ||
    readString(record.type) ||
    readNestedString(record, [
      'serviceType',
      'service_type',
      'code',
      'planCode',
      'plan_code',
      'serviceCode',
      'service_code',
      'type',
      'id',
      'plan',
      'service',
      'data',
      'attributes',
      'item',
      'details',
    ]);

  const normalizedServiceType = serviceType ? serviceType.toUpperCase() : '';
  if (!normalizedServiceType) {
    return null;
  }

  const name =
    readString(record.name) ||
    readString(record.planName) ||
    readString(record.plan_name) ||
    readString(record.title) ||
    readNestedString(record, [
      'name',
      'planName',
      'plan_name',
      'title',
      'plan',
      'data',
      'attributes',
      'details',
    ]) ||
    normalizedServiceType;

  const description =
    readString(record.description) ||
    readString(record.planDescription) ||
    readString(record.plan_description) ||
    readString(record.details) ||
    readNestedString(record, [
      'description',
      'planDescription',
      'plan_description',
      'details',
      'resume',
      'summary',
      'data',
      'attributes',
      'plan',
      'item',
    ]) ||
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

