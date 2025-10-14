'use client';

import { useEffect, useMemo, useState } from 'react';

type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

type PaymentStatusResponse = {
  canChange: boolean;
  reason: string | null;
  hasPaidInvoice: boolean;
  blockingPayments: { id: string; status: string; dueDate: string | null; value: number | null }[];
  subscriptionId: string | null;
  customerId: string | null;
  currentBillingType: BillingType | null;
  subscriptionStatus: string | null;
  nextDueDate: string | null;
  availableBillingTypes?: BillingType[];
};

type PaymentChangeDialogProps = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  mode: 'self' | 'admin';
  target?: { userId?: string; beneficiaryUuid?: string; cpf?: string };
  onSuccess?: (billingType: BillingType) => void;
};

const paymentOptions: { id: BillingType; title: string; description: string }[] = [
  {
    id: 'PIX',
    title: 'Pix',
    description: 'Pagamentos instantâneos com QR Code e confirmação automática.',
  },
  {
    id: 'BOLETO',
    title: 'Boleto bancário',
    description: 'Receba os boletos no e-mail cadastrado com vencimento ajustável.',
  },
  {
    id: 'CREDIT_CARD',
    title: 'Cartão de crédito',
    description: 'Cobrança automática no cartão cadastrado. Requer token ativo.',
  },
];

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function PaymentMethodDialog({
  open,
  onClose,
  token,
  mode,
  target,
  onSuccess,
}: PaymentChangeDialogProps) {
  const [status, setStatus] = useState<PaymentStatusResponse | null>(null);
  const [selectedType, setSelectedType] = useState<BillingType | ''>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const authHeaders = useMemo(() => {
    if (!token) return undefined;
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  useEffect(() => {
    if (!open) {
      setStatus(null);
      setSelectedType('');
      setError('');
      setSuccess('');
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
        const res = await fetch(
          `/api/plano/pagamento/status${params.toString() ? `?${params.toString()}` : ''}`,
          { headers: { ...authHeaders }, signal: controller.signal },
        );
        const json = (await res.json()) as PaymentStatusResponse | { error: string };
        if (!res.ok) {
          throw new Error((json as { error: string }).error || 'Falha ao consultar restrições.');
        }
        const typed = json as PaymentStatusResponse;
        setStatus(typed);
        setSelectedType((current) => current || (typed.currentBillingType ?? ''));
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err?.message || 'Erro inesperado ao consultar a assinatura.');
      } finally {
        setLoading(false);
      }
    };

    void fetchStatus();
    return () => controller.abort();
  }, [open, authHeaders, mode, target]);

  const availableOptions = useMemo(() => {
    const allowed = status?.availableBillingTypes || ['PIX', 'BOLETO', 'CREDIT_CARD'];
    return paymentOptions.filter((option) => allowed.includes(option.id));
  }, [status?.availableBillingTypes]);

  const isSameBilling = useMemo(() => {
    if (!status?.currentBillingType || !selectedType) return false;
    return status.currentBillingType === selectedType;
  }, [status?.currentBillingType, selectedType]);

  const reasonMessage = useMemo(() => {
    if (!status || status.canChange) return '';
    switch (status.reason) {
      case 'no_paid_invoice':
        return 'É necessário possuir ao menos uma cobrança paga antes de alterar a forma de pagamento.';
      case 'pending_invoices':
        return 'Existem cobranças pendentes. Regularize-as antes de continuar.';
      case 'subscription_not_found':
        return 'Não encontramos uma assinatura ativa. Verifique os dados e tente novamente ou contate o suporte.';
      case 'asaas_subscription_error':
        return 'Não foi possível consultar a assinatura na Asaas. Tente mais tarde.';
      case 'asaas_payments_error':
        return 'Não foi possível consultar as cobranças na Asaas. Tente mais tarde.';
      default:
        return 'Não foi possível liberar a troca neste momento.';
    }
  }, [status]);

  const disableCreditCard = useMemo(() => {
    if (!status) return true;
    if (status.currentBillingType === 'CREDIT_CARD') return false;
    return true;
  }, [status]);

  const handleConfirm = async () => {
    if (!status) return;
    if (!selectedType) {
      setError('Selecione a forma de pagamento desejada.');
      return;
    }
    if (!authHeaders) {
      setError('Sessão expirada. Faça login novamente.');
      return;
    }
    if (isSameBilling) {
      setSuccess('A forma de pagamento selecionada já está ativa.');
      return;
    }
    if (selectedType === 'CREDIT_CARD' && disableCreditCard) {
      setError('Para migrar para cartão de crédito, contate o suporte.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      const payload: Record<string, unknown> = {
        newBillingType: selectedType,
      };
      if (mode === 'admin' && target) {
        payload.target = target;
      }

      const response = await fetch('/api/plano/pagamento', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.message || json?.error || 'Falha ao atualizar forma de pagamento.');
      }

      setSuccess(json?.message || 'Forma de pagamento atualizada com sucesso.');
      if (typeof json?.billingType === 'string' && onSuccess) {
        onSuccess(json.billingType as BillingType);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao atualizar forma de pagamento.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {mode === 'admin' ? 'Alterar forma de pagamento' : 'Minha forma de pagamento'}
            </h2>
            <p className="text-sm text-zinc-600">
              Defina como você prefere receber suas próximas cobranças.
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
                {reasonMessage && (
                  <p className="mt-1 text-xs text-amber-600">{reasonMessage}</p>
                )}
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
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {availableOptions.map((option) => {
                const disabled = (status && !status.canChange) || (option.id === 'CREDIT_CARD' && disableCreditCard);
                const selected = selectedType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedType(option.id)}
                    disabled={disabled || submitting}
                    className={`flex h-full flex-col rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-emerald-400 bg-emerald-50/90 shadow-sm'
                        : 'border-zinc-200 bg-white/90 hover:border-emerald-200 hover:bg-emerald-50/60'
                    } ${disabled ? 'opacity-60' : ''}`}
                  >
                    <span className="text-sm font-semibold text-emerald-800">{option.title}</span>
                    <span className="mt-2 text-xs text-zinc-500">{option.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-xs text-zinc-600">
              <p className="font-semibold text-zinc-700">Resumo</p>
              <p className="mt-1">Forma atual: {status.currentBillingType || 'Não informado'}</p>
              <p className="mt-1">Nova forma: {selectedType || 'Selecione uma opção'}</p>
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
            disabled={submitting || loading || !status?.canChange || !selectedType || isSameBilling}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Atualizando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
