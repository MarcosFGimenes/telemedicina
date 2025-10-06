import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';


export async function GET(_: NextRequest, { params }: { params: { cpf: string } }) {
const { data } = await rapidoc.get(`/beneficiaries/${params.cpf}`);
return NextResponse.json(data);
}


export async function PUT(req: NextRequest, { params }: { params: { cpf: string } }) {
const body = await req.json();
const { data } = await rapidoc.put(`/beneficiaries/${params.cpf}`, body);
return NextResponse.json(data);
}
