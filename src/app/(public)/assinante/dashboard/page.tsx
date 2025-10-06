"use client";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { useEffect, useState } from "react";

type MeResponse = {
  ok: boolean;
  user?: any;
  payments?: any[];
};

export default function AssinanteDashboard() {
  const { token } = useAuthContext();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        setErr("");
        const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as MeResponse;
        setMe(data);
      } catch (e: any) {
        setErr(e?.message || "Falha ao carregar dados");
      }
    };
    load();
  }, [token]);

  const beneficiaryUuid = (me?.user?.beneficiaryUuid as string | undefined) || "";
  const status = (me?.user?.status as string | undefined) || "";

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="section-title text-emerald-700">Painel do Assinante</h2>
        {status && <span className="badge">{String(status).toUpperCase()}</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="muted mb-1">Beneficiário principal (UUID)</p>
          <code className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
            {beneficiaryUuid || 'não definido'}
          </code>
        </div>

        <div className="card p-4">
          <p className="muted mb-2">Últimos pagamentos</p>
          {!me?.payments?.length && <p className="text-zinc-600">Nenhum pagamento localizado.</p>}
          {!!me?.payments?.length && (
            <ul className="space-y-1">
              {me!.payments!.slice(0, 5).map((p: any) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{p.id}</span>
                  <span className="badge">{String(p.status || '').toUpperCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
