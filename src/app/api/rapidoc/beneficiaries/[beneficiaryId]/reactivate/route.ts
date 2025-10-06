import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';


export async function PUT(_: Request, { params }: { params: { beneficiaryId: string } }) {
const { data } = await rapidoc.put(`/beneficiaries/${params.beneficiaryId}/reactivate`, {});
return NextResponse.json(data);
}
