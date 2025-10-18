import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '@/lib/firebaseAdmin';
import { firstAvailableSlug, slugify } from '@/lib/slug';
import type { PlanDefinition, PlanPayload, PlanUpdatePayload } from '@/types/plans';

const PLANS_COLLECTION = 'plans';

const normalizeDocumentId = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('O nome do plano é obrigatório.');
  }
  if (trimmed.includes('/')) {
    throw new Error('O nome do plano não pode conter "/".');
  }
  return trimmed;
};

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

const extractNumericalValue = (input: unknown): number => {
  const value = Number(
    typeof input === 'number' || typeof input === 'string'
      ? input
      : 0,
  );
  return Number.isFinite(value) ? value : 0;
};

const normalizePlanDoc = (doc: QueryDocumentSnapshot | DocumentSnapshot): PlanDefinition => {
  const data = (doc.data() || {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const storedServiceType = String(data.serviceType || '').trim().toUpperCase();
  const storedId = String(data.id || '').trim().toUpperCase();
  const serviceType = storedServiceType || storedId || String(doc.id || '').trim().toUpperCase();
  const id = storedId || storedServiceType || serviceType;
  const name = String(data.name || '').trim();
  const description = String(data.description || '').trim();
  const value = extractNumericalValue(data.value);
  const maxDependents = extractNumericalValue(data.maxDependents);
  const createdAt = toISOString(data.createdAt, now);
  const updatedAt = toISOString(data.updatedAt, createdAt);

  const fallbackSource = doc.id || id || serviceType || name || `${Date.now()}`;
  const fallbackSlug = slugify(fallbackSource) || slugify(`${Date.now()}`);

  const slug = firstAvailableSlug(
    typeof data.slug === 'string' ? data.slug : '',
    name,
    serviceType,
    id,
    doc.id,
  ) || `plano-${fallbackSlug}`;

  return {
    documentId: doc.id,
    slug,
    id: id || serviceType,
    serviceType: serviceType || id,
    name,
    description,
    value,
    maxDependents,
    createdAt,
    updatedAt,
  };
};

const findPlanDoc = async (identifier: string) => {
  const input = identifier.trim();
  if (!input) {
    return null;
  }

  const candidates = Array.from(new Set([input, input.toUpperCase(), input.toLowerCase()])) as string[];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const doc = await db.collection(PLANS_COLLECTION).doc(candidate).get();
    if (doc.exists) {
      return doc;
    }
  }

  const normalizedId = input.toUpperCase();
  if (normalizedId) {
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
  }

  const slug = slugify(input);
  if (slug) {
    const bySlug = await db
      .collection(PLANS_COLLECTION)
      .where('slug', '==', slug)
      .limit(1)
      .get();
    if (!bySlug.empty) {
      return bySlug.docs[0];
    }
  }

  return null;
};

const slugExists = async (slug: string, ignoreDocId?: string) => {
  if (!slug) {
    return false;
  }
  const snapshot = await db
    .collection(PLANS_COLLECTION)
    .where('slug', '==', slug)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return false;
  }

  const [doc] = snapshot.docs;
  if (ignoreDocId && doc.id === ignoreDocId) {
    return false;
  }

  return true;
};

const ensureUniqueSlug = async (candidate: string, ignoreDocId?: string) => {
  if (!candidate) {
    return candidate;
  }

  let slug = candidate;
  let counter = 2;
  while (await slugExists(slug, ignoreDocId)) {
    slug = `${candidate}-${counter}`;
    counter += 1;
  }

  return slug;
};

const resolvePlanSlug = async (
  payloadSlug: string | undefined,
  fallbacks: string[],
  ignoreDocId?: string,
) => {
  const baseSlug = firstAvailableSlug(payloadSlug, ...fallbacks);
  if (!baseSlug) {
    throw new Error('Não foi possível gerar uma URL única para o plano.');
  }
  return ensureUniqueSlug(baseSlug, ignoreDocId);
};

