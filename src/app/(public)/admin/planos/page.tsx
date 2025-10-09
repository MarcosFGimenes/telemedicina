'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanDefinition } from '@/types/plans';

type RapidocPlanSummary = {
  serviceType: string;
  name: string;
  description: string;
  isActive: boolean;
  uuid?: string;
};

const emptyForm = {
  id: '',
  serviceType: '',
  name: '',
  description: '',
  value: '',
  maxDependents: '',
};

type FormState = typeof emptyForm;

type ServiceTypeOption = {
  code: string;
  name: string;
  description: string;
};

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

const normalizeRapidocPlans = (value: unknown): RapidocPlanSummary[] => {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { plans?: unknown })?.plans)
      ? ((value as { plans?: unknown })?.plans as unknown[])
      : [];

  return list
    .map((plan) => {
      if (!plan || typeof plan !== 'object') {
        return null;
      }
      const candidate = plan as Record<string, unknown>;
      const serviceTypeRaw = typeof candidate.serviceType === 'string' ? candidate.serviceType : '';
      const serviceType = serviceTypeRaw.trim().toUpperCase();
      if (!serviceType) {
        return null;
      }
      const nameRaw = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
      const uuidRaw = typeof candidate.uuid === 'string' ? candidate.uuid.trim() : '';
      const isActive = typeof candidate.isActive === 'boolean' ? candidate.isActive : true;

      return {
        serviceType,
        name: nameRaw || serviceType,
        description,
        isActive,
        uuid: uuidRaw || undefined,
      } satisfies RapidocPlanSummary;
    })
    .filter((plan): plan is RapidocPlanSummary => Boolean(plan))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<ServiceTypeOption[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState('');
  const [rapidocPlans, setRapidocPlans] = useState<RapidocPlanSummary[]>([]);
  const [loadingRapidocPlans, setLoadingRapidocPlans] = useState(false);
  const [rapidocError, setRapidocError] = useState('');

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

  const loadRapidocPlans = useCallback(async () => {
    try {
      setLoadingRapidocPlans(true);
      setRapidocError('');
      const res = await fetch('/api/rapidoc/planos');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, 'Falha ao consultar planos da Rapidoc.'));
      }

      setRapidocPlans(normalizeRapidocPlans(data));
    } catch (err: unknown) {
      setRapidocPlans([]);
      setRapidocError(err instanceof Error ? err.message : 'Não foi possível carregar os planos da Rapidoc.');
    } finally {
      setLoadingRapidocPlans(false);
    }
  }, []);

  useEffect(() => {
    loadRapidocPlans();
  }, [loadRapidocPlans]);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoadingServices(true);
        setServicesError('');
        const res = await fetch('/api/rapidoc/service-types');
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(extractErrorMessage(data, 'Falha ao carregar serviços da Rapidoc.'));
        }
        setServiceOptions(Array.isArray(data) ? (data as ServiceTypeOption[]) : []);
      } catch (err: unknown) {
        setServiceOptions([]);
        setServicesError(
          err instanceof Error ? err.message : 'Não foi possível carregar os serviços da Rapidoc.',
        );
      } finally {
        setLoadingServices(false);
      }
    };

    fetchServices();
  }, []);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleServiceTypeChange = (value: string) => {
    const normalized = value.toUpperCase();
    setForm((prev) => ({ ...prev, serviceType: normalized, id: normalized }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const payload = {
      id: form.id.trim(),
      serviceType: form.serviceType.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      value: Number(form.value.replace(',', '.')),
      maxDependents:
        form.maxDependents.trim() === ''
          ? null
          : Number(form.maxDependents.trim().replace(',', '.')),
    };

    if (!payload.serviceType) {
      setError('Selecione um serviço da Rapidoc.');
      return;
    }

    if (!payload.id) {
      setError('Informe o código interno do plano.');
      return;
    }

    payload.id = payload.id.toUpperCase();
    payload.serviceType = payload.serviceType.toUpperCase();

    if (!payload.name) {
      setError('Informe um nome para o plano.');
      return;
    }

    if (!Number.isFinite(payload.value) || payload.value <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }

    if (payload.maxDependents !== null) {
      if (!Number.isFinite(payload.maxDependents) || payload.maxDependents < 0) {
        setError('Informe um número válido para o máximo de dependentes.');
        return;
      }
      payload.maxDependents = Math.trunc(Number(payload.maxDependents));
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
      serviceType: plan.serviceType,
      name: plan.name,
      description: plan.description,
      value: String(plan.value.toFixed(2)),
      maxDependents: plan.maxDependents != null ? String(plan.maxDependents) : '',
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

  const availableServiceOptions = useMemo(() => {
    const map = new Map<string, ServiceTypeOption>();
    serviceOptions.forEach((option) => {
      map.set(option.code, option);
    });
    plans.forEach((plan) => {
      if (!map.has(plan.serviceType)) {
        map.set(plan.serviceType, {
          code: plan.serviceType,
          name: plan.name,
          description: plan.description,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [serviceOptions, plans]);

  const selectedService = useMemo(
    () => availableServiceOptions.find((option) => option.code === form.serviceType) || null,
    [availableServiceOptions, form.serviceType],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Especialidades da Rapidoc</h2>
            <p className="text-sm text-zinc-500">
              Lista de planos disponíveis diretamente na Rapidoc. Utilize estes códigos (serviceType) ao criar
              ofertas no sistema.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadRapidocPlans();
            }}
            disabled={loadingRapidocPlans}
            className="h-10 rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Atualizar
          </button>
        </div>

        {loadingRapidocPlans && (
          <p className="mt-6 text-sm text-zinc-500">Consultando planos da Rapidoc…</p>
        )}

        {!loadingRapidocPlans && rapidocError && (
          <p className="mt-6 text-sm text-red-600">{rapidocError}</p>
        )}

        {!loadingRapidocPlans && !rapidocError && rapidocPlans.length === 0 && (
          <p className="mt-6 text-sm text-zinc-500">
            Nenhum plano encontrado na Rapidoc. Verifique as credenciais configuradas.
          </p>
        )}

        {!loadingRapidocPlans && !rapidocError && rapidocPlans.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">serviceType</th>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">Descrição</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rapidocPlans.map((plan) => (
                  <tr key={plan.serviceType} className="bg-white/80" title={plan.uuid ?? undefined}>
                    <td className="px-4 py-3 font-mono text-xs uppercase text-zinc-500">
                      {plan.serviceType}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-700">{plan.name}</td>
                    <td className="px-4 py-3 text-zinc-500">{plan.description || '—'}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {plan.isActive ? 'Ativo' : 'Inativo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">{header}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Defina código (serviceType), nome, descrição e valor padrão para cada plano comercializado.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Serviço Rapidoc (serviceType)</label>
            <select
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={form.serviceType}
              onChange={(event) => handleServiceTypeChange(event.target.value)}
              disabled={loadingServices || Boolean(editingId)}
            >
              <option value="">Selecione um serviço…</option>
              {availableServiceOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name} ({option.code})
                </option>
              ))}
            </select>
            {loadingServices && <p className="text-xs text-zinc-500">Carregando serviços…</p>}
            {servicesError && <p className="text-xs text-red-600">{servicesError}</p>}
            {selectedService?.description && (
              <p className="text-xs text-zinc-500">{selectedService.description}</p>
            )}
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

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Máx. dependentes</label>
            <input
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={form.maxDependents}
              onChange={(event) => handleChange('maxDependents', event.target.value.replace(/[^\d,\.]/g, ''))}
              placeholder="Ex.: 4"
              inputMode="numeric"
            />
            <p className="text-xs text-zinc-500">Deixe em branco para ilimitado.</p>
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
                  <th className="px-4 py-2">serviceType</th>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">Descrição</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-right">Máx. dependentes</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {plans.map((plan) => (
                  <tr key={plan.id} className="bg-white/80">
                    <td className="px-4 py-3 font-mono text-xs uppercase text-zinc-500">
                      {plan.serviceType}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-700">{plan.name}</td>
                    <td className="px-4 py-3 text-zinc-500">{plan.description || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-700">
                      {currency.format(plan.value)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {plan.maxDependents != null ? plan.maxDependents : '—'}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
