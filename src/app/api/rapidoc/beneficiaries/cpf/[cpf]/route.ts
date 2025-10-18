import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';

import { sanitizeCPF, rapidocFindByCpf } from '@/lib/rapidocService';

const jsonError = (
  hint: string,
  status: number,
  message: string,
  upstream: unknown = null,
) =>
  NextResponse.json(
    {
      hint,
      upstreamStatus: status,
      message,
      upstream: typeof upstream === 'string' ? upstream : upstream ?? null,
    },
    { status },
  );

export async function GET(_request: NextRequest, ctx: { params: Promise<{ cpf: string }> }) {
  const { cpf } = await ctx.params;
  const digits = sanitizeCPF(String(cpf || ''));

  if (!digits) {
    return jsonError('cpf_missing', 400, 'CPF é obrigatório.');
  }

  try {
    const found = await rapidocFindByCpf(digits);
    if (!found) {
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-cpf-get', message: 'Beneficiário não encontrado.', upstreamStatus: 404, upstream: null },
        { status: 404 },
      );
    }
    return NextResponse.json(found);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status && error.response.status !== 200 ? error.response.status : 500;
      const upstreamStatus = error.response?.status ?? 500;
      const upstreamData = error.response?.data;
      const message =
        (typeof upstreamData === 'object' && upstreamData && (upstreamData as any).message) ||
        (typeof upstreamData === 'object' && upstreamData && (upstreamData as any)?.error?.message) ||
        error.message ||
        'unknown error';
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-cpf-get', upstreamStatus, message, upstream: upstreamData ?? null },
        { status },
      );
    }
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
    const message =
      (error instanceof Error && error.message) || 'Erro inesperado ao consultar beneficiário por CPF no prontuario clinico.';
    return jsonError('rapidoc-beneficiary-cpf-get', status, message);
  }
}

