import { NextResponse } from 'next/server';
import axios from 'axios';
import { asaas } from '@/lib/asaas';

export async function GET(
  _request: Request,
  context: { params: { paymentId: string } },
) {
  try {
    const { paymentId } = context.params;
    const { data } = await asaas.get(`/payments/${paymentId}`);
    return NextResponse.json({ status: data?.status, raw: data });
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 502;
      return NextResponse.json({ error: error.response?.data || null }, { status });
    }

    return NextResponse.json(
      { error: error?.message || 'unknown error' },
      { status: 500 },
    );
  }
}
