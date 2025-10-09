import axios from 'axios';
import { NextResponse } from 'next/server';
import { fetchPlans } from '@/lib/rapidocSync';

export async function GET() {
  try {
    const plans = await fetchPlans();
    const response = plans.map((plan) => ({
      code: plan.serviceType,
      name: plan.name,
      description: plan.description,
    }));
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
