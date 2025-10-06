import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';

async function requireAuth(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) throw new Error('unauthorized');
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded;
}

export async function PATCH(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    const uid = decoded.uid;
    const email = decoded.email || null;
    const payload = await req.json();

    const allowed: Record<string, unknown> = {};
    const fields = ['name', 'email', 'phone', 'zipCode', 'address', 'city', 'state'];
    for (const f of fields) if (payload[f] !== undefined) allowed[f] = payload[f];
    allowed['updatedAt'] = new Date();

    const users = db.collection('users');
    let snap = await users.where('authUid', '==', uid).limit(1).get();
    if (snap.empty && email) snap = await users.where('email', '==', email).limit(1).get();
    if (snap.empty) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

    await snap.docs[0].ref.set(allowed, { merge: true });
    const updated = await snap.docs[0].ref.get();
    return NextResponse.json({ ok: true, user: { id: updated.id, ...(updated.data() as Record<string, unknown>) } });
  } catch (e: any) {
    const msg = e?.message || 'update_failed';
    const status = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

