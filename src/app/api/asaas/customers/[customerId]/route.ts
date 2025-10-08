import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { respondAsaasError } from '@/lib/asaasError';

export async function GET(
  _req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const { data } = await asaas.get(`/customers/${params.customerId}`);
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const payload = await req.json();
    const { data } = await asaas.put(`/customers/${params.customerId}`, payload);
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const { data } = await asaas.delete(`/customers/${params.customerId}`);
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}
