'use client';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth as getAuthClient } from '@/lib/firebaseClient';
import { onAuthStateChanged, User, signOut, getIdToken } from 'firebase/auth';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  token: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuthClient();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const t = await getIdToken(u, true).catch(() => null);
        setToken(t);
        // tenta vincular o authUid ao documento do usuário no Firestore (lado servidor)
        try {
          await fetch('/api/auth/link', {
            method: 'POST',
            headers: { Authorization: t ? `Bearer ${t}` : '' },
          });
        } catch {}
      } else {
        setToken(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, signOut: () => signOut(getAuthClient()) }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

