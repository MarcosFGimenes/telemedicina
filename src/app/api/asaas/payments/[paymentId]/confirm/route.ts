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
    const { data } = await asaas.post(
      `/payments/${params.paymentId}/confirmReceivedPayment`,
      payload
    );
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { data } = await asaas.delete(
      `/payments/${params.paymentId}/confirmReceivedPayment`
    );
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}
