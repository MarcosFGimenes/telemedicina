'use client';

import { useAuthContext } from '@/components/auth/AuthProvider';
import clsx from 'clsx';

type LogoutButtonProps = {
  className?: string;
  compact?: boolean;
};

export default function LogoutButton({ className, compact }: LogoutButtonProps) {
  const { signOut } = useAuthContext();

  return (
    <button
      type="button"
      onClick={() => signOut()}
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-emerald-600 text-white shadow transition hover:bg-emerald-700',
        compact ? 'px-3 py-1.5 text-xs font-semibold' : 'px-4 py-2 text-sm font-semibold',
        className,
      )}
      aria-label="Encerrar sessão"
      title="Encerrar sessão"
    >
      Encerrar sessão
    </button>
  );
}

