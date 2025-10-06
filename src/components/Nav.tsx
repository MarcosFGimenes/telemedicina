'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
};

const tabs: Tab[] = [
  { href: "/", label: "Inicio" },
  { href: "/assinante/dashboard", label: "Assinante" },
  { href: "/assinante/agendamentos", label: "Agendamentos" },
  { href: "/assinante/dependentes", label: "Dependentes" },
  { href: "/assinante/pagar", label: "Pagar" },
  { href: "/admin/beneficiarios", label: "Admin/Beneficiarios" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-5xl gap-3 px-4 py-2">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const baseClasses = "rounded-md px-3 py-1 text-sm";
          const stateClasses = isActive
            ? " bg-zinc-900 text-white"
            : " hover:bg-zinc-100";

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
    </nav>
  );
}
