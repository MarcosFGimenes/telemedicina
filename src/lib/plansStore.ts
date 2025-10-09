import { promises as fs } from 'fs';
import path from 'path';
import type { PlanDefinition, PlanPayload, PlanUpdatePayload } from '@/types/plans';

const plansFilePath = path.join(process.cwd(), 'src', 'data', 'plans.json');

async function ensureFile() {
  try {
    await fs.access(plansFilePath);
  } catch {
    await fs.mkdir(path.dirname(plansFilePath), { recursive: true });
    await fs.writeFile(plansFilePath, '[]', 'utf8');
  }
}

async function readPlans(): Promise<PlanDefinition[]> {
  await ensureFile();
  const content = await fs.readFile(plansFilePath, 'utf8');
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((plan) => {
      const id = String(plan.id || plan.serviceType || '').trim().toUpperCase();
      const serviceType = String(plan.serviceType || id).trim().toUpperCase();
      const rawMax = Number(plan.maxDependents);
      return {
        id,
        serviceType,
        name: String(plan.name || '').trim(),
        description: String(plan.description || '').trim(),
        value: Number(plan.value || 0),
        maxDependents: Number.isFinite(rawMax) && rawMax > 0 ? Math.trunc(rawMax) : null,
        createdAt: plan.createdAt || new Date().toISOString(),
        updatedAt: plan.updatedAt || plan.createdAt || new Date().toISOString(),
      } satisfies PlanDefinition;
    });
  } catch {
    return [];
  }
}

async function writePlans(plans: PlanDefinition[]) {
  const payload = JSON.stringify(plans, null, 2);
  await fs.writeFile(plansFilePath, payload, 'utf8');
}

export async function listPlans(): Promise<PlanDefinition[]> {
  const plans = await readPlans();
  return plans
    .map((plan) => ({
      ...plan,
      id: plan.id.toUpperCase(),
      serviceType: plan.serviceType.toUpperCase(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function getPlan(id: string): Promise<PlanDefinition | null> {
  const plans = await readPlans();
  const normalizedId = id.toUpperCase();
  return (
    plans.find((plan) => plan.id.toUpperCase() === normalizedId || plan.serviceType.toUpperCase() === normalizedId) ?? null
  );
}

export async function createPlan(payload: PlanPayload): Promise<PlanDefinition> {
  const plans = await readPlans();
  const id = (payload.id || payload.serviceType || '').trim().toUpperCase();
  const serviceType = (payload.serviceType || payload.id || '').trim().toUpperCase();
  if (!id) {
    throw new Error('O código do plano é obrigatório.');
  }

  if (!serviceType) {
    throw new Error('O serviceType do plano é obrigatório.');
  }

  if (plans.some((plan) => plan.id === id || plan.serviceType === serviceType)) {
    throw new Error('Já existe um plano com esse código/serviceType.');
  }

  const name = payload.name.trim();
  if (!name) {
    throw new Error('O nome do plano é obrigatório.');
  }

  const value = Number(payload.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Informe um valor válido para o plano.');
  }

  let maxDependents: number | null = null;
  if (payload.maxDependents !== undefined && payload.maxDependents !== null) {
    const parsed = Number(payload.maxDependents);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Informe um número válido para o máximo de dependentes.');
    }
    maxDependents = parsed === 0 ? null : Math.trunc(parsed);
  }

  const now = new Date().toISOString();
  const plan: PlanDefinition = {
    id,
    serviceType,
    name,
    description: payload.description?.trim() || '',
    value,
    maxDependents,
    createdAt: now,
    updatedAt: now,
  };

  plans.push(plan);
  await writePlans(plans);
  return plan;
}

export async function updatePlan(id: string, payload: PlanUpdatePayload): Promise<PlanDefinition> {
  const plans = await readPlans();
  const normalizedId = id.trim().toUpperCase();
  const index = plans.findIndex((plan) => plan.id === normalizedId);
  if (index === -1) {
    throw new Error('Plano não encontrado.');
  }

  const current = plans[index];
  const name = payload.name !== undefined ? payload.name.trim() : current.name;
  if (!name) {
    throw new Error('O nome do plano é obrigatório.');
  }

  const value =
    payload.value !== undefined
      ? Number(payload.value)
      : current.value;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Informe um valor válido para o plano.');
  }

  const description =
    payload.description !== undefined
      ? payload.description.trim()
      : current.description;

  let serviceType = current.serviceType;
  if (payload.serviceType !== undefined) {
    const normalized = (payload.serviceType || '').trim().toUpperCase();
    if (!normalized) {
      throw new Error('O serviceType do plano é obrigatório.');
    }
    const alreadyExists = plans.some(
      (plan, idx) => idx !== index && (plan.serviceType === normalized || plan.id === normalized),
    );
    if (alreadyExists) {
      throw new Error('Já existe outro plano com esse serviceType.');
    }
    serviceType = normalized;
  }

  let maxDependents = current.maxDependents;
  if (payload.maxDependents !== undefined) {
    if (payload.maxDependents === null) {
      maxDependents = null;
    } else {
      const parsed = Number(payload.maxDependents);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Informe um número válido para o máximo de dependentes.');
      }
      maxDependents = parsed === 0 ? null : Math.trunc(parsed);
    }
  }

  const updated: PlanDefinition = {
    ...current,
    serviceType,
    name,
    value,
    description,
    maxDependents,
    updatedAt: new Date().toISOString(),
  };

  plans[index] = updated;
  await writePlans(plans);
  return updated;
}

export async function deletePlan(id: string): Promise<void> {
  const plans = await readPlans();
  const normalizedId = id.trim().toUpperCase();
  const filtered = plans.filter((plan) => plan.id !== normalizedId);
  if (filtered.length === plans.length) {
    throw new Error('Plano não encontrado.');
  }

  await writePlans(filtered);
}
