import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';


export async function GET(_: Request, { params }: { params: { uuid: string } }) {
const { data } = await rapidoc.get(`/appointments/${params.uuid}`);
return NextResponse.json(data);
}


export async function DELETE(_: Request, { params }: { params: { uuid: string } }) {
const { data } = await rapidoc.delete(`/appointments/${params.uuid}`);
return NextResponse.json(data);
}