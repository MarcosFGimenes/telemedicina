'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { auth as getAuth } from '@/lib/firebaseClient';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    setErr('');
  }, [email, password]);

  const nextUrl = params.get('next') || '/assinante/dashboard';

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await signInWithEmailAndPassword(getAuth(), email, password);
      await linkBeneficiaryIfPresent();
      router.replace(nextUrl);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao entrar');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async () => {
    setLoading(true);
    setErr('');
    try {
      await createUserWithEmailAndPassword(getAuth(), email, password);
      await linkBeneficiaryIfPresent();
      router.replace(nextUrl);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao registrar');
    } finally {
      setLoading(false);
    }
  };

  async function linkBeneficiaryIfPresent() {
    try {
      const uuid = params.get('uuid') || params.get('beneficiaryUuid') || '';
      if (!uuid) return;
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) return;
      await fetch('/api/me/beneficiary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uuid }),
      });
    } catch {}
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-semibold text-emerald-700">Bem-vindo(a)</h1>
        <p className="muted">Acesse seu painel do assinante</p>
      </div>

      <form onSubmit={onSubmit} className="card p-5 space-y-4 border-emerald-100">
        <div>
          <label className="label">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="voce@exemplo.com"
            required
          />
        </div>
        <div>
          <label className="label">Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
          <button type="button" onClick={onRegister} disabled={loading} className="btn-outline disabled:opacity-60">
            Registrar
          </button>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-zinc-500">Carregando formulário…</div>}>
      <LoginContent />
    </Suspense>
  );
}
