import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';


export async function GET(req: NextRequest) {
const search = new URL(req.url).searchParams;
const specialtyId = search.get('specialtyId');
const { data } = await rapidoc.get(`/specialties/${specialtyId}/availability`);
return NextResponse.json(data);
}