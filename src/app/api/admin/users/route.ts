import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { sanitizeCPF } from '@/lib/rapidocService';
import { isValidEmail, isValidPassword } from '@/utils/format';
import { requireAdmin } from './utils';

const ADMIN_ERROR = { error: 'forbidden' } as const;

type AdminUserPayload = {
  uid: string;
  email: string | null;
  beneficiaryUuid: string | null;
  disabled: boolean;
  status?: string | null;
  cpf?: string | null;
  name?: string | null;
  role?: string | null;
  lastSignIn?: string | null;
  createdAt?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const pageToken = req.nextUrl.searchParams.get('pageToken') || undefined;
    const list = await adminAuth.listUsers(1000, pageToken);

    const userDocs = await db.collection('users').get();
    const mappedDocs = new Map<string, Record<string, unknown>>();
    userDocs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const authUid = typeof data.authUid === 'string' ? data.authUid : '';
      if (authUid) mappedDocs.set(authUid, data);
    });

    const users: AdminUserPayload[] = list.users.map((user) => {
      const doc = mappedDocs.get(user.uid);
      return {
        uid: user.uid,
        email: user.email ?? null,
        beneficiaryUuid: (doc?.beneficiaryUuid as string | undefined) ?? null,
        disabled: user.disabled === true,
        status: (doc?.status as string | undefined) ?? null,
        cpf: (doc?.cpf as string | undefined) ?? null,
        name: (doc?.name as string | undefined) ?? null,
        role: (doc?.role as string | undefined) ?? null,
        lastSignIn: user.metadata.lastSignInTime ?? null,
        createdAt: user.metadata.creationTime ?? null,
      };
    });

    return NextResponse.json({ users, nextPageToken: list.pageToken ?? null });
  } catch (error: unknown) {
    const status = typeof (error as { statusCode?: number })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (status === 401 || status === 403) {
      return NextResponse.json(ADMIN_ERROR, { status });
    }
    console.error('[admin][users][GET]', error);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
}

type CreateUserBody = {
  email: string;
  password: string;
  beneficiaryUuid: string;
  cpf?: string;
  name?: string;
};

export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAdmin(req);
    const body = (await req.json()) as CreateUserBody;
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const beneficiaryUuid = typeof body?.beneficiaryUuid === 'string' ? body.beneficiaryUuid.trim() : '';
    const cpf = sanitizeCPF(body?.cpf ?? '');
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }
    if (!isValidPassword(password)) {
      return NextResponse.json({ error: 'weak_password' }, { status: 400 });
    }
    if (!beneficiaryUuid) {
      return NextResponse.json({ error: 'missing_beneficiary' }, { status: 400 });
    }

    const user = await adminAuth.createUser({ email, password, disabled: false });

    const now = new Date();
    await db.collection('users').add({
      authUid: user.uid,
      email,
      beneficiaryUuid,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      cpf: cpf || undefined,
      name: name || undefined,
      createdBy: decoded.uid,
    });

    const payload: AdminUserPayload = {
      uid: user.uid,
      email,
      beneficiaryUuid,
      disabled: false,
      status: 'active',
      cpf: cpf || null,
      name: name || null,
      role: null,
      lastSignIn: null,
      createdAt: user.metadata.creationTime ?? now.toISOString(),
    };

    return NextResponse.json({ user: payload });
  } catch (error: unknown) {
    const status = typeof (error as { statusCode?: number })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (status === 401 || status === 403) {
      return NextResponse.json(ADMIN_ERROR, { status });
    }
    console.error('[admin][users][POST]', error);
    const message = error instanceof Error && error.message ? error.message : 'create_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
