import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';


export async function GET() {
const { data } = await rapidoc.get('/appointments');
return NextResponse.json(data);
}


export async function POST(req: NextRequest) {
const body = await req.json();
// body deve conter: beneficiaryUuid, specialtyId, slotId (ou campos exigidos pela API)
const { data } = await rapidoc.post('/appointments', body);
return NextResponse.json(data);
}