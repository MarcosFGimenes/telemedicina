import axios from 'axios';
import { NextResponse } from 'next/server';
import rapidoc from '@/lib/rapidoc';

type RapidocPlanRecord = Record<string, unknown>;

const CANDIDATE_LIST_KEYS = ['content', 'items', 'data', 'results', 'plans'];

const toArray = (raw: unknown): RapidocPlanRecord[] => {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is RapidocPlanRecord => !!item && typeof item === 'object');
  }
  if (raw && typeof raw === 'object') {
    for (const key of CANDIDATE_LIST_KEYS) {
      const nested = (raw as Record<string, unknown>)[key];
      if (Array.isArray(nested)) {
        return nested.filter((item): item is RapidocPlanRecord => !!item && typeof item === 'object');
      }
    }
  }
  return [];
};

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeDescription = (record: RapidocPlanRecord) => {
  const candidates = [
    readString(record.description),
    readString(record.planDescription),
    readString(record.details),
  ];
  return candidates.find((item) => item.length > 0) || '';
};

const normalizeName = (record: RapidocPlanRecord) => {
  const candidates = [
    readString(record.name),
    readString(record.planName),
    readString(record.title),
  ];
  return candidates.find((item) => item.length > 0) || '';
};

const normalizeCode = (record: RapidocPlanRecord) => {
  const candidates = [
    readString(record.serviceType),
    readString(record.code),
    readString(record.planCode),
    readString(record.id),
    readString(record.type),
  ];
  const match = candidates.find((item) => item.length > 0);
  return match ? match.toUpperCase() : '';
};

const buildResponse = (records: RapidocPlanRecord[]) =>
  records
    .map((record) => {
      const code = normalizeCode(record);
      if (!code) return null;
      return {
        code,
        name: normalizeName(record) || code,
        description: normalizeDescription(record),
      };
    })
    .filter((item): item is { code: string; name: string; description: string } => Boolean(item))
    .reduce<{ code: string; name: string; description: string }[]>((acc, current) => {
      if (!acc.some((item) => item.code === current.code)) {
        acc.push(current);
      }
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export async function GET() {
  try {
    const { data } = await rapidoc.get('/tema/api/plans');
    const records = toArray(data);
    const response = buildResponse(records);
    return NextResponse.json(response);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      return NextResponse.json(
        {
          error: 'Não foi possível carregar os planos da Rapidoc.',
          upstream: error.response?.data ?? null,
        },
        { status },
      );
    }
    return NextResponse.json(
      { error: 'Erro inesperado ao consultar a Rapidoc.' },
      { status: 500 },
    );
  }
}
