import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { getBeneficiaryByCPF, sanitizeCPF } from '@/lib/rapidocService';

export async function GET(
  _req: NextRequest,
  ctx: { params: { cpf: string } },
) {
  try {
    const raw = ctx?.params?.cpf || '';
    const cpf = sanitizeCPF(raw);
    if (!cpf) {
      return NextResponse.json({ error: 'missing_cpf' }, { status: 400 });
    }

    // busca na Rapidoc
    const found = await getBeneficiaryByCPF(cpf);

    // se retornou uuid, vincula automaticamente no user com mesmo CPF
    const uuid = (found?.uuid as string | undefined) || (found?.id as string | undefined) || '';
    if (uuid) {
      try {
        const users = db.collection('users');
        const snap = await users.where('cpf', '==', cpf).limit(1).get();
        if (!snap.empty) {
          const ref = snap.docs[0].ref;
          const data = snap.docs[0].data() as Record<string, unknown>;
          const already = (data?.beneficiaryUuid as string | undefined) || '';
          if (!already) {
            await ref.set({ beneficiaryUuid: uuid, status: 'active', updatedAt: new Date() }, { merge: true });
          }
        }
      } catch (e) {
        console.error('[rapidoc/cpf] failed to link user uuid', cpf, uuid, e);
      }
    }

    return NextResponse.json(found);
  } catch (e: any) {
    const status = e?.status || e?.response?.status || 500;
    const message = e?.message || 'failed';
    return NextResponse.json({ error: message }, { status });
  }
}

