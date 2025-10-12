import { notFound } from 'next/navigation';
import CheckoutExperience from '@/components/checkout/CheckoutExperience';
import { getPlanBySlug } from '@/lib/plansStore';

interface AssinarPlanoPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: AssinarPlanoPageProps) {
  const plan = await getPlanBySlug(params.slug);
  if (!plan) {
    return { title: 'Plano nao encontrado' };
  }

  return {
    title: `Assine ${plan.name}`,
    description: `Complete os dados para ativar o plano ${plan.name}.`,
  };
}

export default async function AssinarPlanoPage({ params }: AssinarPlanoPageProps) {
  const plan = await getPlanBySlug(params.slug);
  if (!plan) {
    notFound();
  }

  return (
    <CheckoutExperience
      lockedPlan={plan}
      allowPlanSelection={false}
      title={`Assine ${plan.name}`}
      description={`Complete os dados para ativar o plano ${plan.name}.`}
    />
  );
}
