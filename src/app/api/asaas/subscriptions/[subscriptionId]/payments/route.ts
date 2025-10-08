import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';
import { respondAsaasError } from '@/lib/asaasError';

export async function GET(
  req: NextRequest,
  { params }: { params: { subscriptionId: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const query: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (value !== undefined && value !== null && value !== '') {
        query[key] = value;
      }
    });

    const { data } = await asaas.get(
      `/subscriptions/${params.subscriptionId}/payments`,
      { params: query }
    );
    return NextResponse.json(data);
  } catch (error) {
    return respondAsaasError(error);
  }
}
