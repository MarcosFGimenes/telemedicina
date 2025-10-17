import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { rapidocGetBeneficiary, rapidocUpdateBeneficiary } from '@/lib/rapidocService';

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

export async function GET(_request: NextRequest, ctx: { params: Promise<{ beneficiaryId: string }> }) {
  const { beneficiaryId } = await ctx.params;
  const trimmed = beneficiaryId?.trim();
  if (!trimmed) {
    return jsonError('beneficiary_missing', 400, 'beneficiaryId é obrigatório.');
  }
  try {
    const record = await rapidocGetBeneficiary(trimmed);
    if (!record) {
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-get', message: 'Beneficiário não encontrado.', upstreamStatus: 404, upstream: null },
        { status: 404 },
      );
    }
    return NextResponse.json(record);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const upstreamStatus = error.response?.status ?? 500;
      const status = upstreamStatus === 200 ? 502 : upstreamStatus;
      const upstreamData = error.response?.data ?? null;
      const message =
        (typeof upstreamData === 'object' && upstreamData && (upstreamData as any).message) ||
        error.message ||
        'Erro ao consultar beneficiário na Rapidoc.';
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-get', upstreamStatus, message, upstream: upstreamData },
        { status },
      );
    }
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
    const message =
      (error instanceof Error && error.message) || 'Erro inesperado ao buscar beneficiário na Rapidoc.';
    return jsonError('rapidoc-beneficiary-get', status, message);
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ beneficiaryId: string }> }) {
  const { beneficiaryId } = await ctx.params;
  const trimmed = beneficiaryId?.trim();
  if (!trimmed) {
    return jsonError('beneficiary_missing', 400, 'beneficiaryId é obrigatório.');
  }
  try {
    const body = await request.json();
    const response = await rapidocUpdateBeneficiary(trimmed, body);
    return NextResponse.json(response ?? { success: true });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const upstreamStatus = error.response?.status ?? 500;
      const status = upstreamStatus === 200 ? 502 : upstreamStatus;
      const upstreamData = error.response?.data ?? null;
      const message =
        (typeof upstreamData === 'object' && upstreamData && (upstreamData as any).message) ||
        error.message ||
        'Erro ao atualizar beneficiário na Rapidoc.';
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-put', upstreamStatus, message, upstream: upstreamData },
        { status },
      );
    }
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
    const message = (error instanceof Error && error.message) || 'Erro inesperado ao atualizar beneficiário na Rapidoc.';
    return jsonError('rapidoc-beneficiary-put', status, message);
  }
}
