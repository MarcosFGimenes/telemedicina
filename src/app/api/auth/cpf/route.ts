import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { sanitizeCPF } from '@/lib/rapidocService';
import { isValidEmail, isValidPhone } from '@/utils/format';

const collection = () => db.collection('users');

export async function GET(req: NextRequest) {
  try {
    const cpfRaw = req.nextUrl.searchParams.get('cpf') || '';
    const cpf = sanitizeCPF(cpfRaw);
    if (!cpf) {
      return NextResponse.json({ error: 'missing_cpf' }, { status: 400 });
    }

    const snap = await collection().where('cpf', '==', cpf).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ exists: false });
    }

    const data = snap.docs[0].data() as Record<string, unknown>;
    return NextResponse.json({
      exists: true,
      email: typeof data.email === 'string' ? data.email : null,
      phone: typeof data.phone === 'string' ? data.phone : null,
      name: typeof data.name === 'string' ? data.name : null,
    });
  } catch (error) {
    console.error('[auth/cpf][GET]', error);
    const message = error instanceof Error && error.message ? error.message : 'lookup_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cpf = sanitizeCPF(String(body?.cpf || ''));
    if (!cpf) {
      return NextResponse.json({ error: 'missing_cpf' }, { status: 400 });
    }

    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
    const phoneRaw = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    const email = emailRaw && isValidEmail(emailRaw) ? emailRaw : null;
    const phone = phoneRaw && isValidPhone(phoneRaw) ? phoneRaw : null;

    const now = new Date();
    const payload: Record<string, unknown> = {
      cpf,
      updatedAt: now,
    };

    if (email) payload.email = email;
    if (phone) payload.phone = phone;
    if (name) payload.name = name;
    if (!payload['status']) payload['status'] = 'pending';

    const users = collection();
    const snap = await users.where('cpf', '==', cpf).limit(1).get();

    if (snap.empty) {
      await users.add({ ...payload, createdAt: now });
    } else {
      await snap.docs[0].ref.set(payload, { merge: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[auth/cpf][POST]', error);
    const message = error instanceof Error && error.message ? error.message : 'upsert_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
