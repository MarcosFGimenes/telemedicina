import axios from 'axios';
import { NextResponse } from 'next/server';

import { fetchPlans } from '@/lib/rapidocSync';

export async function GET() {
  try {
    const plans = await fetchPlans({ force: true });
    return NextResponse.json(plans);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      return NextResponse.json(
        {
          error: 'Nao foi possivel consultar os planos da Rapidoc.',
          upstream: error.response?.data ?? null,
        },
        { status },
      );
    }

    return NextResponse.json(
      { error: 'Erro inesperado ao consultar planos na Rapidoc.' },
      { status: 500 },
    );
  }
}
