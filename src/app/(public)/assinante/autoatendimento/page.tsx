'use client';

import axios from 'axios';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';

type MeResponse = {
  ok: boolean;
  user?: { cpf?: string; beneficiaryUuid?: string; name?: string; email?: string };
};

type Beneficiary = {
  uuid?: string;
  id?: string;
  name?: string;
  cpf?: string;
  birthday?: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  paymentType?: 'S' | 'A';
  serviceType?: 'G' | 'P' | 'GP' | 'GS' | 'GSP';
  status?: string;
};

type PlanOption = {
  plan: { uuid: string; name: string; serviceType: string };
  paymentType: 'S' | 'A';
  specialties?: { name: string; uuid: string }[];
};

type Appointment = { uuid?: string; id?: string; status?: string; specialty?: any; detail?: any };

export default function AutoatendimentoPage() {
  const { token } = useAuthContext();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [error, setError] = useState('');

  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [loadingBeneficiary, setLoadingBeneficiary] = useState(false);

  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState('');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState('');

  const [referrals, setReferrals] = useState<any[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [referralsError, setReferralsError] = useState('');

  const beneficiaryUuid = useMemo(() => {
    return (
      (beneficiary?.uuid || beneficiary?.id) ||
      (me?.user?.beneficiaryUuid || '')
    );
  }, [beneficiary?.uuid, beneficiary?.id, me?.user?.beneficiaryUuid]);

  useEffect(() => {
    const loadMe = async () => {
      if (!token) return;
      try {
        setLoadingMe(true);
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Falha ao carregar dados do assinante');
        const json = (await res.json()) as MeResponse;
        setMe(json);
      } catch (e: any) {
        setError(e?.message || 'Erro ao buscar perfil');
      } finally {
        setLoadingMe(false);
      }
    };
    loadMe();
  }, [token]);

  // Beneficiary load by uuid or cpf
  useEffect(() => {
    const loadBeneficiary = async () => {
      if (!me) return;
      try {
        setLoadingBeneficiary(true);
        setError('');
        let data: any = null;
        const uuid = me?.user?.beneficiaryUuid || '';
        if (uuid) {
          const res = await axios.get(`/api/rapidoc/beneficiaries/${uuid}`);
          data = res.data;
        } else {
          const cpf = me?.user?.cpf || '';
          if (cpf) {
            const res = await axios.get(`/api/rapidoc/beneficiaries/cpf/${cpf}`);
            data = res.data;
          }
        }
        if (data && typeof data === 'object') {
          setBeneficiary(data);
        }
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Erro ao carregar beneficiário');
      } finally {
        setLoadingBeneficiary(false);
      }
    };
    loadBeneficiary();
  }, [me]);

  // Plans
  useEffect(() => {
    const loadPlans = async () => {
      try {
        setLoadingPlans(true);
        setPlansError('');
        const { data } = await axios.get<PlanOption[]>('/api/rapidoc/planos');
        setPlans(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setPlansError(e?.response?.data?.error || e?.message || 'Erro ao buscar planos');
      } finally {
        setLoadingPlans(false);
      }
    };
    loadPlans();
  }, []);

  // Appointments
  const refreshAppointments = async () => {
    if (!beneficiaryUuid) return;
    try {
      setLoadingAppointments(true);
      setAppointmentsError('');
      const { data } = await axios.get(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/appointments`);
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setAppointments(rows);
    } catch (e: any) {
      setAppointments([]);
      setAppointmentsError(e?.response?.data?.message || e?.message || 'Erro ao listar consultas');
    } finally {
      setLoadingAppointments(false);
    }
  };
  useEffect(() => { refreshAppointments(); }, [beneficiaryUuid]);

  // Referrals
  const refreshReferrals = async () => {
    if (!beneficiaryUuid) return;
    try {
      setLoadingReferrals(true);
      setReferralsError('');
      const { data } = await axios.get(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/referrals`);
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setReferrals(rows);
    } catch (e: any) {
      setReferrals([]);
      setReferralsError(e?.response?.data?.message || e?.message || 'Erro ao listar encaminhamentos');
    } finally {
      setLoadingReferrals(false);
    }
  };
  useEffect(() => { refreshReferrals(); }, [beneficiaryUuid]);

  const [form, setForm] = useState<Beneficiary>({});
  useEffect(() => {
    if (!beneficiary) return;
    const patch: Beneficiary = {
      uuid: beneficiary.uuid || beneficiary.id,
      name: beneficiary.name,
      cpf: beneficiary.cpf,
      birthday: beneficiary.birthday,
      email: beneficiary.email,
      phone: beneficiary.phone,
      zipCode: beneficiary.zipCode,
      address: beneficiary.address,
      city: beneficiary.city,
      state: beneficiary.state,
      paymentType: beneficiary.paymentType as any,
      serviceType: beneficiary.serviceType as any,
    };
    setForm(patch);
  }, [beneficiary]);

  const onChange = (key: keyof Beneficiary, value: string) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const saveProfile = async () => {
    if (!beneficiaryUuid) return;
    try {
      setError('');
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        zipCode: form.zipCode,
        address: form.address,
        city: form.city,
        state: form.state,
        paymentType: form.paymentType,
        serviceType: form.serviceType,
      };
      const { data } = await axios.put(`/api/rapidoc/beneficiaries/${beneficiaryUuid}`, payload);
      setBeneficiary({ ...beneficiary, ...(data || {}) });
      // Sincroniza planName/serviceType no usuário local para refletir no resumo do plano e agendamento
      try {
        if (token) {
          await fetch('/api/me/plan', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ serviceType: form.serviceType, paymentType: form.paymentType }),
          });
        }
      } catch {}
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Falha ao atualizar dados');
    }
  };

  const inactivate = async () => {
    if (!beneficiaryUuid) return;
    try {
      setError('');
      await axios.delete(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/inactive`);
      await refreshAppointments();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Falha ao inativar beneficiário');
    }
  };

  const reactivate = async () => {
    if (!beneficiaryUuid) return;
    try {
      setError('');
      await axios.put(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/reactivate`, {});
      await refreshAppointments();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Falha ao reativar beneficiário');
    }
  };

  const cancelAppointment = async (uuid: string) => {
    try {
      setError('');
      await axios.delete(`/api/rapidoc/agendamentos/${uuid}`);
      await refreshAppointments();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Falha ao cancelar agendamento');
    }
  };

  const planOptions = useMemo(() => plans, [plans]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Perfil e plano</h2>
        <p className="mt-1 text-sm text-zinc-600">Visualize e atualize seus dados pessoais e o plano contratado.</p>

        {(loadingMe || loadingBeneficiary) && <p className="mt-3 text-sm text-zinc-500">Carregando informações…</p>}
        {error && <p className="mt-3 text-sm text-red-600">{String(error)}</p>}

        {beneficiary && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="label">Nome</label>
              <input className="input" value={form.name || ''} onChange={(e) => onChange('name', e.target.value)} />
              <label className="label">E-mail</label>
              <input className="input" value={form.email || ''} onChange={(e) => onChange('email', e.target.value)} />
              <label className="label">Telefone</label>
              <input className="input" value={form.phone || ''} onChange={(e) => onChange('phone', e.target.value)} />
              <label className="label">CPF</label>
              <input className="input" value={beneficiary.cpf || ''} readOnly />
              <label className="label">Nascimento</label>
              <input className="input" value={beneficiary.birthday || ''} readOnly />
            </div>
            <div className="space-y-2">
              <label className="label">CEP</label>
              <input className="input" value={form.zipCode || ''} onChange={(e) => onChange('zipCode', e.target.value)} />
              <label className="label">Endereço</label>
              <input className="input" value={form.address || ''} onChange={(e) => onChange('address', e.target.value)} />
              <label className="label">Cidade</label>
              <input className="input" value={form.city || ''} onChange={(e) => onChange('city', e.target.value)} />
              <label className="label">Estado</label>
              <input className="input" value={form.state || ''} onChange={(e) => onChange('state', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">paymentType</label>
                  <select className="select" value={form.paymentType || ''} onChange={(e) => onChange('paymentType', e.target.value)}>
                    <option value="">Selecione…</option>
                    <option value="S">S (recorrente)</option>
                    <option value="A">A (consulta)</option>
                  </select>
                </div>
                <div>
                  <label className="label">serviceType</label>
                  <select className="select" value={form.serviceType || ''} onChange={(e) => onChange('serviceType', e.target.value)}>
                    <option value="">Selecione…</option>
                    <option value="G">G (clínico)</option>
                    <option value="P">P (psicologia)</option>
                    <option value="GP">GP (clínico + psicologia)</option>
                    <option value="GS">GS (clínico + especialista)</option>
                    <option value="GSP">GSP (clínico + especialista + psicologia)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button onClick={saveProfile} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Salvar alterações</button>
              <button onClick={inactivate} className="rounded-full border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">Inativar conta</button>
              <button onClick={reactivate} className="rounded-full border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Reativar conta</button>
            </div>
          </div>
        )}

        <div className="mt-6">
          <p className="text-sm font-semibold text-emerald-700">Mudar de plano</p>
          {loadingPlans && <p className="text-sm text-zinc-500">Carregando planos…</p>}
          {plansError && <p className="text-sm text-red-600">{String(plansError)}</p>}
          {!!planOptions.length && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {planOptions.map((opt) => (
                <button
                  key={opt.plan.uuid}
                  onClick={() => {
                    onChange('serviceType', String(opt.plan.serviceType).toUpperCase());
                    onChange('paymentType', opt.paymentType);
                  }}
                  className="rounded-2xl border border-white/80 bg-white/80 p-3 text-left text-sm text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50/70"
                >
                  <span className="block font-semibold text-emerald-700">{opt.plan.name}</span>
                  <span className="text-xs text-zinc-500">{opt.plan.serviceType} • {opt.paymentType}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Encaminhamentos</h2>
            <p className="text-sm text-zinc-600">Listagem dos encaminhamentos emitidos para este beneficiário.</p>
          </div>
          <button onClick={refreshReferrals} className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline">Atualizar</button>
        </div>
        {loadingReferrals && <p className="mt-3 text-sm text-zinc-500">Carregando…</p>}
        {referralsError && <p className="mt-3 text-sm text-red-600">{String(referralsError)}</p>}
        {!!referrals.length && (
          <ul className="mt-4 grid gap-2">
            {referrals.map((ref: any, idx) => (
              <li key={ref.uuid || ref.id || idx} className="rounded-2xl border border-white/70 bg-white/90 p-4 text-sm text-zinc-700">
                <span className="block font-semibold text-emerald-700">{ref?.specialty?.name || 'Encaminhamento'}</span>
                <span className="text-xs text-zinc-500">{ref?.status || ''}</span>
              </li>
            ))}
          </ul>
        )}
        {!loadingReferrals && !referrals.length && <p className="mt-3 text-sm text-zinc-500">Nenhum encaminhamento.</p>}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Consultas agendadas</h2>
            <p className="text-sm text-zinc-600">Visualize e cancele consultas quando necessário.</p>
          </div>
          <button onClick={refreshAppointments} className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline">Atualizar</button>
        </div>
        {loadingAppointments && <p className="mt-3 text-sm text-zinc-500">Carregando…</p>}
        {appointmentsError && <p className="mt-3 text-sm text-red-600">{String(appointmentsError)}</p>}
        {!!appointments.length && (
          <ul className="mt-4 grid gap-2">
            {appointments.map((appt: any) => {
              const id = appt.uuid || appt.id;
              return (
                <li key={id} className="rounded-2xl border border-white/70 bg-white/90 p-4 text-sm text-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="block font-semibold text-emerald-700">{appt?.specialty?.name || 'Consulta'}</span>
                      <span className="text-xs text-zinc-500">{String(appt?.status || '').toUpperCase()}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => cancelAppointment(String(id))} className="rounded-full border border-rose-600 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Cancelar</button>
                      <Link href={`/admin/agendamentos`} className="rounded-full border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Detalhes</Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!loadingAppointments && !appointments.length && <p className="mt-3 text-sm text-zinc-500">Nenhuma consulta encontrada.</p>}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Agendar e atendimento imediato</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Para agendamentos com regras de encaminhamento e disponibilidade por especialidade, utilize a interface dedicada.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/assinante/agendamentos" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Agendar consulta</Link>
          <Link href="/assinante/imediato" className="rounded-full border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Atendimento imediato (Clínico Geral)</Link>
        </div>
      </section>
    </div>
  );
}
