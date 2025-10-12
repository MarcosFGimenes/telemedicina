'use client';

import { useEffect, useMemo, useState } from 'react';
import PayloadPreview from '@/components/ui/PayloadPreview';

type Appointment = {
  id?: string;
  uuid?: string;
  status?: string;
  scheduledAt?: string;
  patient?: { name?: string };
  beneficiary?: { name?: string };
  specialty?: { name?: string };
  [key: string]: unknown;
};

const parseArray = (payload: any): Appointment[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as Appointment[];
  if (Array.isArray(payload?.data)) return payload.data as Appointment[];
  if (Array.isArray(payload?.appointments)) return payload.appointments as Appointment[];
  return [];
};

const formatDate = (value?: string) => {
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

export default function AdminAgendamentosPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/rapidoc/agendamentos');
      if (!res.ok) throw new Error('Falha ao carregar agendamentos');
      const json = await res.json();
      setAppointments(parseArray(json));
    } catch (e: any) {
      setError(e?.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!statusFilter) return appointments;
    return appointments.filter((appt) => String(appt.status || '').toUpperCase() === statusFilter.toUpperCase());
  }, [appointments, statusFilter]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((appt) => {
      const status = String(appt.status || '').toUpperCase();
      if (status) set.add(status);
    });
    return Array.from(set.values());
  }, [appointments]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Monitoramento da agenda</h2>
            <p className="text-sm text-zinc-600">Consulta direta à API Rapidoc para auditar status de atendimentos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos os status</option>
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Recarregar
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-3 text-xs text-zinc-500">
          {loading
            ? 'Sincronizando com Rapidoc…'
            : `${filtered.length} agendamentos exibidos de ${appointments.length} totais.`}
        </p>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm sm:p-6">
        {!filtered.length && !loading && (
          <p className="text-sm text-zinc-500">Nenhum agendamento encontrado para o filtro selecionado.</p>
        )}
        {loading && <p className="text-sm text-zinc-500">Carregando…</p>}
        {!!filtered.length && (
          <div className="space-y-3">
            {filtered.map((appt) => {
              const code = appt.uuid || appt.id || '—';
              return (
                <article key={code as string} className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[11px] text-emerald-700">{code}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      {String(appt.status || 'PENDENTE').toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold text-zinc-800">Beneficiário:</span>{' '}
                      {appt.beneficiary?.name || appt.patient?.name || '—'}
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-800">Especialidade:</span>{' '}
                      {appt.specialty?.name || '—'}
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-800">Horário:</span> {formatDate(appt.scheduledAt)}
                    </p>
                  </div>
                  <PayloadPreview
                    data={appt}
                    title="Detalhes técnicos"
                    description="Dados completos retornados pela Rapidoc para auditoria."
                    className="mt-3"
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
