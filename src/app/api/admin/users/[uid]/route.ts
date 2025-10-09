import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { sanitizeCPF } from '@/lib/rapidocService';
import { isValidEmail, isValidPassword } from '@/utils/format';
import { requireAdmin } from '../utils';

const ADMIN_ERROR = { error: 'forbidden' } as const;

export async function PATCH(req: NextRequest, { params }: { params: { uid: string } }) {
  try {
    await requireAdmin(req);
    const uid = params.uid;
    if (!uid) {
      return NextResponse.json({ error: 'missing_uid' }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const updates: Parameters<typeof adminAuth.updateUser>[1] = {};
    const merge: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.email === 'string') {
      const email = body.email.trim();
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
      }
      updates.email = email;
      merge.email = email;
    }

    if (typeof body.password === 'string' && body.password) {
      if (!isValidPassword(body.password)) {
        return NextResponse.json({ error: 'weak_password' }, { status: 400 });
      }
      updates.password = body.password;
    }

    if (typeof body.disabled === 'boolean') {
      updates.disabled = body.disabled;
      merge.status = body.disabled ? 'disabled' : 'active';
    }

    if (typeof body.beneficiaryUuid === 'string') {
      const beneficiaryUuid = body.beneficiaryUuid.trim();
      if (beneficiaryUuid) {
        merge.beneficiaryUuid = beneficiaryUuid;
      }
    }

    if (typeof body.name === 'string' && body.name.trim()) {
      merge.name = body.name.trim();
    }

    if (typeof body.cpf === 'string' && body.cpf) {
      const cpf = sanitizeCPF(body.cpf);
      if (cpf) merge.cpf = cpf;
    }

    if (Object.keys(updates).length === 0 && Object.keys(merge).length === 1) {
      return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
    }

    const user = await adminAuth.updateUser(uid, updates);

    const users = db.collection('users');
    const snap = await users.where('authUid', '==', uid).limit(1).get();
    if (snap.empty) {
      await users.add({ authUid: uid, ...merge, createdAt: new Date() });
    } else {
      await snap.docs[0].ref.set(merge, { merge: true });
    }

    return NextResponse.json({
      user: {
        uid: user.uid,
        email: user.email ?? null,
        disabled: user.disabled,
        beneficiaryUuid: merge.beneficiaryUuid ?? null,
        status: merge.status ?? null,
      },
    });
  } catch (error: unknown) {
    const status = typeof (error as { statusCode?: number })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (status === 401 || status === 403) {
      return NextResponse.json(ADMIN_ERROR, { status });
    }
    console.error('[admin][users][PATCH]', error);
    const message = error instanceof Error && error.message ? error.message : 'update_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { uid: string } }) {
  try {
    await requireAdmin(req);
    const uid = params.uid;
    if (!uid) {
      return NextResponse.json({ error: 'missing_uid' }, { status: 400 });
    }

    await adminAuth.deleteUser(uid);

    const users = db.collection('users');
    const snap = await users.where('authUid', '==', uid).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.set({ status: 'deleted', updatedAt: new Date() }, { merge: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const status = typeof (error as { statusCode?: number })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (status === 401 || status === 403) {
      return NextResponse.json(ADMIN_ERROR, { status });
    }
    console.error('[admin][users][DELETE]', error);
    const message = error instanceof Error && error.message ? error.message : 'delete_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
