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

function derivePlanName(serviceType?: string) {
  const st = (serviceType || '').toUpperCase();
  switch (st) {
    case 'G':
      return 'Generalista';
    case 'P':
      return 'Psicologia';
    case 'GP':
      return 'Generalista + Psicologia';
    case 'GS':
      return 'Generalista + Especialistas';
    case 'GSP':
      return 'Generalista + Especialistas + Psicologia';
    default:
      return '';
  }
}

export async function PUT(req: NextRequest) {
  const decoded = await getAuth(req);
  if (!decoded) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = decoded.uid;
  const email = decoded.email || null;

  const payload = (await req.json()) as { serviceType?: string; paymentType?: string; planName?: string };
  const serviceType = (payload.serviceType || '').toUpperCase();
  const paymentType = payload.paymentType || undefined;
  const planName = payload.planName || derivePlanName(serviceType);

  const users = db.collection('users');
  let snap = await users.where('authUid', '==', uid).limit(1).get();
  if (snap.empty && email) snap = await users.where('email', '==', email).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: 'user-not-found' }, { status: 404 });

  const ref = snap.docs[0].ref;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (serviceType) updates.serviceType = serviceType;
  if (paymentType) updates.paymentType = paymentType;
  if (planName) updates.planName = planName;

  await ref.set(updates, { merge: true });
  return NextResponse.json({ ok: true, planName, serviceType, paymentType });
}

