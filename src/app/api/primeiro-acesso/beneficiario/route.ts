import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { rapidocFindByCpf, sanitizeCPF } from '@/lib/rapidocService';
import { normalizeBeneficiaryRecord } from '@/utils/beneficiary';
import { isValidCpf } from '@/utils/format';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cpfRaw = typeof body?.cpf === 'string' ? body.cpf : '';
    const cpf = sanitizeCPF(cpfRaw);

    if (!isValidCpf(cpf)) {
      return NextResponse.json({ error: 'invalid_cpf' }, { status: 400 });
    }

    // Endpoint Rapidoc: GET /beneficiaries/:cpf
    let found: unknown = null;
    try {
      found = await rapidocFindByCpf(cpf);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      throw error;
    }
    if (!found) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const beneficiary = normalizeBeneficiaryRecord(found as Record<string, unknown>, cpf);

    if (!beneficiary.uuid) {
      return NextResponse.json({ error: 'missing_uuid' }, { status: 502 });
    }

    return NextResponse.json({ beneficiary });
  } catch (error) {
    console.error('[primeiro-acesso][beneficiario]', error);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
