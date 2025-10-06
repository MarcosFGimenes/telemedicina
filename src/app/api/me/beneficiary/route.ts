import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';

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
    const { uuid, overwrite } = (await req.json()) || {};

    const beneficiaryUuid = typeof uuid === 'string' ? uuid.trim() : '';
    if (!beneficiaryUuid) return NextResponse.json({ error: 'missing_uuid' }, { status: 400 });

    const users = db.collection('users');
    let snap = await users.where('authUid', '==', uid).limit(1).get();
    if (snap.empty && email) snap = await users.where('email', '==', email).limit(1).get();

    if (snap.empty) {
      // cria doc mínimo caso não exista
      const created = await users.add({ authUid: uid, email, beneficiaryUuid, status: 'active', createdAt: new Date(), updatedAt: new Date() });
      return NextResponse.json({ ok: true, userId: created.id, linked: true, created: true });
    }

    const doc = snap.docs[0];
    const data = doc.data() as Record<string, unknown>;
    const already = (data?.beneficiaryUuid as string | undefined) || '';
    if (already && !overwrite) {
      return NextResponse.json({ ok: true, userId: doc.id, linked: false, reason: 'already_set' });
    }

    await doc.ref.set({ beneficiaryUuid, status: 'active', updatedAt: new Date() }, { merge: true });
    return NextResponse.json({ ok: true, userId: doc.id, linked: true });
  } catch (e: any) {
    const status = e?.message === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: e?.message || 'failed' }, { status });
  }
}

