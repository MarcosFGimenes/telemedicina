'use client';
import AuthGuard from '@/components/auth/AuthGuard';

export default function AssinanteLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

