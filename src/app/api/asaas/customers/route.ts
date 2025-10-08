import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { respondAsaasError } from '@/lib/asaasError';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const params: Record<string, string> = {};

    searchParams.forEach((value, key) => {
      if (value !== undefined && value !== null && value !== '') {
        params[key] = value;
      }
    });

    const { data } = await asaas.get('/customers', { params });
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { data } = await asaas.post('/customers', payload);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return respondAsaasError(error);
  }
}
