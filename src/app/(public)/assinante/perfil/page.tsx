'use client';

import { useAuthContext } from '@/components/auth/AuthProvider';
import { useEffect, useState } from 'react';

type UserDoc = {
  name?: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  cpf?: string;
  beneficiaryUuid?: string;
};

export default function PerfilPage() {
  const { token, user } = useAuthContext();
  const [doc, setDoc] = useState<UserDoc>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setDoc({ ...(data?.user || {}) });
      } catch {}
    };
    load();
  }, [token]);

  const update = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setErr('');
      setOk('');
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: doc.name,
          email: doc.email,
          phone: doc.phone,
          zipCode: doc.zipCode,
          address: doc.address,
          city: doc.city,
          state: doc.state,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Falha ao salvar');
      setOk('Dados salvos com sucesso.');
    } catch (e: any) {
      setErr(e?.message || 'Falha ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Dados pessoais</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Atualize suas informações de contato para receber notificações e confirmações de agendamento sem atrasos.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['name', 'Nome'],
              ['email', 'E-mail'],
              ['phone', 'Telefone'],
              ['zipCode', 'CEP'],
              ['address', 'Endereço'],
              ['city', 'Cidade'],
              ['state', 'UF'],
            ] as [keyof UserDoc, string][]
          ).map(([key, label]) => (
            <div key={key} className="space-y-2 rounded-2xl border border-white/70 bg-white/80 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{label}</label>
              <input
                className="input"
                value={String(doc[key] || '')}
                onChange={(e) => setDoc((s) => ({ ...s, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Informações do plano</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">CPF</p>
            <p className="mt-1 font-mono text-sm text-zinc-700">{doc.cpf || '—'}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Beneficiário Rapidoc</p>
            <p className="mt-1 font-mono text-sm text-zinc-700">{doc.beneficiaryUuid || '—'}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">E-mail do login</p>
            <p className="mt-1 font-mono text-sm text-zinc-700">{user?.email || '—'}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Alterações no CPF ou no beneficiário devem ser solicitadas à equipe administrativa pela central Rapidoc.
        </p>
      </section>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}

      <button onClick={update} disabled={loading} className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60">
        {loading ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  );
}
