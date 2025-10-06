import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';

async function getAuth(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const decoded = await getAuth(req);
  if (!decoded) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = decoded.uid;
  const email = decoded.email || null;

  // carrega user doc por authUid (preferido) ou por e-mail
  const users = db.collection('users');
  let snap = await users.where('authUid', '==', uid).limit(1).get();
  if (snap.empty && email) snap = await users.where('email', '==', email).limit(1).get();

  const userDoc = snap.empty ? null : { id: snap.docs[0].id, ...(snap.docs[0].data() as Record<string, unknown>) };
  const cpf = (userDoc?.cpf as string | undefined) || null;

  // pagamentos por CPF
  let payments: unknown[] = [];
  if (cpf) {
    const pSnap = await db
      .collection('payments')
      .where('cpf', '==', cpf)
      .limit(50)
      .get()
      .catch(() => null);
    payments = pSnap?.docs?.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) || [];
  }

  return NextResponse.json({ ok: true, user: userDoc, payments });
}
