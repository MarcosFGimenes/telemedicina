import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

export async function GET() {
  try {
    const { data } = await rapidoc.get('/plans');
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.response?.data || e?.message || 'Falha ao buscar planos' },
      { status: e?.response?.status || 500 },
    );
  }
}

