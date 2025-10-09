import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { derivePlanMetadata } from '@/lib/planMetadata';
import { sanitizeCPF } from '@/lib/rapidocService';
import { isValidEmail, isValidPhone } from '@/utils/format';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asTrimmedString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asRecordArray = (value: unknown): Record<string, unknown>[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter(isRecord);
  return filtered.length ? filtered : undefined;
};

const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'ativo', 'active'].includes(normalized)) return true;
    if (['false', '0', 'inativo', 'inactive'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

async function requireAuth(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) throw new Error('unauthorized');
  return adminAuth.verifyIdToken(token);
}

export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    const uid = decoded.uid;
    const email = decoded.email || null;
    const {
      uuid,
      overwrite,
      profile,
      rapidocSnapshot,
      rapidocPlans,
      rapidocDependents,
    } = (await req.json()) || {};

    const beneficiaryUuid = typeof uuid === 'string' ? uuid.trim() : '';
    if (!beneficiaryUuid) {
      return NextResponse.json({ error: 'missing_uuid' }, { status: 400 });
    }

    const profileData = isRecord(profile) ? profile : {};
    const cpf = sanitizeCPF(String(profileData?.cpf || ''));
    const name = asTrimmedString(profileData?.name);
    const birthday = asTrimmedString(profileData?.birthday);
    const phoneRaw = asTrimmedString(profileData?.phone);
    const phone = phoneRaw && isValidPhone(phoneRaw) ? phoneRaw : '';
    const emailFromProfile = asTrimmedString(profileData?.email);
    const zipCode = asTrimmedString(profileData?.zipCode);
    const address = asTrimmedString(profileData?.address);
    const city = asTrimmedString(profileData?.city);
    const state = asTrimmedString(profileData?.state);
    const serviceType = asTrimmedString(profileData?.serviceType);
    const paymentType = asTrimmedString(profileData?.paymentType);
    const clientId = asTrimmedString(profileData?.clientId);
    const isActive = asBoolean(profileData?.isActive);

    const plans = asRecordArray(profileData?.plans) ?? asRecordArray(rapidocPlans);
    const dependents =
      asRecordArray(profileData?.dependents) ?? asRecordArray(rapidocDependents);
    const snapshot = isRecord(rapidocSnapshot)
      ? rapidocSnapshot
      : isRecord(profileData?.raw)
        ? (profileData.raw as Record<string, unknown>)
        : undefined;

    const users = db.collection('users');
    let snap = await users.where('authUid', '==', uid).limit(1).get();
    if (snap.empty && email) {
      snap = await users.where('email', '==', email).limit(1).get();
    }

    const now = new Date();
    const payload: Record<string, unknown> = {
      authUid: uid,
      beneficiaryUuid,
      status: 'active',
      updatedAt: now,
    };

    if (cpf) payload.cpf = cpf;
    if (name) payload.name = name;
    if (birthday) payload.birthday = birthday;
    if (phone) payload.phone = phone;
    if (zipCode) payload.zipCode = zipCode;
    if (address) payload.address = address;
    if (city) payload.city = city;
    if (state) payload.state = state;
    if (serviceType) {
      payload.serviceType = serviceType;
      const metadata = await derivePlanMetadata(serviceType);
      if (metadata.planName) payload.planName = metadata.planName;
      if (metadata.planDescription) payload.planDescription = metadata.planDescription;
      if (metadata.maxDependents !== undefined) payload.maxDependents = metadata.maxDependents;
    }
    if (paymentType) payload.paymentType = paymentType;
    if (typeof isActive === 'boolean') payload.isActive = isActive;
    if (clientId) payload.clientId = clientId;
    if (plans) payload.rapidocPlans = plans;
    if (dependents) payload.rapidocDependents = dependents;
    if (snapshot) payload.rapidocSnapshot = snapshot;

    if (emailFromProfile && isValidEmail(emailFromProfile)) {
      payload.email = emailFromProfile;
    } else if (email && isValidEmail(email)) {
      payload.email = email;
    }

    if (snap.empty) {
      const created = await users.add({ ...payload, createdAt: now });
      return NextResponse.json({ ok: true, userId: created.id, linked: true, created: true });
    }

    const doc = snap.docs[0];
    const data = doc.data() as Record<string, unknown>;
    const already = (data?.beneficiaryUuid as string | undefined) || '';
    if (already && !overwrite) {
      return NextResponse.json({ ok: true, userId: doc.id, linked: false, reason: 'already_set' });
    }

    await doc.ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, userId: doc.id, linked: true });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : 'failed';
    const status = message === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
