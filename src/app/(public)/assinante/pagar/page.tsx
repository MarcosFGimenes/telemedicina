'use client';

import axios from 'axios';
import { useMemo, useState } from 'react';
import type {
  CheckoutRequestBody,
  CheckoutResponse,
  StatusResponse,
} from '@/types/checkout';
import { PAYMENT_SUCCESS_STATUSES } from '@/types/checkout';

type FormState = {
  customerId: string;
  name: string;
  cpf: string;
  value: string;
  email: string;
  mobilePhone: string;
  zipCode: string;
  address: string;
  city: string;
  state: string;
  description: string;
};

const POLL_INTERVAL_MS = 6000;
const MAX_ATTEMPTS = 20;

const statusColor = (status?: string) => {
  switch (status) {
    case 'CONFIRMED':
    case 'RECEIVED':
      return 'bg-green-100 text-green-700';
    case 'OVERDUE':
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    case 'PENDING':
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
};

const formatDisplayDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('pt-BR');
};

const successStatuses = new Set(PAYMENT_SUCCESS_STATUSES);

export default function PagarAgoraPage() {
  const [form, setForm] = useState<FormState>({
    customerId: '',
    name: '',
    cpf: '',
    value: '',
    email: '',
    mobilePhone: '',
    zipCode: '',
    address: '',
    city: '',
    state: '',
    description: '',
  });

  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState<CheckoutResponse | null>(null);
  const [status, setStatus] = useState<string>('');
  const [polling, setPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const expirationDisplay = useMemo(
    () => formatDisplayDate(payment?.pix?.expirationDate ?? null),
    [payment?.pix?.expirationDate],
  );

  const isExpired = useMemo(() => {
    if (!payment?.pix?.expirationDate) {
      return false;
    }
    const parsed = new Date(payment.pix.expirationDate);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }
    return parsed.getTime() < Date.now();
  }, [payment?.pix?.expirationDate]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildRequestPayload = (): CheckoutRequestBody | null => {
    const numericValue = Number(form.value.replace(',', '.'));

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setError('Informe um valor valido.');
      return null;
    }

    const cpfDigits = form.cpf.replace(/\D/g, '');
    if (!cpfDigits) {
      setError('Informe o CPF do titular.');
      return null;
    }

    if (!form.customerId && !form.name.trim()) {
      setError('Informe o nome para criar o customer no Asaas.');
      return null;
    }

    const payload: CheckoutRequestBody = {
      value: Number(numericValue.toFixed(2)),
      cpf: cpfDigits,
    };

    if (form.customerId.trim()) {
      payload.customerId = form.customerId.trim();
    }

    if (form.name.trim()) {
      payload.name = form.name.trim();
    }

    if (form.description.trim()) {
      payload.description = form.description.trim();
    }

    if (form.email.trim()) {
      payload.email = form.email.trim();
    }

    if (form.mobilePhone.trim()) {
      payload.mobilePhone = form.mobilePhone.trim();
    }

    if (form.zipCode.trim()) {
      payload.zipCode = form.zipCode.trim();
    }

    if (form.address.trim()) {
      payload.address = form.address.trim();
    }

    if (form.city.trim()) {
      payload.city = form.city.trim();
    }

    if (form.state.trim()) {
      payload.state = form.state.trim();
    }

    return payload;
  };

  const handleSubmit = async () => {
    setError('');
    setSuccessMessage('');
    setCopySuccess('');

    const payload = buildRequestPayload();
    if (!payload) {
      return;
    }

    setLoading(true);
    setPolling(false);
    setPollAttempts(0);

    try {
      const { data } = await axios.post<CheckoutResponse>(
        '/api/checkout/pagar-agora',
        payload,
      );
      setPayment(data);
      setStatus(data.status);
    } catch (err: any) {
      const backend = err?.response?.data?.error;
      setError(backend || err?.message || 'Erro ao criar pagamento');
    } finally {
      setLoading(false);
    }
  };

  const copyPayload = async () => {
    if (!payment?.pix?.payload) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payment.pix.payload);
      setCopySuccess('Codigo copiado!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      setError('Nao foi possivel copiar automaticamente.');
    }
  };

    const pollStatus = async () => {
    if (!payment) {
      setError('Gere um pagamento antes de verificar.');
      return;
    }

    setPolling(true);
    setPollAttempts(0);
    setError('');
    setSuccessMessage('');

    let attempts = 0;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      active = false;
      setPolling(false);
      if (timer) {
        clearTimeout(timer);
      }
    };

    const run = async () => {
      if (!active) {
        return;
      }

      attempts += 1;
      setPollAttempts(attempts);

      try {
        const { data } = await axios.get<StatusResponse>(`/api/checkout/status/${payment.paymentId}`);
        setStatus(data.status);

        if (successStatuses.has(data.status)) {
          setSuccessMessage('Pagamento confirmado. O webhook ira ativar o acesso em instantes.');
          stop();
          return;
        }

        if (attempts >= MAX_ATTEMPTS) {
          stop();
          return;
        }
      } catch (err: any) {
        const backend = err?.response?.data?.error;
        setError(backend || err?.message || 'Erro ao verificar status');
        stop();
        return;
      }

      timer = setTimeout(run, POLL_INTERVAL_MS);
    };

    await run();

    return stop;
  };

  const resetForNewPayment = () => {
    setPayment(null);
    setStatus('');
    setPolling(false);
    setPollAttempts(0);
    setSuccessMessage('');
    setCopySuccess('');
    setError('');
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Pagamento rapido via PIX (Sandbox)</h2>
      <p className="text-sm text-zinc-600">
        Gere um checkout PIX no Asaas sandbox. O beneficiario sera criado ou reativado automaticamente apos o webhook de confirmacao.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-white p-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Customer ID (opcional)</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="cus_..."
              value={form.customerId}
              onChange={(event) => updateForm('customerId', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Nome completo</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Joao da Silva"
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">CPF</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="12345678909"
              value={form.cpf}
              onChange={(event) => updateForm('cpf', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Valor (R$)</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="49.90"
              value={form.value}
              onChange={(event) => updateForm('value', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Descricao (opcional)</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Teste de cobranca"
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Email</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="cliente@email.com"
              value={form.email}
              onChange={(event) => updateForm('email', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Celular</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="11999999999"
              value={form.mobilePhone}
              onChange={(event) => updateForm('mobilePhone', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">CEP</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="01310930"
              value={form.zipCode}
              onChange={(event) => updateForm('zipCode', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Endereco</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Av. Paulista, 1000"
              value={form.address}
              onChange={(event) => updateForm('address', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Cidade</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Sao Paulo"
              value={form.city}
              onChange={(event) => updateForm('city', event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Estado (UF)</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="SP"
              value={form.state}
              onChange={(event) => updateForm('state', event.target.value)}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? 'Gerando...' : 'Gerar pagamento PIX'}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
        </div>

        <div className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status atual</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(status)}`}>
              {status || 'Sem status'}
            </span>
          </div>

          {payment ? (
            <div className="space-y-3">
              {payment.pix?.encodedImage ? (
                <img
                  src={`data:image/png;base64,${payment.pix.encodedImage}`}
                  alt="QR Code PIX"
                  className="mx-auto h-56 w-56 rounded-md border"
                />
              ) : (
                <p className="text-sm text-zinc-500">QR Code nao retornado.</p>
              )}

              {payment.pix?.payload && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Codigo copia e cola</label>
                  <textarea
                    readOnly
                    className="h-24 w-full rounded-md border px-3 py-2 text-xs"
                    value={payment.pix.payload}
                  />
                  <button
                    onClick={copyPayload}
                    className="rounded-md border border-zinc-300 px-3 py-1 text-sm"
                  >
                    Copiar codigo
                  </button>
                  {copySuccess && <span className="text-xs text-green-600">{copySuccess}</span>}
                </div>
              )}

              {expirationDisplay && (
                <p className="text-xs text-zinc-500">QR expira em: {expirationDisplay}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={pollStatus}
                  disabled={polling}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {polling ? 'Verificando...' : 'Verificar pagamento'}
                </button>
                {isExpired && (
                  <button
                    onClick={() => {
                      resetForNewPayment();
                      handleSubmit();
                    }}
                    disabled={loading}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-60"
                  >
                    Gerar novo QR
                  </button>
                )}
                {!isExpired && (
                  <button
                    onClick={resetForNewPayment}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
                  >
                    Limpar resultado
                  </button>
                )}
              </div>

              {pollAttempts > 0 && (
                <p className="text-xs text-zinc-500">
                  Tentativas de consulta: {pollAttempts}/{MAX_ATTEMPTS}
                </p>
              )}

              {payment.invoiceUrl && (
                <a
                  href={payment.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 underline"
                >
                  Abrir invoice no Asaas
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Gere um QR Code para ver os detalhes aqui. Ambiente sandbox do Asaas.
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Em producao, prefira webhooks do Asaas para sincronizar status e evitar polling constante.
      </p>
    </div>
  );
}