const persistSlugIfNeeded = async (
  doc: QueryDocumentSnapshot | DocumentSnapshot,
  plan: PlanDefinition,
) => {
  const data = doc.data() as Record<string, unknown> | undefined;
  const storedSlug = typeof data?.slug === 'string' ? slugify(data.slug) : '';
  if (plan.slug && storedSlug !== plan.slug) {
    await doc.ref.update({ slug: plan.slug });
  }
};

export async function listPlans(): Promise<PlanDefinition[]> {
  const snapshot = await db.collection(PLANS_COLLECTION).orderBy('name').get();

  const plans = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const plan = normalizePlanDoc(doc);
      await persistSlugIfNeeded(doc, plan);
      return plan;
    }),
  );

  return plans.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function getPlan(id: string): Promise<PlanDefinition | null> {
  const doc = await findPlanDoc(id);
  if (!doc) {
    return null;
  }
  const plan = normalizePlanDoc(doc);
  await persistSlugIfNeeded(doc, plan);
  return plan;
}

export async function getPlanBySlug(slug: string): Promise<PlanDefinition | null> {
  const normalizedSlug = slugify(slug);
  if (!normalizedSlug) {
    return null;
  }

  const snapshot = await db
    .collection(PLANS_COLLECTION)
    .where('slug', '==', normalizedSlug)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const plan = normalizePlanDoc(doc);
    await persistSlugIfNeeded(doc, plan);
    return plan.slug === normalizedSlug ? plan : null;
  }

  const fallbackDoc = await findPlanDoc(normalizedSlug);
  if (!fallbackDoc) {
    return null;
  }
  const plan = normalizePlanDoc(fallbackDoc);
  await persistSlugIfNeeded(fallbackDoc, plan);
  return plan.slug === normalizedSlug ? plan : null;
}

export async function createPlan(payload: PlanPayload): Promise<PlanDefinition> {
  const id = payload.id.trim().toUpperCase();
  if (!id) {
    throw new Error('O código do plano é obrigatório.');
  }

  const name = payload.name.trim();
  if (!name) {
    throw new Error('O nome do plano é obrigatório.');
  }

  const documentId = normalizeDocumentId(name);
  const docRef = db.collection(PLANS_COLLECTION).doc(documentId);
  const docSnapshot = await docRef.get();
  if (docSnapshot.exists) {
    throw new Error('Já existe um plano com esse nome.');
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

  const slug = await resolvePlanSlug(payload.slug, [name, id], undefined);

  const data = {
    id,
    serviceType: id,
    slug,
    name,
    description: payload.description?.trim() || '',
    value,
    maxDependents,
    createdAt: now,
    updatedAt: now,
  };

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

  const documentId = normalizeDocumentId(name);
  const willRenameDocument = documentId !== doc.id;

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

  const slug = await resolvePlanSlug(payload.slug, [current.slug, name, current.name, current.id], doc.id);

  const updatedAt = new Date().toISOString();

  if (!willRenameDocument) {
    await doc.ref.update({
      name,
      value,
      description,
      maxDependents,
      slug,
      updatedAt,
    });

    const refreshed = await doc.ref.get();
    return normalizePlanDoc(refreshed);
  }

  const newDocRef = db.collection(PLANS_COLLECTION).doc(documentId);
  const collision = await newDocRef.get();
  if (collision.exists) {
    throw new Error('Já existe um plano com esse nome.');
  }

  const baseData = (doc.data() || {}) as Record<string, unknown>;

  await newDocRef.set({
    ...baseData,
    id: current.id,
    serviceType: current.serviceType || current.id,
    slug,
    name,
    description,
    value,
    maxDependents,
    createdAt: baseData.createdAt ?? current.createdAt,
    updatedAt,
  });

  await doc.ref.delete();

  const refreshed = await newDocRef.get();
  return normalizePlanDoc(refreshed);
}

export async function deletePlan(id: string): Promise<void> {
  const doc = await findPlanDoc(id);
  if (!doc) {
    throw new Error('Plano não encontrado.');
  }

  await doc.ref.delete();
}
