'use client';

import Link from 'next/link';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanDefinition } from '@/types/plans';
import { formatCurrency } from '@/utils/format';

type UserDoc = {
  name?: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  cpf?: string;
  beneficiaryUuid?: string;
  status?: string;
  serviceType?: string;
  paymentType?: string;
  planName?: string;
};

type MeResponse = {
  ok: boolean;
  user?: UserDoc;
};

type PlanSpecialty = { uuid?: string; name?: string };

type Beneficiary = {
  uuid?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  cpf?: string;
  birthday?: string;
  paymentType?: 'S' | 'A';
  serviceType?: string;
  status?: string;
  specialties?: PlanSpecialty[];
};

type PlanOption = PlanDefinition;

type BeneficiaryForm = {
  name?: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  paymentType?: '' | 'S' | 'A';
};

const serviceTypeLabel = (value?: string) => {
  switch ((value || '').toUpperCase()) {
    case 'G':
      return 'Generalista';
    case 'P':
      return 'Psicologia';
    case 'GP':
      return 'Generalista + Psicologia';
    case 'GS':
      return 'Generalista + Especialistas';
    case 'GSP':
      return 'Generalista + Especialistas + Psicologia';
    default:
      return 'Plano não identificado';
  }
};

export default function PerfilPage() {
  const { token, user } = useAuthContext();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [doc, setDoc] = useState<UserDoc>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [beneficiaryForm, setBeneficiaryForm] = useState<BeneficiaryForm>({});
  const [loadingBeneficiary, setLoadingBeneficiary] = useState(false);
  const [beneficiaryError, setBeneficiaryError] = useState('');

  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState('');

  const [planFeedback, setPlanFeedback] = useState('');
  const [planError, setPlanError] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      try {
        setLoadingProfile(true);
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Falha ao carregar dados do assinante.');
        const data = (await res.json()) as MeResponse;
        if (!active) return;
        setMe(data);
        setDoc({ ...(data?.user || {}) });
      } catch (error: any) {
        if (!active) return;
        setProfileError(error?.message || 'Não foi possível carregar seus dados.');
      } finally {
        if (active) setLoadingProfile(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        setLoadingPlans(true);
        setPlansError('');
        const res = await fetch('/api/rapidoc/planos');
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data as any)?.error || 'Falha ao buscar planos');
        const options = Array.isArray(data) ? (data as PlanOption[]) : [];
        setPlans(options);
      } catch (error: any) {
        setPlansError(error?.message || 'Não foi possível carregar planos.');
      } finally {
        setLoadingPlans(false);
      }
    };
    loadPlans();
  }, []);

  const fetchBeneficiary = useCallback(async () => {
    const beneficiaryUuid = me?.user?.beneficiaryUuid;
    const cpf = me?.user?.cpf;
    if (!beneficiaryUuid && !cpf) {
      setBeneficiary(null);
      return;
    }

    try {
      setLoadingBeneficiary(true);
      setBeneficiaryError('');
      const url = beneficiaryUuid
        ? `/api/rapidoc/beneficiaries/${beneficiaryUuid}`
        : `/api/rapidoc/beneficiaries/cpf/${cpf}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as any)?.message || (data as any)?.error || 'Falha ao carregar beneficiário.');
      setBeneficiary((data || null) as Beneficiary | null);
    } catch (error: any) {
      setBeneficiary(null);
      setBeneficiaryError(error?.message || 'Não foi possível carregar o status do plano.');
    } finally {
      setLoadingBeneficiary(false);
    }
  }, [me?.user?.beneficiaryUuid, me?.user?.cpf]);

  useEffect(() => {
    if (!me) return;
    fetchBeneficiary();
  }, [me, fetchBeneficiary]);

  useEffect(() => {
    if (!beneficiary) return;
    setBeneficiaryForm({
      name: beneficiary.name,
      email: beneficiary.email,
      phone: beneficiary.phone,
      zipCode: beneficiary.zipCode,
      address: beneficiary.address,
      city: beneficiary.city,
      state: beneficiary.state,
      paymentType: beneficiary.paymentType || '',
    });
  }, [beneficiary]);

  useEffect(() => {
    const currentServiceType = (beneficiary?.serviceType || doc?.serviceType || '').trim();
    if (!currentServiceType) return;

    setSelectedPlanId((prev) => {
      if (prev) return prev;
      const match = plans.find((option) => {
        const normalizedId = option.id.trim().toUpperCase();
        const normalizedServiceType = (option.serviceType || option.id).trim().toUpperCase();
        const target = currentServiceType.toUpperCase();
        return normalizedId === target || normalizedServiceType === target;
      });
      if (match) {
        return match.id;
      }
      return currentServiceType.toUpperCase();
    });
  }, [beneficiary?.serviceType, doc?.serviceType, plans]);

  const beneficiaryUuid = useMemo(
    () => beneficiary?.uuid || beneficiary?.id || me?.user?.beneficiaryUuid || '',
    [beneficiary?.uuid, beneficiary?.id, me?.user?.beneficiaryUuid],
  );

  const specialties = useMemo(() => {
    return (beneficiary?.specialties || []).map((item) => item?.name).filter(Boolean) as string[];
  }, [beneficiary?.specialties]);

  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) return null;
    const normalized = selectedPlanId.trim().toUpperCase();
    return (
      plans.find((option) => option.id.trim().toUpperCase() === normalized) ||
      plans.find((option) => (option.serviceType || option.id).trim().toUpperCase() === normalized) ||
      null
    );
  }, [plans, selectedPlanId]);

  const handleBeneficiaryChange = (key: keyof BeneficiaryForm, value: string) => {
    setBeneficiaryForm((prev) => ({ ...prev, [key]: value }));
  };

  const savePlan = async () => {
    if (!beneficiaryUuid) {
      setPlanError('Beneficiário não localizado. Vincule seu CPF ao plano para continuar.');
      return;
    }

    if (!selectedPlanId) {
      setPlanError('Selecione o plano desejado antes de salvar.');
      return;
    }

    const normalizedSelectedId = selectedPlanId.trim().toUpperCase();
    const plan =
      selectedPlan ||
      plans.find((option) => option.id.trim().toUpperCase() === normalizedSelectedId) ||
      plans.find((option) => (option.serviceType || option.id).trim().toUpperCase() === normalizedSelectedId) ||
      null;

    if (!plan) {
      setPlanError('Plano selecionado não encontrado. Escolha uma opção válida.');
      return;
    }

    if (!token) {
      setPlanError('Sessão expirada. Faça login novamente para alterar o plano.');
      return;
    }

    try {
      setPlanSubmitting(true);
      setPlanError('');
      setPlanFeedback('');
      const payload = {
        name: beneficiaryForm.name,
        email: beneficiaryForm.email,
        phone: beneficiaryForm.phone,
        zipCode: beneficiaryForm.zipCode,
        address: beneficiaryForm.address,
        city: beneficiaryForm.city,
        state: beneficiaryForm.state,
        paymentType: beneficiaryForm.paymentType || undefined,
        serviceType: (plan.serviceType || plan.id).trim().toUpperCase() || undefined,
      };
      const res = await fetch(`/api/rapidoc/beneficiaries/${beneficiaryUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as any)?.message || (data as any)?.error || 'Falha ao salvar alterações.');
      const planChangeRes = await fetch('/api/plano/alterar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPlanId: plan.id }),
      });
      const planChangeData = await planChangeRes.json().catch(() => null);
      if (!planChangeRes.ok) {
        throw new Error(
          (planChangeData as any)?.message || (planChangeData as any)?.error || 'Falha ao atualizar o plano e cobranças.',
        );
      }
      setPlanFeedback(
        (planChangeData as any)?.message || 'Plano atualizado com sucesso. As próximas cobranças refletirão o novo valor.',
      );
      await fetchBeneficiary();
      await fetch('/api/me/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          serviceType: (plan.serviceType || plan.id).trim().toUpperCase(),
          paymentType: beneficiaryForm.paymentType,
          planName: plan.name,
          planValue: plan.value,
        }),
      }).catch(() => null);
    } catch (error: any) {
      setPlanError(error?.message || 'Não foi possível atualizar o plano.');
    } finally {
      setPlanSubmitting(false);
    }
  };

  const updateProfile = async () => {
    if (!token) return;
    try {
      setLoadingProfile(true);
      setProfileError('');
      setProfileSuccess('');
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: doc.name,
          email: doc.email,
          phone: doc.phone,
          zipCode: doc.zipCode,
          address: doc.address,
          city: doc.city,
          state: doc.state,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as any)?.error || 'Falha ao salvar dados pessoais.');
      setProfileSuccess('Dados pessoais atualizados com sucesso.');
    } catch (error: any) {
      setProfileError(error?.message || 'Não foi possível salvar suas informações.');
    } finally {
      setLoadingProfile(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (beneficiary?.status) return String(beneficiary.status).toUpperCase();
    if (doc?.status) return String(doc.status).toUpperCase();
    return 'PENDENTE';
  }, [beneficiary?.status, doc?.status]);

  const derivedPlanName = useMemo(() => {
    if (beneficiary?.serviceType) return serviceTypeLabel(beneficiary.serviceType);
    if (doc?.planName) return doc.planName;
    if (doc?.serviceType) return serviceTypeLabel(doc.serviceType);
    return 'Plano não identificado';
  }, [beneficiary?.serviceType, doc?.planName, doc?.serviceType]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Dados pessoais</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Atualize suas informações de contato para receber notificações e confirmações de agendamento sem atrasos.
        </p>

        {profileError && <p className="mt-3 text-sm text-red-600">{profileError}</p>}
        {profileSuccess && <p className="mt-3 text-sm text-emerald-700">{profileSuccess}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['name', 'Nome'],
              ['email', 'E-mail'],
              ['phone', 'Telefone'],
              ['zipCode', 'CEP'],
              ['address', 'Endereço'],
              ['city', 'Cidade'],
              ['state', 'UF'],
            ] as [keyof UserDoc, string][]
          ).map(([key, label]) => (
            <div key={key} className="space-y-2 rounded-2xl border border-white/70 bg-white/80 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{label}</label>
              <input
                className="input"
                value={String(doc[key] || '')}
                onChange={(e) => setDoc((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">CPF cadastrado</p>
            <p className="mt-1 font-mono text-sm text-zinc-700">{doc.cpf || '—'}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Beneficiário Rapidoc</p>
            <p className="mt-1 font-mono text-sm text-zinc-700">{beneficiaryUuid || '—'}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">E-mail do login</p>
            <p className="mt-1 font-mono text-sm text-zinc-700">{user?.email || '—'}</p>
          </div>
        </div>

        <button
          onClick={updateProfile}
          disabled={loadingProfile}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {loadingProfile ? 'Salvando…' : 'Salvar dados pessoais'}
        </button>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Plano e status Rapidoc</h2>
            <p className="text-sm text-zinc-600">
              Consulte seu plano diretamente na Rapidoc, ajuste especialidades e mantenha o cadastro sincronizado.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span>Status</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] tracking-wide text-emerald-600">
              {loadingBeneficiary ? 'Carregando…' : statusLabel}
            </span>
          </div>
        </div>

        {beneficiaryError && <p className="mt-3 text-sm text-red-600">{beneficiaryError}</p>}
        {planError && <p className="mt-3 text-sm text-red-600">{planError}</p>}
        {planFeedback && <p className="mt-3 text-sm text-emerald-700">{planFeedback}</p>}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-zinc-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Plano atual</p>
            <p className="text-lg font-semibold text-zinc-900">{derivedPlanName}</p>
            <div className="grid gap-2 text-xs text-zinc-500">
              <p>
                <span className="font-semibold text-emerald-700">ServiceType:</span>{' '}
                <span>{beneficiary?.serviceType || doc?.serviceType || '—'}</span>
              </p>
              <p>
                <span className="font-semibold text-emerald-700">Forma de pagamento:</span>{' '}
                <span>{beneficiary?.paymentType || doc?.paymentType || '—'}</span>
              </p>
              <p>
                <span className="font-semibold text-emerald-700">CPF consultado:</span>{' '}
                <span>{beneficiary?.cpf || doc?.cpf || '—'}</span>
              </p>
              <p>
                <span className="font-semibold text-emerald-700">Nascimento:</span>{' '}
                <span>{beneficiary?.birthday || '—'}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Especialidades liberadas</p>
              {specialties.length ? (
                <ul className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-emerald-700">
                  {specialties.map((name) => (
                    <li key={name} className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Nenhuma especialidade informada pela Rapidoc.</p>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Atualizar cadastro Rapidoc</p>
            <div className="grid gap-3">
              {(
                [
                  ['name', 'Nome completo'],
                  ['email', 'E-mail de contato'],
                  ['phone', 'Telefone'],
                  ['zipCode', 'CEP'],
                  ['address', 'Endereço'],
                  ['city', 'Cidade'],
                  ['state', 'UF'],
                ] as [keyof BeneficiaryForm, string][]
              ).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs font-semibold text-emerald-600">
                  <span className="block uppercase tracking-wide">{label}</span>
                  <input
                    className="input"
                    value={String(beneficiaryForm[key] || '')}
                    onChange={(e) => handleBeneficiaryChange(key, e.target.value)}
                  />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-emerald-600">
                <label className="space-y-1">
                  <span className="block uppercase tracking-wide">Pagamento</span>
                  <select
                    className="select"
                    value={beneficiaryForm.paymentType || ''}
                    onChange={(e) => handleBeneficiaryChange('paymentType', e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    <option value="S">S (assinatura)</option>
                    <option value="A">A (avulso)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block uppercase tracking-wide">Plano Rapidoc</span>
                  <select
                    className="select"
                    value={selectedPlan?.id || selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    disabled={!plans.length}
                  >
                    <option value="">Selecione…</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} • {formatCurrency(plan.value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {selectedPlan && (
                <p className="text-[11px] font-semibold text-emerald-700">
                  Plano selecionado: {selectedPlan.name} ({(selectedPlan.serviceType || selectedPlan.id).toUpperCase()}) •{' '}
                  {formatCurrency(selectedPlan.value)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={savePlan}
                disabled={planSubmitting || loadingBeneficiary}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {planSubmitting ? 'Salvando…' : 'Salvar alterações Rapidoc'}
              </button>
              <Link
                href="/assinante/perfil/cancelar"
                className="inline-flex items-center justify-center rounded-full border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
              >
                Solicitar cancelamento do plano
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold text-emerald-700">Sugestões de planos</p>
          {loadingPlans && <p className="text-sm text-zinc-500">Carregando planos…</p>}
          {plansError && <p className="text-sm text-red-600">{plansError}</p>}
          {!loadingPlans && !plans.length && !plansError && (
            <p className="text-sm text-zinc-500">Nenhum plano foi retornado pela Rapidoc.</p>
          )}
          {!!plans.length && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setSelectedPlanId(option.id);
                  }}
                  className={`rounded-2xl border p-3 text-left text-sm transition hover:border-emerald-200 hover:bg-emerald-50/70 ${
                    (selectedPlan?.id || selectedPlanId)?.toUpperCase() === option.id.toUpperCase()
                      ? 'border-emerald-300 bg-emerald-50/80 text-emerald-800'
                      : 'border-white/80 bg-white/80 text-zinc-700'
                  }`}
                >
                  <span className="block font-semibold text-emerald-700">{option.name}</span>
                  <span className="text-xs text-zinc-500">
                    {(option.serviceType || option.id).toUpperCase()} • {formatCurrency(option.value)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
