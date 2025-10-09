import { NextRequest, NextResponse } from 'next/server';
import { createPlan, listPlans } from '@/lib/plansStore';
import type { PlanPayload } from '@/types/plans';

export async function GET() {
  const plans = await listPlans();
  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as PlanPayload;
    const plan = await createPlan(payload);
    return NextResponse.json(plan, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao criar plano';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
