'use client';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import PixViewer from '@/components/PixViewer';
import type { BillingType, CheckoutRequestBody, CheckoutResponse, StatusResponse, PAYMENT_SUCCESS_STATUSES } from '@/types/checkout';

type PlanOption = {
  paymentType: 'S' | 'A';
  plan: {
    uuid: string;
    name: string;
    description?: string;
    serviceType: 'G' | 'P' | 'GP' | 'GS' | 'GSP';
    specialties?: { name: string; uuid: string }[];
  };
};

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
  serviceType: 'G' | 'P' | 'GP' | 'GS' | 'GSP';
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

export default function TesteRapidocPage() {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState('');
  const [selectedPlanUuid, setSelectedPlanUuid] = useState('');

  const [form, setForm] = useState<BeneficiaryForm>(SAMPLE);
  const [resp, setResp] = useState<unknown>(null);
  const [err, setErr] = useState('');

  const [billingType, setBillingType] = useState<BillingType>('PIX');
  const [value, setValue] = useState<string>('49.90');

  const [payment, setPayment] = useState<CheckoutResponse | null>(null);
  const [status, setStatus] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const successSet = useRef(new Set(['RECEIVED','CONFIRMED'] satisfies typeof PAYMENT_SUCCESS_STATUSES[number][]));

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        setPlansError('');
        const { data } = await axios.get<PlanOption[]>('/api/rapidoc/planos');
        setPlans(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setPlansError(
          e?.response?.data?.error || e?.message || 'Erro ao buscar planos da Rapidoc',
        );
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
    () => plans.find((p) => p.plan.uuid === selectedPlanUuid) || null,
    [plans, selectedPlanUuid],
  );

  useEffect(() => {
    if (selectedPlan) {
      // Ajusta paymentType e serviceType conforme o plano selecionado
      setForm((state) => ({
        ...state,
        paymentType: selectedPlan.paymentType,
        serviceType: selectedPlan.plan.serviceType,
      }));
    }
  }, [selectedPlan]);

  const createCharge = async () => {
    try {
      setErr('');
      setResp(null);
      setPayment(null);
      setStatus('');
      stopPolling();

      const amount = Number(String(value).replace(',', '.')) || 0;
      if (!amount || amount <= 0) {
        setErr('Informe um valor válido (> 0).');
        return;
      }

      const payload: CheckoutRequestBody = {
        billingType,
        value: amount,
        description: `Teste Rapidoc - ${selectedPlan?.plan.name ?? 'Plano'}`,
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
        serviceType: form.serviceType,
        holder: form.holder,
        general: form.general,
      };

      const { data } = await axios.post<CheckoutResponse>('/api/checkout/pagar', payload);
      setPayment(data);
      setStatus(data.status);

      // inicia polling automático para status
      startPolling();
    } catch (e: any) {
      setErr(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          'Erro ao gerar cobrança',
      );
    }
  };

  const checkStatus = async () => {
    if (!payment?.paymentId) return;
    try {
      setChecking(true);
      const { data } = await axios.get<StatusResponse>(`/api/checkout/status/${payment.paymentId}`);
      setStatus(data.status);
      // se confirmado, cria beneficiário automaticamente
      if (successSet.current.has(String(data.status) as any)) {
        await createBeneficiary();
        stopPolling();
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Falha ao checar status');
    } finally {
      setChecking(false);
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
    } catch (e: any) {
      setErr(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.response?.data?.error ||
          e?.message ||
          'Erro ao criar beneficiário',
      );
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
                value={selectedPlanUuid}
                onChange={(e) => setSelectedPlanUuid(e.target.value)}
              >
                <option value="">Selecione um plano…</option>
                {plans.map((opt) => (
                  <option key={opt.plan.uuid} value={opt.plan.uuid}>
                    {opt.plan.name} – {opt.plan.serviceType} / {opt.paymentType}
                  </option>
                ))}
              </select>
              {selectedPlan && (
                <p className="mt-2 text-xs text-zinc-600">
                  {selectedPlan.plan.description || 'Sem descrição.'}
                </p>
              )}
            </div>

            <div className="rounded-lg border bg-white p-3">
              <label className="mb-1 block text-sm font-medium">paymentType</label>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={form.paymentType}
                onChange={(e) => onChange('paymentType', e.target.value)}
              >
                <option value="S">S</option>
                <option value="A">A</option>
              </select>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <label className="mb-1 block text-sm font-medium">serviceType</label>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={form.serviceType}
                onChange={(e) => onChange('serviceType', e.target.value)}
              >
                <option value="G">G</option>
                <option value="P">P</option>
                <option value="GP">GP</option>
                <option value="GS">GS</option>
                <option value="GSP">GSP</option>
              </select>
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
        <h2 className="text-lg font-medium">Cobrança (Asaas)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-white p-3">
            <label className="mb-1 block text-sm font-medium">Método de pagamento</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as BillingType)}
            >
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
            </select>
          </div>

          <div className="rounded-lg border bg-white p-3">
            <label className="mb-1 block text-sm font-medium">Valor (R$)</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="49.90"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={createCharge}
            className="rounded-md bg-zinc-900 px-4 py-2 text-white"
          >
            Gerar cobrança
          </button>
          <button
            onClick={polling ? stopPolling : startPolling}
            disabled={!payment}
            className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60"
          >
            {polling ? 'Parar polling' : 'Iniciar polling'}
          </button>
          <button
            onClick={checkStatus}
            disabled={!payment || checking}
            className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-60"
          >
            {checking ? 'Verificando…' : 'Verificar status'}
          </button>
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

        {payment?.pix && (
          <PixViewer
            encodedImage={payment.pix?.encodedImage}
            payload={payment.pix?.payload}
            expirationDate={payment.pix?.expirationDate}
            status={status}
          />
        )}

        {payment && (
          <div className="rounded-md border border-dashed border-zinc-300 p-3 text-xs">
            <p>
              Payment ID: <span className="font-mono text-sm">{payment.paymentId}</span>
            </p>
            <p>Status: {status || payment.status}</p>
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
