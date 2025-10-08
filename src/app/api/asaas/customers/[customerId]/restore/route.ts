import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { respondAsaasError } from '@/lib/asaasError';

export async function POST(
  _req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const { data } = await asaas.post(`/customers/${params.customerId}/restore`);
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}
