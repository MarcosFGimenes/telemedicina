'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import PaymentMethodSelector from '@/components/PaymentMethodSelector';
import PixViewer from '@/components/PixViewer';
import { usePolling } from '@/hooks/usePolling';
import {
  type BillingType,
  type CheckoutRequestBody,
  type CheckoutResponse,
  type FinalizeResponseBody,
  type StatusResponse,
  PAYMENT_SUCCESS_STATUSES,
} from '@/types/checkout';
import {
  formatCurrency,
  formatDateInput,
  isValidCpf,
  isValidEmail,
  onlyDigits,
  parseCurrencyInput,
} from '@/utils/format';

const STORAGE_KEY = 'checkout:last-payment';
const SUCCESS_STATUSES = new Set(PAYMENT_SUCCESS_STATUSES);
const DEFAULT_METHOD: BillingType = 'BOLETO';

type CustomerForm = {
  name: string;
  cpf: string;
  email: string;
  mobilePhone: string;
  zipCode: string;
  address: string;
  city: string;
  state: string;
};

type CardForm = {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
};

type CardHolderForm = {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
};

type StoredPayment = {
  payment: CheckoutResponse;
  method: BillingType;
  cpf: string;
};

const getDefaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return formatDateInput(date.toISOString());
};

const extractErrorMessage = (error: unknown): string => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Erro inesperado';
  }

  const data = error.response?.data as any;
  const description =
    data?.errors?.[0]?.description ||
    data?.error?.errors?.[0]?.description ||
    data?.error?.message ||
    data?.error?.description ||
    data?.error;

  if (typeof description === 'string') {
    return description;
  }

  return error.message ?? 'Erro ao processar requisição';
};

