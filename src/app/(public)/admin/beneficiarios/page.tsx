'use client';
import axios from 'axios';
import { useState } from 'react';

type BeneficiaryData = {
  uuid?: string;
  id?: string;
  beneficiaryUuid?: string;
  [key: string]: unknown;
};

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
  const [cpf, setCpf] = useState("");
  const [data, setData] = useState<BeneficiaryData | BeneficiaryData[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState("");

  const buscar = async () => {
    if (!cpf) {
      return;
    }

    setErr("");
    setData(null);
    setBeneficiaryId("");
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
          "Erro ao buscar cpf"
      );
    } finally {
      setLoading(false);
    }
  };

  const inativar = async () => {
    if (!beneficiaryId) {
      return;
    }

    setErr("");

    try {
      await axios.delete(`/api/rapidoc/beneficiaries/${beneficiaryId}/inactive`);
      alert('Beneficiario inativado com sucesso');
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao inativar");
    }
  };

  const reativar = async () => {
    if (!beneficiaryId) {
      return;
    }

    setErr("");

    try {
      await axios.put(`/api/rapidoc/beneficiaries/${beneficiaryId}/reactivate`, {});
      alert('Beneficiario reativado com sucesso');
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao reativar");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Admin Beneficiarios</h2>

      <div className="rounded-lg border bg-white p-3">
        <label className="mb-1 block text-sm font-medium">CPF</label>
        <div className="flex gap-2">
          <input
            className="w-full rounded-md border px-3 py-2"
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
            placeholder="Somente numeros"
          />
          <button
            onClick={buscar}
            disabled={loading}
            className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </div>

      {beneficiaryId && (
        <div className="flex items-center gap-2">
          <span className="text-sm">
            beneficiaryId: <b>{beneficiaryId}</b>
          </span>
          <button
            onClick={inativar}
            className="rounded-md bg-red-600 px-3 py-1 text-white"
          >
            Inativar
          </button>
          <button
            onClick={reativar}
            className="rounded-md bg-green-600 px-3 py-1 text-white"
          >
            Reativar
          </button>
        </div>
      )}

      {err && <p className="text-sm text-red-600">{String(err)}</p>}

      {data && (
        <pre className="whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}