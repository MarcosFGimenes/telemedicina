import { NextResponse } from 'next/server';
import { listPlans } from '@/lib/plansStore';
import rapidoc from '@/lib/rapidoc';
import type { RapidocPlanDetails } from '@/lib/rapidocService';

// GET /api/rapidoc/planos - busca planos disponíveis da Rapidoc
export async function GET() {
  try {
    console.info('[rapidoc/planos] Attempting to fetch plans from Rapidoc...');
    // A resposta da API é um array direto de planos (não aninhado)
    const { data } = await rapidoc.get<RapidocPlanDetails[]>('/tema/api/plans');
    console.info('[rapidoc/planos] Raw response:', JSON.stringify(data).substring(0, 500));
    if (!Array.isArray(data)) {
      console.error('[rapidoc/planos] unexpected response format:', data);
      throw new Error('Invalid response format');
    }
    console.info(`[rapidoc/planos] Successfully fetched ${data.length} plans`);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[rapidoc/planos] failed to fetch plans:', error?.response?.data || error?.message);
    // Fallback para planos do Firestore se a Rapidoc falhar
    const plans = await listPlans();
    console.info(`[rapidoc/planos] Returning fallback: ${plans.length} plans from Firestore`);
    return NextResponse.json(plans);
  }
}
