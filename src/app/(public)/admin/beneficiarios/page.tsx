'use client';

import axios from 'axios';
import { useMemo, useState } from 'react';
import PayloadPreview from '@/components/ui/PayloadPreview';

type BeneficiaryData = {
  uuid?: string;
  id?: string;
  beneficiaryUuid?: string;
  status?: string;
  [key: string]: unknown;
};

type ActionResult = BeneficiaryData | BeneficiaryData[] | null;

const extractBeneficiaryId = (payload: any): string | undefined => {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return payload.uuid || payload.id || payload.beneficiaryUuid;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const id = extractBeneficiaryId(item);
      if (id) {
        return id;
      }
    }
  }

  return undefined;
};

export default function AdminBeneficiariosPage() {
  const [cpf, setCpf] = useState('');
  const [data, setData] = useState<ActionResult>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const firstResult = useMemo<BeneficiaryData | null>(() => {
    if (!data) return null;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === 'object') {
          return item as BeneficiaryData;
        }
      }
    }
    if (typeof data === 'object') {
      return data as BeneficiaryData;
    }
    return null;
  }, [data]);

  const statusLabel = useMemo(() => {
    if (!firstResult) return '';
    const status = firstResult.status || (firstResult as Record<string, unknown>)?.['situation'];
    return status ? String(status).toUpperCase() : '';
  }, [firstResult]);

  const nameLabel = useMemo(() => {
    if (!firstResult) return '';
    const direct = (firstResult as Record<string, unknown>)?.['name'];
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return direct;
    }
    const nested = (firstResult as Record<string, unknown>)?.['beneficiary'];
    if (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>)['name'] === 'string') {
      return String((nested as Record<string, unknown>)['name']);
    }
    return '';
  }, [firstResult]);

  const buscar = async () => {
    if (!cpf) {
      setErr('Informe um CPF para consulta.');
      return;
    }

    setErr('');
    setData(null);
    setBeneficiaryId('');
    setLoading(true);

    try {
      const { data: response } = await axios.get(`/api/rapidoc/beneficiaries/cpf/${cpf}`);
      setData(response);

      const id = extractBeneficiaryId(response);
      if (id) {
        setBeneficiaryId(String(id));
      }
    } catch (e: any) {
      setErr(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.message ||
          'Erro ao buscar CPF',
      );
    } finally {
      setLoading(false);
    }
  };

  const inativar = async () => {
    if (!beneficiaryId) {
      setErr('Selecione um beneficiário para inativar.');
      return;
    }

    setErr('');

    try {
      await axios.delete(`/api/rapidoc/beneficiaries/${beneficiaryId}/inactive`);
      alert('Beneficiário inativado com sucesso');
      await buscar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Erro ao inativar');
    }
  };

  const reativar = async () => {
    if (!beneficiaryId) {
      setErr('Selecione um beneficiário para reativar.');
      return;
    }

    setErr('');

    try {
      await axios.put(`/api/rapidoc/beneficiaries/${beneficiaryId}/reactivate`, {});
      alert('Beneficiário reativado com sucesso');
      await buscar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Erro ao reativar');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Consulta de beneficiários</h2>
        <p className="mt-1 text-sm text-zinc-600">Busque titulares por CPF, visualize payloads e altere status rapidamente.</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">CPF</label>
            <input
              className="input"
              value={cpf}
              onChange={(event) => setCpf(event.target.value)}
              placeholder="Somente números"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={buscar}
              disabled={loading}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCpf('');
                setData(null);
                setBeneficiaryId('');
                setErr('');
              }}
              className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Limpar
            </button>
          </div>
        </div>

        {beneficiaryId && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-semibold text-emerald-700">
              Beneficiário: {beneficiaryId}
            </span>
            {nameLabel && (
              <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 font-semibold text-emerald-700">
                {nameLabel}
              </span>
            )}
            {statusLabel && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-semibold text-emerald-700">
                Status: {statusLabel}
              </span>
            )}
            <button
              onClick={inativar}
              className="rounded-full border border-red-200 px-3 py-1 font-semibold text-red-600 transition hover:bg-red-50"
            >
              Inativar
            </button>
            <button
              onClick={reativar}
              className="rounded-full border border-emerald-200 px-3 py-1 font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Reativar
            </button>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{String(err)}</p>}
      </section>

      {data && (
        <section className="space-y-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm sm:p-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
            <p className="font-semibold">Resumo do beneficiário</p>
            <p className="mt-1 text-xs text-emerald-700">
              Utilize as ações acima para ativar ou inativar o cadastro diretamente na Rapidoc.
            </p>
          </div>
          <PayloadPreview
            data={data}
            title="Retorno da Rapidoc"
            description="Visualize o payload completo retornado pela API para auditoria."
          />
        </section>
      )}

      {!data && !loading && (
        <section className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-sm text-emerald-700">
          <p>
            Consulte um CPF para visualizar o payload completo, identificar o UUID do beneficiário e executar ações de ativação
            ou suspensão diretamente pela API Rapidoc.
          </p>
        </section>
      )}
    </div>
  );
}
