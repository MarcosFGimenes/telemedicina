'use client';
import axios from 'axios';
import clsx from 'clsx';
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

type FlowStep = 'form' | 'instructions' | 'payment';

type CheckoutExperienceProps = {
  lockedPlan?: PlanOption | null;
  initialPlans?: PlanOption[];
  allowPlanSelection?: boolean;
  title?: string;
  description?: string;
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

export default function CheckoutExperience({
  lockedPlan = null,
  initialPlans,
  allowPlanSelection = true,
  title,
  description,
}: CheckoutExperienceProps) {
  const planSelectionEnabled = allowPlanSelection && !lockedPlan;
  const initialPlanList =
    (initialPlans && initialPlans.length > 0 ? initialPlans : null) ||
    (lockedPlan ? [lockedPlan] : []);

  const pageTitle =
    title ||
    (lockedPlan ? `Assinatura do plano ${lockedPlan.name}` : 'Checkout de assinatura');
  const pageDescription =
    description ||
    (lockedPlan
      ? 'Revise os dados do titular e finalize a assinatura.'
      : 'Selecione o plano, preencha os dados do beneficiario e acompanhe a criacao automatica.');

  const [plans, setPlans] = useState<PlanOption[]>(initialPlanList);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState(
    lockedPlan?.id || initialPlanList[0]?.id || '',
  );

  const [form, setForm] = useState<BeneficiaryForm>(SAMPLE);
  const [resp, setResp] = useState<unknown>(null);
  const [err, setErr] = useState('');
  const [flowStep, setFlowStep] = useState<FlowStep>('form');

  const [payment, setPayment] = useState<CheckoutResponse | null>(null);
  const [status, setStatus] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [polling, setPolling] = useState(false);
  const [submittingSubscription, setSubmittingSubscription] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState<unknown>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<unknown>(null);
  const [subscriptionPaymentId, setSubscriptionPaymentId] = useState('');
  const [subscriptionPaymentUrl, setSubscriptionPaymentUrl] = useState('');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const successSet = useRef(new Set<string>(PAYMENT_SUCCESS_STATUSES));
  const paymentRef = useRef<CheckoutResponse | null>(null);
  const beneficiaryCreatedRef = useRef(false);
  const [beneficiaryCreated, setBeneficiaryCreated] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    const basePlans =
      (initialPlans && initialPlans.length > 0 ? initialPlans : null) ||
      (lockedPlan ? [lockedPlan] : []);
    if (basePlans.length > 0) {
      setPlans(basePlans);
      if (lockedPlan) {
        setSelectedPlanId(lockedPlan.id);
      } else {
        setSelectedPlanId((current) => current || basePlans[0]?.id || '');
      }
    }
  }, [initialPlans, lockedPlan]);

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
    if (!planSelectionEnabled) {
      return;
    }
    if (initialPlans && initialPlans.length > 0) {
      return;
    }
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        setPlansError('');
        const { data } = await axios.get<PlanOption[]>('/api/plans');
        const fetched = Array.isArray(data) ? data : [];
        setPlans(fetched);
        setSelectedPlanId((current) => current || fetched[0]?.id || '');
      } catch (error: unknown) {
        setPlansError(getErrorMessage(error, 'Erro ao buscar planos disponíveis.'));
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, [planSelectionEnabled, initialPlans]);

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

  const planSummary = useMemo(() => {
    if (!selectedPlan) {
      return null;
    }
    return (
      <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60 p-6 shadow-inner">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-500">
          Plano confirmado
        </p>
        <p className="mt-2 text-2xl font-semibold text-emerald-800">{selectedPlan.name}</p>
        <p className="mt-1 text-xs font-medium uppercase text-emerald-500">
          Codigo Rapidoc: {selectedPlan.id}
        </p>
        <p className="mt-3 text-sm text-emerald-700">
          {selectedPlan.description || 'Sem descricao cadastrada.'}
        </p>
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-100 bg-white/90 px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-emerald-600">Valor oficial</span>
          <span className="text-xl font-semibold text-emerald-700">
            R$ {selectedPlan.value.toFixed(2)}
          </span>
        </div>
      </div>
    );
  }, [selectedPlan]);


  const fieldLabels: Record<keyof BeneficiaryForm, string> = {
    name: 'Nome completo',
    cpf: 'CPF',
    birthday: 'Data de nascimento',
    phone: 'Telefone',
    email: 'E-mail',
    zipCode: 'CEP',
    address: 'Endereco',
    city: 'Cidade',
    state: 'UF',
    holder: 'CPF do titular responsavel',
    general: 'Observacoes'
  };

  const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-100';

  const subtleCardClass =
    'rounded-3xl border border-white/70 bg-white/90 p-6 shadow-lg backdrop-blur';

  useEffect(() => {
    if (selectedPlan) {
      setForm((state) => ({
        ...state,
        serviceType: selectedPlan.serviceType as BeneficiaryForm['serviceType'],
      }));
    }
  }, [selectedPlan]);

  const createSubscription = async (): Promise<boolean> => {
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
      setBeneficiaryCreated(false);

      if (!selectedPlan) {
        setErr('Plano de assinatura indisponivel.');
        return false;
      }

      const amount = Number(selectedPlan.value) || 0;
      if (!amount || amount <= 0) {
        setErr('Informe um valor válido (> 0).');
        return false;
      }

      const normalizedPaymentType: BeneficiaryForm['paymentType'] = 'S';
      if (form.paymentType !== normalizedPaymentType) {
        setForm((state) => ({ ...state, paymentType: normalizedPaymentType }));
      }

      const payload: CheckoutRequestBody = {
        billingType: 'UNDEFINED',
        value: amount,
        description: `Assinatura - ${selectedPlan.name}`,
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
      return true;
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Erro ao criar assinatura'));
      return false;
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
      setBeneficiaryCreated(true);
      return true;
    } catch (error: unknown) {
      beneficiaryCreatedRef.current = false;
      setBeneficiaryCreated(false);
      setErr(getErrorMessage(error, 'Erro ao criar beneficiário'));
      return false;
    }
  };

  const stepOrder: FlowStep[] = ['form', 'instructions', 'payment'];
  const currentStepIndex = stepOrder.indexOf(flowStep);
  const stepLabels: Record<FlowStep, { title: string; description: string }> = {
    form: {
      title: 'Dados do beneficiário',
      description: 'Informe os dados do titular e escolha o plano ideal.',
    },
    instructions: {
      title: 'Confirme a assinatura',
      description: 'Revise as informações e gere a cobrança segura via Asaas.',
    },
    payment: {
      title: 'Finalize o pagamento',
      description: 'Realize o pagamento, aguarde a confirmação automática e conclua o registro.',
    },
  };

  const handleContinueToInstructions = () => {
    if (!selectedPlan) {
      setErr('Defina um plano valido antes de continuar.');
      return;
    }
    setErr('');
    setFlowStep('instructions');
  };

  const handleBackToForm = () => {
    setFlowStep('form');
  };

  const handleConfirmSubscription = async () => {
    setSubmittingSubscription(true);
    const success = await createSubscription();
    setSubmittingSubscription(false);
    if (success) {
      setFlowStep('payment');
    }
  };

  const checkoutUrl = subscriptionPaymentUrl || payment?.invoiceUrl || '';

  const friendlyResponseMessage = useMemo(() => {
    if (!resp) return '';
    const message = extractMessage(resp);
    if (!message) return '';
    const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized.includes('processamento concluido') && normalized.includes('beneficiario criado')) {
      return 'Processamento concluído com sucesso! Beneficiário criado na Rapidoc. Agora finalize o cadastro de acesso para liberar o portal.';
    }
    return message;
  }, [resp]);

  const successSummary = useMemo(() => {
    if (friendlyResponseMessage) return friendlyResponseMessage;
    if (beneficiaryCreated) {
      return 'Pagamento confirmado e beneficiário cadastrado automaticamente. Continue com o registro do acesso para concluir.';
    }
    return '';
  }, [friendlyResponseMessage, beneficiaryCreated]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-16">
      <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-400 p-8 text-white shadow-2xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
              Fluxo de assinatura
            </span>
            <h1 className="text-3xl font-semibold sm:text-4xl">{pageTitle}</h1>
            <p className="text-sm text-emerald-50/90">{pageDescription}</p>
          </div>
          {selectedPlan ? (
            <div className="min-w-[220px] rounded-3xl border border-white/40 bg-white/10 px-6 py-5 text-sm shadow-lg backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Plano atual</p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedPlan.name}</p>
              <p className="text-xs text-emerald-100/90">Codigo Rapidoc: {selectedPlan.id}</p>
              <p className="mt-3 text-base font-semibold text-white">
                R$ {displayValue || '0,00'}
              </p>
            </div>
          ) : planSelectionEnabled ? (
            <div className="min-w-[220px] rounded-3xl border border-white/40 bg-white/10 px-6 py-5 text-sm shadow-lg backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Proximo passo</p>
              <p className="mt-2 text-sm text-white/90">
                Escolha um plano para visualizar os detalhes aqui.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className={clsx(subtleCardClass, 'p-8')}>
        <ol className="grid gap-4 sm:grid-cols-3">
          {stepOrder.map((step, index) => {
          const { title, description } = stepLabels[step];
          const isActive = step === flowStep;
          const isCompleted = index < currentStepIndex;
          const indicator = isCompleted ? '✓' : index + 1;
          return (
            <li
              key={step}
              className={clsx(
                'rounded-2xl border px-5 py-4 shadow-sm transition',
                isActive
                  ? 'border-emerald-400/70 bg-emerald-50'
                  : isCompleted
                  ? 'border-emerald-200/70 bg-emerald-50/70'
                  : 'border-zinc-200/60 bg-white',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={clsx(
                    'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold',
                    isCompleted
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : isActive
                      ? 'border-emerald-500 text-emerald-700'
                      : 'border-zinc-200 text-zinc-400',
                  )}
                >
                  {indicator}
                </span>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">{title}</p>
                  <p className="text-xs text-zinc-500">{description}</p>
                </div>
              </div>
            </li>
          );
          })}
        </ol>
      </section>

      {err && (
        <div className="rounded-2xl border border-red-100 bg-red-50/80 p-4 text-sm text-red-700">
          {err}
        </div>
      )}

      {flowStep === 'form' && (
        <div className="space-y-6">
          <section className={clsx(subtleCardClass, 'space-y-6')}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-emerald-800">Plano de assinatura</h2>
                <p className="text-sm text-zinc-500">
                  {planSelectionEnabled
                    ? 'Escolha a opcao ideal para o titular.'
                    : 'Plano definido via link dedicado. As informacoes abaixo sao apenas referencia.'}
                </p>
              </div>
              {planSelectionEnabled && (
                <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 sm:inline-flex">
                  Etapa 1 de 3
                </span>
              )}
            </div>
            {planSelectionEnabled && loadingPlans && (
              <p className="text-sm text-zinc-500">Carregando planos...</p>
            )}
            {plansError && <p className="text-sm text-red-600">{plansError}</p>}

            {planSelectionEnabled ? (
              !loadingPlans &&
              !plansError && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3">
                      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Plano</label>
                      <select
                        className={inputClass}
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                      >
                        <option value="">Selecione um plano...</option>
                        {plans.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name} - R$ {opt.value.toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-zinc-500">
                        O valor e o service type sao aplicados automaticamente ao escolher o plano.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-700 shadow-inner">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Service Type</p>
                      <p className="mt-2 font-mono text-sm uppercase text-emerald-700">{form.serviceType || '--'}</p>
                      <p className="mt-2 text-xs text-emerald-600">
                        Essa configuracao sera usada ao criar a assinatura no Asaas/Rapidoc.
                      </p>
                    </div>
                  </div>
                  {planSummary && <div className="mt-4">{planSummary}</div>}
                </>
              )
            ) : (
              planSummary && (
                <div className="space-y-4">
                  {planSummary}
                  <p className="text-xs text-zinc-500">O plano ja foi vinculado a este checkout.</p>
                </div>
              )
            )}
          </section>

          <section className={clsx(subtleCardClass, 'space-y-6')}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-emerald-800">Dados do beneficiario</h2>
                <p className="text-sm text-zinc-500">Informe exatamente como aparecer no prontuario Rapidoc.</p>
              </div>
              <span className="hidden rounded-full border border-emerald-200 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 sm:inline-flex">
                Etapa 2 de 3
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {([
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
              ] as (keyof BeneficiaryForm)[]).map((key) => {
                const label = fieldLabels[key] || key;
                return (
                  <div key={key} className="flex flex-col gap-2 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
                    <input
                      className={inputClass}
                      value={String(form[key] ?? '')}
                      onChange={(e) => onChange(key, e.target.value)}
                      placeholder={key === 'birthday' ? 'aaaa-mm-dd' : ''}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500">Os dados enviados sao validados automaticamente pelo conector Rapidoc.</p>

            <div className="flex flex-col gap-4 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-800">Valor da assinatura</p>
                <p className="mt-1 text-3xl font-semibold text-emerald-700">R$ {displayValue || '0,00'}</p>
                <p className="text-xs text-emerald-600">Valor calculado com base na configuracao oficial do plano.</p>
              </div>
              <button
                type="button"
                onClick={handleContinueToInstructions}
                className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
              >
                Continuar
              </button>
            </div>
            <p className="text-xs text-zinc-500">Voce podera revisar todas as informacoes antes de confirmar a assinatura.</p>
          </section>
        </div>
      )}
      {flowStep === 'instructions' && selectedPlan && (
        <section
          className={clsx(
            subtleCardClass,
            'space-y-6 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60',
          )}
        >
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-emerald-800">Revise antes de confirmar</h2>
            <p className="text-sm text-emerald-600">
              Geraremos a assinatura no Asaas utilizando exatamente as informacoes abaixo.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-emerald-100 bg-white/95 p-5 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Plano selecionado
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-800">{selectedPlan.name}</p>
              <p className="text-xs text-zinc-500">Valor mensal: R$ {displayValue || '0,00'}</p>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-white/95 p-5 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Beneficiario
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-800">{form.name}</p>
              <p className="text-xs text-zinc-500">CPF: {form.cpf}</p>
              <p className="text-xs text-zinc-500">E-mail: {form.email}</p>
              <p className="text-xs text-zinc-500">Telefone: {form.phone}</p>
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-emerald-700">
            <li>Confirme se os dados do beneficiario e do plano estao corretos.</li>
            <li>
              Clique em <strong>Confirmar assinatura</strong> para gerar a cobranca segura no Asaas.
            </li>
            <li>Na proxima etapa voce sera direcionado ao checkout para efetuar o pagamento.</li>
            <li>Apos pagar, retorne a esta pagina para acompanhar a confirmacao automatica.</li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBackToForm}
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-700"
            >
              Editar informacoes
            </button>
            <button
              type="button"
              onClick={handleConfirmSubscription}
              disabled={submittingSubscription}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submittingSubscription ? 'Gerando assinatura...' : 'Confirmar assinatura'}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Assim que a assinatura for criada exibiremos o link para continuar o pagamento.
          </p>
        </section>
      )}      {flowStep === 'payment' && (
        <section className={clsx(subtleCardClass, 'space-y-6')}>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-emerald-800">Pagamento e confirmacao automatica</h2>
            <p className="text-sm text-emerald-600">
              Abra o checkout do Asaas para concluir o pagamento e acompanhe o status sem sair desta pagina.
            </p>
          </div>
          <ul className="list-disc space-y-1 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 pl-6 text-sm text-emerald-700">
            <li>O link abre em uma nova aba. Finalize o pagamento normalmente no Asaas.</li>
            <li>Assim que o pagamento for confirmado, atualizamos o status automaticamente e criamos o beneficiario.</li>
            <li>Mesmo que a aba seja fechada, o webhook do Asaas garante a conclusao do processo.</li>
            <li>
              Com o pagamento confirmado, finalize o registro no portal{' '}
              <a className="text-emerald-700 underline" href="/primeiro-acesso">
                Primeiro acesso
              </a>
              .
            </li>
          </ul>
          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
            >
              Continuar para pagamento
            </a>
          ) : (
            <p className="text-sm text-emerald-600">Gerando cobranca... aguarde um instante para exibirmos o link de pagamento.</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={checkStatus}
              disabled={!payment || checking}
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-60"
            >
              {checking
                ? 'Verificando...'
                : payment?.subscriptionId
                  ? 'Verificar assinatura'
                  : 'Verificar status'}
            </button>
            {payment?.subscriptionId && (
              <button
                type="button"
                onClick={listSubscriptionPayments}
                className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-700"
              >
                Atualizar cobrancas
              </button>
            )}
            {subscriptionPaymentUrl && (
              <a
                href={subscriptionPaymentUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-emerald-600 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Abrir cobranca (Asaas)
              </a>
            )}
            {payment?.invoiceUrl && (
              <a
                href={payment.invoiceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-emerald-600 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Abrir fatura / checkout
              </a>
            )}
            <span className="text-xs text-emerald-600">
              {polling
                ? 'Monitoramento automatico ativo.'
                : 'O monitoramento inicia automaticamente apos gerar a cobranca.'}
            </span>
          </div>          {payment && (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-700">
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

          {successSummary && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/90 p-6 shadow-sm">
              <p className="text-base font-semibold text-emerald-700">Beneficiário confirmado</p>
              <p className="mt-2 text-sm text-emerald-700">{successSummary}</p>
              <a
                href="/primeiro-acesso"
                className="mt-4 inline-flex items-center justify-center rounded-full border border-emerald-600 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Ir para o registro de acesso
              </a>
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
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-700">Resposta Rapidoc</h3>
              <pre className="whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs">
                {JSON.stringify(resp, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}


