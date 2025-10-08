import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { respondAsaasError } from '@/lib/asaasError';

export async function POST(
  req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      payload = undefined;
    }
    const { data } = await asaas.post(`/payments/${params.paymentId}/refund`, payload);
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}
