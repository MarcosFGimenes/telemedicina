'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuthContext } from '@/components/auth/AuthProvider';
import PlanChangeDialog from '@/components/plan/PlanChangeDialog';
import PaymentMethodDialog from '@/components/plan/PaymentMethodDialog';

type Beneficiary = {
  uuid: string;
  name: string;
  cpf: string;
  birthday?: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  paymentType?: string;
  serviceType?: string;
  holder?: string;
  general?: string;
  status?: string;
};

type ApiBeneficiary = Record<string, unknown>;

const normalizeBirthday = (value?: string) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split(/[\/\-]/).map((part) => part.trim());
  if (parts.length === 3) {
    const [part0, part1, part2] = parts;
    if (part0.length === 2 && part1.length === 2 && part2.length === 4) {
      return `${part2}-${part1}-${part0}`;
    }
    if (part0.length === 4 && part1.length === 2 && part2.length === 2) {
      return `${part0}-${part1}-${part2}`;
    }
  }
  return '';
};

const normalizeCPF = (value?: string) => (value ?? '').replace(/\D/g, '');

const toTitle = (value?: string) =>
  (value ?? '').toString().trim().replace(/\s+/g, ' ') || '';

const extractString = (record: ApiBeneficiary, key: string) => {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeBeneficiary = (item: ApiBeneficiary): Beneficiary | null => {
  const uuid =
    extractString(item, 'uuid') ||
    extractString(item, 'id') ||
    extractString(item, 'beneficiaryUuid');
  const name = toTitle(extractString(item, 'name'));
  const cpf = normalizeCPF(extractString(item, 'cpf') || extractString(item, 'document'));
  if (!uuid || !cpf) {
    return null;
  }
  return {
    uuid,
    name: name || 'Beneficiário sem nome',
    cpf,
    birthday: normalizeBirthday(extractString(item, 'birthday')),
    email: extractString(item, 'email'),
    phone: normalizeCPF(extractString(item, 'phone')),
    zipCode: normalizeCPF(extractString(item, 'zipCode')),
    address: toTitle(extractString(item, 'address')),
    city: toTitle(extractString(item, 'city')),
    state: extractString(item, 'state')?.toUpperCase() || '',
    paymentType: extractString(item, 'paymentType')?.toUpperCase(),
    serviceType: extractString(item, 'serviceType')?.toUpperCase(),
    holder: normalizeCPF(extractString(item, 'holder')),
    general: extractString(item, 'general'),
    status: extractString(item, 'status')?.toUpperCase(),
  };
};

const extractBeneficiaries = (payload: unknown): ApiBeneficiary[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((item): item is ApiBeneficiary => typeof item === 'object' && item !== null);
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.beneficiaries)) {
      return record.beneficiaries.filter((item): item is ApiBeneficiary => typeof item === 'object' && item !== null);
    }
    if (Array.isArray(record.data)) {
      return record.data.filter((item): item is ApiBeneficiary => typeof item === 'object' && item !== null);
    }
    if (Array.isArray(record.items)) {
      return record.items.filter((item): item is ApiBeneficiary => typeof item === 'object' && item !== null);
    }
  }
  return [];
};

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-100';

type EditForm = Partial<
  Pick<
    Beneficiary,
    | 'name'
    | 'birthday'
    | 'phone'
    | 'email'
    | 'zipCode'
    | 'address'
    | 'city'
    | 'state'
    | 'paymentType'
    | 'serviceType'
    | 'holder'
    | 'general'
  >
>;

const defaultForm: EditForm = {};

