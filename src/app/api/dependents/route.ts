import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';

async function requireAuth(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) throw new Error('unauthorized');
  return adminAuth.verifyIdToken(token);
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    const uid = decoded.uid;
    const list = await db
      .collection('dependents')
      .where('ownerUid', '==', uid)
      .get();
    const data = list.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    return NextResponse.json({ ok: true, dependents: data });
  } catch (e: any) {
    const status = e?.message === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: e?.message || 'failed' }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    const uid = decoded.uid;
    const body = await req.json();
    const uuid = String(body?.uuid || '').trim();
    if (!uuid) return NextResponse.json({ error: 'missing_uuid' }, { status: 400 });
    const payload: Record<string, unknown> = {
      ownerUid: uid,
      uuid,
      name: body?.name || null,
      cpf: body?.cpf || null,
      createdAt: new Date(),
    };
    const created = await db.collection('dependents').add(payload);
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    const status = e?.message === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: e?.message || 'failed' }, { status });
  }
}
