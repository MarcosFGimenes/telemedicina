'use client';
import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthContext } from './AuthProvider';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthContext();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const params = new URLSearchParams();
      if (path) params.set('next', path);
      router.replace(`/login?${params.toString()}`);
    }
  }, [loading, user, router, path]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-600">Carregando sessão…</div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