export default function AdminBeneficiariosPage() {
  const { token } = useAuthContext();
  const [list, setList] = useState<Beneficiary[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<EditForm>(defaultForm);
  const [showPlanChange, setShowPlanChange] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const selected = useMemo(
    () => list.find((item) => item.uuid === selectedUuid) ?? null,
    [list, selectedUuid],
  );

  const planChangeTarget = useMemo(() => {
    if (!selected) return undefined;
    return { beneficiaryUuid: selected.uuid, cpf: selected.cpf };
  }, [selected]);

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return list;
    }
    const q = search.trim().toLowerCase();
    return list.filter((item) => {
      const name = item.name.toLowerCase();
      const cpf = item.cpf;
      return name.includes(q) || cpf.includes(q.replace(/\D/g, ''));
    });
  }, [list, search]);

  const loadBeneficiaries = async () => {
    try {
      setLoadingList(true);
      setError('');
      const res = await fetch('/api/rapidoc/beneficiaries');
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(
          (payload && (payload.error?.message || payload.message)) ||
            'Falha ao buscar beneficiários',
        );
      }
      const normalized = extractBeneficiaries(payload)
        .map((item) => normalizeBeneficiary(item))
        .filter((item): item is Beneficiary => Boolean(item));
      normalized.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setList(normalized);
      if (normalized.length && !selectedUuid) {
        setSelectedUuid(normalized[0].uuid);
      }
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar os beneficiários.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadBeneficiaries();
  }, []);

  useEffect(() => {
    if (!selected) {
      setForm(defaultForm);
      return;
    }
    setForm({
      name: selected.name,
      birthday: normalizeBirthday(selected.birthday),
      phone: selected.phone || '',
      email: selected.email || '',
      zipCode: selected.zipCode || '',
      address: selected.address || '',
      city: selected.city || '',
      state: selected.state || '',
      paymentType: selected.paymentType || 'S',
      serviceType: selected.serviceType || 'GS',
      holder: selected.holder || '',
      general: selected.general || '',
    });
  }, [selected]);

  const handleSelect = (uuid: string) => {
    setSelectedUuid(uuid);
    setSuccess('');
    setError('');
  };

  const handleChange = (key: keyof EditForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!selected) {
      setError('Selecione um beneficiário para editar.');
      return;
    }
    try {
      setLoadingAction(true);
      setError('');
      setSuccess('');
      const payload = {
        name: form.name?.trim() || selected.name,
        birthday: form.birthday ?? '',
        phone: normalizeCPF(form.phone),
        email: form.email?.trim() || '',
        zipCode: normalizeCPF(form.zipCode),
        address: form.address?.trim() || '',
        city: form.city?.trim() || '',
        state: form.state?.trim().toUpperCase() || '',
        paymentType: form.paymentType?.trim().toUpperCase() || 'S',
        serviceType: form.serviceType?.trim().toUpperCase() || 'GS',
        holder: normalizeCPF(form.holder),
        general: form.general?.trim() || '',
      };
      await axios.put(`/api/rapidoc/beneficiaries/${selected.uuid}`, payload);
      setSuccess('Beneficiário atualizado com sucesso.');
      await loadBeneficiaries();
    } catch (e: any) {
      const message =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Falha ao atualizar beneficiário.';
      setError(typeof message === 'string' ? message : 'Erro desconhecido');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selected) {
      setError('Selecione um beneficiário primeiro.');
      return;
    }
    try {
      setLoadingAction(true);
      setError('');
      setSuccess('');
      await axios.delete(`/api/rapidoc/beneficiaries/${selected.uuid}/inactive`);
      setSuccess('Beneficiário inativado.');
      await loadBeneficiaries();
    } catch (e: any) {
      const message =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Falha ao inativar beneficiário.';
      setError(typeof message === 'string' ? message : 'Erro desconhecido');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReactivate = async () => {
    if (!selected) {
      setError('Selecione um beneficiário primeiro.');
      return;
    }
    try {
      setLoadingAction(true);
      setError('');
      setSuccess('');
      await axios.put(`/api/rapidoc/beneficiaries/${selected.uuid}/reactivate`, {});
      setSuccess('Beneficiário reativado.');
      await loadBeneficiaries();
    } catch (e: any) {
      const message =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Falha ao reativar beneficiário.';
      setError(typeof message === 'string' ? message : 'Erro desconhecido');
    } finally {
      setLoadingAction(false);
    }
  };

  const activeCount = useMemo(
    () =>
      list.filter(
        (item) =>
          (item.status && !item.status.includes('INATIV')) ||
          (!item.status && item.serviceType),
      ).length,
    [list],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Beneficiários Rapidoc</h1>
            <p className="text-sm text-zinc-600">
              Visualize, filtre e edite os beneficiários retornados diretamente pela API Rapidoc.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadBeneficiaries}
              disabled={loadingList}
              className="rounded-full border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              {loadingList ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Total de beneficiários
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{list.length}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Possíveis ativos
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Selecionado
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-800">
              {selected ? `${selected.name} · ${selected.cpf}` : '—'}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Buscar por nome ou CPF
            </label>
            <input
              className={inputClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Digite parte do nome ou CPF"
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-0 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">CPF</th>
                <th className="px-4 py-2">UUID</th>
                <th className="px-4 py-2">Serviço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((item) => {
                const isActive = item.uuid === selectedUuid;
                return (
                  <tr
                    key={item.uuid}
                    onClick={() => handleSelect(item.uuid)}
                    className={`cursor-pointer transition ${
                      isActive
                        ? 'bg-emerald-50/80 hover:bg-emerald-50'
                        : 'hover:bg-zinc-50'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-zinc-700">{item.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{item.cpf}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{item.uuid}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {item.serviceType || '—'}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={4}>
                    {loadingList
                      ? 'Carregando beneficiários...'
                      : 'Nenhum beneficiário encontrado para o filtro informado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Detalhes do beneficiário</h2>
              <p className="text-sm text-zinc-600">
                Edite os dados básicos e sincronize com a Rapidoc imediatamente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-semibold text-emerald-700">
                UUID: {selected.uuid}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-semibold text-emerald-700">
                CPF: {selected.cpf}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {(
              [
                ['name', 'Nome completo'],
                ['birthday', 'Data de nascimento'],
                ['phone', 'Telefone'],
                ['email', 'E-mail'],
                ['zipCode', 'CEP'],
                ['address', 'Endereço'],
                ['city', 'Cidade'],
                ['state', 'UF'],
                ['paymentType', 'Tipo de pagamento (S/A)'],
                ['serviceType', 'Service type'],
                ['holder', 'CPF do titular responsável'],
                ['general', 'Observações'],
              ] as [keyof EditForm, string][]
            ).map(([key, label]) => (
              <label key={key} className="space-y-2 text-sm font-semibold text-zinc-600">
                <span className="block text-xs uppercase tracking-wide text-emerald-600">
                  {label}
                </span>
                <input
                  className={inputClass}
                  value={String(form[key] ?? '')}
                  onChange={(event) => handleChange(key, event.target.value)}
                  placeholder={key === 'birthday' ? 'aaaa-mm-dd' : ''}
                />
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={loadingAction}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {loadingAction ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button
              type="button"
              onClick={() => setShowPlanChange(true)}
              className="rounded-full border border-emerald-200 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Alterar plano
            </button>
            <button
              type="button"
              onClick={() => setShowPaymentDialog(true)}
              className="rounded-full border border-emerald-200 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Alterar forma de pagamento
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              className="rounded-full border border-red-200 px-5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              Inativar
            </button>
            <button
              type="button"
              onClick={handleReactivate}
              className="rounded-full border border-emerald-200 px-5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Reativar
            </button>
          </div>
        </section>
      )}

      {!selected && !loadingList && (
        <section className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-sm text-emerald-700">
          <p>Selecione um beneficiário na tabela para visualizar e editar os detalhes.</p>
        </section>
      )}

      <PlanChangeDialog
        open={showPlanChange && Boolean(selected)}
        onClose={() => setShowPlanChange(false)}
        token={token || null}
        mode="admin"
        target={planChangeTarget}
        onSuccess={() => {
          setShowPlanChange(false);
          void loadBeneficiaries();
        }}
      />
      <PaymentMethodDialog
        open={showPaymentDialog && Boolean(selected)}
        onClose={() => setShowPaymentDialog(false)}
        token={token || null}
        mode="admin"
        target={planChangeTarget}
        onSuccess={() => {
          setShowPaymentDialog(false);
          void loadBeneficiaries();
        }}
      />
    </div>
  );
}
