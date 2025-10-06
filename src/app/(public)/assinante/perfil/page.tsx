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
    <div className="space-y-4">
      <h2 className="section-title text-emerald-700">Meu Perfil</h2>

      <div className="grid gap-3 sm:grid-cols-2">
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
          <div key={key} className="card p-3">
            <label className="label">{label}</label>
            <input
              className="input"
              value={String(doc[key] || '')}
              onChange={(e) => setDoc((s) => ({ ...s, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className="card p-3 text-sm">
        <p>
          CPF: <span className="font-mono">{doc.cpf || '—'}</span>
        </p>
        <p>
          Beneficiário UUID: <span className="font-mono">{doc.beneficiaryUuid || '—'}</span>
        </p>
        <p>
          E-mail do login: <span className="font-mono">{user?.email || '—'}</span>
        </p>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}

      <button onClick={update} disabled={loading} className="btn-primary disabled:opacity-60">
        {loading ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  );
}
