import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { respondAsaasError } from '@/lib/asaasError';

export async function GET(
  _req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const { data } = await asaas.get(`/payments/${params.paymentId}`);
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
    const { data } = await asaas.delete(`/payments/${params.paymentId}`);
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}
