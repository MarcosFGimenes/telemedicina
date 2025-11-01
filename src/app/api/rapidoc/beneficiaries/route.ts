import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json(); // array de beneficiários
    console.info('[rapidoc/beneficiaries] POST body:', JSON.stringify(body).substring(0, 500));
    const { data } = await rapidoc.post('/tema/api/beneficiaries', body);
    console.info('[rapidoc/beneficiaries] POST response:', JSON.stringify(data).substring(0, 500));
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[rapidoc/beneficiaries] POST error:', e?.response?.data || e.message);
    return NextResponse.json({ error: e?.response?.data || e.message }, { status: e?.response?.status || 500 });
  }
}

export async function GET() {
  try {
    const { data } = await rapidoc.get('/tema/api/beneficiaries');
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[rapidoc/beneficiaries] GET error:', e?.response?.data || e.message);
    return NextResponse.json({ error: e?.response?.data || e.message }, { status: e?.response?.status || 500 });
  }
}
