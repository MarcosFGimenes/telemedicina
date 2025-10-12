'use client';

import AuthGuard from '@/components/auth/AuthGuard';
import { useAuthContext } from '@/components/auth/AuthProvider';
import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <AuthGuard>
      <div className="space-y-6">
        <header className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/assinante/dashboard" className="flex items-center gap-4">
              <Image src="/logo.png" alt="Rapidoc" width={180} height={60} className="h-12 w-auto" priority />
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={clsx(
                      'rounded-full px-4 py-2 text-sm font-semibold transition',
                      isActive
                        ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                        : 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800',
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-50 lg:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-controls="assinante-mobile-menu"
            >
              <span className="sr-only">Abrir menu de navegação</span>
              {mobileMenuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>

          {mobileMenuOpen && (
            <div
              id="assinante-mobile-menu"
              className="mt-4 space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 shadow-sm lg:hidden"
            >
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={clsx(
                      'flex flex-col rounded-xl px-3 py-2 text-sm transition',
                      isActive
                        ? 'bg-white text-emerald-800'
                        : 'text-emerald-700 hover:bg-white/80 hover:text-emerald-800',
                    )}
                  >
                    <span className="font-semibold">{link.label}</span>
                    <span className="text-[11px] text-emerald-600/80">{link.helper}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </header>

        <div className="space-y-6 lg:grid lg:grid-cols-[280px,1fr] lg:gap-6 lg:space-y-0">
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
          <section className="space-y-6">
            <header className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{meta.description}</p>
              <h1 className="mt-2 text-3xl font-semibold text-zinc-900">{meta.title}</h1>
            </header>
            <div className="space-y-6">{children}</div>
          </section>
        </div>
      </div>
    </AuthGuard>
  );
}
