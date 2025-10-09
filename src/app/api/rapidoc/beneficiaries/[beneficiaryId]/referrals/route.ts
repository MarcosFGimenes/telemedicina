/**
 * Testes (Postman):
 * 1. Criar beneficiario via checkout finalizado.
 * 2. GET /api/rapidoc/beneficiaries/{beneficiaryId}/referrals (placeholder) retorna mensagem.
 * 3. Ajustar conforme necessidade futura.
 * 4. Confirmar resolucao do parametro dinamico.
 * 5. --
 */

import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

type Params = { beneficiaryId: string };

export async function GET(_request: NextRequest, ctx: { params: Promise<Params> }) {
  const { beneficiaryId } = await ctx.params;
  const trimmed = beneficiaryId?.trim();

  if (!trimmed) {
    return NextResponse.json({ error: 'beneficiaryId is required' }, { status: 400 });
  }

  try {
    // Rapidoc v2: endpoint correto e `medical-referrals`
    const { data } = await rapidoc.get(`/beneficiaries/${trimmed}/medical-referrals`);
    if (data && typeof data === 'object' && data !== null && (data as any).success === false) {
      const message =
        (typeof (data as any).message === 'string' && (data as any).message) ||
        'Nenhum encaminhamento encontrado.';
      const status = /nao encontrado/i.test(message.toLowerCase()) ? 404 : 502;
      return NextResponse.json(
        { error: 'referrals_not_found', message, backend: data, upstreamStatus: status },
        { status },
      );
    }
    return NextResponse.json(data);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string } | undefined;
    const status = err?.response?.status ?? 500;
    const backend = err?.response?.data;
    console.error('[rapidoc/beneficiaries/referrals] failed', trimmed, err?.message || error);
    return NextResponse.json(
      {
        error: 'failed-to-fetch-referrals',
        message: backend?.message || backend?.error || error?.message || 'Erro ao buscar encaminhamentos',
        backend,
      },
      { status },
    );
  }
}
