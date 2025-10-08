import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';

import rapidoc, { sanitizeCPF } from '@/lib/rapidoc';

const messageFromUpstream = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const message = record['message'];
  return typeof message === 'string' ? message : null;
};

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

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ cpf: string }> },
) {
  const { cpf } = await ctx.params;
  const digits = sanitizeCPF(String(cpf || ''));

  if (!digits) {
    return jsonError('cpf_missing', 400, 'CPF é obrigatório.');
  }

  try {
    const { data } = await rapidoc.get(`/beneficiaries/${digits}`);
    return NextResponse.json(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status && error.response.status !== 200 ? error.response.status : 500;
      const upstreamStatus = error.response?.status ?? 500;
      const upstreamData = error.response?.data;
      const message = messageFromUpstream(upstreamData) || error.message || 'unknown error';
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-cpf-get', upstreamStatus, message, upstream: upstreamData ?? null },
        { status },
      );
    }
    return jsonError('rapidoc-beneficiary-cpf-get', 500, 'unknown error');
  }
}
