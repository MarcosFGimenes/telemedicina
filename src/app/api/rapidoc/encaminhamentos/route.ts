import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

// Encaminhamentos globais conforme documentação v2
export async function GET() {
  const { data } = await rapidoc.get('/beneficiary-medical-referrals');
  return NextResponse.json(data);
}

