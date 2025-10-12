import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/auth/AuthProvider";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Medicos Consultas Online",
  description:
    "Central do assinante para agendamentos digitais e gestão integrada à Rapidoc e Asaas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased">
        <AuthProvider>
          <div className="relative min-h-screen bg-[radial-gradient(1600px_700px_at_20%_-10%,rgba(16,185,129,0.12),transparent),radial-gradient(1200px_600px_at_120%_-30%,rgba(16,185,129,0.08),transparent)]">
            {/* Header removido globalmente */}
            <main className="relative mx-auto w-full max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-10">{children}</main>
            <footer className="border-t border-white/60 bg-white/80 py-10 text-sm text-zinc-600">
              <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium text-emerald-700">Medicos Consultas Online</p>
                <p className="text-xs sm:text-sm">
                  Integração com Rapidoc &amp; Asaas para operação completa de telemedicina.
                </p>
                <div className="flex items-center gap-4 text-xs sm:text-sm">
                  <Link
                    href="/assinante/dashboard"
                    className="text-emerald-700 underline-offset-2 hover:underline"
                  >
                    Central do assinante
                  </Link>
                  <Link
                    href="/admin/dashboard"
                    className="text-emerald-700 underline-offset-2 hover:underline"
                  >
                    Gestão administrativa
                  </Link>
                  <Link
                    href="/teste-rapidoc"
                    className="text-emerald-700 underline-offset-2 hover:underline"
                  >
                    Laboratório Rapidoc
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
