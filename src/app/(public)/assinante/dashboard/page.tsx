'use client';

import Link from 'next/link';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { useEffect, useMemo, useState } from 'react';

type Payment = {
  id: string;
  status?: string;
  value?: number;
  dueDate?: string;
  invoiceUrl?: string | null;
  processedAt?: string;
  createdAt?: string;
};

type MeResponse = {
  ok: boolean;
  user?: {
    beneficiaryUuid?: string;
    status?: string;
    planName?: string;
    serviceType?: string;
    paymentType?: string;
    cpf?: string;
  };
  payments?: Payment[];
};

type Dependent = { uuid: string; name?: string; status?: string };

type Snapshot = {
  me: MeResponse | null;
  dependents: Dependent[];
};

type Beneficiary = {
  uuid?: string;
  id?: string;
  status?: string;
  serviceType?: string;
  paymentType?: string;
  specialties?: { uuid?: string; name?: string }[];
};

const formatCurrency = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const parseDateValue = (value?: string) => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const hasTime = /\dT\d|\d:\d/.test(raw);
  const isoLike = hasTime ? raw : `${raw}T00:00:00`;
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDate = (value?: string) => {
  const date = parseDateValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatDateTime = (value?: string) => {
  const date = parseDateValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function AssinanteDashboard() {
  const { token } = useAuthContext();
  const [data, setData] = useState<Snapshot>({ me: null, dependents: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [beneficiaryLoading, setBeneficiaryLoading] = useState(false);
  const [beneficiaryError, setBeneficiaryError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError('');
        const headers = { Authorization: `Bearer ${token}` };
        const [meRes, depRes] = await Promise.all([
          fetch('/api/me', { headers }),
          fetch('/api/dependents', { headers }),
        ]);

        if (!meRes.ok) throw new Error('Não foi possível carregar seus dados.');
        const me = (await meRes.json()) as MeResponse;
        let dependents: Dependent[] = [];
        if (depRes.ok) {
          const depJson = await depRes.json();
          const items = Array.isArray(depJson?.dependents) ? depJson.dependents : [];
          dependents = items
            .filter((item: any) => item?.uuid)
            .map((item: any) => ({ uuid: String(item.uuid), name: item?.name, status: item?.status }));
        }

        setData({ me, dependents });
      } catch (e: any) {
        setError(e?.message || 'Falha ao carregar informações do assinante.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  useEffect(() => {
    const uuid = data.me?.user?.beneficiaryUuid;
    const cpf = data.me?.user?.cpf;
    if (!uuid && !cpf) {
      setBeneficiary(null);
      setBeneficiaryError('');
      return;
    }

    let active = true;
    const load = async () => {
      try {
        setBeneficiaryLoading(true);
        setBeneficiaryError('');
        const url = uuid ? `/api/rapidoc/beneficiaries/${uuid}` : `/api/rapidoc/beneficiaries/cpf/${cpf}`;
        const res = await fetch(url);
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error((json as any)?.message || (json as any)?.error || 'Falha ao consultar plano atual.');
        if (!active) return;
        setBeneficiary((json || null) as Beneficiary | null);
      } catch (err: any) {
        if (!active) return;
        setBeneficiary(null);
        const message = err?.message || 'Não foi possível consultar o plano atual.';
        const normalized = message
          .toString()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase();
        if (normalized.includes('beneficiario nao encontrado')) {
          setBeneficiaryError('');
        } else {
          setBeneficiaryError(message);
        }
      } finally {
        if (active) setBeneficiaryLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [data.me?.user?.beneficiaryUuid, data.me?.user?.cpf]);

  const status = beneficiary?.status
    ? String(beneficiary.status).toUpperCase()
    : data.me?.user?.status
    ? String(data.me.user.status).toUpperCase()
    : 'PENDENTE';
  const beneficiaryUuid = beneficiary?.uuid || beneficiary?.id || data.me?.user?.beneficiaryUuid || '';

  const mapServiceType = (value?: string) => {
    switch ((value || '').toUpperCase()) {
      case 'G':
        return 'Generalista';
      case 'P':
        return 'Psicologia';
      case 'GP':
        return 'Generalista + Psicologia';
      case 'GS':
        return 'Generalista + Especialistas';
      case 'GSP':
        return 'Generalista + Especialistas + Psicologia';
      default:
        return 'Plano não identificado';
    }
  };

  const planName = useMemo(() => {
    if (beneficiary?.serviceType) return mapServiceType(beneficiary.serviceType);
    const raw = data.me?.user?.planName as string | undefined;
    if (raw) return raw;
    const st = data.me?.user?.serviceType;
    if (st) return mapServiceType(st);
    return 'Plano não identificado';
  }, [beneficiary?.serviceType, data.me?.user]);

  const planPaymentType = beneficiary?.paymentType || data.me?.user?.paymentType || '—';

  const planSpecialties = useMemo(() => {
    return (beneficiary?.specialties || [])
      .map((item) => item?.name)
      .filter(Boolean) as string[];
  }, [beneficiary?.specialties]);

  const nextPayment = useMemo<Payment | null>(() => {
    const payments = data.me?.payments ?? [];
    if (!payments.length) return null;

    const withParsed = payments.map((payment) => {
      const due = parseDateValue(payment.dueDate);
      const processed = parseDateValue(payment.processedAt);
      const created = parseDateValue(payment.createdAt);
      const reference = processed || due || created;
      return { payment, due, reference };
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const upcoming = withParsed
      .filter((item) => item.due && item.due.getTime() >= startOfToday.getTime())
      .sort((a, b) => (a.due!.getTime() - b.due!.getTime()));
    if (upcoming[0]) return upcoming[0].payment;

    const sorted = withParsed
      .filter((item) => item.reference)
      .sort((a, b) => b.reference!.getTime() - a.reference!.getTime());
    if (sorted[0]) return sorted[0].payment;

    return payments[0] ?? null;
  }, [data.me?.payments]);

  const dependents = data.dependents;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Status do plano</p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">{planName}</h2>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span>{beneficiaryLoading || loading ? 'Atualizando…' : status}</span>
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            Titular Rapidoc:{' '}
            <span className="font-mono text-xs">{beneficiaryUuid || 'defina seu beneficiário'}</span>
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Forma de pagamento:{' '}
            <span className="font-semibold text-emerald-700">{planPaymentType}</span>
          </p>
          {beneficiaryError ? (
            <p className="mt-2 text-xs text-red-600">{beneficiaryError}</p>
          ) : planSpecialties.length ? (
            <div className="mt-3 space-y-2 text-xs text-zinc-500">
              <p className="font-semibold uppercase tracking-wide text-emerald-600">Especialidades disponíveis</p>
              <div className="flex flex-wrap gap-2">
                {planSpecialties.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">Nenhuma especialidade foi retornada para este beneficiário.</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Próxima fatura</p>
          {nextPayment ? (
            <div className="mt-3 space-y-2 text-sm text-zinc-600">
              <p>
                <span className="font-medium text-zinc-800">{formatCurrency(nextPayment.value)}</span>
                <span className="ml-2 text-xs text-zinc-400">ID {nextPayment.id}</span>
              </p>
              <p>
                Vencimento:{' '}
                <span className="font-medium text-emerald-700">
                  {nextPayment.dueDate
                    ? formatDate(nextPayment.dueDate)
                    : formatDateTime(nextPayment.processedAt || nextPayment.createdAt)}
                </span>
              </p>
              <p className="text-xs uppercase tracking-wide text-emerald-600">
                {String(nextPayment.status || 'PENDENTE').toUpperCase()}
              </p>
              {nextPayment.invoiceUrl && (
                <Link
                  href={nextPayment.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
                >
                  Abrir fatura
                </Link>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Nenhuma cobrança localizada até o momento.</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Dependentes ativos</p>
          <h2 className="mt-3 text-3xl font-semibold text-zinc-900">{dependents.length}</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Acompanhe limites, status e convide novos beneficiários em poucos cliques.
          </p>
          <div className="mt-4 flex gap-2 text-xs font-semibold text-emerald-700">
            <Link href="/assinante/dependentes" className="rounded-full bg-emerald-600 px-3 py-1 text-white shadow hover:bg-emerald-700">
              Gerenciar
            </Link>
            <Link href="/assinante/agendamentos" className="rounded-full border border-emerald-200 px-3 py-1 hover:bg-emerald-50">
              Agendar para dependente
            </Link>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Próximos passos</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Utilize os atalhos abaixo para completar o ciclo digital do plano sem depender do suporte.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/assinante/agendamentos" className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-800 transition hover:border-emerald-200">
            <span className="block font-semibold">Agendar nova consulta</span>
            <span className="text-xs text-emerald-600">Confirme horários disponíveis imediatamente.</span>
          </Link>
          <Link href="/assinante/faturas" className="rounded-2xl border border-white/80 bg-white/80 p-4 text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/70">
            <span className="block font-semibold text-emerald-700">Ver todas as cobranças</span>
            <span className="text-xs text-zinc-500">Acesse comprovantes e histórico completo.</span>
          </Link>
          <Link href="/assinante/dependentes" className="rounded-2xl border border-white/80 bg-white/80 p-4 text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/70">
            <span className="block font-semibold text-emerald-700">Adicionar dependente</span>
            <span className="text-xs text-zinc-500">Convide familiares com vínculo imediato.</span>
          </Link>
          <Link href="/assinante/perfil" className="rounded-2xl border border-white/80 bg-white/80 p-4 text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/70">
            <span className="block font-semibold text-emerald-700">Atualizar dados</span>
            <span className="text-xs text-zinc-500">Garanta contato e notificações corretas.</span>
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Faturas recentes</h2>
            <p className="text-sm text-zinc-500">Integração automática com o Asaas para controle financeiro.</p>
          </div>
          <Link href="/assinante/faturas" className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline">
            Ver todas
          </Link>
        </div>
        {(!data.me?.payments || data.me.payments.length === 0) && (
          <p className="mt-4 text-sm text-zinc-500">Nenhuma cobrança disponível ainda.</p>
        )}
        {!!data.me?.payments?.length && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/60">
            <table className="min-w-full divide-y divide-emerald-100 text-sm">
              <thead className="bg-emerald-50/80 text-emerald-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Valor</th>
                  <th className="px-3 py-2 text-left font-semibold">Atualização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50 bg-white/80">
                {data.me.payments.slice(0, 5).map((payment) => (
                  <tr key={payment.id} className="text-xs text-zinc-600">
                    <td className="px-3 py-2 font-mono text-[11px]">{payment.id}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        {String(payment.status || 'PENDENTE').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatCurrency(payment.value)}</td>
                    <td className="px-3 py-2">{formatDateTime(payment.processedAt || payment.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Dependentes vinculados</h2>
            <p className="text-sm text-zinc-500">Gerencie quem pode utilizar o seu plano e acompanhe o status.</p>
          </div>
          <Link href="/assinante/dependentes" className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline">
            Gerenciar
          </Link>
        </div>
        {!dependents.length && (
          <p className="mt-4 text-sm text-zinc-500">
            Você ainda não possui dependentes cadastrados. Adicione agora mesmo para liberar agendamentos familiares.
          </p>
        )}
        {!!dependents.length && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dependents.map((dependent) => (
              <li key={dependent.uuid} className="rounded-2xl border border-white/70 bg-white/90 p-4 text-sm text-zinc-600 shadow-sm">
                <p className="text-base font-semibold text-emerald-700">{dependent.name || 'Dependente sem nome'}</p>
                <p className="mt-1 font-mono text-[11px] text-zinc-400">{dependent.uuid}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-emerald-600">
                  {String(dependent.status || 'ATIVO').toUpperCase()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Carregando dados atualizados…</p>}
    </div>
  );
}

