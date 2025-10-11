'use client';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthContext } from './AuthProvider';

type AuthGuardProps = {
  children: ReactNode;
  requireAdmin?: boolean;
};

export default function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { user, loading, token } = useAuthContext();
  const router = useRouter();
  const path = usePathname();
  const [adminState, setAdminState] = useState<'idle' | 'checking' | 'allowed' | 'denied'>(
    requireAdmin ? 'checking' : 'allowed',
  );

  useEffect(() => {
    if (!loading && !user) {
      const params = new URLSearchParams();
      if (path) params.set('next', path);
      router.replace(`/login?${params.toString()}`);
    }
  }, [loading, user, router, path]);

  useEffect(() => {
    if (!requireAdmin) {
      setAdminState('allowed');
      return;
    }

    if (loading || !user) {
      setAdminState('checking');
      return;
    }

    if (!token) {
      setAdminState('denied');
      return;
    }

    let cancelled = false;
    const verifyAdmin = async () => {
      setAdminState('checking');
      try {
        const response = await fetch('/api/admin/access', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('forbidden');
        }
        if (!cancelled) {
          setAdminState('allowed');
        }
      } catch (error) {
        console.error('[auth][guard][admin-check]', error);
        if (!cancelled) {
          setAdminState('denied');
        }
      }
    };

    void verifyAdmin();

    return () => {
      cancelled = true;
    };
  }, [requireAdmin, loading, user, token]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-600">Carregando sessão…</div>
    );
  }

  if (!user) return null;

  if (requireAdmin) {
    if (adminState === 'checking') {
      return (
        <div className="py-12 text-center text-sm text-zinc-600">Validando permissões…</div>
      );
    }

    if (adminState === 'denied') {
      return (
        <div className="space-y-4 rounded-3xl border border-red-100 bg-red-50/80 p-8 text-center">
          <p className="text-base font-semibold text-red-700">Acesso restrito</p>
          <p className="text-sm text-red-600">
            Você precisa de um perfil administrativo para acessar esta área. Entre em contato com a equipe
            responsável para solicitar a liberação.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Voltar para a página inicial
          </button>
        </div>
      );
    }
  }

  return <>{children}</>;
}

