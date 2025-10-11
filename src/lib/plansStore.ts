import { promises as fs } from 'fs';
import path from 'path';
import { Timestamp, type DocumentData, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { db } from '@/lib/firebaseAdmin';
import type { PlanDefinition, PlanPayload, PlanUpdatePayload } from '@/types/plans';

const plansCollection = () => db.collection('plans');
const legacyPlansPath = path.join(process.cwd(), 'src', 'data', 'plans.json');

let migrationAttempted = false;

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeUpper = (value: unknown): string => normalizeString(value).toUpperCase();

const toIsoString = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value && typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      const asDate = (value as { toDate: () => Date }).toDate();
      return asDate.toISOString();
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const toMaxDependents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized === 0 ? null : normalized;
};

const toPlanDefinition = (
  snapshot: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>,
): PlanDefinition | null => {
  const data = snapshot.data();
  if (!data) {
    return null;
  }

  const id = normalizeUpper(data.id || snapshot.id);
  const serviceType = normalizeUpper(data.serviceType || id);
  if (!id || !serviceType) {
    return null;
  }

  const name = normalizeString(data.name) || serviceType;
  const description = normalizeString(data.description);
  const value = Number(data.value);
  const maxDependents = toMaxDependents(data.maxDependents);
  const nowIso = new Date().toISOString();
  const createdAt = toIsoString(data.createdAt, nowIso);
  const updatedAt = toIsoString(data.updatedAt, createdAt);

  return {
    id,
    serviceType,
    name,
    description,
    value: Number.isFinite(value) && value > 0 ? value : 0,
    maxDependents,
    createdAt,
    updatedAt,
  };
};

const readLegacyPlans = async (): Promise<PlanDefinition[]> => {
  try {
    const content = await fs.readFile(legacyPlansPath, 'utf8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        const id = normalizeUpper(entry?.id || entry?.serviceType || '');
        const serviceType = normalizeUpper(entry?.serviceType || entry?.id || id);
        const name = normalizeString(entry?.name) || serviceType;
        const description = normalizeString(entry?.description);
        const value = Number(entry?.value);
        const maxDependents = toMaxDependents(entry?.maxDependents);
        if (!id || !serviceType || !name || !Number.isFinite(value) || value <= 0) {
          return null;
        }
        const nowIso = new Date().toISOString();
        const createdAt = toIsoString(entry?.createdAt, nowIso);
        const updatedAt = toIsoString(entry?.updatedAt, createdAt);
        return {
          id,
          serviceType,
          name,
          description,
          value,
          maxDependents,
          createdAt,
          updatedAt,
        } satisfies PlanDefinition;
      })
      .filter((plan): plan is PlanDefinition => Boolean(plan));
  } catch {
    return [];
  }
};

const maybeMigrateLegacyPlans = async () => {
  if (migrationAttempted) {
    return;
  }
  migrationAttempted = true;

  try {
    const snapshot = await plansCollection().limit(1).get();
    if (!snapshot.empty) {
      return;
    }

    const legacyPlans = await readLegacyPlans();
    if (legacyPlans.length === 0) {
      return;
    }

    const batch = db.batch();
    legacyPlans.forEach((plan) => {
      const docRef = plansCollection().doc(plan.id);
      batch.set(docRef, plan);
    });

    await batch.commit();
  } catch (error) {
    console.warn('[plansStore] Legacy plan migration skipped', error);
  }
};

const ensureUniqueServiceType = async (serviceType: string, ignoreId?: string) => {
  const snapshot = await plansCollection().where('serviceType', '==', serviceType).get();
  if (snapshot.empty) {
    return;
  }

  const duplicate = snapshot.docs.find((doc) => normalizeUpper(doc.id) !== normalizeUpper(ignoreId));
  if (duplicate) {
    throw new Error('Ja existe um plano com esse codigo/serviceType.');
  }
};

