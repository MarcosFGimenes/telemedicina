'use client';

import { useEffect, useMemo, useState } from 'react';

type PlanOption = {
  id: string;
  name: string;
  description: string;
  value: number;
  serviceType: string;
  slug?: string;
};

type PlanChangeStatus = {
  canChange: boolean;
  reason: string | null;
  hasPaidInvoice: boolean;
  blockingPayments: { id: string; status: string; dueDate: string | null; value: number | null }[];
  subscriptionId: string | null;
  customerId: string | null;
  currentPlanId: string | null;
  currentPlanName: string | null;
  currentPlanValue: number | null;
  currentPlanServiceType: string | null;
  currentPlanDescription: string | null;
  nextDueDate: string | null;
  subscriptionStatus: string | null;
  beneficiaryUuid: string | null;
};

type PlanChangeTarget = {
  userId?: string;
  beneficiaryUuid?: string;
  cpf?: string;
};

type PlanChangeRequest = {
  newPlanId: string;
  updatePendingPayments?: boolean;
  reason?: string;
  target?: PlanChangeTarget;
};

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

type PlanChangeDialogProps = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  mode: 'self' | 'admin';
  target?: PlanChangeTarget;
  onSuccess?: (plan: { id: string; name: string; value: number }) => void;
};

export default function PlanChangeDialog({
  open,
  onClose,
  token,
  mode,
  target,
  onSuccess,
}: PlanChangeDialogProps) {
  const [status, setStatus] = useState<PlanChangeStatus | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) || null, [plans, selectedPlanId]);
  const currentPlanValue = status?.currentPlanValue ?? 0;
  const priceDiff = useMemo(() => {
    if (!selectedPlan) return 0;
    return selectedPlan.value - currentPlanValue;
  }, [selectedPlan, currentPlanValue]);
  const priceDiffLabel = useMemo(() => {
    if (!selectedPlan) return '';
    if (!status) return '';
    if (!status.currentPlanValue) {
      return `Novo valor mensal: ${formatCurrency(selectedPlan.value)}`;
    }
    if (priceDiff === 0) {
      return 'O valor mensal permanece o mesmo.';
    }
    const difference = formatCurrency(Math.abs(priceDiff));
    return priceDiff > 0
      ? `Acréscimo mensal de ${difference}.`
      : `Redução mensal de ${difference}.`;
  }, [selectedPlan, status, priceDiff]);

  const isSamePlan = useMemo(() => {
    if (!status || !selectedPlanId) return false;
    const candidateIds = [status.currentPlanId, status.currentPlanServiceType]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase());
    const normalizedSelection = selectedPlanId.toUpperCase();
    return candidateIds.includes(normalizedSelection);
  }, [status, selectedPlanId]);

  const reasonMessage = useMemo(() => {
    if (!status || status.canChange) return '';
    switch (status.reason) {
      case 'no_paid_invoice':
        return 'É necessário possuir ao menos uma cobrança paga antes de solicitar a troca.';
      case 'pending_invoices':
        return 'Existem cobranças pendentes. Regularize-as para liberar a alteração.';
      case 'subscription_not_found':
        return 'Não encontramos uma assinatura ativa. Verifique os dados antes de continuar.';
      case 'asaas_subscription_error':
        return 'Não foi possível consultar a assinatura na Asaas. Tente novamente em instantes.';
      case 'asaas_payments_error':
        return 'Não foi possível consultar as cobranças na Asaas. Tente novamente em instantes.';
      default:
        return 'Não foi possível liberar a troca neste momento.';
    }
  }, [status]);

  const authHeaders = useMemo(() => {
    if (!token) return undefined;
    return { Authorization: `Bearer ${token}` };
  }, [token]);

    useEffect(() => {
    if (!open) {
      setStatus(null);
      setPlans([]);
      setSelectedPlanId('');
      setSuccess('');
      setError('');
    }
  }, [open]);

