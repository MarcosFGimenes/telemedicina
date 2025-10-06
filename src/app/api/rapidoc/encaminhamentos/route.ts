import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';
export async function GET() { const { data } = await rapidoc.get('/referrals'); return NextResponse.json(data); }