import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '@/lib/firebaseAdmin';
import type { PlanDefinition, PlanPayload, PlanUpdatePayload } from '@/types/plans';

const PLANS_COLLECTION = 'plans';

const toISOString = (value: unknown, fallback: string) => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const normalizePlanDoc = (doc: QueryDocumentSnapshot | DocumentSnapshot): PlanDefinition => {
  const data = (doc.data() || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const serviceType = String(data.serviceType || data.id || doc.id || '').trim().toUpperCase();
  const id = String(data.id || serviceType || doc.id || '').trim().toUpperCase() || serviceType;
  const name = String(data.name || '').trim();
  const description = String(data.description || '').trim();
  const valueRaw = data.value;
  const value = Number(
    typeof valueRaw === 'number' || typeof valueRaw === 'string' ? valueRaw : 0,
  );
  const normalizedValue = Number.isFinite(value) ? value : 0;
  const maxDependentsRaw = data.maxDependents;
  const maxDependents = Number(
    typeof maxDependentsRaw === 'number' || typeof maxDependentsRaw === 'string'
      ? maxDependentsRaw
      : 0,
  );

  const createdAt = toISOString(data.createdAt, now);
  const updatedAt = toISOString(data.updatedAt, createdAt);

  return {
    id: id || serviceType,
    serviceType: serviceType || id,
    name,
    description,
    value: normalizedValue,
    maxDependents: Number.isFinite(maxDependents) ? maxDependents : 0,
    createdAt,
    updatedAt,
  };
};

const findPlanDoc = async (id: string) => {
  const normalizedId = id.trim().toUpperCase();
  if (!normalizedId) {
    return null;
  }

  const direct = await db.collection(PLANS_COLLECTION).doc(normalizedId).get();
  if (direct.exists) {
    return direct;
  }

  const byId = await db
    .collection(PLANS_COLLECTION)
    .where('id', '==', normalizedId)
    .limit(1)
    .get();
  if (!byId.empty) {
    return byId.docs[0];
  }

  const byServiceType = await db
    .collection(PLANS_COLLECTION)
    .where('serviceType', '==', normalizedId)
    .limit(1)
    .get();
  if (!byServiceType.empty) {
    return byServiceType.docs[0];
  }

  return null;
};

export async function listPlans(): Promise<PlanDefinition[]> {
  const snapshot = await db.collection(PLANS_COLLECTION).orderBy('name').get();
  return snapshot.docs
    .map((doc) => normalizePlanDoc(doc))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function getPlan(id: string): Promise<PlanDefinition | null> {
  const doc = await findPlanDoc(id);
  if (!doc) {
    return null;
  }
  return normalizePlanDoc(doc);
}

export async function createPlan(payload: PlanPayload): Promise<PlanDefinition> {
  const id = payload.id.trim().toUpperCase();
  if (!id) {
    throw new Error('O código do plano é obrigatório.');
  }

  const existing = await findPlanDoc(id);
  if (existing) {
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

  const maxDependents =
    payload.maxDependents !== undefined ? Number(payload.maxDependents) : 0;
  if (!Number.isFinite(maxDependents) || maxDependents < 0) {
    throw new Error('Informe um número válido de dependentes.');
  }

  const now = new Date().toISOString();

  const data = {
    id,
    serviceType: id,
    name,
    description: payload.description?.trim() || '',
    value,
    maxDependents,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = db.collection(PLANS_COLLECTION).doc(id);
  await docRef.set(data);

  const created = await docRef.get();
  return normalizePlanDoc(created);
}

export async function updatePlan(id: string, payload: PlanUpdatePayload): Promise<PlanDefinition> {
  const doc = await findPlanDoc(id);
  if (!doc) {
    throw new Error('Plano não encontrado.');
  }

  const current = normalizePlanDoc(doc);

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

  const maxDependents =
    payload.maxDependents !== undefined
      ? Number(payload.maxDependents)
      : current.maxDependents;
  if (!Number.isFinite(maxDependents) || maxDependents < 0) {
    throw new Error('Informe um número válido de dependentes.');
  }

  const description =
    payload.description !== undefined
      ? payload.description.trim()
      : current.description;

  const updatedAt = new Date().toISOString();

  await doc.ref.update({
    name,
    value,
    description,
    maxDependents,
    updatedAt,
  });

  const refreshed = await doc.ref.get();
  return normalizePlanDoc(refreshed);
}

export async function deletePlan(id: string): Promise<void> {
  const doc = await findPlanDoc(id);
  if (!doc) {
    throw new Error('Plano não encontrado.');
  }

  await doc.ref.delete();
}
