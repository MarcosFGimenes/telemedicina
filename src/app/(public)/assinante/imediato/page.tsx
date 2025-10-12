'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';
import PayloadPreview from '@/components/ui/PayloadPreview';

type Patient = { uuid: string; label: string };

export default function AtendimentoImediatoPage() {
  const { token } = useAuthContext();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [beneficiaryUuid, setBeneficiaryUuid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const resultMessage = useMemo(() => {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (typeof result === 'object') {
      const record = result as Record<string, unknown>;
      const messageKeys = ['message', 'detail', 'status'];
      for (const key of messageKeys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          return value;
        }
      }
    }
    return '';
  }, [result]);

  useEffect(() => {
    const loadPatients = async () => {
      if (!token) return;
      try {
        setError('');
        const headers = { Authorization: `Bearer ${token}` };
        const [meRes, depRes] = await Promise.all([
          axios.get('/api/me', { headers }),
          axios.get('/api/dependents', { headers }),
        ]);

        const opts: Patient[] = [];
        const me = meRes?.data?.user || {};
        if (me?.beneficiaryUuid) {
          opts.push({ uuid: String(me.beneficiaryUuid), label: me?.name ? `${me.name} (Titular)` : 'Titular' });
        }
        const deps = Array.isArray(depRes?.data?.dependents) ? depRes.data.dependents : [];
        deps.forEach((d: any) => {
          if (d?.uuid) opts.push({ uuid: String(d.uuid), label: d?.name ? String(d.name) : `Dependente ${String(d.uuid).slice(0, 6)}…` });
        });
        setPatients(opts);
        if (opts.length) setBeneficiaryUuid(opts[0].uuid);
      } catch (e: any) {
        setError(e?.message || 'Falha ao carregar beneficiários');
      }
    };
    loadPatients();
  }, [token]);

  const canRequest = useMemo(() => Boolean(beneficiaryUuid), [beneficiaryUuid]);

  const requestImmediate = async () => {
    try {
      setLoading(true);
      setError('');
      setResult(null);
      if (!beneficiaryUuid) {
        setError('Selecione o beneficiário.');
        return;
      }
      const { data } = await axios.get(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/request-appointment`);
      if (data?.url) {
        window.open(String(data.url), '_blank');
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          e?.response?.data?.upstream?.message ||
          e?.message ||
          'Falha ao solicitar atendimento imediato',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Solicitar atendimento imediato</h2>
        <p className="mt-1 text-sm text-zinc-600">
          O atendimento imediato é realizado por um Clínico Geral (generalista) e deve ser aberto em uma nova janela.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Atendimento para</label>
            <select className="select" value={beneficiaryUuid} onChange={(e) => setBeneficiaryUuid(e.target.value)}>
              {!patients.length && <option value="">Nenhum beneficiário encontrado</option>}
              {patients.map((p) => (
                <option key={p.uuid} value={p.uuid}>
                  {p.label}
                </option>
              ))}
            </select>
            {!patients.length && (
              <p className="mt-2 text-xs text-zinc-500">
                Cadastre seu titular ou dependente em <strong>Dependentes</strong> antes de seguir.
              </p>
            )}
          </div>

          <div className="flex items-end">
            <button
              onClick={requestImmediate}
              disabled={!canRequest || loading}
              className="inline-flex items-center justify-center rounded-full border border-emerald-600 px-6 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              {loading ? 'Solicitando…' : 'Atendimento imediato (Clínico Geral)'}
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{String(error)}</p>}
        {resultMessage && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
            {resultMessage}
          </div>
        )}
        {result && (
          <PayloadPreview
            data={result}
            title="Retorno da Rapidoc"
            description="Utilize os detalhes abaixo apenas para auditoria e suporte técnico."
            className="mt-4"
          />
        )}
      </section>
    </div>
  );
}

