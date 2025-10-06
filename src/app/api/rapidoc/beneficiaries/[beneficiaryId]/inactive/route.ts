import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';


export async function DELETE(_: Request, { params }: { params: { beneficiaryId: string } }) {
const { data } = await rapidoc.delete(`/beneficiaries/${params.beneficiaryId}`);
return NextResponse.json(data);
}
