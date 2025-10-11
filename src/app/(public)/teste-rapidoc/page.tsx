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

const ASAAS_SANDBOX_PAYMENT_BASE_URL = 'https://sandbox.asaas.com/i/';

const extractMessage = (payload: unknown): string | null => {
  if (!payload) return null;
  if (typeof payload === 'string') {
    return payload.trim().length > 0 ? payload : null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const message = extractMessage(item);
      if (message) return message;
    }
    return null;
  }
  if (typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const keys = ['error', 'message', 'backend', 'description', 'detail'] as const;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const nested = errors
      .map((item) => extractMessage(item))
      .filter((value): value is string => Boolean(value));
    if (nested.length > 0) {
      return nested.join(' | ');
    }
  }

  return null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = extractMessage(error.response?.data);
    if (message) return message;
    try {
      if (error.response?.data) {
        return JSON.stringify(error.response.data, null, 2);
      }
    } catch (serializationError) {
      if (serializationError instanceof Error && serializationError.message) {
        return `${fallback}: ${serializationError.message}`;
      }
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const message = extractMessage(error);
  return message || fallback;
};

type PaymentExtraction = {
  firstPaymentId: string;
  firstPaymentStatus: string;
  hasSuccessfulPayment: boolean;
};

const extractFirstPayment = (payload: unknown): PaymentExtraction => {
  const fallback: PaymentExtraction = {
    firstPaymentId: '',
    firstPaymentStatus: '',
    hasSuccessfulPayment: false,
  };
  if (!payload) return fallback;

  const resolveArray = (items: unknown[]): PaymentExtraction => {
    let firstPaymentId = '';
    let firstPaymentStatus = '';
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : '';
      const status = typeof record.status === 'string' ? record.status : '';
      if (!firstPaymentId && id) {
        firstPaymentId = id;
        firstPaymentStatus = status;
      }
    }
    return { firstPaymentId, firstPaymentStatus, hasSuccessfulPayment: false };
  };

  if (Array.isArray(payload)) {
    return resolveArray(payload);
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const data = record.data;
    if (Array.isArray(data)) {
      const fromData = resolveArray(data);
      if (fromData.firstPaymentId) {
        return fromData;
      }
    }
    const items = record.items;
    if (Array.isArray(items)) {
      const fromItems = resolveArray(items);
      if (fromItems.firstPaymentId) {
        return fromItems;
      }
    }
  }

  return fallback;
};

