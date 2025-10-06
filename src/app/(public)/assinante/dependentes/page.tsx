'use client';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';

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
};

export default function AssinanteDependentesPage() {
  const { token } = useAuthContext();
  const [form, setForm] = useState<BeneficiaryForm>({
    name: "",
    cpf: "",
    birthday: "",
    phone: "",
    email: "",
    zipCode: "",
    address: "",
    city: "",
    state: "",
  });
  const [resp, setResp] = useState<unknown>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [dependents, setDependents] = useState<any[]>([]);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const [meRes, depRes] = await Promise.all([
          axios.get('/api/me', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setLimit(Number(meRes?.data?.user?.maxDependents ?? NaN));
        setDependents(Array.isArray(depRes?.data?.dependents) ? depRes.data.dependents : []);
      } catch {}
    };
    load();
  }, [token]);

  const onChange = (key: keyof BeneficiaryForm, value: string) => {
    setForm((state) => ({ ...state, [key]: value }));
  };

  const submit = async () => {
    try {
      setLoading(true);
      setErr("");
      setResp(null);

      const payload = [form];
      const { data } = await axios.post("/api/rapidoc/beneficiaries", payload);
      setResp(data);

      // tenta extrair uuid e registrar no Firestore
      try {
        const raw = data;
        let uuid: string | undefined;
        const tryGet = (v: any): string | undefined => {
          if (!v) return undefined;
          if (typeof v === 'string') return v;
          return v.uuid || v.id || v.beneficiaryUuid || undefined;
        };
        if (Array.isArray(raw)) {
          uuid = tryGet(raw[0]);
        } else if (raw?.data && Array.isArray(raw.data)) {
          uuid = tryGet(raw.data[0]);
        } else {
          uuid = tryGet(raw);
        }
        if (uuid && token) {
          await axios.post(
            '/api/dependents',
            { uuid, name: form.name, cpf: form.cpf },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          // refresh list
          const li = await axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } });
          setDependents(Array.isArray(li?.data?.dependents) ? li.data.dependents : []);
        }
      } catch {}
    } catch (e: any) {
      setErr(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.message ||
          "Erro ao criar beneficiario"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="section-title text-emerald-700">Dependentes e Beneficiários</h2>
      <div className="card p-3 text-sm">
        <p>
          Dependentes cadastrados: <span className="font-medium">{dependents.length}</span>
          {limit != null && !Number.isNaN(limit) && (
            <>
              {' '}de <span className="font-medium">{limit}</span> permitidos
            </>
          )}
        </p>
        {!!dependents.length && (
          <ul className="mt-2 list-disc pl-5">
            {dependents.map((d) => (
              <li key={d.id} className="text-xs">
                <span className="badge mr-2">{d.name || 'sem nome'}</span>
                <span className="font-mono">{d.uuid}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(form).map(([key, value]) => (
          <div key={key} className="card p-3">
            <label className="label">{key}</label>
            <input
              className="input"
              value={value}
              onChange={(event) => onChange(key as keyof BeneficiaryForm, event.target.value)}
              placeholder={key === "birthday" ? "dd/mm/aaaa" : ""}
            />
          </div>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={loading || (limit != null && !Number.isNaN(limit) && dependents.length >= Number(limit))}
        className="btn-primary disabled:opacity-60"
      >
        {loading ? "Enviando..." : "Criar beneficiario"}
      </button>

      {err && <p className="text-sm text-red-600">{String(err)}</p>}
      {resp && (
        <pre className="whitespace-pre-wrap card p-3 text-xs">
          {JSON.stringify(resp, null, 2)}
        </pre>
      )}
    </div>
  );
}