useEffect(() => {
    if (!open) {
      return;
    }
    if (!authHeaders) {
      setError('Sessão expirada. Faça login novamente.');
      return;
    }

    const controller = new AbortController();

    const fetchStatus = async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        if (mode === 'admin' && target) {
          if (target.userId) params.set('userId', target.userId);
          if (target.beneficiaryUuid) params.set('beneficiaryUuid', target.beneficiaryUuid);
          if (target.cpf) params.set('cpf', target.cpf);
        }

        const statusRes = await fetch(
          `/api/plano/alterar/status${params.toString() ? `?${params.toString()}` : ''}`,
          {
            headers: { ...authHeaders },
            signal: controller.signal,
          },
        );
        const statusJson = (await statusRes.json()) as PlanChangeStatus | { error?: string };
        if (!statusRes.ok) {
          throw new Error(
            (statusJson as { error?: string })?.error || 'Falha ao consultar restrições de troca.',
          );
        }
        setStatus(statusJson as PlanChangeStatus);
        setSelectedPlanId((current) =>
          current || statusJson.currentPlanId || statusJson.currentPlanServiceType || '',
        );

        const plansRes = await fetch('/api/plans', { signal: controller.signal });
        const plansJson = await plansRes.json();
        if (!plansRes.ok || !Array.isArray(plansJson)) {
          throw new Error('Não foi possível carregar os planos disponíveis.');
        }
        setPlans(
          (plansJson as any[]).map((plan) => ({
            id: String(plan.id || plan.serviceType || '').toUpperCase(),
            name: String(plan.name || ''),
            description: String(plan.description || ''),
            value: Number(plan.value) || 0,
            serviceType: String(plan.serviceType || plan.id || '').toUpperCase(),
            slug: plan.slug ? String(plan.slug) : undefined,
          })),
        );
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err?.message || 'Erro inesperado ao preparar a troca de plano.');
      } finally {
        setLoading(false);
      }
    };

    void fetchStatus();
    return () => controller.abort();
  }, [open, authHeaders, mode, target]);

  const handleConfirm = async () => {
    if (!status) return;
    if (!selectedPlanId) {
      setError('Selecione o novo plano desejado.');
      return;
    }
    if (!authHeaders) {
      setError('Sessão expirada. Faça login novamente.');
      return;
    }
    if (isSamePlan) {
      setSuccess('O plano selecionado já está ativo.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      const payload: PlanChangeRequest = {
        newPlanId: selectedPlanId,
      };
      if (mode === 'admin' && target) {
        payload.target = target;
      }

      const response = await fetch('/api/plano/alterar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.message || json?.error || 'Falha ao trocar o plano.');
      }

      const planResult = plans.find((plan) => plan.id === selectedPlanId);
      if (planResult && onSuccess) {
        onSuccess(planResult);
      }
      setSuccess('Plano atualizado com sucesso. As próximas cobranças refletirão o novo valor.');
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao atualizar o plano.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPlan = useMemo(() => {
    if (status?.currentPlanId) {
      const match = plans.find((plan) => plan.id === status.currentPlanId);
      if (match) return match;
    }
    if (status?.currentPlanName) {
      return {
        id: status.currentPlanId || status.currentPlanServiceType || '',
        name: status.currentPlanName,
        description: status.currentPlanDescription || '',
        value: status.currentPlanValue ?? 0,
        serviceType: status.currentPlanServiceType || '',
        slug: undefined,
      } as PlanOption;
    }
    return null;
  }, [plans, status?.currentPlanId, status?.currentPlanName, status?.currentPlanDescription, status?.currentPlanServiceType, status?.currentPlanValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {mode === 'admin' ? 'Alterar plano do beneficiário' : 'Alterar meu plano'}
            </h2>
            <p className="text-sm text-zinc-600">
              Escolha o novo plano desejado. A mudança ocorrerá nas próximas cobranças confirmadas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-50"
          >
            Fechar
          </button>
        </div>

        {loading && <p className="mt-4 text-sm text-zinc-500">Carregando opções...</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}

        {status && (
          <div className="mt-4 space-y-4">
            {!status.canChange && !loading && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-700">
                <p className="font-semibold">Troca indisponível no momento</p>
                <p className="mt-1 text-xs text-amber-600">
                  {status.reason === 'no_paid_invoice'
                    ? 'É necessário possuir ao menos uma cobrança paga antes de solicitar a troca.'
                    : 'Existem cobranças pendentes. Regularize-as para liberar a alteração.'}
                </p>
                {status.blockingPayments.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {status.blockingPayments.map((invoice) => (
                      <li key={invoice.id}>
                        {invoice.id} · {invoice.status}
                        {invoice.dueDate ? ` · vencimento ${invoice.dueDate}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {status && selectedPlan && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-xs text-zinc-600">
                  <p className="font-semibold text-zinc-700">Resumo financeiro</p>
                  <p className="mt-1">Valor atual: {formatCurrency(status.currentPlanValue ?? 0)}</p>
                  <p className="mt-1">Novo valor: {formatCurrency(selectedPlan.value)}</p>
                  <p className="mt-1 text-emerald-700">{priceDiffLabel}</p>
                </div>
              )}
            )}
{currentPlan && (
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  Plano atual
                </p>
                <p className="mt-1 text-base font-semibold text-emerald-800">
                  {currentPlan.name}
                </p>
                {status?.currentPlanDescription && (
                  <p className="mt-1 text-xs text-emerald-600">{status.currentPlanDescription}</p>
                )}
                {status?.currentPlanServiceType && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-emerald-500">
                    Código Rapidoc: {status.currentPlanServiceType}
                  </p>
                )}
                <p className="mt-2 text-xs text-emerald-600">
                  Valor atual: {formatCurrency(status?.currentPlanValue ?? currentPlan.value)}
                </p>
                {status?.nextDueDate && (
                  <p className="mt-1 text-xs text-emerald-600">
                    Próximo vencimento: {status.nextDueDate}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-700">Selecione o novo plano</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map((plan) => {
                  const selected = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      disabled={(status && !status.canChange) || submitting}
                      className={`flex h-full flex-col rounded-2xl border p-4 text-left transition ${
                        selected
                          ? 'border-emerald-400 bg-emerald-50/90 shadow-sm'
                          : 'border-zinc-200 bg-white/90 hover:border-emerald-200 hover:bg-emerald-50/60'
                      }`}
                    >
                      <span className="text-sm font-semibold text-emerald-800">{plan.name}</span>
                      <span className="mt-2 text-xs text-zinc-500">{plan.description || 'Plano sem descrição cadastrada.'}</span>
                      <span className="mt-4 text-base font-semibold text-emerald-700">
                        {formatCurrency(plan.value)}
                      </span>
                      <span className="mt-1 text-[10px] uppercase tracking-wide text-emerald-500">{plan.serviceType}</span>
                    </button>
                  );
                })}
              </div>
              {status && selectedPlan && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-xs text-zinc-600">
                  <p className="font-semibold text-zinc-700">Resumo financeiro</p>
                  <p className="mt-1">Valor atual: {formatCurrency(status.currentPlanValue ?? 0)}</p>
                  <p className="mt-1">Novo valor: {formatCurrency(selectedPlan.value)}</p>
                  {priceDiffLabel && (
                    <p className="mt-1 text-emerald-700">{priceDiffLabel}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || loading || !status?.canChange || isSamePlan}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Atualizando...' : 'Confirmar troca'}
          </button>
        </div>
      </div>
    </div>
  );
}

