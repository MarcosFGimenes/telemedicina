import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { derivePlanMetadata } from '@/lib/planMetadata';
import { fetchBeneficiaryByCpf } from '@/lib/rapidocSync';
import { sanitizeCPF } from '@/lib/rapidocService';
import { isValidEmail, isValidPhone } from '@/utils/format';

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
    const fallbackEmail = decoded.email || null;
    const body = await req.json();

    const cpf = sanitizeCPF(String(body?.cpf || ''));
    if (!cpf) {
      return NextResponse.json({ error: 'missing_cpf' }, { status: 400 });
    }

    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
    const phoneRaw = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    const email = emailRaw && isValidEmail(emailRaw) ? emailRaw : fallbackEmail;
    const phone = phoneRaw && isValidPhone(phoneRaw) ? phoneRaw : null;

    const users = db.collection('users');

    const byCpf = await users.where('cpf', '==', cpf).limit(1).get();
    const byUid = await users.where('authUid', '==', uid).limit(1).get();
    const now = new Date();

    let ref = byCpf.empty ? (byUid.empty ? null : byUid.docs[0].ref) : byCpf.docs[0].ref;

    if (!ref) {
      const created = await users.add({
        cpf,
        authUid: uid,
        email: email || null,
        phone: phone || null,
        name: name || null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      ref = created;
    }

    const update: Record<string, unknown> = {
      authUid: uid,
      cpf,
      updatedAt: now,
    };
    if (email) update.email = email;
    if (phone) update.phone = phone;
    if (name) update.name = name;
    if (!update.status) update.status = 'active';

    await ref.set(update, { merge: true });

    const resolved = await ref.get();
    const payload = resolved.data() as Record<string, unknown> | undefined;

    // tenta vincular beneficiário automaticamente
    if (cpf && (!payload?.beneficiaryUuid || !String(payload.beneficiaryUuid))) {
      try {
        const beneficiary = await fetchBeneficiaryByCpf(cpf);
        const metadata = await derivePlanMetadata(beneficiary.serviceType);
        const updates: Record<string, unknown> = {
          beneficiaryUuid: beneficiary.uuid,
          status: 'active',
          serviceType: beneficiary.serviceType,
          paymentType: beneficiary.paymentType,
          updatedAt: new Date(),
        };
        if (!payload?.name && beneficiary.name) updates.name = beneficiary.name;
        if (!payload?.birthday && beneficiary.birthday) updates.birthday = beneficiary.birthday;
        if (metadata.planName) updates.planName = metadata.planName;
        if (metadata.planDescription) updates.planDescription = metadata.planDescription;
        if (metadata.maxDependents !== undefined) updates.maxDependents = metadata.maxDependents;
        await ref.set(updates, { merge: true });
      } catch (err) {
        console.warn('[auth/cpf/link] rapidoc lookup failed', err);
      }
    }

    // atualiza usuário no Firebase Authentication
    try {
      await adminAuth.updateUser(uid, {
        email: email || undefined,
        phoneNumber: phone || undefined,
        displayName: name || undefined,
      });
    } catch (err) {
      console.warn('[auth/cpf/link] failed to update auth profile', err);
    }

    return NextResponse.json({ ok: true, userId: resolved.id });
  } catch (error) {
    const status = error instanceof Error && error.message === 'unauthorized' ? 401 : 500;
    const message = error instanceof Error && error.message ? error.message : 'link_failed';
    console.error('[auth/cpf/link]', error);
    return NextResponse.json({ error: message }, { status });
  }
}
