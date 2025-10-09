import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { rapidocFindByCpf, sanitizeCPF } from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord } from '@/utils/beneficiary';
import { isValidCpf } from '@/utils/format';

const toHint = (error: unknown) => {
  if (error && typeof error === 'object' && 'hint' in error && typeof (error as any).hint === 'string') {
    return (error as any).hint as string;
  }
  return '';
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cpfRaw = typeof body?.cpf === 'string' ? body.cpf : '';
    const cpf = sanitizeCPF(cpfRaw);

    if (!isValidCpf(cpf)) {
      return NextResponse.json({ error: 'invalid_cpf' }, { status: 400 });
    }

    // Endpoint Rapidoc: GET /beneficiaries/:cpf
    let found: Record<string, unknown> | null = null;
    try {
      const resolved = await rapidocFindByCpf(cpf);
      if (resolved && typeof resolved === 'object') {
        found = resolved as Record<string, unknown>;
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      const hint = toHint(error);
      if (hint === 'rapidoc-cpf-failed') {
        const message =
          (error instanceof Error && error.message) || 'Falha ao consultar o beneficiario na Rapidoc.';
        return NextResponse.json({ error: 'lookup_failed', message }, { status: 502 });
      }
      throw error;
    }

    if (!found) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const beneficiary = normalizeBeneficiaryRecord(found, cpf);

    if (!beneficiary.uuid) {
      return NextResponse.json({ error: 'missing_uuid' }, { status: 502 });
    }

    return NextResponse.json({ beneficiary, rapidoc: found });
  } catch (error) {
    console.error('[primeiro-acesso][beneficiario]', error);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
