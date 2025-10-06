/**
 * Testes (Postman):
 * 1. Criar pagamento no Asaas e obter o paymentId.
 * 2. Confirmar pagamento e garantir status RECEIVED/CONFIRMED.
 * 3. POST /api/checkout/finalizar com { paymentId, cpf }.
 * 4. GET /api/rapidoc/beneficiaries/cpf/{cpf} deve retornar o beneficiário.
 * 5. Repetir GET para validar idempotência.
 */

import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';
import { getBeneficiaryByCPF, sanitizeCPF } from '@/lib/rapidocService';

const jsonError = (hint: string, status: number, message: string, upstream: unknown = null) =>
  NextResponse.json(
    {
      hint,
      upstreamStatus: status,
      message,
      upstream: typeof upstream === 'string' ? upstream : upstream ?? null,
    },
    { status },
  );

const handleUpstreamError = (error: unknown, hint: string) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status && error.response.status !== 200 ? error.response.status : 500;
    const upstreamStatus = error.response?.status ?? 500;
    const upstreamData = error.response?.data;
    const message =
      (typeof upstreamData === 'object' && upstreamData !== null
        ? ((upstreamData as Record<string, unknown>).message as string | undefined)
        : undefined) ||
      (typeof upstreamData === 'object' && upstreamData !== null && 'error' in upstreamData
        ? ((upstreamData as { error?: Record<string, unknown> }).error?.message as string | undefined)
        : undefined) ||
      error.message ||
      'unknown error';

    return NextResponse.json(
      {
        hint,
        upstreamStatus,
        message,
        upstream: typeof upstreamData === 'string' ? upstreamData : upstreamData ?? null,
      },
      { status },
    );
  }

  const message = error instanceof Error ? error.message : 'unknown error';
  return jsonError(hint, 500, message);
};

type HintedError = { hint?: string; status?: number };
const isHintedError = (value: unknown): value is HintedError =>
  typeof value === 'object' && value !== null && 'hint' in value;

export async function GET(_request: NextRequest, ctx: { params: Promise<{ cpf: string }> }) {
  const { cpf } = await ctx.params;
  const digits = sanitizeCPF(cpf);

  if (digits.length !== 11) {
    return jsonError('cpf_invalid', 400, 'CPF deve conter 11 dígitos.');
  }

  try {
    const beneficiary = await getBeneficiaryByCPF(digits);
    return NextResponse.json(beneficiary);
  } catch (error) {
    if (isHintedError(error) && error.hint === 'rapidoc-cpf-not-found') {
      const status = error.status ?? 404;
      return jsonError('rapidoc-cpf-not-found', status, 'Beneficiário não encontrado.', error);
    }

    return handleUpstreamError(error, 'rapidoc-get');
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ cpf: string }> }) {
  const { cpf } = await ctx.params;
  const digits = sanitizeCPF(cpf);

  if (digits.length !== 11) {
    return jsonError('cpf_invalid', 400, 'CPF deve conter 11 dígitos.');
  }

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch (error) {
    console.warn('[rapidoc/beneficiaries/cpf] failed to parse body', error);
    payload = {};
  }

  try {
    const { data } = await rapidoc.put(`/beneficiaries/cpf/${digits}`, payload);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[rapidoc/beneficiaries/cpf] update failed', digits, error);
    return handleUpstreamError(error, 'rapidoc-update');
  }
}
