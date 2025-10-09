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
    return parsed.map((plan) => ({
      id: String(plan.id || plan.serviceType || '').toUpperCase(),
      name: String(plan.name || '').trim(),
      description: String(plan.description || '').trim(),
      value: Number(plan.value || 0),
      createdAt: plan.createdAt || new Date().toISOString(),
      updatedAt: plan.updatedAt || plan.createdAt || new Date().toISOString(),
    })) as PlanDefinition[];
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
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function getPlan(id: string): Promise<PlanDefinition | null> {
  const plans = await readPlans();
  const normalizedId = id.toUpperCase();
  return plans.find((plan) => plan.id.toUpperCase() === normalizedId) ?? null;
}

export async function createPlan(payload: PlanPayload): Promise<PlanDefinition> {
  const plans = await readPlans();
  const id = payload.id.trim().toUpperCase();
  if (!id) {
    throw new Error('O código do plano é obrigatório.');
  }

  if (plans.some((plan) => plan.id === id)) {
    throw new Error('Já existe um plano com esse código.');
  }

  const name = payload.name.trim();
  if (!name) {
    throw new Error('O nome do plano é obrigatório.');
  }

  const value = Number(payload.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Informe um valor válido para o plano.');
  }

  const now = new Date().toISOString();
  const plan: PlanDefinition = {
    id,
    name,
    description: payload.description?.trim() || '',
    value,
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

  const updated: PlanDefinition = {
    ...current,
    name,
    value,
    description,
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
