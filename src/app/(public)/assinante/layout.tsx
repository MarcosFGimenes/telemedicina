'use client';

import AuthGuard from '@/components/auth/AuthGuard';
import { useAuthContext } from '@/components/auth/AuthProvider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

type SubscriberMeta = {
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
    href: '/assinante/dashboard',
    label: 'Resumo do plano',
    helper: 'Status do contrato e próximos passos',
  },
  {
    href: '/assinante/agendamentos',
    label: 'Agendar consulta',
    helper: 'Escolha especialidade, horário e beneficiário',
  },
  {
    href: '/assinante/imediato',
    label: 'Atendimento imediato',
    helper: 'Clínico geral via telemedicina',
  },
  {
    href: '/assinante/autoatendimento',
    label: 'Autoatendimento',
    helper: 'Perfil, plano e consultas',
  },
  {
    href: '/assinante/dependentes',
    label: 'Dependentes',
    helper: 'Cadastre e acompanhe seus vínculos',
  },
  {
    href: '/assinante/faturas',
    label: 'Pagamentos e faturas',
    helper: 'Histórico de cobranças Asaas',
  },
  {
    href: '/assinante/perfil',
    label: 'Meu perfil',
    helper: 'Dados pessoais e contatos',
  },
];

const metaByRoute: Record<string, SubscriberMeta> = {
  '/assinante/dashboard': {
    title: 'Central do assinante',
    description: 'Controle total do plano, serviços ativos e pagamentos.',
  },
  '/assinante/agendamentos': {
    title: 'Agendar novo atendimento',
    description: 'Selecione beneficiário, especialidade e confirme seu horário.',
  },
  '/assinante/imediato': {
    title: 'Atendimento imediato',
    description: 'Fila de telemedicina com clínico geral (generalista).',
  },
  '/assinante/dependentes': {
    title: 'Gestão de dependentes',
    description: 'Convide familiares, acompanhe limites e status do plano.',
  },
  '/assinante/faturas': {
    title: 'Faturas e histórico',
    description: 'Acompanhe cobranças, status e comprovantes em tempo real.',
  },
  '/assinante/perfil': {
    title: 'Meu perfil',
    description: 'Atualize dados de contato para garantir notificações rápidas.',
  },
};

type SubscriberSnapshot = {
  name?: string;
  status?: string;
  beneficiaryUuid?: string;
};

export default function AssinanteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, token } = useAuthContext();
  const [snapshot, setSnapshot] = useState<SubscriberSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        setLoadingSnapshot(true);
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Falha ao carregar perfil');
        const data = await res.json();
        setSnapshot({
          name: data?.user?.name,
          status: data?.user?.status,
          beneficiaryUuid: data?.user?.beneficiaryUuid,
        });
      } catch (error) {
        console.error('[assinante/layout] erro ao carregar snapshot', error);
      } finally {
        setLoadingSnapshot(false);
      }
    };
    load();
  }, [token]);

  const meta = useMemo<SubscriberMeta>(() => {
    return metaByRoute[pathname] ?? metaByRoute['/assinante/dashboard'];
  }, [pathname]);

  const statusLabel = snapshot?.status ? String(snapshot.status).toUpperCase() : 'PENDENTE';

  return (
    <AuthGuard>
      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <aside className="h-max rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Central do assinante</p>
              <p className="text-sm text-zinc-500">
                Bem-vindo, <span className="font-medium text-zinc-700">{snapshot?.name || user?.email || 'cliente'}</span>
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span>Status</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] tracking-wide text-emerald-600">
                  {loadingSnapshot ? 'Carregando...' : statusLabel}
                </span>
              </div>
              {snapshot?.beneficiaryUuid && (
                <p className="text-[11px] text-zinc-500">
                  Titular Rapidoc: <span className="font-mono text-xs">{snapshot.beneficiaryUuid}</span>
                </p>
              )}
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
                      isActive
                        ? 'border-emerald-300 bg-emerald-50/80 shadow-sm'
                        : 'border-white/60 bg-white/80',
                    )}
                  >
                    <span className="block text-sm font-semibold text-emerald-700">{link.label}</span>
                    <span className="text-xs text-zinc-500">{link.helper}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-700">
              <p className="font-semibold">Precisa de ajuda?</p>
              <p className="mt-1">
                Confira o laboratório Rapidoc para visualizar requisições em tempo real ou acesse o painel administrativo para
                suporte especializado.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/teste-rapidoc" className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-emerald-700">
                  Rapidoc Live
                </Link>
                <Link href="/admin/dashboard" className="rounded-full border border-white/70 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                  Fale com o admin
                </Link>
              </div>
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
    </AuthGuard>
  );
}
