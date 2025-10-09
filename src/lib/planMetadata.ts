import { getPlan } from '@/lib/plansStore';
import { fetchPlans, fallbackPlanName, getPlanByServiceType } from '@/lib/rapidocSync';

export type PlanMetadata = {
  planName: string;
  planDescription: string;
  maxDependents: number | null | undefined;
  isActive?: boolean;
  source: 'rapidoc' | 'local' | 'fallback' | 'none';
};

export async function derivePlanMetadata(serviceType?: string): Promise<PlanMetadata> {
  const normalized = (serviceType || '').trim().toUpperCase();
  if (!normalized) {
    return { planName: '', planDescription: '', maxDependents: undefined, source: 'none' };
  }

  try {
    const plan = await getPlanByServiceType(normalized);
    if (plan) {
      return {
        planName: plan.name || normalized,
        planDescription: plan.description,
        maxDependents: undefined,
        isActive: plan.isActive,
        source: 'rapidoc',
      };
    }
  } catch (error) {
    console.warn('[planMetadata] Falha ao carregar planos da Rapidoc', error);
  }

  const localPlan = await getPlan(normalized);
  if (localPlan) {
    return {
      planName: localPlan.name,
      planDescription: localPlan.description,
      maxDependents: localPlan.maxDependents ?? null,
      source: 'local',
    };
  }

  const fallback = fallbackPlanName(normalized);
  if (fallback) {
    return {
      planName: fallback,
      planDescription: '',
      maxDependents: null,
      source: 'fallback',
    };
  }

  return { planName: '', planDescription: '', maxDependents: null, source: 'none' };
}

export async function preloadRapidocPlans() {
  try {
    await fetchPlans();
  } catch (error) {
    console.warn('[planMetadata] Não foi possível pré-carregar os planos Rapidoc', error);
  }
}

