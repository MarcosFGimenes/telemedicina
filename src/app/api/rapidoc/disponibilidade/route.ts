import { NextRequest, NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';
import axios from 'axios';

export async function GET(req: NextRequest) {
  const search = new URL(req.url).searchParams;
  const specialtyId = (search.get('specialtyId') || search.get('specialtyUuid') || '').trim();
  const beneficiaryUuid = (search.get('beneficiaryUuid') || '').trim();
  const dateInitial = (search.get('dateInitial') || '').trim();
  const dateFinal = (search.get('dateFinal') || '').trim();

  if (!specialtyId) {
    return NextResponse.json({ error: 'missing_specialty' }, { status: 400 });
  }

  const formatDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const today = new Date();
  const in7 = new Date();
  in7.setDate(today.getDate() + 7);

  const params: Record<string, string> = {
    specialtyUuid: specialtyId,
    dateInitial: dateInitial || formatDate(today),
    dateFinal: dateFinal || formatDate(in7),
  };
  if (beneficiaryUuid) params.beneficiaryUuid = beneficiaryUuid;

  try {
    const { data } = await rapidoc.get('/specialty-availability', { params });
    return NextResponse.json(data);
  } catch (e: any) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status ?? 500;
      const payload = e.response?.data ?? { message: e.message };
      return NextResponse.json(payload, { status });
    }
    return NextResponse.json({ message: String(e?.message || 'failed') }, { status: 500 });
  }
}
