import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import {
  onlyDigits,
  rapidocGetBeneficiary,
  rapidocUpdateBeneficiary,
} from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord } from '@/utils/beneficiary';

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

const pickString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
};

const pickDigits = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string') {
      const digits = onlyDigits(value);
      if (digits) {
        return digits;
      }
    }
  }
  return '';
};

const assignNullable = (payload: Record<string, unknown>, key: string, ...values: unknown[]) => {
  const value = pickString(...values);
  payload[key] = value || null;
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

    const dependentDoc = dependentSnap.docs[0];
    const dependentData = (dependentDoc.data() as Record<string, unknown>) || {};
    const rapidocDependent = await rapidocGetBeneficiary(uuid);
    if (!rapidocDependent) {
      return NextResponse.json({ error: 'dependent_beneficiary_not_found' }, { status: 404 });
    }

    const fallbackCpf = pickDigits(
      dependentData['cpf'],
      dependentData['document'],
      dependentData['holder'],
      dependentData['holderCpf'],
      (rapidocDependent as Record<string, unknown>)['cpf'],
      (rapidocDependent as Record<string, unknown>)['document'],
      (rapidocDependent as Record<string, unknown>)['holder'],
    );

    const normalizedDependent = normalizeBeneficiaryRecord(rapidocDependent, fallbackCpf);
    const rawDependent = (normalizedDependent.raw ?? {}) as Record<string, unknown>;

    const payload: Record<string, unknown> = {
      serviceType,
    };

    const resolvedName =
      pickString(
        normalizedDependent.name,
        dependentData['name'],
        rawDependent['name'],
        rawDependent['fullName'],
        rawDependent['beneficiaryName'],
        rawDependent['nome'],
      ) || 'Dependente';
    payload.name = resolvedName;

    assignNullable(
      payload,
      'birthday',
      normalizedDependent.birthday,
      dependentData['birthday'],
      rawDependent['birthDay'],
      rawDependent['birthDate'],
      rawDependent['birthday'],
      rawDependent['dateOfBirth'],
    );
    assignNullable(
      payload,
      'phone',
      normalizedDependent.phone,
      dependentData['phone'],
      rawDependent['phone'],
      rawDependent['mobile'],
      rawDependent['cellphone'],
      rawDependent['cellPhone'],
      rawDependent['phoneNumber'],
    );
    assignNullable(
      payload,
      'email',
      normalizedDependent.email,
      dependentData['email'],
      rawDependent['email'],
      rawDependent['login'],
      rawDependent['contactEmail'],
    );
    assignNullable(
      payload,
      'zipCode',
      normalizedDependent.zipCode,
      dependentData['zipCode'],
      rawDependent['zipCode'],
      rawDependent['cep'],
    );
    assignNullable(
      payload,
      'address',
      normalizedDependent.address,
      dependentData['address'],
      rawDependent['address'],
      rawDependent['logradouro'],
      rawDependent['endereco'],
    );
    assignNullable(
      payload,
      'city',
      normalizedDependent.city,
      dependentData['city'],
      rawDependent['city'],
      rawDependent['cidade'],
    );
    const resolvedState = pickString(
      normalizedDependent.state,
      dependentData['state'],
      rawDependent['state'],
      rawDependent['estado'],
      rawDependent['uf'],
    );
    payload.state = resolvedState ? resolvedState.toUpperCase() : null;

    const paymentType = pickString(
      normalizedDependent.paymentType,
      dependentData['paymentType'],
      rawDependent['paymentType'],
      rawDependent['payment_type'],
    );
    payload.paymentType = (paymentType || 'S').toUpperCase();

    const holderValue = pickString(
      rawDependent['holder'],
      dependentData['holder'],
      dependentData['holderCpf'],
      dependentData['cpf'],
      fallbackCpf,
    );
    if (holderValue) {
      payload.holder = holderValue;
    }

    const generalValue = pickString(
      rawDependent['general'],
      dependentData['general'],
      dependentData['generalInfo'],
    );
    payload.general = generalValue || null;

    if (fallbackCpf) {
      payload.cpf = fallbackCpf;
    }

    await rapidocUpdateBeneficiary(uuid, payload);

    await dependentDoc.ref.set(
      {
        serviceType,
        planServiceType: serviceType,
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
