/**
 * Testes (Postman):
 * 1. Criar pagamento e confirmar no Asaas.
 * 2. Finalizar checkout para criar beneficiário.
 * 3. DELETE /api/rapidoc/beneficiaries/{beneficiaryId}/inactive para inativar.
 * 4. GET /api/rapidoc/beneficiaries/cpf/{cpf} confirma status.
 * 5. PUT /api/rapidoc/beneficiaries/{beneficiaryId}/reactivate para reativar.
 */

import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

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

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ beneficiaryId: string }> }) {
  const { beneficiaryId } = await ctx.params;
  const trimmed = beneficiaryId?.trim();

  if (!trimmed) {
    return jsonError('beneficiary_missing', 400, 'beneficiaryId é obrigatório.');
  }

  try {
    const { data } = await rapidoc.delete(`/beneficiaries/${trimmed}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[rapidoc/beneficiaries/inactive] delete failed', trimmed, error);
    return handleUpstreamError(error, 'rapidoc-delete');
  }
}
