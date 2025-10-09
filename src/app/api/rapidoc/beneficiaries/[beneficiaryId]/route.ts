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

export async function GET(_request: NextRequest, ctx: { params: Promise<{ beneficiaryId: string }> }) {
  const { beneficiaryId } = await ctx.params;
  const trimmed = beneficiaryId?.trim();
  if (!trimmed) {
    return jsonError('beneficiary_missing', 400, 'beneficiaryId é obrigatório.');
  }
  try {
    const { data } = await rapidoc.get(`/beneficiaries/${trimmed}`);
    if (data && typeof data === 'object' && data !== null && (data as any).success === false) {
      const message =
        (typeof (data as any).message === 'string' && (data as any).message) ||
        'Beneficiario nao encontrado.';
      const status = /nao encontrado/i.test(message.toLowerCase()) ? 404 : 502;
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-get', upstreamStatus: status, message, upstream: data },
        { status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status && error.response.status !== 200 ? error.response.status : 500;
      const upstreamStatus = error.response?.status ?? 500;
      const upstreamData = error.response?.data;
      const message = (typeof upstreamData === 'object' && upstreamData && (upstreamData as any).message) || error.message || 'unknown error';
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-get', upstreamStatus, message, upstream: upstreamData ?? null },
        { status },
      );
    }
    return jsonError('rapidoc-beneficiary-get', 500, 'unknown error');
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
    const { data } = await rapidoc.put(`/beneficiaries/${trimmed}`, body, {
      headers: { 'Content-Type': 'application/vnd.rapidoc.tema-v2+json' },
    });
    return NextResponse.json(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status && error.response.status !== 200 ? error.response.status : 500;
      const upstreamStatus = error.response?.status ?? 500;
      const upstreamData = error.response?.data;
      const message = (typeof upstreamData === 'object' && upstreamData && (upstreamData as any).message) || error.message || 'unknown error';
      return NextResponse.json(
        { hint: 'rapidoc-beneficiary-put', upstreamStatus, message, upstream: upstreamData ?? null },
        { status },
      );
    }
    return jsonError('rapidoc-beneficiary-put', 500, 'unknown error');
  }
}
