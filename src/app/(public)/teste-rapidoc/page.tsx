'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import type { BillingType, CheckoutRequestBody, CheckoutResponse } from '@/types/checkout';
import type { PlanDefinition } from '@/types/plans';

type PlanOption = PlanDefinition;

type BeneficiaryForm = {
  name: string;
  cpf: string;
  birthday: string;
  phone: string;
  email: string;
  zipCode: string;
  address: string;
  city: string;
  state: string;
  paymentType: 'S' | 'A';
  serviceType: string;
  holder: string;
  general: string;
};

const SAMPLE: BeneficiaryForm = {
  name: 'Marcos Farinelli Gimenes',
  cpf: '14750347922',
  birthday: '2006-07-01',
  phone: '45998394505',
  email: 'teste@gmail.com',
  zipCode: '38065280',
  address: 'Rua de Teste, 01',
  city: 'Belo Horizonte',
  state: 'MG',
  paymentType: 'S',
  serviceType: 'GS',
  holder: '29974076056',
  general: 'General purpose',
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const extractMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const keys = ['error', 'message', 'backend'] as const;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = extractMessage(error.response?.data);
    if (message) return message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const message = extractMessage(error);
  return message || fallback;
};

export default function TesteRapidocPage() {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const [form, setForm] = useState<BeneficiaryForm>(SAMPLE);
  const [billingType, setBillingType] = useState<BillingType>('PIX');
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        setPlansError('');
        const { data } = await axios.get<PlanOption[]>('/api/rapidoc/planos');
        const fetched = Array.isArray(data) ? data : [];
        setPlans(fetched);
        setSelectedPlanId((current) => current || fetched[0]?.id || '');
      } catch (err: unknown) {
        setPlansError(getErrorMessage(err, 'Erro ao buscar planos da Rapidoc'));
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

  const onChange = (key: keyof BeneficiaryForm, value: string) => {
    setForm((state) => ({ ...state, [key]: value }));
  };

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId],
  );

  useEffect(() => {
    if (selectedPlan) {
      setForm((state) => ({
        ...state,
        serviceType: selectedPlan.serviceType as BeneficiaryForm['serviceType'],
      }));
    }
  }, [selectedPlan]);

  const formattedPrice = useMemo(() => {
    if (!selectedPlan) return currency.format(0);
    return currency.format(selectedPlan.value);
  }, [selectedPlan]);

  const dependentsLabel = useMemo(() => {
    if (!selectedPlan) return '—';
    return selectedPlan.maxDependents != null ? String(selectedPlan.maxDependents) : 'Ilimitado';
  }, [selectedPlan]);

  const checkoutUrl = useMemo(() => {
    if (!checkout) return '';
    return (
      checkout.checkoutUrl ||
      (checkout.checkoutId ? `https://asaas.com/checkoutSession/show?id=${checkout.checkoutId}` : '')
    );
  }, [checkout]);

  const initiateCheckout = async () => {
    if (!selectedPlan) {
      setError('Selecione um plano antes de continuar.');
      return;
    }

    if (!form.name.trim() || !form.cpf.trim()) {
      setError('Informe nome e CPF do beneficiário.');
      return;
    }

    try {
      setIsSubmitting(true);
      setRedirecting(false);
      setError('');
      setCheckout(null);

      const payload: CheckoutRequestBody = {
        billingType,
        value: Number(selectedPlan.value),
        description: `Assinatura ${selectedPlan.name}`,
        name: form.name,
        cpf: form.cpf,
        email: form.email,
        mobilePhone: form.phone,
        zipCode: form.zipCode,
        address: form.address,
        city: form.city,
        state: form.state,
        birthday: form.birthday,
        paymentType: form.paymentType,
        serviceType: selectedPlan.serviceType,
        holder: form.holder,
        general: form.general,
        planId: selectedPlan.serviceType,
      };

      const { data } = await axios.post<CheckoutResponse>('/api/checkout/pagar', payload);
      setCheckout(data);

      const url = data.checkoutUrl || (data.checkoutId ? `https://asaas.com/checkoutSession/show?id=${data.checkoutId}` : '');
      if (url) {
        setRedirecting(true);
        setTimeout(() => {
          window.location.href = url;
        }, 600);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao iniciar checkout no Asaas'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Teste – Rapidoc Beneficiário</h1>
        <p className="text-sm text-zinc-600">
          Simule a criação de assinaturas Rapidoc utilizando o checkout do Asaas. Preencha os dados, escolha o plano e finalize o pagamento.
        </p>
      </header>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Selecione o plano</h2>
          <p className="text-sm text-zinc-500">
            Os planos abaixo são carregados automaticamente da configuração interna e exibem preço e limite de dependentes.
          </p>
        </div>

        {loadingPlans && <p className="text-sm text-zinc-600">Carregando planos…</p>}
        {plansError && <p className="text-sm text-red-600">{plansError}</p>}

        {!loadingPlans && !plansError && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <label className="mb-2 block text-sm font-medium text-zinc-700">Plano</label>
              <select
                className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
              >
                <option value="">Selecione um plano…</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} – {currency.format(plan.value)}
                  </option>
                ))}
              </select>
              {selectedPlan && (
                <div className="mt-3 space-y-2 rounded-xl bg-emerald-50/80 p-3 text-xs text-emerald-700">
                  <p className="font-semibold uppercase tracking-wide">Código: {selectedPlan.serviceType}</p>
                  <p>{selectedPlan.description || 'Sem descrição cadastral.'}</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <label className="mb-2 block text-sm font-medium text-zinc-700">Tipo de cobrança (Rapidoc)</label>
              <select
                className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                value={form.paymentType}
                onChange={(event) => onChange('paymentType', event.target.value)}
              >
                <option value="S">Assinatura recorrente (S)</option>
                <option value="A">Cobrança avulsa (A)</option>
              </select>
              <p className="mt-2 text-xs text-zinc-500">
                Utilize “S” para gerar assinaturas mensais ou “A” para cobranças isoladas.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Dados do beneficiário</h2>
          <p className="text-sm text-zinc-500">Esses dados serão enviados para a Rapidoc e pré-preenchem o checkout do Asaas.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['name', 'Nome completo'],
              ['cpf', 'CPF (somente números)'],
              ['birthday', 'Data de nascimento (aaaa-mm-dd)'],
              ['phone', 'Telefone'],
              ['email', 'E-mail'],
              ['zipCode', 'CEP'],
              ['address', 'Endereço'],
              ['city', 'Cidade'],
              ['state', 'UF'],
              ['holder', 'CPF do titular'],
              ['general', 'Observações'],
            ] as [keyof BeneficiaryForm, string][]
          ).map(([key, label]) => (
            <div key={key} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{label}</label>
              <input
                className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2"
                value={form[key] as string}
                onChange={(event) => onChange(key, event.target.value)}
                placeholder={label}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Resumo e pagamento</h2>
          <p className="text-sm text-zinc-500">Confirme os valores e escolha a forma de pagamento para abrir o checkout do Asaas.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-zinc-800">Resumo do pedido</h3>
            {selectedPlan ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-700">{selectedPlan.name}</p>
                    <p className="text-xs text-zinc-500">serviceType: {selectedPlan.serviceType}</p>
                  </div>
                  <span className="text-base font-semibold text-emerald-600">{formattedPrice}</span>
                </div>
                <p className="text-sm text-zinc-600">{selectedPlan.description || 'Sem descrição cadastrada.'}</p>
                <div className="flex flex-wrap gap-4 text-xs uppercase tracking-wide text-zinc-500">
                  <span>Máx. dependentes: {dependentsLabel}</span>
                  <span>Tipo Rapidoc: {form.paymentType}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Selecione um plano para visualizar o resumo.</p>
            )}
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div>
              <label className="text-sm font-medium text-zinc-700">Forma de pagamento</label>
              <select
                className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2"
                value={billingType}
                onChange={(event) => setBillingType(event.target.value as BillingType)}
              >
                <option value="PIX">Pix</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Valor a pagar</label>
              <input className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2" value={formattedPrice} readOnly />
              <p className="mt-1 text-xs text-zinc-500">Valor oficial conforme cadastro do plano.</p>
            </div>
            <p className="text-xs text-zinc-500">
              Ao continuar, você será direcionado para a página segura do Asaas para concluir o pagamento. Após a confirmação, o status da assinatura poderá ser consultado na área administrativa.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={initiateCheckout}
            disabled={isSubmitting || !selectedPlan}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSubmitting ? 'Preparando checkout…' : 'Pagar com Asaas'}
          </button>
          {redirecting && (
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Redirecionando para o Asaas…
            </span>
          )}
        </div>

        {checkout && checkoutUrl && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-700">
            <p className="font-semibold">Não foi redirecionado automaticamente?</p>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center font-semibold underline"
            >
              Abrir checkout do Asaas
            </a>
          </div>
        )}

        {checkout && (
          <details className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-700">
              Detalhes da sessão de checkout
            </summary>
            <pre className="mt-3 whitespace-pre-wrap break-all text-[11px] leading-relaxed">
              {JSON.stringify(checkout, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
}
