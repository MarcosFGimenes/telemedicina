import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { getPlan } from '@/lib/plansStore';

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

type PlanMetadata = { planName: string; maxDependents: number | null | undefined };

async function derivePlanMetadata(serviceType?: string): Promise<PlanMetadata> {
  const st = (serviceType || '').toUpperCase();
  if (!st) {
    return { planName: '', maxDependents: undefined };
  }

  const plan = await getPlan(st);
  if (plan) {
    return { planName: plan.name, maxDependents: plan.maxDependents ?? null };
  }

  switch (st) {
    case 'G':
      return { planName: 'Generalista', maxDependents: null };
    case 'P':
      return { planName: 'Psicologia', maxDependents: null };
    case 'GP':
      return { planName: 'Generalista + Psicologia', maxDependents: null };
    case 'GS':
      return { planName: 'Generalista + Especialistas', maxDependents: null };
    case 'GSP':
      return { planName: 'Generalista + Especialistas + Psicologia', maxDependents: null };
    default:
      return { planName: '', maxDependents: null };
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
  const metadata = await derivePlanMetadata(serviceType);
  const planName = payload.planName || metadata.planName;

  const users = db.collection('users');
  let snap = await users.where('authUid', '==', uid).limit(1).get();
  if (snap.empty && email) snap = await users.where('email', '==', email).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: 'user-not-found' }, { status: 404 });

  const ref = snap.docs[0].ref;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (serviceType) updates.serviceType = serviceType;
  if (paymentType) updates.paymentType = paymentType;
  if (planName) updates.planName = planName;
  if (metadata.maxDependents !== undefined) updates.maxDependents = metadata.maxDependents;

  await ref.set(updates, { merge: true });
  return NextResponse.json({ ok: true, planName, serviceType, paymentType, maxDependents: metadata.maxDependents });
}

