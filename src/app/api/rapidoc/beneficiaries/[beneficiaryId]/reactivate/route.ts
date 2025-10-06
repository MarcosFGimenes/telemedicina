import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

export async function PUT(request: Request, { params }: { params: { beneficiaryId: string } }) {
  let payload: unknown = {};

  try {
    const rawBody = await request.text();
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    console.error('[rapidoc/reactivate] Failed to parse body', error);
    payload = {};
  }

  const { data } = await rapidoc.put(`/beneficiaries/${params.beneficiaryId}/reactivate`, payload);
  return NextResponse.json(data);
}
