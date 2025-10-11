'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuthContext } from '@/components/auth/AuthProvider';
import clsx from 'clsx';

const primaryLinks = [
  {
    href: '/',
    label: 'Início',
    match: (pathname: string) => pathname === '/',
  },
  {
    href: '/assinante/dashboard',
    label: 'Central do Assinante',
    match: (pathname: string) => pathname.startsWith('/assinante'),
  },
  {
    href: '/admin/dashboard',
    label: 'Gestão Administrativa',
    match: (pathname: string) => pathname.startsWith('/admin'),
  },
  {
    href: '/teste-rapidoc',
    label: 'Laboratório Rapidoc',
    match: (pathname: string) => pathname.startsWith('/teste-rapidoc'),
  },
];

export default function Nav() {
  const pathname = usePathname();
  const { user, signOut } = useAuthContext();

  return (
    <header className="sticky top-0 z-40 border-b border-white/50 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="Medicos Consultas Online"
              width={120}
              height={36}
              className="h-9 w-auto"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-medium text-zinc-600 lg:flex">
            {primaryLinks.map((link) => {
              const isActive = link.match(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'rounded-full px-3 py-1.5 transition',
                    isActive
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {!user && (
            <Link
              href="/login"
              className="rounded-full border border-emerald-600 px-4 py-1.5 font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              Entrar
            </Link>
          )}
          {user && (
            <>
              <span className="hidden text-xs text-zinc-500 sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow transition hover:bg-emerald-700"
              >
                Sair
              </button>
            </>
          )}
        </div>
      </div>
      <nav className="flex justify-center gap-1 border-t border-white/40 bg-white/70 px-4 py-2 text-xs font-medium text-emerald-700 lg:hidden">
        {primaryLinks.map((link) => {
          const isActive = link.match(pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'rounded-full px-3 py-1 transition',
                isActive ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-emerald-100',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
