'use client';

import { FormEvent, useState } from 'react';

type StatusResult = {
  status?: string;
  raw?: unknown;
};

type FinalizeResult = {
  message?: string;
  uuid?: string;
  raw?: unknown;
  [key: string]: unknown;
};

const pretty = (payload: unknown) => JSON.stringify(payload ?? {}, null, 2);

export default function AdminFinanceiroPage() {
  const [paymentId, setPaymentId] = useState('');
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  const [statusError, setStatusError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  const [finalizeCpf, setFinalizeCpf] = useState('');
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [finalizeError, setFinalizeError] = useState('');
  const [finalizeLoading, setFinalizeLoading] = useState(false);

  const checkStatus = async () => {
    if (!paymentId) {
      setStatusError('Informe o paymentId do Asaas.');
      return;
    }

    try {
      setStatusLoading(true);
      setStatusError('');
      const res = await fetch(`/api/checkout/status/${paymentId}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || 'Falha ao consultar status');
      }
      setStatusResult(json);
    } catch (error: any) {
      setStatusError(error?.message || 'Falha ao consultar status');
      setStatusResult(null);
    } finally {
      setStatusLoading(false);
    }
  };

  const finalize = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentId) {
      setFinalizeError('Informe o paymentId do Asaas.');
      return;
    }

    try {
      setFinalizeLoading(true);
      setFinalizeError('');
      const res = await fetch('/api/checkout/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, cpf: finalizeCpf || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || 'Falha ao finalizar beneficiário');
      }
      setFinalizeResult(json);
    } catch (error: any) {
      setFinalizeError(error?.message || 'Falha ao finalizar');
      setFinalizeResult(null);
    } finally {
      setFinalizeLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Auditoria financeira</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Utilize o paymentId gerado pelo Asaas para consultar o status do pagamento e, quando confirmado, finalizar o fluxo de
          ativação automática do beneficiário no prontuario clínico.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr,auto]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">paymentId</label>
            <input
              className="input"
              value={paymentId}
              onChange={(event) => setPaymentId(event.target.value)}
              placeholder="ID do pagamento Asaas"
            />
          </div>
          <button
            type="button"
            onClick={checkStatus}
            className="self-end rounded-full border border-emerald-600 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            {statusLoading ? 'Consultando…' : 'Consultar status'}
          </button>
        </div>
        {statusError && <p className="mt-3 text-sm text-red-600">{statusError}</p>}
        {statusResult && (
          <details className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-xs text-zinc-600">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
              Status: {String(statusResult.status || '—').toUpperCase()}
            </summary>
            <pre className="mt-3 whitespace-pre-wrap break-all text-[11px] leading-relaxed">{pretty(statusResult.raw ?? statusResult)}</pre>
          </details>
        )}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Finalizar ativação do plano</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Após a confirmação do pagamento, finalize o beneficiário para criar automaticamente o registro no prontuario clínico e vincular ao
          titular no Firestore.
        </p>

        <form onSubmit={finalize} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">paymentId</label>
              <input
                className="input"
                value={paymentId}
                onChange={(event) => setPaymentId(event.target.value)}
                placeholder="ID do pagamento Asaas"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">CPF do beneficiário (opcional)</label>
              <input
                className="input"
                value={finalizeCpf}
                onChange={(event) => setFinalizeCpf(event.target.value)}
                placeholder="Somente números"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={finalizeLoading}
            className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {finalizeLoading ? 'Finalizando…' : 'Finalizar beneficiário'}
          </button>
        </form>

        {finalizeError && <p className="mt-3 text-sm text-red-600">{finalizeError}</p>}
        {finalizeResult && (
          <details className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-xs text-zinc-600">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-700">Retorno do fluxo</summary>
            <pre className="mt-3 whitespace-pre-wrap break-all text-[11px] leading-relaxed">{pretty(finalizeResult ?? {})}</pre>
          </details>
        )}
      </section>

      <section className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-sm text-emerald-700">
        <p className="font-semibold">Checklist financeiro recomendado</p>
        <ol className="mt-2 space-y-1">
          <li>1. Gerar pagamento via laboratório de integração / checkout de teste.</li>
          <li>2. Confirmar pagamento no Asaas sandbox.</li>
          <li>3. Consultar status acima para garantir confirmação.</li>
          <li>4. Finalizar beneficiário para liberar acesso imediato.</li>
        </ol>
      </section>
    </div>
  );
}
