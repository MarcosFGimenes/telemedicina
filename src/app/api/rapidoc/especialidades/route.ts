import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';
export async function GET() { const { data } = await rapidoc.get('/specialties'); return NextResponse.json(data); }