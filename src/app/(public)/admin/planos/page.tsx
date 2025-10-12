'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { slugify } from '@/lib/slug';
import type { PlanDefinition } from '@/types/plans';

const emptyForm = {
  id: '',
  name: '',
  description: '',
  value: '',
  slug: '',
};

type FormState = typeof emptyForm;

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === 'string') {
      return value;
    }
  }
  return fallback;
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [origin, setOrigin] = useState('');

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/plans');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, 'Falha ao carregar planos.'));
      }
      setPlans(Array.isArray(data) ? (data as PlanDefinition[]) : []);
    } catch (error: unknown) {
      setPlans([]);
      setError(error instanceof Error ? error.message : 'Não foi possível carregar os planos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const slugPreview = useMemo(() => {
    const currentSlug = (form.slug || '').trim();
    if (currentSlug) {
      return currentSlug;
    }
    const fromName = slugify(form.name || '');
    if (fromName) {
      return fromName;
    }
    const fromId = slugify(form.id || '');
    if (fromId) {
      return fromId;
    }
    return '';
  }, [form.id, form.name, form.slug]);

  const checkoutPath = slugPreview ? `/assinar/${slugPreview}` : '';
  const checkoutUrl = checkoutPath ? (origin ? `${origin}${checkoutPath}` : checkoutPath) : '';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const payload = {
      id: form.id.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      value: Number(form.value.replace(',', '.')),
    };

    if (!payload.id) {
      setError('Informe o código interno do plano.');
      return;
    }

    if (!payload.name) {
      setError('Informe um nome para o plano.');
      return;
    }

    if (!Number.isFinite(payload.value) || payload.value <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }

    try {
      setSubmitting(true);
      const endpoint = editingId ? `/api/plans/${editingId}` : '/api/plans';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, 'Não foi possível salvar o plano.'));
      }
      await loadPlans();
      setSuccess(editingId ? 'Plano atualizado com sucesso.' : 'Plano criado com sucesso.');
      resetForm();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Falha ao salvar plano.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (plan: PlanDefinition) => {
    setEditingId(plan.id);
    setForm({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      value: String(plan.value.toFixed(2)),
      slug: plan.slug,
    });
    setSuccess('');
    setError('');
  };

  const handleDelete = async (plan: PlanDefinition) => {
    if (!window.confirm(`Deseja remover o plano "${plan.name}"?`)) {
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');
      const res = await fetch(`/api/plans/${plan.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, 'Falha ao remover o plano.'));
      }
      if (editingId === plan.id) {
        resetForm();
      }
      await loadPlans();
      setSuccess('Plano removido com sucesso.');
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Erro ao remover plano.');
    } finally {
      setSubmitting(false);
    }
  };

  const header = useMemo(() => {
    return editingId ? `Editando plano ${editingId}` : 'Cadastrar novo plano';
  }, [editingId]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">{header}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Defina código (serviceType), nome, descrição e valor padrão para cada plano comercializado.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Código (serviceType)</label>
            <input
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={form.id}
              onChange={(event) => handleChange('id', event.target.value.toUpperCase())}
              placeholder="Ex.: GS"
              disabled={Boolean(editingId)}
            />
            <p className="text-xs text-zinc-500">Use o mesmo código utilizado pela Rapidoc.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Nome do plano</label>
            <input
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={form.name}
              onChange={(event) => handleChange('name', event.target.value)}
              placeholder="Plano Especialistas"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Link de assinatura</label>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span className="font-mono text-xs text-emerald-700">
                {checkoutPath ? checkoutUrl : 'Informe o código e o nome para gerar a URL'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              O link é criado automaticamente e permanece associado ao plano após a publicação.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Descrição dos serviços</label>
            <textarea
              className="h-24 w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={form.description}
              onChange={(event) => handleChange('description', event.target.value)}
              placeholder="Inclui consultas generalistas e especialistas."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Valor padrão (R$)</label>
            <input
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={form.value}
              onChange={(event) => handleChange('value', event.target.value)}
              placeholder="49,90"
              inputMode="decimal"
            />
          </div>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {editingId ? 'Salvar alterações' : 'Cadastrar plano'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Planos cadastrados</h2>
            <p className="text-sm text-zinc-500">
              Esses dados alimentam o formulário de beneficiários e a cobrança automática.
            </p>
          </div>
          <button
            type="button"
            onClick={loadPlans}
            disabled={loading}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Atualizar
          </button>
        </div>

        {loading && <p className="mt-6 text-sm text-zinc-500">Carregando planos…</p>}
        {!loading && plans.length === 0 && (
          <p className="mt-6 text-sm text-zinc-500">Nenhum plano cadastrado até o momento.</p>
        )}

        {!loading && plans.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Codigo</th>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">URL de assinatura</th>
                  <th className="px-4 py-2">Descricao</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {plans.map((plan) => {
                  const planHref = `/assinar/${plan.slug}`;
                  const planDisplayUrl = origin ? `${origin}${planHref}` : planHref;
                  return (
                    <tr key={plan.id} className="bg-white/80">
                      <td className="px-4 py-3 font-mono text-xs uppercase text-zinc-500">{plan.id}</td>
                      <td className="px-4 py-3 font-medium text-zinc-700">{plan.name}</td>
                      <td className="px-4 py-3">
                        {plan.slug ? (
                          <div className="flex flex-col items-start gap-1">
                            <a
                              href={planHref}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs text-emerald-700 underline-offset-2 hover:underline"
                            >
                              {planDisplayUrl}
                            </a>
                            <span className="text-[11px] uppercase tracking-wide text-emerald-500">
                              Compartilhe esta URL
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">URL indisponivel</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{plan.description || '...'}</td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-700">
                        {currency.format(plan.value)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(plan)}
                            className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(plan)}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
