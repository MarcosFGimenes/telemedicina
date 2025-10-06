'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/components/auth/AuthProvider";

type Tab = {
  href: string;
  label: string;
};

const tabs: Tab[] = [
  { href: "/", label: "Inicio" },
  { href: "/assinante/dashboard", label: "Assinante" },
  { href: "/assinante/perfil", label: "Perfil" },
  { href: "/assinante/agendamentos", label: "Agendamentos" },
  { href: "/assinante/dependentes", label: "Dependentes" },
  { href: "/assinante/faturas", label: "Faturas" },
  // { href: "/assinante/pagar", label: "Pagar" },
  { href: "/admin/beneficiarios", label: "Admin/Beneficiarios" },
  { href: "/teste-rapidoc", label: "Teste Rapidoc" },
];

export default function Nav() {
  const pathname = usePathname();
  const { user, signOut } = useAuthContext();

  return (
    <nav className="w-full border-b border-emerald-100/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 sticky top-0 z-30">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex gap-3">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const baseClasses = "rounded-md px-3 py-1 text-sm transition";
          const stateClasses = isActive
            ? " bg-emerald-600 text-white shadow-sm"
            : " text-emerald-700 hover:bg-emerald-50";

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${baseClasses}${stateClasses}`}
            >
              {tab.label}
            </Link>
          );
        })}
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden text-xs text-zinc-600 sm:inline">{user.email}</span>
              <button onClick={() => signOut()} className="btn-outline px-3 py-1">Sair</button>
            </>
          ) : (
            <Link href="/login" className="btn-outline px-3 py-1">Entrar</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
