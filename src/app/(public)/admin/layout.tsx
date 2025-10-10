'use client';

import AuthGuard from '@/components/auth/AuthGuard';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { ADMIN_ROLE } from '@/constants/roles';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

type LayoutMeta = {
  title: string;
  description: string;
};

type NavLink = {
  href: string;
  label: string;
  helper: string;
};

const navLinks: NavLink[] = [
  {
    href: '/admin/dashboard',
    label: 'Visão geral',
    helper: 'Métricas globais e status dos serviços',
  },
  {
    href: '/admin/beneficiarios',
    label: 'Beneficiários',
    helper: 'Consulta, ativação e inativação rápida',
  },
  {
    href: '/admin/usuarios',
    label: 'Gerenciar usuários',
    helper: 'Acesso, senhas e vinculação de contas',
  },
  {
    href: '/admin/agendamentos',
    label: 'Agendamentos',
    helper: 'Monitoramento de agenda e disponibilidade',
  },
  {
    href: '/admin/financeiro',
    label: 'Financeiro',
    helper: 'Cobranças Asaas e conciliações',
  },
  {
    href: '/admin/planos',
    label: 'Planos',
    helper: 'Cadastre e atualize planos e valores padrão',
  },
];

const metaByRoute: Record<string, LayoutMeta> = {
  '/admin/dashboard': {
    title: 'Painel administrativo',
    description: 'Visão 360º dos serviços conectados à Rapidoc e ao Asaas.',
  },
  '/admin/beneficiarios': {
    title: 'Gestão de beneficiários',
    description: 'Pesquise titulares, controle status e alinhe cadastros.',
  },
  '/admin/usuarios': {
    title: 'Gerenciar usuários',
    description: 'Controle acessos, redefina senhas e habilite contas rapidamente.',
  },
  '/admin/agendamentos': {
    title: 'Agenda integrada',
    description: 'Auditoria e acompanhamento dos atendimentos em tempo real.',
  },
  '/admin/financeiro': {
    title: 'Monitoramento financeiro',
    description: 'Audite cobranças, confirme pagamentos e libere planos.',
  },
  '/admin/planos': {
    title: 'Gestão de planos',
    description: 'Mantenha os planos Rapidoc com descrições e valores oficiais.',
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token } = useAuthContext();
  const [greeting, setGreeting] = useState('');
  const [checkingRole, setCheckingRole] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Bom dia');
    else if (hour < 18) setGreeting('Boa tarde');
    else setGreeting('Boa noite');
  }, []);

  useEffect(() => {
    let active = true;
    const verifyRole = async () => {
      if (!user) {
        setCheckingRole(true);
        setAuthorized(false);
        return;
      }
      setCheckingRole(true);
      setAuthorized(false);

      try {
        const result = await user.getIdTokenResult().catch(() => null);
        const claims = (result?.claims ?? null) as Record<string, unknown> | null;
        const claimRole =
          (claims && typeof claims.role === 'string' && claims.role) ||
          (claims && typeof claims['custom:role'] === 'string' && (claims['custom:role'] as string)) ||
          '';
        if (claimRole === ADMIN_ROLE) {
          if (active) {
            setAuthorized(true);
            setCheckingRole(false);
          }
          return;
        }
      } catch (error) {
        console.warn('[admin/layout][claims]', error);
      }

      if (!token) {
        return;
      }

      try {
        const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (response.ok) {
          const data = await response.json();
          const docRole = typeof data?.user?.role === 'string' ? data.user.role : '';
          if (docRole === ADMIN_ROLE) {
            if (active) {
              setAuthorized(true);
              setCheckingRole(false);
            }
            return;
          }
        }
      } catch (error) {
        console.error('[admin/layout][profile]', error);
      }

      if (active) {
        setCheckingRole(false);
        router.replace('/assinante/dashboard');
      }
    };

    verifyRole();
    return () => {
      active = false;
    };
  }, [user, token, router]);

  const meta = useMemo<LayoutMeta>(() => {
    return metaByRoute[pathname] ?? metaByRoute['/admin/dashboard'];
  }, [pathname]);

  return (
    <AuthGuard>
      {checkingRole ? (
        <div className="py-12 text-center text-sm text-zinc-600">Validando privilégios administrativos…</div>
      ) : !authorized ? null : (
        <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
          <aside className="h-max rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Gestão administrativa</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {greeting}, <span className="font-medium text-zinc-700">{user?.email ?? 'administrador'}</span>
                </p>
              </div>
              <nav className="space-y-3">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={clsx(
                        'block rounded-2xl border px-4 py-3 transition hover:border-emerald-200 hover:bg-emerald-50',
                        isActive ? 'border-emerald-300 bg-emerald-50/80 shadow-sm' : 'border-white/60 bg-white/80',
                      )}
                    >
                      <span className="block text-sm font-semibold text-emerald-700">{link.label}</span>
                      <span className="text-xs text-zinc-500">{link.helper}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-700">
                <p className="font-semibold">Como usar</p>
                <p className="mt-1">
                  Todas as ações administrativas são refletidas diretamente na API Rapidoc e no Asaas. Utilize a seção
                  financeira para confirmar pagamentos antes de liberar novos acessos.
                </p>
              </div>
            </div>
          </aside>
          <section className="space-y-6">
            <header className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{meta.description}</p>
              <h1 className="mt-2 text-3xl font-semibold text-zinc-900">{meta.title}</h1>
            </header>
            <div className="space-y-6">{children}</div>
          </section>
        </div>
      )}
    </AuthGuard>
  );
}
