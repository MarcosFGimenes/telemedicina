import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { rapidocListBeneficiaries, sanitizeCPF } from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord } from '@/utils/beneficiary';
import { requireAdmin } from '../../users/utils';

const ADMIN_ERROR = { error: 'forbidden' } as const;

type UnlinkedBeneficiary = {
  uuid: string;
  cpf: string;
  name: string;
  birthday?: string | null;
  phone?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const docs = await db.collection('users').get();
    const linkedUuids = new Set<string>();
    const linkedCpfs = new Set<string>();
    docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const uuid = typeof data.beneficiaryUuid === 'string' ? data.beneficiaryUuid.trim() : '';
      const cpf = sanitizeCPF(String(data.cpf || ''));
      if (uuid) linkedUuids.add(uuid);
      if (cpf) linkedCpfs.add(cpf);
    });

    // Endpoint Rapidoc: GET /beneficiaries
    const rapidocList = await rapidocListBeneficiaries();
    const beneficiaries: UnlinkedBeneficiary[] = [];

    rapidocList.forEach((entry) => {
      const record = entry as Record<string, unknown>;
      const fallbackCpfSource =
        typeof record.cpf === 'string'
          ? record.cpf
          : typeof record.document === 'string'
            ? record.document
            : '';
      const candidate = normalizeBeneficiaryRecord(record, fallbackCpfSource);
      const alreadyLinked = linkedUuids.has(candidate.uuid) || linkedCpfs.has(candidate.cpf);
      if (!alreadyLinked) {
        beneficiaries.push({
          uuid: candidate.uuid,
          cpf: candidate.cpf,
          name: candidate.name,
          birthday: candidate.birthday ?? null,
          phone: candidate.phone ?? null,
        });
      }
    });

    return NextResponse.json({ beneficiaries });
  } catch (error: unknown) {
    const status = typeof (error as { statusCode?: number })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (status === 401 || status === 403) {
      return NextResponse.json(ADMIN_ERROR, { status });
    }
    console.error('[admin][beneficiaries][unlinked]', error);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
}
