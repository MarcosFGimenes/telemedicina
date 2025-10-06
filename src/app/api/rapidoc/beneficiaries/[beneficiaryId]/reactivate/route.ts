/**
 * Testes (Postman):
 * 1. Criar pagamento e finalizar checkout para criar beneficiário.
 * 2. DELETE /api/rapidoc/beneficiaries/{beneficiaryId}/inactive para inativar.
 * 3. PUT /api/rapidoc/beneficiaries/{beneficiaryId}/reactivate deve retornar sucesso.
 * 4. GET /api/rapidoc/beneficiaries/cpf/{cpf} confirma a reativação.
 * 5. Repetir PUT para validar idempotência (pode retornar 409/422).
 */

import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { reactivateBeneficiary } from '@/lib/rapidocService';

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

export async function PUT(_request: NextRequest, ctx: { params: Promise<{ beneficiaryId: string }> }) {
  const { beneficiaryId } = await ctx.params;
  const trimmed = beneficiaryId?.trim();

  if (!trimmed) {
    return jsonError('beneficiary_missing', 400, 'beneficiaryId é obrigatório.');
  }

  try {
    const data = await reactivateBeneficiary(trimmed);
    return NextResponse.json(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status && error.response.status !== 200 ? error.response.status : 500;
      const upstreamStatus = error.response?.status ?? 500;
      const upstreamData = error.response?.data;
      const message = error.response?.data?.message || error.message || 'unknown error';
      return NextResponse.json(
        {
          hint: 'rapidoc-reactivate',
          upstreamStatus,
          message,
          upstream: typeof upstreamData === 'string' ? upstreamData : upstreamData ?? null,
        },
        { status },
      );
    }

    const message = error instanceof Error ? error.message : 'unknown error';
    return jsonError('rapidoc-reactivate', 500, message);
  }
}
