'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type MetricSnapshot = {
  totalBeneficiaries: number;
  inactiveBeneficiaries: number;
  appointments: number;
  referrals: number;
  lastSync?: string;
};

const parseArray = (payload: any): any[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.beneficiaries)) return payload.beneficiaries;
  return [];
};

const computeInactive = (rows: any[]): number => {
  return rows.filter((row) => {
    const status = String(row?.status ?? '').toUpperCase();
    if (status.includes('INATIV') || status.includes('INACTIVE') || status.includes('CANCEL')) {
      return true;
    }
    if (typeof row?.active === 'boolean') {
      return !row.active;
    }
    return false;
  }).length;
};

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<MetricSnapshot>({
    totalBeneficiaries: 0,
    inactiveBeneficiaries: 0,
    appointments: 0,
    referrals: 0,
    lastSync: undefined,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError('');
      const [benefRes, apptRes, referralRes] = await Promise.all([
        fetch('/api/rapidoc/beneficiaries'),
        fetch('/api/rapidoc/agendamentos'),
        fetch('/api/rapidoc/encaminhamentos'),
      ]);

      const beneficiaries = benefRes.ok ? parseArray(await benefRes.json()) : [];
      const appointments = apptRes.ok ? parseArray(await apptRes.json()) : [];
      const referrals = referralRes.ok ? parseArray(await referralRes.json()) : [];

      setMetrics({
        totalBeneficiaries: beneficiaries.length,
        inactiveBeneficiaries: computeInactive(beneficiaries),
        appointments: appointments.length,
        referrals: referrals.length,
        lastSync: new Date().toISOString(),
      });
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
  }, []);

  const activeBeneficiaries = metrics.totalBeneficiaries - metrics.inactiveBeneficiaries;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Visão geral operacional</h2>
            <p className="text-sm text-zinc-600">
              Acompanhe em tempo real o status dos beneficiários, consultas e encaminhamentos conectados à Rapidoc.
            </p>
          </div>
          <button
            type="button"
            onClick={loadMetrics}
            className="inline-flex items-center justify-center rounded-full border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            Atualizar dados
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Beneficiários ativos</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">{Math.max(activeBeneficiaries, 0)}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Beneficiários inativos</p>
            <p className="mt-2 text-3xl font-semibold text-amber-600">{metrics.inactiveBeneficiaries}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Agendamentos registrados</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">{metrics.appointments}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Encaminhamentos</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">{metrics.referrals}</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          {loading
            ? 'Consultando Rapidoc…'
            : `Última sincronização: ${metrics.lastSync ? new Date(metrics.lastSync).toLocaleString('pt-BR') : '—'}`}
        </p>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Ações rápidas</h2>
        <p className="mt-1 text-sm text-zinc-600">Fluxos prioritários para atendimento e suporte do assinante.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/beneficiarios" className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm transition hover:border-emerald-200 hover:bg-emerald-50/80">
            <span className="block text-lg font-semibold text-emerald-700">Beneficiários</span>
            <span className="text-xs text-zinc-500">Buscar por CPF, ativar ou inativar planos.</span>
          </Link>
          <Link href="/admin/agendamentos" className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm transition hover:border-emerald-200 hover:bg-emerald-50/80">
            <span className="block text-lg font-semibold text-emerald-700">Agendamentos</span>
            <span className="text-xs text-zinc-500">Audite horários aprovados e disponibilidade.</span>
          </Link>
          <Link href="/admin/financeiro" className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm transition hover:border-emerald-200 hover:bg-emerald-50/80">
            <span className="block text-lg font-semibold text-emerald-700">Financeiro Asaas</span>
            <span className="text-xs text-zinc-500">Validar pagamentos antes da liberação de acesso.</span>
          </Link>
          <Link href="/admin/planos" className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm transition hover:border-emerald-300">
            <span className="block text-lg font-semibold text-emerald-700">Planos e assinaturas</span>
            <span className="text-xs text-emerald-600">Gerencie valores e copie links individuais de assinatura.</span>
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Checklist de monitoramento</h2>
        <ol className="mt-3 space-y-2 text-sm text-zinc-600">
          <li>1. Confirmar pagamentos recentes via Asaas antes de liberar novos acessos.</li>
          <li>2. Revisar beneficiários inativos e acionar comunicação automatizada.</li>
          <li>3. Verificar agendamentos com status pendente na Rapidoc e aprovar quando necessário.</li>
          <li>4. Auditar encaminhamentos para garantir atendimento contínuo.</li>
        </ol>
      </section>
    </div>
  );
}
