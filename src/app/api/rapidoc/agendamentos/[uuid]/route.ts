/**
 * Testes (Postman):
 * 1. Criar agendamento na Rapidoc (fora do escopo).
 * 2. GET /api/rapidoc/agendamentos/{uuid} deve retornar o agendamento.
 * 3. DELETE /api/rapidoc/agendamentos/{uuid} remove o agendamento.
 * 4. Validar respostas com logs.
 * 5. Recriar o agendamento se necessário.
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

export async function GET(_request: NextRequest, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  const trimmed = uuid?.trim();

  if (!trimmed) {
    return jsonError('uuid_missing', 400, 'uuid é obrigatório.');
  }

  try {
    const { data } = await rapidoc.get(`/appointments/${trimmed}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[rapidoc/agendamentos] get failed', trimmed, error);
    return handleUpstreamError(error, 'rapidoc-get');
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  const trimmed = uuid?.trim();

  if (!trimmed) {
    return jsonError('uuid_missing', 400, 'uuid é obrigatório.');
  }

  try {
    const { data } = await rapidoc.delete(`/appointments/${trimmed}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[rapidoc/agendamentos] delete failed', trimmed, error);
    return handleUpstreamError(error, 'rapidoc-delete');
  }
}
