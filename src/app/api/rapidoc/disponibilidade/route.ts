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
    return `${yyyy}-${mm}-${dd}`;
  };

  const normalizeDateParam = (value: string | null | undefined) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const isoMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const brMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDate(parsed);
    }
    return null;
  };

  const today = new Date();
  const in7 = new Date();
  in7.setDate(today.getDate() + 7);

  const normalizedInitial = normalizeDateParam(dateInitial) || formatDate(today);
  const normalizedFinal = normalizeDateParam(dateFinal) || formatDate(in7);

  const startDate = new Date(`${normalizedInitial}T00:00:00`);
  const endDate = new Date(`${normalizedFinal}T00:00:00`);

  const ensuredFinal =
    !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate < startDate
      ? normalizedInitial
      : normalizedFinal;

  const params: Record<string, string> = {
    specialtyUuid: specialtyId,
    dateInitial: normalizedInitial,
    dateFinal: ensuredFinal,
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
