import { NextRequest, NextResponse } from 'next/server';
import { asaas } from '@/lib/asaas';


export async function POST(req: NextRequest) {
const body = await req.json();
const { data } = await asaas.post('/subscriptions', body);
return NextResponse.json(data);
}