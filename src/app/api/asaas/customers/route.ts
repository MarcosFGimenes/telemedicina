import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';


export async function POST(req: NextRequest) {
try {
const payload = await req.json();
const { data } = await asaas.post('/customers', payload);
return NextResponse.json(data);
} catch (e: any) {
return NextResponse.json({ error: e?.response?.data || e.message }, { status: e?.response?.status || 500 });
}
}