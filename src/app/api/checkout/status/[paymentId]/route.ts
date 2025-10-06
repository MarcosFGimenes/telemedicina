/**
 * Testes (Postman):
 * 1. Criar pagamento no Asaas e obter o paymentId.
 * 2. Confirmar pagamento no sandbox e aguardar status RECEIVED/CONFIRMED.
 * 3. GET /api/checkout/status/{paymentId} deve retornar status e payload bruto.
 * 4. POST /api/checkout/finalizar com { paymentId, cpf }.
 * 5. GET /api/rapidoc/beneficiaries/cpf/{cpf} confirma o beneficiário.
 */

import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';

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

export async function GET(_request: NextRequest, ctx: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await ctx.params;
  const trimmed = paymentId?.trim();

  if (!trimmed) {
    return jsonError('paymentId_missing', 400, 'paymentId é obrigatório.');
  }

  try {
    const started = Date.now();
    console.info(`[checkout/status] fetching payment ${trimmed}`);
    const { data } = await asaas.get(`/payments/${trimmed}`);
    console.info(`[checkout/status] done payment=${trimmed} status=${data?.status ?? 'unknown'} ms=${Date.now() - started}`);
    return NextResponse.json({ status: data?.status, raw: data });
  } catch (error) {
    console.error('[checkout/status] failed', trimmed, error);
    return handleUpstreamError(error, 'asaas-payment');
  }
}