const detectSuccessfulPayment = (payload: unknown, successStatuses: Set<string>): boolean => {
  if (!payload || successStatuses.size === 0) return false;

  const hasSuccess = (items: unknown[]): boolean =>
    items.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const status = (entry as Record<string, unknown>).status;
      return typeof status === 'string' && successStatuses.has(status);
    });

  if (Array.isArray(payload)) {
    return hasSuccess(payload);
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data) && hasSuccess(record.data)) {
      return true;
    }
    if (Array.isArray(record.items) && hasSuccess(record.items)) {
      return true;
    }
  }

  return false;
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
  const [subscriptionPaymentId, setSubscriptionPaymentId] = useState('');
  const [subscriptionPaymentUrl, setSubscriptionPaymentUrl] = useState('');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const successSet = useRef(new Set<string>(PAYMENT_SUCCESS_STATUSES));
  const paymentRef = useRef<CheckoutResponse | null>(null);
  const beneficiaryCreatedRef = useRef(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    paymentRef.current = payment;
  }, [payment]);

  useEffect(() => {
    checkingRef.current = checking;
  }, [checking]);

  const subscriptionPaymentCode = useMemo(() => {
    return subscriptionPaymentId ? subscriptionPaymentId.replace(/^pay_/, '') : '';
  }, [subscriptionPaymentId]);

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
      setSubscriptionPaymentId('');
      setSubscriptionPaymentUrl('');
      beneficiaryCreatedRef.current = false;

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

      if (data.subscriptionId) {
        await fetchSubscriptionPaymentsById(data.subscriptionId);
      }
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Erro ao criar assinatura'));
    }
  };

  const checkStatus = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    const currentPayment = paymentRef.current;
    if (currentPayment?.subscriptionId) {
      try {
        setChecking(true);
        const { data } = await axios.get<Record<string, unknown>>(
          `/api/asaas/subscriptions/${currentPayment.subscriptionId}`,
        );
        const rawStatus = data['status'];
        setStatus(typeof rawStatus === 'string' ? rawStatus : '');
        setSubscriptionDetails(data);
        const extraction = await fetchSubscriptionPaymentsById(currentPayment.subscriptionId, {
          silent: true,
        });
        const shouldCreate =
          extraction.hasSuccessfulPayment ||
          (extraction.firstPaymentStatus &&
            successSet.current.has(String(extraction.firstPaymentStatus)));
        if (shouldCreate && !beneficiaryCreatedRef.current) {
          const created = await createBeneficiary();
          if (created) {
            stopPolling();
          }
        }
      } catch (error: unknown) {
        setErr(getErrorMessage(error, 'Falha ao consultar assinatura'));
      } finally {
        setChecking(false);
        checkingRef.current = false;
      }
      return;
    }

    if (!currentPayment?.paymentId) {
      checkingRef.current = false;
      return;
    }
    try {
      setChecking(true);
      const { data } = await axios.get<StatusResponse>(`/api/checkout/status/${currentPayment.paymentId}`);
      setStatus(data.status);
      // se confirmado, cria beneficiário automaticamente
      if (successSet.current.has(String(data.status)) && !beneficiaryCreatedRef.current) {
        const created = await createBeneficiary();
        if (created) {
          stopPolling();
        }
      }
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Falha ao checar status'));
    } finally {
      setChecking(false);
      checkingRef.current = false;
    }
  };

  const fetchSubscriptionPaymentsById = async (
    subscriptionId: string,
    options?: { silent?: boolean },
  ): Promise<PaymentExtraction> => {
    try {
      if (!options?.silent) {
        setErr('');
      }
      const { data } = await axios.get(`/api/asaas/subscriptions/${subscriptionId}/payments`);
      setSubscriptionPayments(data);
      const extraction = extractFirstPayment(data);
      const hasSuccess = detectSuccessfulPayment(data, successSet.current);
      const result: PaymentExtraction = {
        ...extraction,
        hasSuccessfulPayment: hasSuccess,
      };
      setSubscriptionPaymentId(result.firstPaymentId);
      const code = result.firstPaymentId.replace(/^pay_/, '');
      setSubscriptionPaymentUrl(code ? `${ASAAS_SANDBOX_PAYMENT_BASE_URL}${code}` : '');
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Falha ao listar cobranças da assinatura');
      setErr(message);
      setSubscriptionPaymentId('');
      setSubscriptionPaymentUrl('');
      return { firstPaymentId: '', firstPaymentStatus: '', hasSuccessfulPayment: false };
    }
  };

  const listSubscriptionPayments = async () => {
    const currentPayment = paymentRef.current;
    if (!currentPayment?.subscriptionId) return;
    await fetchSubscriptionPaymentsById(currentPayment.subscriptionId);
  };

  const startPolling = () => {
    if (pollingRef.current) return;
    setPolling(true);
    pollingRef.current = setInterval(() => {
      void checkStatus();
    }, 4000);
    void checkStatus();
  };

  const stopPolling = () => {
    setPolling(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    const current = payment;
    if (!current?.paymentId && !current?.subscriptionId) {
      return;
    }
    startPolling();
  }, [payment]);

  const createBeneficiary = async (): Promise<boolean> => {
    try {
      setErr('');
      setResp(null);
      const payload = [form];
      const { data } = await axios.post('/api/rapidoc/beneficiaries', payload);
      setResp(data);
      beneficiaryCreatedRef.current = true;
      return true;
    } catch (error: unknown) {
      beneficiaryCreatedRef.current = false;
      setErr(getErrorMessage(error, 'Erro ao criar beneficiário'));
      return false;
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={createSubscription}
            className="rounded-md bg-zinc-900 px-4 py-2 text-white"
          >
            Criar assinatura
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
            <>
              <button
                onClick={listSubscriptionPayments}
                className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60"
              >
                Atualizar cobranças
              </button>
              {subscriptionPaymentUrl && (
                <a
                  href={subscriptionPaymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-emerald-600 px-4 py-2 text-emerald-700 transition hover:bg-emerald-50"
                >
                  Abrir cobrança (Asaas)
                </a>
              )}
            </>
          )}
          <span className="text-xs text-emerald-600">
            {polling
              ? 'Monitoramento automático ativo.'
              : 'O monitoramento inicia automaticamente após gerar a cobrança.'}
          </span>
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
                {subscriptionPaymentId && (
                  <p>
                    Payment ID inicial{' '}
                    <span className="font-mono text-sm">{subscriptionPaymentId}</span>
                  </p>
                )}
                {subscriptionPaymentCode && (
                  <p>
                    Código Asaas{' '}
                    <span className="font-mono text-sm">{subscriptionPaymentCode}</span>
                  </p>
                )}
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
