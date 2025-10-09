import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebaseAdmin';
import { derivePlanMetadata } from '@/lib/planMetadata';
import { fetchBeneficiaryByCpf } from '@/lib/rapidocSync';
import { sanitizeCPF } from '@/lib/rapidocService';

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get('authorization') || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || null;

    if (!uid) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

    // Vincula o documento de usuário existente pelo e-mail (fallback) se ainda não estiver vinculado
    // users: { cpf, asaasCustomerId, ... , authUid? }
    const users = db.collection('users');
    const byAuth = await users.where('authUid', '==', uid).limit(1).get();
    if (!byAuth.empty) {
      return NextResponse.json({ ok: true, linked: true, userId: byAuth.docs[0].id });
    }

    if (email) {
      const byEmail = await users.where('email', '==', email).limit(1).get();
      if (!byEmail.empty) {
        const ref = byEmail.docs[0].ref;
        await ref.set({ authUid: uid, updatedAt: new Date() }, { merge: true });
        // se o usuário tem CPF mas não tem beneficiaryUuid, tenta resolver pela Rapidoc
        try {
          const data = byEmail.docs[0].data() as Record<string, unknown>;
          const cpf = sanitizeCPF(String(data?.cpf || ''));
          const hasUuid = Boolean(data?.beneficiaryUuid);
          if (cpf && !hasUuid) {
            const beneficiary = await fetchBeneficiaryByCpf(cpf);
            const metadata = await derivePlanMetadata(beneficiary.serviceType);
            const updates: Record<string, unknown> = {
              beneficiaryUuid: beneficiary.uuid,
              status: 'active',
              serviceType: beneficiary.serviceType,
              paymentType: beneficiary.paymentType,
              updatedAt: new Date(),
            };
            if (metadata.planName) updates.planName = metadata.planName;
            if (metadata.planDescription) updates.planDescription = metadata.planDescription;
            if (metadata.maxDependents !== undefined) updates.maxDependents = metadata.maxDependents;
            await ref.set(updates, { merge: true });
          }
        } catch (e) {
          console.error('[auth/link] failed to auto-resolve beneficiary data by cpf', e);
        }
        return NextResponse.json({ ok: true, linked: true, userId: byEmail.docs[0].id });
      }
    }

    // Se não encontrou por e-mail, apenas cria um documento leve placeholder
    const created = await users.add({ authUid: uid, email, status: 'pending', createdAt: new Date(), updatedAt: new Date() });
    return NextResponse.json({ ok: true, linked: true, userId: created.id, created: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'link_failed' }, { status: 500 });
  }
}