export default function PagarPage() {
  const [customer, setCustomer] = useState<CustomerForm>({
    name: '',
    cpf: '',
    email: '',
    mobilePhone: '',
    zipCode: '',
    address: '',
    city: '',
    state: '',
  });
  const [method, setMethod] = useState<BillingType>(DEFAULT_METHOD);
  const [pixAvailable, setPixAvailable] = useState(true);
  const [amount, setAmount] = useState('49.90');
  const [dueDate, setDueDate] = useState(getDefaultDueDate);
  const [card, setCard] = useState<CardForm>({
    holderName: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: '',
  });
  const [cardHolder, setCardHolder] = useState<CardHolderForm>({
    name: '',
    email: '',
    cpfCnpj: '',
    postalCode: '',
    addressNumber: '',
    phone: '',
  });

  const [payment, setPayment] = useState<CheckoutResponse | null>(null);
  const [status, setStatus] = useState('');
  const [statusAttempts, setStatusAttempts] = useState(0);
  const [rawLog, setRawLog] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [success, setSuccess] = useState('');
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedRaw = window.localStorage.getItem(STORAGE_KEY);
    if (!storedRaw) {
      return;
    }

    try {
      const stored = JSON.parse(storedRaw) as StoredPayment;
      if (stored?.payment?.paymentId) {
        setPayment(stored.payment);
        setStatus(stored.payment.status);
        setMethod(stored.method ?? DEFAULT_METHOD);
        setCustomer((prev) => ({ ...prev, cpf: stored.cpf }));
      }
    } catch (err) {
      console.error('Failed to parse stored payment', err);
    }
  }, []);

  useEffect(() => {
    if (!payment || typeof window === 'undefined') {
      return;
    }

    const payload: StoredPayment = {
      payment,
      method,
      cpf: customer.cpf,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [payment, method, customer.cpf]);

  const successStatusLabel = useMemo(() =>
    SUCCESS_STATUSES.has(status as (typeof PAYMENT_SUCCESS_STATUSES)[number])
      ? 'Pagamento confirmado'
      : undefined,
  [status]);

  const { start: startPolling, stop: stopPolling, running: polling, attempts } = usePolling(async () => {
    if (!payment) {
      return true;
    }

    try {
      const { data } = await axios.get<StatusResponse>(`/api/checkout/status/${payment.paymentId}`);
      setStatus(data.status);
      setRawLog(data.raw);
      if (SUCCESS_STATUSES.has(data.status as (typeof PAYMENT_SUCCESS_STATUSES)[number])) {
        setInfoMessage('Pagamento confirmado! Você pode finalizar manualmente.');
        return true;
      }

      return false;
    } catch (err) {
      setError(extractErrorMessage(err));
      return true;
    }
  }, { interval: 6000, maxAttempts: 20 });

  const resetState = () => {
    stopPolling();
    setPayment(null);
    setStatus('');
    setRawLog(null);
    setStatusAttempts(0);
    setInfoMessage('');
    setSuccess('');
  };

  const handleCustomerChange = (key: keyof CustomerForm, value: string) => {
    setCustomer((prev) => ({ ...prev, [key]: value }));
  };

  const handleCardChange = (key: keyof CardForm, value: string) => {
    setCard((prev) => ({ ...prev, [key]: value }));
  };

  const handleCardHolderChange = (key: keyof CardHolderForm, value: string) => {
    setCardHolder((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = (): CheckoutRequestBody | null => {
    const trimmedName = customer.name.trim();
    if (!trimmedName) {
      setError('Informe o nome completo.');
      return null;
    }

    if (!isValidCpf(customer.cpf)) {
      setError('Informe um CPF válido (somente números).');
      return null;
    }

    if (customer.email && !isValidEmail(customer.email)) {
      setError('Informe um e-mail válido.');
      return null;
    }

    const parsedValue = parseCurrencyInput(amount);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setError('Informe um valor válido.');
      return null;
    }

    const payload: CheckoutRequestBody = {
      billingType: method,
      value: Number(parsedValue.toFixed(2)),
      name: trimmedName,
      cpf: onlyDigits(customer.cpf),
      email: customer.email || undefined,
      mobilePhone: customer.mobilePhone || undefined,
      zipCode: customer.zipCode || undefined,
      address: customer.address || undefined,
      city: customer.city || undefined,
      state: customer.state || undefined,
      description: undefined,
    };

    if (method === 'BOLETO' || method === 'PIX') {
      payload.dueDate = dueDate;
    }

    if (method === 'CREDIT_CARD') {
      const allCardFilled = Object.values(card).every((value) => value.trim());
      const allHolderFilled = Object.values(cardHolder).every((value) => value.trim());

      if (!allCardFilled || !allHolderFilled) {
        setError('Preencha todos os campos do cartão e do titular.');
        return null;
      }

      payload.creditCard = {
        holderName: card.holderName.trim(),
        number: card.number.replace(/\s+/g, ''),
        expiryMonth: card.expiryMonth.trim(),
        expiryYear: card.expiryYear.trim(),
        ccv: card.ccv.trim(),
      };

      payload.creditCardHolderInfo = {
        name: cardHolder.name.trim(),
        email: cardHolder.email.trim(),
        cpfCnpj: onlyDigits(cardHolder.cpfCnpj),
        postalCode: onlyDigits(cardHolder.postalCode),
        addressNumber: cardHolder.addressNumber.trim(),
        phone: onlyDigits(cardHolder.phone),
      };
    }

    return payload;
  };

  const handleGenerate = async () => {
    setError('');
    setInfoMessage('');
    setSuccess('');
    stopPolling();

    const payload = buildPayload();
    if (!payload) {
      return;
    }

    try {
      setLoading(true);
      const { data } = await axios.post<CheckoutResponse>('/api/checkout/pagar', payload);
      setPayment(data);
      setStatus(data.status);
      setRawLog(null);
      setStatusAttempts(0);
      setInfoMessage('Cobrança criada. Acompanhe o status abaixo.');
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);

      if (method === 'PIX' && message.toLowerCase().includes('invalid_billingtype')) {
        setPixAvailable(false);
        setMethod('BOLETO');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!payment) {
      setError('Nenhum pagamento em andamento.');
      return;
    }

    setError('');
    setChecking(true);

    try {
      const { data } = await axios.get<StatusResponse>(`/api/checkout/status/${payment.paymentId}`);
      setStatus(data.status);
      setRawLog(data.raw);
      if (SUCCESS_STATUSES.has(data.status as (typeof PAYMENT_SUCCESS_STATUSES)[number])) {
        setInfoMessage('Pagamento confirmado! Você pode finalizar manualmente.');
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const handleFinalize = async () => {
    if (!payment) {
      setError('Nenhum pagamento disponível para finalizar.');
      return;
    }

    setError('');
    setSuccess('');
    setFinalizing(true);

    try {
      const { data } = await axios.post<FinalizeResponseBody>('/api/checkout/finalizar', {
        cpf: customer.cpf,
        paymentId: payment.paymentId,
      });

      if (data.ok) {
        setSuccess('Beneficiário ativo com sucesso!');
        setInfoMessage('Rapidoc sincronizado.');
        setStatus(data.status);
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } else {
        setError('Pagamento ainda não confirmado.');
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setFinalizing(false);
    }
  };

  const statusBadge = useMemo(() => {
    if (!status) {
      return 'Sem status';
    }

    if (SUCCESS_STATUSES.has(status as (typeof PAYMENT_SUCCESS_STATUSES)[number])) {
      return `? ${status}`;
    }

    return status;
  }, [status]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Checkout de teste – Asaas + Rapidoc</h1>
        <p className="text-sm text-zinc-600">
          Escolha a forma de pagamento, gere a cobrança e ative o beneficiário manualmente sem aguardar o webhook.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">1. Dados do cliente</h2>
          <p className="text-xs text-zinc-500">Informe os dados básicos do titular usados no Asaas e Rapidoc.</p>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Nome completo</label>
              <input
                className="rounded-md border px-3 py-2"
                placeholder="João da Silva"
                value={customer.name}
                onChange={(event) => handleCustomerChange('name', event.target.value)}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">CPF</label>
              <input
                className="rounded-md border px-3 py-2"
                placeholder="Somente números"
                value={customer.cpf}
                onChange={(event) => handleCustomerChange('cpf', onlyDigits(event.target.value))}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">E-mail</label>
              <input
                className="rounded-md border px-3 py-2"
                placeholder="cliente@exemplo.com"
                value={customer.email}
                onChange={(event) => handleCustomerChange('email', event.target.value)}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">Telefone</label>
              <input
                className="rounded-md border px-3 py-2"
                placeholder="11999999999"
                value={customer.mobilePhone}
                onChange={(event) => handleCustomerChange('mobilePhone', onlyDigits(event.target.value))}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">CEP</label>
              <input
                className="rounded-md border px-3 py-2"
                placeholder="01310930"
                value={customer.zipCode}
                onChange={(event) => handleCustomerChange('zipCode', onlyDigits(event.target.value))}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium">Endereço</label>
              <input
                className="rounded-md border px-3 py-2"
                placeholder="Av. Paulista, 1000"
                value={customer.address}
                onChange={(event) => handleCustomerChange('address', event.target.value)}
              />
            </div>

            <div className="grid gap-1 md:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-sm font-medium">Cidade</label>
                <input
                  className="rounded-md border px-3 py-2"
                  placeholder="São Paulo"
                  value={customer.city}
                  onChange={(event) => handleCustomerChange('city', event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-medium">Estado</label>
                <input
                  className="rounded-md border px-3 py-2"
                  placeholder="SP"
                  value={customer.state}
                  onChange={(event) => handleCustomerChange('state', event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">2. Escolha a forma de pagamento</h2>
          <PaymentMethodSelector value={method} onChange={setMethod} pixAvailable={pixAvailable} />

          <div className="space-y-3">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Valor da cobrança</label>
              <input
                className="rounded-md border px-3 py-2"
                placeholder="49.90"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span className="text-xs text-zinc-500">Será enviado ao Asaas como {formatCurrency(parseCurrencyInput(amount))}.</span>
            </div>

            {(method === 'BOLETO' || method === 'PIX') && (
              <div className="grid gap-1">
                <label className="text-sm font-medium">Data de vencimento</label>
                <input
                  type="date"
                  className="rounded-md border px-3 py-2"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            )}

            {method === 'CREDIT_CARD' && (
              <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
                <h3 className="text-sm font-semibold">Dados do cartão</h3>
                <div className="grid gap-1">
                  <label className="text-sm">Nome impresso</label>
                  <input
                    className="rounded-md border px-3 py-2"
                    value={card.holderName}
                    onChange={(event) => handleCardChange('holderName', event.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm">Número</label>
                  <input
                    className="rounded-md border px-3 py-2"
                    value={card.number}
                    onChange={(event) => handleCardChange('number', event.target.value)}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="grid gap-1">
                    <label className="text-sm">Mês</label>
                    <input
                      className="rounded-md border px-3 py-2"
                      placeholder="09"
                      value={card.expiryMonth}
                      onChange={(event) => handleCardChange('expiryMonth', event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm">Ano</label>
                    <input
                      className="rounded-md border px-3 py-2"
                      placeholder="2026"
                      value={card.expiryYear}
                      onChange={(event) => handleCardChange('expiryYear', event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm">CVV</label>
                    <input
                      className="rounded-md border px-3 py-2"
                      placeholder="123"
                      value={card.ccv}
                      onChange={(event) => handleCardChange('ccv', event.target.value)}
                    />
                  </div>
                </div>

                <h3 className="pt-2 text-sm font-semibold">Titular do cartão</h3>
                <div className="grid gap-1">
                  <label className="text-sm">Nome</label>
                  <input
                    className="rounded-md border px-3 py-2"
                    value={cardHolder.name}
                    onChange={(event) => handleCardHolderChange('name', event.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm">E-mail</label>
                  <input
                    className="rounded-md border px-3 py-2"
                    value={cardHolder.email}
                    onChange={(event) => handleCardHolderChange('email', event.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm">CPF</label>
                  <input
                    className="rounded-md border px-3 py-2"
                    value={cardHolder.cpfCnpj}
                    onChange={(event) => handleCardHolderChange('cpfCnpj', onlyDigits(event.target.value))}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="grid gap-1">
                    <label className="text-sm">CEP</label>
                    <input
                      className="rounded-md border px-3 py-2"
                      value={cardHolder.postalCode}
                      onChange={(event) => handleCardHolderChange('postalCode', onlyDigits(event.target.value))}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm">Número</label>
                    <input
                      className="rounded-md border px-3 py-2"
                      value={cardHolder.addressNumber}
                      onChange={(event) => handleCardHolderChange('addressNumber', event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm">Telefone</label>
                    <input
                      className="rounded-md border px-3 py-2"
                      value={cardHolder.phone}
                      onChange={(event) => handleCardHolderChange('phone', onlyDigits(event.target.value))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
            >
              {loading ? 'Processando...' : 'Gerar cobrança'}
            </button>
            <button
              type="button"
              onClick={resetState}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
            >
              Limpar resultado
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {infoMessage && <p className="text-sm text-blue-600">{infoMessage}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">3. Acompanhar cobrança</h2>
            <p className="text-xs text-zinc-500">Status atual: {statusBadge}</p>
            {successStatusLabel && <p className="text-xs text-green-600">{successStatusLabel}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={!payment || checking}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-60"
            >
              {checking ? 'Consultando...' : 'Verificar status'}
            </button>
            <button
              type="button"
              onClick={polling ? stopPolling : startPolling}
              disabled={!payment}
              className="rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-60"
            >
              {polling ? 'Parar polling' : 'Iniciar polling'}
            </button>
            <button
              type="button"
              onClick={handleFinalize}
              disabled={!payment || finalizing || !SUCCESS_STATUSES.has(status as (typeof PAYMENT_SUCCESS_STATUSES)[number])}
              className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-60"
            >
              {finalizing ? 'Finalizando...' : 'Finalizar manualmente'}
            </button>
          </div>
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
            <p>
              Cliente: <span className="font-mono text-sm">{payment.customerId}</span>
            </p>
            <p>Status: {status}</p>
            {attempts > 0 && <p>Polling tentativas: {attempts}</p>}
            {statusAttempts > 0 && <p>Consultas manuais: {statusAttempts}</p>}
          </div>
        )}

        {rawLog && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowLog((prev) => !prev)}
              className="text-sm text-blue-600 underline"
            >
              {showLog ? 'Ocultar log bruto' : 'Exibir log bruto'}
            </button>
            {showLog && (
              <pre className="max-h-72 overflow-auto rounded-md border bg-zinc-950/90 p-3 text-xs text-zinc-100">
                {JSON.stringify(rawLog, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>

      {!pixAvailable && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          PIX ainda não está habilitado para esta conta sandbox. Utilize boleto, cartão ou checkout Asaas até a liberação.
        </section>
      )}

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Como testar</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-zinc-600">
          <li>
            Preencha os dados do cliente e selecione o método de pagamento desejado. Informe um valor (ex.: 49.90).
          </li>
          <li>
            Clique em <strong>Gerar cobrança</strong>. Abra a fatura (invoiceUrl) ou use o QR Code PIX conforme o método escolhido.
          </li>
          <li>
            Após concluir o pagamento no ambiente sandbox, use <strong>Verificar status</strong> ou ative o <strong>Polling</strong>.
          </li>
          <li>
            Quando o status estiver como RECEIVED/CONFIRMED, toque em <strong>Finalizar manualmente</strong> para garantir o beneficiário na Rapidoc.
          </li>
          <li>
            Se o PIX ainda não estiver habilitado, utilize boleto, cartão ou checkout Asaas; o alerta acima ficará visível até a aprovação.
          </li>
        </ol>
      </section>
    </div>
  );
}
