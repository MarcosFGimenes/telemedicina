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
    const rapidocList = await rapidocListBeneficiaries({ size: 200 });
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
    const statusFromError =
      typeof (error as { status?: number })?.status === 'number'
        ? (error as { status: number }).status
        : typeof (error as { statusCode?: number })?.statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 500;
    if (statusFromError === 401 || statusFromError === 403) {
      return NextResponse.json(ADMIN_ERROR, { status: statusFromError });
    }
    const hint = (error as { hint?: string })?.hint;
    const message =
      hint === 'rapidoc-list-failed'
        ? 'Nao foi possivel consultar a lista de beneficiarios no prontuario clinico.'
        : 'Falha ao carregar beneficiarios sem acesso.';
    console.error('[admin][beneficiaries][unlinked]', error);
    return NextResponse.json({ error: 'list_failed', message }, { status: statusFromError || 500 });
  }
}
