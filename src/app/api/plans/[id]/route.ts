import { NextRequest, NextResponse } from 'next/server';
import { deletePlan, getPlan, updatePlan } from '@/lib/plansStore';
import type { PlanUpdatePayload } from '@/types/plans';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const plan = await getPlan(params.id);
  if (!plan) {
    return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
  }
  return NextResponse.json(plan);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const payload = (await req.json()) as PlanUpdatePayload;
    const plan = await updatePlan(params.id, payload);
    return NextResponse.json(plan);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar plano';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await deletePlan(params.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao remover plano';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
