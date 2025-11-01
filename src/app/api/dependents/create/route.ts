import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { getPlan } from '@/lib/plansStore';
import {
  sanitizeCPF,
  type RapidocBeneficiaryPayload,
  rapidocCreateOrResolveUuid,
} from '@/lib/rapidocService';

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
    const body = (await req.json()) as Partial<RapidocBeneficiaryPayload> & {
      name?: string;
      cpf?: string;
      birthday?: string;
    };

    const name = String(body?.name || '').trim();
    const cpf = sanitizeCPF(String(body?.cpf || ''));
    const birthday = String(body?.birthday || '').trim();

    if (!name || !cpf || !birthday) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    // Load current user doc
    const users = db.collection('users');
    let userSnap = await users.where('authUid', '==', uid).limit(1).get();
    if (userSnap.empty && decoded.email) {
      userSnap = await users.where('email', '==', decoded.email).limit(1).get();
    }
    const userDoc = userSnap.empty ? null : userSnap.docs[0];
    const userData = (userDoc?.data() as Record<string, unknown>) || {};

    // Resolve max dependents
    let limit: number | null = null;
    const rawLimit = userData?.maxDependents;
    if (typeof rawLimit === 'number') {
      limit = Number.isFinite(rawLimit) ? rawLimit : null;
    } else if (typeof rawLimit === 'string') {
      const n = Number(rawLimit);
      limit = Number.isFinite(n) ? n : null;
    }
    if (limit == null) {
      const stRaw = userData?.serviceType;
      const serviceType = typeof stRaw === 'string' ? stRaw.trim().toUpperCase() : '';
      if (serviceType) {
        const plan = await getPlan(serviceType).catch(() => null);
        if (plan && typeof plan.maxDependents === 'number') {
          limit = plan.maxDependents;
        }
      }
    }

    // Count active dependents
    const existing = await db
      .collection('dependents')
      .where('ownerUid', '==', uid)
      .get();
    const activeCount = existing.docs.filter((d) => {
      const s = String(((d.data() as any)?.status || 'active') as string).toLowerCase();
      const disabled = Boolean((d.data() as any)?.disabled);
      return !disabled && s !== 'inactive' && s !== 'inativo';
    }).length;

    if (limit != null && Number.isFinite(limit) && activeCount >= Number(limit)) {
      return NextResponse.json(
        { error: 'dependents_limit_reached', limit, count: activeCount },
        { status: 409 },
      );
    }

    // Create beneficiary in Rapidoc (ensure or resolve)
    const userCpf = String(userData?.cpf || '').replace(/\D/g, '');
    const userServiceType = String(userData?.serviceType || '').trim().toUpperCase();
    
    const payload: RapidocBeneficiaryPayload = {
      name,
      cpf,
      birthday,
      phone: body?.phone,
      email: body?.email,
      zipCode: body?.zipCode,
      address: body?.address,
      city: body?.city,
      state: body?.state,
      paymentType: (body?.paymentType || userData?.paymentType || 'S') as 'S' | 'A',
      // Por enquanto mantemos serviceType para compatibilidade; a nova API usa plans
      serviceType: (body?.serviceType || userServiceType || 'GS') as any,
      holder: body?.holder || userCpf || undefined,
      general: body?.general || undefined,
    };

    const ensured = await rapidocCreateOrResolveUuid(payload);
    const uuid = ensured.uuid;

    // Store dependent doc and link to user
    const depPayload: Record<string, unknown> = {
      ownerUid: uid,
      uuid,
      name,
      cpf,
      status: 'active',
      createdAt: new Date(),
    };
    await db.collection('dependents').add(depPayload);

    if (userDoc) {
      await userDoc.ref.set(
        { dependentUuids: FieldValue.arrayUnion(uuid), updatedAt: new Date() },
        { merge: true },
      );
    } else if (decoded.email) {
      await users.add({
        authUid: uid,
        email: decoded.email,
        dependentUuids: [uuid],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({ ok: true, uuid, ensured: ensured.created });
  } catch (e: any) {
    const status = e?.message === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: e?.message || 'failed' }, { status });
  }
}

