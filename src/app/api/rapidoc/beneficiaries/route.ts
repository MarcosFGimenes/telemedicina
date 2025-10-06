import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';


export async function POST(req: NextRequest) {
try {
const body = await req.json(); // array de beneficiários
const { data } = await rapidoc.post('/beneficiaries', body);
return NextResponse.json(data);
} catch (e: any) {
return NextResponse.json({ error: e?.response?.data || e.message }, { status: e?.response?.status || 500 });
}
}


export async function GET() {
try {
const { data } = await rapidoc.get('/beneficiaries');
return NextResponse.json(data);
} catch (e: any) {
return NextResponse.json({ error: e?.response?.data || e.message }, { status: e?.response?.status || 500 });
}
}