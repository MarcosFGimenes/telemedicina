import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { sanitizeCPF } from '@/lib/rapidocService';
import { isValidEmail, isValidPhone } from '@/utils/format';

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
    const { uuid, overwrite, profile } = (await req.json()) || {};

    const beneficiaryUuid = typeof uuid === 'string' ? uuid.trim() : '';
    if (!beneficiaryUuid) return NextResponse.json({ error: 'missing_uuid' }, { status: 400 });

    const profileData = typeof profile === 'object' && profile ? (profile as Record<string, unknown>) : {};
    const cpf = sanitizeCPF(String(profileData?.cpf || ''));
    const name = typeof profileData?.name === 'string' ? profileData.name.trim() : '';
    const birthday = typeof profileData?.birthday === 'string' ? profileData.birthday.trim() : '';
    const phoneRaw = typeof profileData?.phone === 'string' ? profileData.phone.trim() : '';
    const phone = phoneRaw && isValidPhone(phoneRaw) ? phoneRaw : '';
    const emailFromProfile = typeof profileData?.email === 'string' ? profileData.email.trim() : '';

    const users = db.collection('users');
    let snap = await users.where('authUid', '==', uid).limit(1).get();
    if (snap.empty && email) snap = await users.where('email', '==', email).limit(1).get();

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
    if (emailFromProfile && isValidEmail(emailFromProfile)) {
      payload.email = emailFromProfile;
    } else if (email && isValidEmail(email)) {
      payload.email = email;
    }

    if (snap.empty) {
      // cria doc mínimo caso não exista
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

