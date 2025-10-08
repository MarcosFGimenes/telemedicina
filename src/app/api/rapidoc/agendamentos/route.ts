import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

export async function GET() {
  const { data } = await rapidoc.get('/appointments');
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const incoming = await req.json();
  const payload: Record<string, unknown> = {
    beneficiaryUuid: incoming.beneficiaryUuid,
    availabilityUuid: incoming.slotId || incoming.availabilityUuid,
    specialtyUuid: incoming.specialtyId || incoming.specialtyUuid,
    approveAdditionalPayment: true,
  };

  const refUuid = (incoming as any).referralUuid || (incoming as any).referralId;
  if (refUuid) {
    (payload as any).beneficiaryMedicalReferralUuid = refUuid;
  }

  const { data } = await rapidoc.post('/appointments', payload, {
    headers: { 'Content-Type': 'application/vnd.rapidoc.tema-v2+json' },
  });
  return NextResponse.json(data);
}

