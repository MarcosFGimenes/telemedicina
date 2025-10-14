'use client';

import { useAuthContext } from '@/components/auth/AuthProvider';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Payment = {
  id: string;
  status?: string;
  processedAt?: string;
  value?: number;
  invoiceUrl?: string | null;
  dueDate?: string;
  paymentDate?: string | null;
  billingType?: string;
  source?: string;
};

const formatCurrency = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const normalizeStatus = (value?: string) => String(value || 'PENDING').toUpperCase();

const statusLabel = (billingType?: string | null) => {
  switch ((billingType || '').toUpperCase()) {
    case 'PIX':
      return 'Pix';
    case 'BOLETO':
      return 'Boleto bancário';
    case 'CREDIT_CARD':
      return 'Cartão de crédito';
    default:
      return 'não informado';
  }
};

const statusStyles: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  RECEIVED: 'bg-emerald-50 text-emerald-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  OVERDUE: 'bg-rose-50 text-rose-700',
  REFUNDED: 'bg-sky-50 text-sky-700',
  CANCELLED: 'bg-zinc-100 text-zinc-600',
};

export default function FaturasPage() {
  const { token } = useAuthContext();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const loadPayments = useCallback(async () => {
    if (!token) return;
    try {
      setErr('');
      setLoading(true);
      const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Falha ao carregar faturas');
      const data = await res.json();
      const mapped: Payment[] = Array.isArray(data?.payments)
        ? data.payments.map((payment: Payment) => ({
            ...payment,
            status: normalizeStatus(payment.status),
          }))
        : [];
      const sorted = [...mapped].sort((a, b) => {
        const aDate = new Date(a.processedAt || a.dueDate || '').getTime();
        const bDate = new Date(b.processedAt || b.dueDate || '').getTime();
        if (Number.isNaN(aDate) && Number.isNaN(bDate)) return 0;
        if (Number.isNaN(aDate)) return 1;
        if (Number.isNaN(bDate)) return -1;
        return bDate - aDate;
      });
      setPayments(sorted);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar faturas');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const { paid, pending } = useMemo(() => {
    const paidStatuses = new Set(['CONFIRMED', 'RECEIVED']);
    const paidList = payments.filter((p) => paidStatuses.has(normalizeStatus(p.status)));
    const pendingList = payments.filter((p) => !paidStatuses.has(normalizeStatus(p.status)));
    return { paid: paidList, pending: pendingList };
  }, [payments]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Resumo financeiro</h2>
            <p className="text-sm text-zinc-600">
              Integração automática com o Asaas para emissão e confirmação de faturas.
            </p>
          </div>
          <Link
            href="/admin/financeiro"
            className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
          >
            Abrir painel financeiro admin
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Forma de pagamento</p>
              <p className="mt-2 text-sm font-semibold text-zinc-900">{statusLabel(data.me?.user?.paymentType)}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPaymentDialog(true)}
              disabled={!hasPaidInvoices || hasPendingInvoices}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
            >
              Alterar forma de pagamento
            </button>
            {!hasPaidInvoices || hasPendingInvoices ? (
              <p className="text-[11px] text-amber-600">Não é possível alterar enquanto houver cobranças pendentes ou nenhuma cobrança paga registrada.</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Faturas emitidas</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">{payments.length}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Pagas</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">{paid.length}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Pendentes</p>
            <p className="mt-2 text-3xl font-semibold text-amber-600">{pending.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Última atualização</p>
            <p className="mt-2 text-sm text-emerald-700">
              {loading ? 'Sincronizando…' : formatDateTime(payments[0]?.processedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Histórico de faturas</h2>
            <p className="text-sm text-zinc-600">
              Clique no identificador para abrir a fatura diretamente no ambiente Asaas.
            </p>
          </div>
        </div>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
        {loading && <p className="mt-4 text-sm text-zinc-500">Sincronizando dados…</p>}
        {!loading && !payments.length && !err && (
          <p className="mt-4 text-sm text-zinc-500">Nenhuma fatura localizada até o momento.</p>
        )}

        {!!payments.length && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/60">
            <table className="min-w-full divide-y divide-emerald-100 text-sm">
              <thead className="bg-emerald-50/80 text-emerald-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Valor</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Vencimento</th>
                  <th className="px-3 py-2 text-left font-semibold">Pagamento</th>
                  <th className="px-3 py-2 text-left font-semibold">Fonte</th>
                  <th className="px-3 py-2 text-left font-semibold">Fatura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50 bg-white/80">
                {payments.map((p) => {
                  const status = normalizeStatus(p.status);
                  const statusClass = statusStyles[status] || 'bg-zinc-100 text-zinc-600';
                  return (
                    <tr key={p.id} className="text-xs text-zinc-600">
                      <td className="px-3 py-2 font-mono text-[11px] text-emerald-700">
                        {p.invoiceUrl ? (
                          <a
                            href={p.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            {p.id}
                          </a>
                        ) : (
                          p.id
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-zinc-700">{formatCurrency(p.value)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{formatDate(p.dueDate)}</td>
                      <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2 capitalize">{p.source === 'asaas' ? 'Asaas' : 'Registro interno'}</td>
                      <td className="px-3 py-2 text-emerald-700">
                        {p.invoiceUrl ? (
                          <a
                            href={p.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            Abrir fatura
                          </a>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PaymentMethodDialog
        open={showPaymentDialog}
        onClose={() => setShowPaymentDialog(false)}
        token={token}
        mode="self"
        onSuccess={() => {
          setShowPaymentDialog(false);
          void loadPayments();
        }}
      />
    </div>
  );
}
