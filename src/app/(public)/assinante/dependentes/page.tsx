'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { normalizeBrazilianDate } from '@/utils/datetime';
import { onlyDigits } from '@/utils/format';
import { translateStatus } from '@/utils/status';

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

type Dependent = {
  id?: string;
  uuid: string;
  name?: string;
  status?: string;
};

export default function AssinanteDependentesPage() {
  const { token } = useAuthContext();
  const [form, setForm] = useState<BeneficiaryForm>({
    name: '',
    cpf: '',
    birthday: '',
    phone: '',
    email: '',
    zipCode: '',
    address: '',
    city: '',
    state: '',
  });
  const [resp, setResp] = useState<unknown>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const [meRes, depRes] = await Promise.all([
          axios.get('/api/me', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const rawLimit = meRes?.data?.user?.maxDependents;
        const parsed = Number(rawLimit);
        setLimit(Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null);
        const items = Array.isArray(depRes?.data?.dependents) ? depRes.data.dependents : [];
        setDependents(items.filter((d: any) => d?.uuid).map((d: any) => ({ uuid: String(d.uuid), name: d?.name, status: d?.status })));
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
      setErr('');
      setResp(null);

      const payload = [
        {
          ...form,
          cpf: onlyDigits(form.cpf),
          birthday: normalizeBrazilianDate(form.birthday) ?? form.birthday,
        },
      ];
      const { data } = await axios.post('/api/rapidoc/beneficiaries', payload);
      setResp(data);

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
            { uuid, name: form.name, cpf: onlyDigits(form.cpf) },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const li = await axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } });
          const items = Array.isArray(li?.data?.dependents) ? li.data.dependents : [];
          setDependents(items.filter((d: any) => d?.uuid).map((d: any) => ({ uuid: String(d.uuid), name: d?.name, status: d?.status })));
        }
      } catch {}
    } catch (e: any) {
      setErr(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.message ||
          'Erro ao criar beneficiário',
      );
    } finally {
      setLoading(false);
    }
  };

  const reachedLimit = limit != null && dependents.length >= limit;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Dependentes vinculados</h2>
            <p className="text-sm text-zinc-600">Cadastre novos beneficiários e acompanhe o limite disponível.</p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-1 text-xs font-semibold text-emerald-700">
            {dependents.length} cadastrados{limit != null ? ` / ${limit}` : ' / ilimitado'}
          </div>
        </div>

        {!!dependents.length && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dependents.map((dependent) => (
              <li key={dependent.uuid} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
                <p className="text-base font-semibold text-emerald-700">{dependent.name || 'Dependente sem nome'}</p>
                <p className="mt-1 font-mono text-[11px] text-zinc-400">{dependent.uuid}</p>
                <p className="mt-2 text-xs tracking-wide text-emerald-600">
                  {translateStatus(dependent.status ?? 'ACTIVE')}
                </p>
              </li>
            ))}
          </ul>
        )}
        {!dependents.length && (
          <p className="mt-4 text-sm text-zinc-500">
            Nenhum dependente cadastrado. Utilize o formulário abaixo para adicionar familiares ao seu plano.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Cadastrar novo dependente</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Os dados abaixo são enviados diretamente para a Rapidoc e vinculados ao seu contrato após confirmação.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['name', 'Nome completo'],
              ['cpf', 'CPF (somente números)'],
              ['birthday', 'Data de nascimento (aaaa-mm-dd)'],
              ['phone', 'Telefone'],
              ['email', 'E-mail'],
              ['zipCode', 'CEP'],
              ['address', 'Endereço'],
              ['city', 'Cidade'],
              ['state', 'UF'],
            ] as [keyof BeneficiaryForm, string][]
          ).map(([key, label]) => (
            <div key={key} className="space-y-2 rounded-2xl border border-white/70 bg-white/80 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{label}</label>
              <input
                className="input"
                value={form[key]}
                onChange={(event) => onChange(key, event.target.value)}
                placeholder={label}
              />
            </div>
          ))}
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{String(err)}</p>}
        {resp && (
          <details className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-xs text-zinc-600">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-700">Resposta da Rapidoc</summary>
            <pre className="mt-3 whitespace-pre-wrap break-all text-[11px] leading-relaxed">{JSON.stringify(resp, null, 2)}</pre>
          </details>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={submit}
            disabled={loading || reachedLimit}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Enviando…' : 'Criar beneficiário'}
          </button>
          {reachedLimit && (
            <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
              Limite de dependentes atingido
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
