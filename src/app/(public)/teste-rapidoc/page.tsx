'use client';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CheckoutRequestBody, CheckoutResponse, StatusResponse } from '@/types/checkout';
import { PAYMENT_SUCCESS_STATUSES } from '@/types/checkout';
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
  const [resp, setResp] = useState<unknown>(null);
  const [err, setErr] = useState('');

  const [payment, setPayment] = useState<CheckoutResponse | null>(null);
  const [status, setStatus] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [polling, setPolling] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState<unknown>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<unknown>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const successSet = useRef(new Set<string>(PAYMENT_SUCCESS_STATUSES));

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        setPlansError('');
        const { data } = await axios.get<PlanOption[]>('/api/rapidoc/planos');
        const fetched = Array.isArray(data) ? data : [];
        setPlans(fetched);
        setSelectedPlanId((current) => current || fetched[0]?.id || '');
      } catch (error: unknown) {
        setPlansError(getErrorMessage(error, 'Erro ao buscar planos da Rapidoc'));
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

  const displayValue = useMemo(() => {
    if (!selectedPlan) return '';
    return selectedPlan.value.toFixed(2);
  }, [selectedPlan]);

  useEffect(() => {
    if (selectedPlan) {
      setForm((state) => ({
        ...state,
        serviceType: selectedPlan.id as BeneficiaryForm['serviceType'],
      }));
    }
  }, [selectedPlan]);

  const createSubscription = async () => {
    try {
      setErr('');
      setResp(null);
      setPayment(null);
      setStatus('');
      stopPolling();
      setSubscriptionDetails(null);
      setSubscriptionPayments(null);

      if (!selectedPlan) {
        setErr('Selecione um plano antes de criar a assinatura.');
        return;
      }

      const amount = Number(selectedPlan.value) || 0;
      if (!amount || amount <= 0) {
        setErr('Informe um valor válido (> 0).');
        return;
      }

      const normalizedPaymentType: BeneficiaryForm['paymentType'] = 'S';
      if (form.paymentType !== normalizedPaymentType) {
        setForm((state) => ({ ...state, paymentType: normalizedPaymentType }));
      }

      const payload: CheckoutRequestBody = {
        billingType: 'UNDEFINED',
        value: amount,
        description: `Teste Rapidoc - ${selectedPlan.name}`,
        name: form.name,
        cpf: form.cpf,
        email: form.email,
        mobilePhone: form.phone,
        zipCode: form.zipCode,
        address: form.address,
        city: form.city,
        state: form.state,
        birthday: form.birthday,
        paymentType: normalizedPaymentType,
        serviceType: form.serviceType,
        holder: form.holder,
        general: form.general,
        planId: selectedPlan.id,
      };

      const { data } = await axios.post<CheckoutResponse>('/api/checkout/pagar', payload);
      setPayment(data);
      setStatus(data.status);

      if (data.paymentId) {
        // inicia polling automático para status quando há cobrança única
        startPolling();
      }
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Erro ao criar assinatura'));
    }
  };

  const checkStatus = async () => {
    if (payment?.subscriptionId) {
      try {
        setChecking(true);
        const { data } = await axios.get<Record<string, unknown>>(
          `/api/asaas/subscriptions/${payment.subscriptionId}`,
        );
        const rawStatus = data['status'];
        setStatus(typeof rawStatus === 'string' ? rawStatus : '');
        setSubscriptionDetails(data);
      } catch (error: unknown) {
        setErr(getErrorMessage(error, 'Falha ao consultar assinatura'));
      } finally {
        setChecking(false);
      }
      return;
    }

    if (!payment?.paymentId) return;
    try {
      setChecking(true);
      const { data } = await axios.get<StatusResponse>(`/api/checkout/status/${payment.paymentId}`);
      setStatus(data.status);
      // se confirmado, cria beneficiário automaticamente
      if (successSet.current.has(String(data.status))) {
        await createBeneficiary();
        stopPolling();
      }
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Falha ao checar status'));
    } finally {
      setChecking(false);
    }
  };

  const listSubscriptionPayments = async () => {
    if (!payment?.subscriptionId) return;
    try {
      setErr('');
      const { data } = await axios.get(
        `/api/asaas/subscriptions/${payment.subscriptionId}/payments`,
      );
      setSubscriptionPayments(data);
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Falha ao listar cobranças da assinatura'));
    }
  };

  const startPolling = () => {
    if (pollingRef.current) return;
    setPolling(true);
    pollingRef.current = setInterval(checkStatus, 4000);
  };

  const stopPolling = () => {
    setPolling(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const createBeneficiary = async () => {
    try {
      setErr('');
      setResp(null);
      const payload = [form];
      const { data } = await axios.post('/api/rapidoc/beneficiaries', payload);
      setResp(data);
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Erro ao criar beneficiário'));
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Teste – Rapidoc Beneficiário</h1>
        <p className="text-sm text-zinc-600">
          Busca planos disponíveis, permite editar os dados e cria beneficiário.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Planos disponíveis</h2>
        {loadingPlans && <p className="text-sm text-zinc-600">Carregando planos…</p>}
        {plansError && <p className="text-sm text-red-600">{plansError}</p>}

        {!loadingPlans && !plansError && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-white p-3">
              <label className="mb-1 block text-sm font-medium">Plano</label>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
              >
                <option value="">Selecione um plano…</option>
                {plans.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} – R$ {opt.value.toFixed(2)}
                  </option>
                ))}
              </select>
              {selectedPlan && (
                <div className="mt-2 space-y-1 rounded-md bg-emerald-50/60 p-3 text-xs text-emerald-700">
                  <p className="font-semibold uppercase tracking-wide">
                    Código: {selectedPlan.id}
                  </p>
                  <p>{selectedPlan.description || 'Sem descrição.'}</p>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-white p-3">
              <p className="text-sm font-medium text-zinc-700">Service Type</p>
              <p className="mt-2 font-mono text-sm uppercase text-zinc-700">
                {form.serviceType || '—'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Definido automaticamente pelo plano selecionado.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Dados do beneficiário</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              'name',
              'cpf',
              'birthday',
              'phone',
              'email',
              'zipCode',
              'address',
              'city',
              'state',
              'holder',
              'general',
            ] as (keyof BeneficiaryForm)[]
          ).map((key) => (
            <div key={key} className="rounded-lg border bg-white p-3">
              <label className="mb-1 block text-sm font-medium">{key}</label>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={form[key] as string}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={key === 'birthday' ? 'aaaa-mm-dd' : ''}
              />
            </div>
          ))}
        </div>

        {err && <p className="text-sm text-red-600">{String(err)}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Assinatura (Asaas)</h2>
        <div className="rounded-lg border bg-white p-3">
          <label className="mb-1 block text-sm font-medium">Valor (R$)</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={displayValue}
            readOnly
            placeholder="Selecione um plano"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Valor calculado a partir da configuração oficial do plano.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={createSubscription}
            className="rounded-md bg-zinc-900 px-4 py-2 text-white"
          >
            Criar assinatura
          </button>
          <button
            onClick={polling ? stopPolling : startPolling}
            disabled={!payment?.paymentId}
            className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60"
          >
            {polling ? 'Parar polling' : 'Iniciar polling'}
          </button>
          <button
            onClick={checkStatus}
            disabled={!payment || checking}
            className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60"
          >
            {checking
              ? 'Verificando…'
              : payment?.subscriptionId
                ? 'Verificar assinatura'
                : 'Verificar status'}
          </button>
          {payment?.subscriptionId && (
            <button
              onClick={listSubscriptionPayments}
              className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60"
            >
              Cobranças da assinatura
            </button>
          )}
        </div>

        {payment && payment.invoiceUrl && (
          <a
            href={payment.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center text-sm text-blue-600 underline"
          >
            Abrir fatura / checkout
          </a>
        )}

        {payment && (
          <div className="rounded-md border border-dashed border-zinc-300 p-3 text-xs">
            {payment.subscriptionId ? (
              <>
                <p>
                  Subscription ID:{' '}
                  <span className="font-mono text-sm">{payment.subscriptionId}</span>
                </p>
                <p>Status: {status || payment.status}</p>
              </>
            ) : (
              <>
                <p>
                  Payment ID:{' '}
                  <span className="font-mono text-sm">{payment.paymentId}</span>
                </p>
                <p>Status: {status || payment.status}</p>
              </>
            )}
            <p>
              Valor: <span className="font-semibold">R$ {displayValue || '0,00'}</span>
            </p>
          </div>
        )}

        {subscriptionDetails && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-700">Detalhes da assinatura</h3>
            <pre className="whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs">
              {JSON.stringify(subscriptionDetails, null, 2)}
            </pre>
          </div>
        )}

        {subscriptionPayments && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-700">Cobranças programadas</h3>
            <pre className="whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs">
              {JSON.stringify(subscriptionPayments, null, 2)}
            </pre>
          </div>
        )}

        {resp && (
          <pre className="whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs">
            {JSON.stringify(resp, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
