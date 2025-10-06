'use client';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { useEffect, useState } from 'react';

type Payment = { id: string; status?: string; processedAt?: any; value?: number; invoiceUrl?: string | null };

export default function FaturasPage() {
  const { token } = useAuthContext();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        setErr('');
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setPayments(Array.isArray(data?.payments) ? data.payments : []);
      } catch (e: any) {
        setErr(e?.message || 'Falha ao carregar faturas');
      }
    };
    load();
  }, [token]);

  return (
    <div className="space-y-3">
      <h2 className="section-title text-emerald-700">Faturas e Pagamentos</h2>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!payments.length && <p className="muted">Nenhuma fatura localizada.</p>}
      {!!payments.length && (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Fatura</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="font-mono">{p.id}</td>
                  <td>R$ {typeof p.value === 'number' ? p.value.toFixed(2) : '-'}</td>
                  <td>
                    <span className="badge">{String(p.status || '').toUpperCase()}</span>
                  </td>
                  <td>
                    {p.invoiceUrl ? (
                      <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
                        Abrir
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
