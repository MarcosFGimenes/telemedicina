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
    helper: 'Status do contrato e proximos passos',
  },
  {
    href: '/assinante/agendamentos',
    label: 'Agendar consulta',
    helper: 'Escolha especialidade, horario e beneficiario',
  },
  {
    href: '/assinante/encaminhamentos',
    label: 'Encaminhamentos',
    helper: 'Baixe e acompanhe seus encaminhamentos',
  },
  {
    href: '/assinante/imediato',
    label: 'Atendimento imediato',
    helper: 'Clinico geral via telemedicina',
  },
  {
    href: '/assinante/dependentes',
    label: 'Dependentes',
    helper: 'Cadastre e acompanhe seus vinculos',
  },
  {
    href: '/assinante/faturas',
    label: 'Pagamentos e faturas',
    helper: 'Historico de cobrancas Asaas',
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
    description: 'Controle total do plano, servicos ativos e pagamentos.',
  },
  '/assinante/agendamentos': {
    title: 'Agendar novo atendimento',
    description: 'Selecione beneficiario, especialidade e confirme seu horario.',
  },
  '/assinante/encaminhamentos': {
    title: 'Encaminhamentos do beneficiario',
    description: 'Visualize e baixe encaminhamentos ativos diretamente da Rapidoc.',
  },
  '/assinante/imediato': {
    title: 'Atendimento imediato',
    description: 'Fila de telemedicina com clinico geral (generalista).',
  },
  '/assinante/dependentes': {
    title: 'Gestao de dependentes',
    description: 'Convide familiares, acompanhe limites e status do plano.',
  },
  '/assinante/faturas': {
    title: 'Faturas e historico',
    description: 'Acompanhe cobrancas, status e comprovantes em tempo real.',
  },
  '/assinante/perfil': {
    title: 'Meu perfil',
    description: 'Atualize dados de contato para garantir notificacoes rapidas.',
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
      <div className="space-y-6 lg:grid lg:grid-cols-[280px,1fr] lg:items-start lg:gap-6 lg:space-y-0">
        <aside className="hidden h-max rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm lg:block">
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
                Confira o laboratorio Rapidoc para visualizar requisicoes em tempo real ou acesse o painel administrativo para
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

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Central do assinante</p>
            <p className="mt-1 text-sm text-zinc-500">
              Bem-vindo, <span className="font-medium text-zinc-700">{snapshot?.name || user?.email || 'cliente'}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-semibold text-emerald-700">
                <span>Status</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] tracking-wide text-emerald-600">
                  {loadingSnapshot ? 'Carregando...' : statusLabel}
                </span>
              </span>
              {snapshot?.beneficiaryUuid && (
                <span className="font-mono text-[11px] text-zinc-500">{snapshot.beneficiaryUuid}</span>
              )}
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <Link href="/teste-rapidoc" className="rounded-full border border-emerald-200 px-3 py-1 font-semibold text-emerald-700">
                Rapidoc Live
              </Link>
              <Link href="/admin/dashboard" className="rounded-full border border-emerald-200 px-3 py-1 font-semibold text-emerald-700">
                Suporte admin
              </Link>
            </div>
          </section>

          <nav className="lg:hidden">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={clsx(
                      'flex min-w-[200px] flex-col rounded-2xl border px-4 py-3',
                      isActive
                        ? 'border-emerald-300 bg-emerald-50/90 text-emerald-700 shadow-sm'
                        : 'border-white/70 bg-white/90 text-zinc-600',
                    )}
                  >
                    <span className="text-sm font-semibold">{link.label}</span>
                    <span className="text-xs">{link.helper}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{meta.description}</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-900">{meta.title}</h1>
          </section>
          <div className="space-y-6">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
