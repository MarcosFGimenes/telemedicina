'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth as getAuth } from '@/lib/firebaseClient';
import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword, type User } from 'firebase/auth';
import { ADMIN_ROLE } from '@/constants/roles';

function readError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-email':
        return 'E-mail inválido. Verifique e tente novamente.';
      case 'auth/user-disabled':
        return 'Seu acesso está temporariamente desativado. Procure o suporte para regularizar.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'E-mail ou senha incorretos.';
      case 'auth/too-many-requests':
        return 'Bloqueamos temporariamente as tentativas. Aguarde alguns instantes e tente de novo.';
      default:
        break;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Não foi possível realizar o acesso. Tente novamente.';
}

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get('next') || '/assinante/dashboard';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const auth = getAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const token = await credential.user.getIdToken().catch(() => null);

      if (token) {
        try {
          await fetch('/api/auth/link', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (linkError) {
          console.warn('[login][link]', linkError);
        }
      }

      await linkBeneficiaryIfPresent(token);
      const destination = await resolvePostLoginRedirect(credential.user, token, nextUrl);
      router.replace(destination);
    } catch (err) {
      console.error('[login][password]', err);
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-emerald-700">Acesse sua conta</h1>
        <p className="text-sm text-zinc-600">Utilize o e-mail e a senha cadastrados para entrar.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 border-emerald-100 p-6">
        <div>
          <label className="label">E-mail</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="label">Senha</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite sua senha"
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm text-zinc-600">
        {error && <p className="text-red-600">{error}</p>}
        <p>
          Primeiro acesso?{' '}
          <Link href="/primeiro-acesso" className="font-semibold text-emerald-700 hover:underline">
            Cadastre-se com seu CPF
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

async function linkBeneficiaryIfPresent(token: string | null) {
  if (!token) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const uuid = params.get('uuid') || params.get('beneficiaryUuid') || '';
    if (!uuid) return;
    await fetch('/api/me/beneficiary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uuid }),
    });
  } catch (err) {
    console.warn('[login][beneficiary]', err);
  }
}

async function resolvePostLoginRedirect(user: User, token: string | null, requested: string) {
  const subscriberDashboard = '/assinante/dashboard';
  const adminDashboard = '/admin/dashboard';
  const requestedPath = typeof requested === 'string' && requested.trim().length > 0 ? requested : subscriberDashboard;

  try {
    const result = await user.getIdTokenResult().catch(() => null);
    const claims = (result?.claims ?? null) as Record<string, unknown> | null;
    const claimRole =
      (claims && typeof claims.role === 'string' && claims.role) ||
      (claims && typeof claims['custom:role'] === 'string' && (claims['custom:role'] as string)) ||
      '';
    if (claimRole === ADMIN_ROLE) {
      return requestedPath.startsWith('/admin') ? requestedPath : adminDashboard;
    }
  } catch (error) {
    console.warn('[login][redirect][claims]', error);
  }

  if (token) {
    try {
      const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        const docRole = typeof data?.user?.role === 'string' ? data.user.role : '';
        if (docRole === ADMIN_ROLE) {
          return requestedPath.startsWith('/admin') ? requestedPath : adminDashboard;
        }
      }
    } catch (error) {
      console.warn('[login][redirect][profile]', error);
    }
  }

  return subscriberDashboard;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-zinc-500">Carregando formulário…</div>}>
      <LoginContent />
    </Suspense>
  );
}
