/**
 * Testes (Postman):
 * 1. Criar beneficiário via checkout finalizado.
 * 2. GET /api/rapidoc/beneficiaries/{beneficiaryId}/referrals (placeholder) retorna mensagem.
 * 3. Ajustar conforme necessidade futura.
 * 4. Confirmar resolução do parâmetro dinâmico.
 * 5. --
 */

import { NextRequest, NextResponse } from 'next/server';

type Params = { beneficiaryId: string };

export async function GET(_request: NextRequest, ctx: { params: Promise<Params> }) {
  const { beneficiaryId } = await ctx.params;
  return NextResponse.json({
    message: 'Listar encaminhamentos nao implementado',
    beneficiaryId,
  });
}