export async function listPlans(): Promise<PlanDefinition[]> {
  await maybeMigrateLegacyPlans();
  const snapshot = await plansCollection().get();
  return snapshot.docs
    .map((doc) => toPlanDefinition(doc))
    .filter((plan): plan is PlanDefinition => Boolean(plan))
    .map((plan) => ({
      ...plan,
      id: plan.id.toUpperCase(),
      serviceType: plan.serviceType.toUpperCase(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function getPlan(id: string): Promise<PlanDefinition | null> {
  await maybeMigrateLegacyPlans();
  const normalizedId = normalizeUpper(id);
  if (!normalizedId) {
    return null;
  }

  const doc = await plansCollection().doc(normalizedId).get();
  const byId = toPlanDefinition(doc);
  if (byId) {
    return byId;
  }

  const byServiceTypeSnapshot = await plansCollection()
    .where('serviceType', '==', normalizedId)
    .limit(1)
    .get();
  const candidate = byServiceTypeSnapshot.docs[0];
  return candidate ? toPlanDefinition(candidate) : null;
}

export async function createPlan(payload: PlanPayload): Promise<PlanDefinition> {
  await maybeMigrateLegacyPlans();

  const id = normalizeUpper(payload.id || payload.serviceType || '');
  const serviceType = normalizeUpper(payload.serviceType || payload.id || '');
  if (!id) {
    throw new Error('O codigo do plano e obrigatorio.');
  }
  if (!serviceType) {
    throw new Error('O serviceType do plano e obrigatorio.');
  }

  const name = normalizeString(payload.name);
  if (!name) {
    throw new Error('O nome do plano e obrigatorio.');
  }

  const value = Number(payload.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Informe um valor valido para o plano.');
  }

  const docRef = plansCollection().doc(id);
  const existing = await docRef.get();
  if (existing.exists) {
    throw new Error('Ja existe um plano com esse codigo/serviceType.');
  }

  await ensureUniqueServiceType(serviceType);

  let maxDependents: number | null = null;
  if (payload.maxDependents !== undefined && payload.maxDependents !== null) {
    const parsed = Number(payload.maxDependents);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Informe um numero valido para o maximo de dependentes.');
    }
    maxDependents = parsed === 0 ? null : Math.trunc(parsed);
  }

  const now = new Date().toISOString();
  const plan: PlanDefinition = {
    id,
    serviceType,
    name,
    description: normalizeString(payload.description),
    value,
    maxDependents,
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(plan);
  return plan;
}

export async function updatePlan(id: string, payload: PlanUpdatePayload): Promise<PlanDefinition> {
  await maybeMigrateLegacyPlans();

  const normalizedId = normalizeUpper(id);
  if (!normalizedId) {
    throw new Error('Plano nao encontrado.');
  }

  const docRef = plansCollection().doc(normalizedId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new Error('Plano nao encontrado.');
  }

  const current = toPlanDefinition(snapshot);
  if (!current) {
    throw new Error('Plano invalido.');
  }

  const name =
    payload.name !== undefined ? normalizeString(payload.name) : current.name;
  if (!name) {
    throw new Error('O nome do plano e obrigatorio.');
  }

  const value =
    payload.value !== undefined ? Number(payload.value) : current.value;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Informe um valor valido para o plano.');
  }

  const description =
    payload.description !== undefined
      ? normalizeString(payload.description)
      : current.description;

  let serviceType = current.serviceType;
  if (payload.serviceType !== undefined) {
    const normalizedServiceType = normalizeUpper(payload.serviceType);
    if (!normalizedServiceType) {
      throw new Error('O serviceType do plano e obrigatorio.');
    }
    if (normalizedServiceType !== current.serviceType) {
      await ensureUniqueServiceType(normalizedServiceType, current.id);
    }
    serviceType = normalizedServiceType;
  }

  let maxDependents = current.maxDependents;
  if (payload.maxDependents !== undefined) {
    if (payload.maxDependents === null) {
      maxDependents = null;
    } else {
      const parsed = Number(payload.maxDependents);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Informe um numero valido para o maximo de dependentes.');
      }
      maxDependents = parsed === 0 ? null : Math.trunc(parsed);
    }
  }

  const updated: PlanDefinition = {
    ...current,
    serviceType,
    name,
    description,
    value,
    maxDependents,
    updatedAt: new Date().toISOString(),
  };

  await docRef.set(updated);
  return updated;
}

export async function deletePlan(id: string): Promise<void> {
  await maybeMigrateLegacyPlans();

  const normalizedId = normalizeUpper(id);
  if (!normalizedId) {
    throw new Error('Plano nao encontrado.');
  }

  const docRef = plansCollection().doc(normalizedId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new Error('Plano nao encontrado.');
  }

  await docRef.delete();
}
