import { NextResponse } from 'next/server';

type AsaasError = {
  response?: {
    status?: number;
    data?: unknown;
  };
};

export function respondAsaasError(error: unknown) {
  const fallback = { status: 500, payload: { error: 'Asaas request failed' } };
  if (!error || typeof error !== 'object') {
    return NextResponse.json(fallback.payload, { status: fallback.status });
  }

  const candidate = error as AsaasError;
  const status = candidate.response?.status ?? fallback.status;
  const payload = candidate.response?.data ?? fallback.payload;
  return NextResponse.json(payload, { status });
}
