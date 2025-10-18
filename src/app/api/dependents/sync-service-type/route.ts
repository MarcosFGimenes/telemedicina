import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { rapidocGetBeneficiary, rapidocUpdateBeneficiary } from '@/lib/rapidocService';

async function requireAuth(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) throw new Error('unauthorized');
  return adminAuth.verifyIdToken(token);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readServiceType = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim().toUpperCase();
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.serviceType === 'string') {
      return record.serviceType.trim().toUpperCase();
    }
    if (typeof record.id === 'string') {
      return record.id.trim().toUpperCase();
    }
  }
  return '';
};

const readTrimmed = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    const body = (await req.json()) as { uuid?: string } | null;
    const uuid = typeof body?.uuid === 'string' ? body.uuid.trim() : '';
    if (!uuid) {
      return NextResponse.json({ error: 'missing_uuid' }, { status: 400 });
    }

    const ownerUid = decoded.uid;
    const dependentSnap = await db
      .collection('dependents')
      .where('ownerUid', '==', ownerUid)
      .where('uuid', '==', uuid)
      .limit(1)
      .get();

    if (dependentSnap.empty) {
      return NextResponse.json({ error: 'dependent_not_found' }, { status: 404 });
    }

    const users = db.collection('users');
    let userSnap = await users.where('authUid', '==', ownerUid).limit(1).get();
    if (userSnap.empty && decoded.email) {
      userSnap = await users.where('email', '==', decoded.email).limit(1).get();
    }

    const userDoc = userSnap.empty ? null : userSnap.docs[0];
    const userData = (userDoc?.data() as Record<string, unknown>) || {};

    const candidates: unknown[] = [
      userData.serviceType,
      userData.planServiceType,
      userData.planId,
      userData.currentPlanServiceType,
      (userData.plan as Record<string, unknown> | undefined)?.serviceType,
      (userData.plan as Record<string, unknown> | undefined)?.id,
    ];

    let serviceType = '';
    for (const candidate of candidates) {
      const normalized = readServiceType(candidate);
      if (normalized) {
        serviceType = normalized;
        break;
      }
    }

    if (!serviceType) {
      const beneficiaryUuid = readTrimmed(userData.beneficiaryUuid);
      if (beneficiaryUuid) {
        const record = await rapidocGetBeneficiary(beneficiaryUuid).catch(() => null);
        if (record && typeof record === 'object') {
          serviceType = readServiceType((record as Record<string, unknown>).serviceType);
          if (!serviceType) {
            serviceType = readServiceType((record as Record<string, unknown>).service_type);
          }
        }
      }
    }

    if (!serviceType) {
      return NextResponse.json({ error: 'owner_service_type_not_found' }, { status: 422 });
    }

    await rapidocUpdateBeneficiary(uuid, { serviceType });

    await dependentSnap.docs[0].ref.set(
      {
        serviceType,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, serviceType });
  } catch (error: unknown) {
    let status = 500;
    let message = 'failed';

    if (error instanceof Error && error.message === 'unauthorized') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (isRecord(error)) {
      if (typeof error.status === 'number') {
        status = error.status;
      }
      const response = error.response;
      if (isRecord(response)) {
        if (typeof response.status === 'number') {
          status = response.status;
        }
        const data = response.data;
        if (isRecord(data)) {
          const responseMessage = readTrimmed(data.message) || readTrimmed(data.error);
          if (responseMessage) {
            message = responseMessage;
          }
        } else if (typeof data === 'string' && data.trim()) {
          message = data.trim();
        }
      }
      if (!message || message === 'failed') {
        const ownMessage = readTrimmed(error.message);
        if (ownMessage) {
          message = ownMessage;
        }
      }
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }

    return NextResponse.json({ error: message || 'failed' }, { status });
  }
}
