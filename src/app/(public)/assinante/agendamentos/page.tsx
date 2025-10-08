'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';

type Specialty = { id?: string; uuid?: string; name?: string; [key: string]: unknown };
type Availability = Record<string, unknown>;
type AppointmentResp = { uuid?: string; id?: string; [key: string]: unknown };

type SlotOption = {
  id: string;
  label: string;
  raw?: Record<string, unknown>;
};

type SelectedSlotSummary = {
  label: string;
  raw?: Record<string, unknown>;
};

type ReferralOption = {
  id: string;
  label: string;
  specialtyId?: string;
  specialtyName?: string;
  expiresAt?: string;
  raw?: Record<string, unknown>;
};

type ReferralSummary = {
  label: string;
  raw?: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const stringFrom = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const formatDateLabel = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    try {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const parseReferrals = (raw: unknown): ReferralOption[] => {
  const containers: Record<string, unknown>[] = [];
  const queue: unknown[] = [raw];
  const keysToExplore = ['data', 'referrals', 'items', 'results'];

  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    let forwarded = false;
    keysToExplore.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        queue.push(record[key]);
        forwarded = true;
      }
    });

    if (!forwarded) {
      containers.push(record);
    }
  }

  if (!containers.length) {
    return [];
  }

  return containers
    .map((item, index) => {
      const specialty = asRecord(item.specialty);
      const id =
        stringFrom(item.uuid) ||
        stringFrom(item.id) ||
        stringFrom(item.referralUuid) ||
        stringFrom(item.referralId) ||
        (specialty && stringFrom(specialty.referralUuid)) ||
        undefined;
      if (!id) return null;

      const specialtyId =
        stringFrom(item.specialtyUuid) ||
        stringFrom(item.specialtyId) ||
        (specialty && (stringFrom(specialty.uuid) || stringFrom(specialty.id))) ||
        undefined;

      const specialtyName =
        stringFrom(item.specialtyName) ||
        (specialty && (stringFrom(specialty.name) || stringFrom(specialty.description))) ||
        undefined;

      const status = stringFrom(item.status) || stringFrom(item.situation);
      const expiresAt =
        stringFrom(item.expiresAt) ||
        stringFrom(item.expirationDate) ||
        stringFrom(item.validUntil) ||
        undefined;

      const formattedExpiry = formatDateLabel(expiresAt);

      const labelParts = [
        specialtyName || 'Encaminhamento',
        status ? `Status: ${status}` : null,
        formattedExpiry ? `Validade: ${formattedExpiry}` : null,
      ].filter(Boolean) as string[];

      const label = labelParts.length ? labelParts.join(' • ') : `Encaminhamento ${index + 1}`;

      return {
        id,
        label,
        specialtyId,
        specialtyName,
        expiresAt,
        raw: item,
      } as ReferralOption;
    })
    .filter(Boolean) as ReferralOption[];
};

const extractPlanInfo = (user: unknown): { planName: string; isPlus: boolean } => {
  const record = asRecord(user);
  if (!record) return { planName: '', isPlus: false };
  const candidates = [
    stringFrom(record.planName),
    stringFrom(record.plan),
    stringFrom(record.planType),
    stringFrom(record.planTier),
    stringFrom(record.planCategory),
    stringFrom(record.productName),
    stringFrom(record.product),
    stringFrom(record.planSlug),
  ].filter(Boolean) as string[];
  let planName = candidates[0] || '';
  if (!planName) {
    const st = (stringFrom(record.serviceType) || '').toUpperCase();
    planName =
      st === 'G'
        ? 'Generalista'
        : st === 'P'
        ? 'Psicologia'
        : st === 'GP'
        ? 'Generalista + Psicologia'
        : st === 'GS'
        ? 'Generalista + Especialistas'
        : st === 'GSP'
        ? 'Generalista + Especialistas + Psicologia'
        : '';
  }
  const isPlus = candidates.some((value) => value.toLowerCase().includes('plus'));
  return { planName, isPlus };
};

export default function AssinanteAgendamentosPage() {
  const { token } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [specId, setSpecId] = useState('');
  const [disp, setDisp] = useState<Availability[]>([]);
  const [slotId, setSlotId] = useState('');
  const [beneficiaryUuid, setBeneficiaryUuid] = useState('');
  const [patients, setPatients] = useState<{ uuid: string; label: string }[]>([]);
  const [planName, setPlanName] = useState('');
  const [hasPlusPlan, setHasPlusPlan] = useState(false);
  const [dateInitial, setDateInitial] = useState<string>('');
  const [dateFinal, setDateFinal] = useState<string>('');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [referrals, setReferrals] = useState<ReferralOption[]>([]);
  const [selectedReferralId, setSelectedReferralId] = useState('');
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [referralsError, setReferralsError] = useState('');

  useEffect(() => {
    const loadSpecs = async () => {
      try {
        setError('');
        const { data } = await axios.get('/api/rapidoc/especialidades');
        setSpecs(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(
          e?.response?.data?.backend?.message ||
            e?.response?.data?.message ||
            e?.message ||
            'Erro ao listar especialidades',
        );
      }
    };

    loadSpecs();
  }, []);

  useEffect(() => {
    const loadPatients = async () => {
      if (!token) {
        setPatients([]);
        setBeneficiaryUuid('');
        setPlanName('');
        setHasPlusPlan(false);
        return;
      }
      try {
        const [meRes, depRes] = await Promise.all([
          axios.get('/api/me', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const opts: { uuid: string; label: string }[] = [];
        const me = meRes?.data?.user || {};
        const planInfo = extractPlanInfo(meRes?.data?.user);
        setPlanName(planInfo.planName);
        setHasPlusPlan(planInfo.isPlus);
        if (me?.beneficiaryUuid) {
          opts.push({ uuid: String(me.beneficiaryUuid), label: me?.name ? `${me.name} (Titular)` : 'Titular' });
        }
        const deps = Array.isArray(depRes?.data?.dependents) ? depRes.data.dependents : [];
        deps.forEach((d: any) => {
          if (d?.uuid)
            opts.push({ uuid: String(d.uuid), label: d?.name ? String(d.name) : `Dependente ${String(d.uuid).slice(0, 6)}…` });
        });
        setPatients(opts);
        if (opts.length) setBeneficiaryUuid(opts[0].uuid);

        // Refina o nome do plano a partir do serviceType atual da Rapidoc do titular, se disponível
        const primaryUuid = me?.beneficiaryUuid ? String(me.beneficiaryUuid) : '';
        if (primaryUuid) {
          try {
            const { data: b } = await axios.get(`/api/rapidoc/beneficiaries/${primaryUuid}`);
            const st = String(b?.serviceType || '').toUpperCase();
            const derived =
              st === 'G'
                ? 'Generalista'
                : st === 'P'
                ? 'Psicologia'
                : st === 'GP'
                ? 'Generalista + Psicologia'
                : st === 'GS'
                ? 'Generalista + Especialistas'
                : st === 'GSP'
                ? 'Generalista + Especialistas + Psicologia'
                : '';
            if (derived) setPlanName(derived);
          } catch {}
        }
      } catch {
        setPlanName('');
        setHasPlusPlan(false);
      }
    };
    loadPatients();
  }, [token]);

  const onSelectSpec = async (id: string) => {
    setSpecId(id);
    setSlotId('');
    setDisp([]);
    setResult(null);
    setError('');
    setSelectedReferralId('');

    if (!id) {
      return;
    }

    try {
      const fmt = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      };
      const today = new Date();
      const next = new Date();
      next.setDate(today.getDate() + 7);
      const di = dateInitial || fmt(today);
      const df = dateFinal || fmt(next);
      const { data } = await axios.get('/api/rapidoc/disponibilidade', {
        params: {
          specialtyId: id,
          beneficiaryUuid: beneficiaryUuid || undefined,
          dateInitial: di,
          dateFinal: df,
        },
      });

      if (Array.isArray(data)) {
        setDisp(data as Availability[]);
      } else if (Array.isArray(data?.data)) {
        setDisp(data.data as Availability[]);
      } else {
        setDisp([]);
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          e?.response?.data?.backend?.message ||
          e?.message ||
          'Erro ao listar disponibilidade',
      );
    }
  };

  useEffect(() => {
    if (specId) {
      onSelectSpec(specId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beneficiaryUuid, dateInitial, dateFinal]);

  useEffect(() => {
    if (!beneficiaryUuid) {
      setReferrals([]);
      setSelectedReferralId('');
      setReferralsError('');
      return;
    }

    let active = true;
    const loadReferrals = async () => {
      try {
        setLoadingReferrals(true);
        setReferralsError('');
        const { data } = await axios.get(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/referrals`);
        if (!active) return;
        const items = parseReferrals(data);
        setReferrals(items);
      } catch (e: any) {
        if (!active) return;
        setReferrals([]);
        setReferralsError(
          e?.response?.data?.message ||
            e?.response?.data?.error ||
            e?.message ||
            'Falha ao carregar encaminhamentos do beneficiário.',
        );
      } finally {
        if (active) {
          setLoadingReferrals(false);
        }
      }
    };

    setSelectedReferralId('');
    loadReferrals();

    return () => {
      active = false;
    };
  }, [beneficiaryUuid]);

  const computeSlotId = (entry: any): string | undefined => {
    if (!entry) {
      return undefined;
    }

    return entry.id ?? entry.uuid ?? entry.slotId ?? entry.code;
  };

  const currentSpec = useMemo<Specialty | null>(() => {
    if (!specId) return null;
    return (
      specs.find((spec, index) => {
        const id = spec.id ?? spec.uuid ?? (spec as any)?.code ?? index;
        return String(id) === String(specId);
      }) || null
    );
  }, [specId, specs]);

  const currentSpecName = currentSpec?.name ? String(currentSpec.name) : '';
  const normalizedSpecName = currentSpecName.toLowerCase();
  const isPsychology = normalizedSpecName.includes('psic');
  const isNutrition = normalizedSpecName.includes('nutri');
  const isPsychOrNutrition = isPsychology || isNutrition;
  const isGeneralist =
    normalizedSpecName.includes('generalista') ||
    (normalizedSpecName.includes('clín') && normalizedSpecName.includes('geral')) ||
    (normalizedSpecName.includes('clin') && normalizedSpecName.includes('geral'));
  const requiresReferral = Boolean(specId) && !isPsychOrNutrition;

  const referralOptions = useMemo<ReferralOption[]>(() => {
    if (!referrals.length) return [];
    if (!specId) return referrals;
    const matches: ReferralOption[] = [];
    const others: ReferralOption[] = [];
    referrals.forEach((ref) => {
      const refIdMatches = ref.specialtyId ? String(ref.specialtyId) === String(specId) : false;
      const refName = ref.specialtyName ? ref.specialtyName.toLowerCase() : '';
      const nameMatches =
        normalizedSpecName && refName
          ? refName.includes(normalizedSpecName) || normalizedSpecName.includes(refName)
          : false;
      if (refIdMatches || nameMatches) {
        matches.push(ref);
      } else {
        others.push(ref);
      }
    });
    return [...matches, ...others];
  }, [referrals, specId, normalizedSpecName]);

  useEffect(() => {
    if (!selectedReferralId) return;
    if (referralOptions.some((ref) => ref.id === selectedReferralId)) return;
    setSelectedReferralId('');
  }, [selectedReferralId, referralOptions]);

  useEffect(() => {
    if (!requiresReferral) return;
    if (selectedReferralId) return;
    if (!referralOptions.length) return;
    setSelectedReferralId(referralOptions[0].id);
  }, [requiresReferral, referralOptions, selectedReferralId]);

  const selectedReferral = useMemo<ReferralOption | null>(() => {
    if (!selectedReferralId) return null;
    return referrals.find((ref) => ref.id === selectedReferralId) || null;
  }, [selectedReferralId, referrals]);

  const selectedReferralSummary = useMemo<ReferralSummary | null>(() => {
    if (!selectedReferral) return null;
    const expiry = selectedReferral.expiresAt ? formatDateLabel(selectedReferral.expiresAt) : null;
    const parts = [selectedReferral.label];
    if (expiry && !selectedReferral.label.toLowerCase().includes(String(expiry).toLowerCase())) {
      parts.push(`Validade: ${expiry}`);
    }
    return { label: parts.join(' • '), raw: selectedReferral.raw };
  }, [selectedReferral]);

  const canConfirm = Boolean(
    beneficiaryUuid &&
      specId &&
      slotId &&
      (!requiresReferral || (!!selectedReferral && selectedReferral.id)),
  );

  const allSlots = useMemo<SlotOption[]>(() => {
    const rows: SlotOption[] = [];

    (disp as any[]).forEach((item) => {
      if (!item) {
        return;
      }

      const maybeArray = Array.isArray(item?.slots)
        ? item.slots
        : Array.isArray(item)
        ? item
        : [];

      (maybeArray as any[]).forEach((slot, index) => {
        const id = computeSlotId(slot);
        if (!id) {
          return;
        }

        const date = slot?.date || slot?.day || (item as any)?.date;
        const from = slot?.from || slot?.start || slot?.time;
        const to = slot?.to || slot?.end;
        const base = [date, from && to ? `${from}-${to}` : from].filter(Boolean).join(' ');
        const label = base || slot?.label || `Slot ${index + 1}`;
        rows.push({ id: String(id), label: String(label), raw: slot as Record<string, unknown> });
      });
    });

    return rows;
  }, [disp]);

  const selectedSlotSummary = useMemo<SelectedSlotSummary | null>(() => {
    if (!slotId) return null;
    const option = allSlots.find((slot) => slot.id === slotId);
    if (!option) return null;
    return { label: option.label, raw: option.raw };
  }, [slotId, allSlots]);

  const createAppointment = async () => {
    if (!beneficiaryUuid || !specId || !slotId) {
      setError('Preencha beneficiário, especialidade e horário.');
      return;
    }

    if (requiresReferral && !selectedReferral) {
      setError('Selecione um encaminhamento válido para esta especialidade.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setResult(null);

      const payload: Record<string, unknown> = {
        beneficiaryUuid,
        specialtyId: specId,
        slotId,
      };

      if (selectedReferral) {
        const rawReferral = asRecord(selectedReferral.raw) || {};
        const referralUuid =
          stringFrom(rawReferral['uuid']) ||
          stringFrom(rawReferral['id']) ||
          stringFrom(rawReferral['referralUuid']) ||
          stringFrom(rawReferral['referralId']) ||
          selectedReferral.id;
        const referralId = stringFrom(rawReferral['id']) || selectedReferral.id;
        payload.referralUuid = referralUuid;
        payload.referralId = referralId;
      }

      const { data } = await axios.post<AppointmentResp>('/api/rapidoc/agendamentos', payload);

      setResult(data);
    } catch (e: any) {
      setError(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.message ||
          'Erro ao agendar',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Monte seu atendimento</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Escolha quem será atendido, ajuste o período desejado e confirme a especialidade. A disponibilidade vem diretamente
          da Rapidoc.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-white/70 bg-white/80 p-4">
            <div>
              <label className="label">Atendimento para</label>
              <select className="select" value={beneficiaryUuid} onChange={(e) => setBeneficiaryUuid(e.target.value)}>
                {!patients.length && <option value="">Nenhum beneficiário encontrado</option>}
                {patients.map((p) => (
                  <option key={p.uuid} value={p.uuid}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500">
                Plano atual:{' '}
                <span className="font-medium text-emerald-700">{planName || 'Não identificado'}</span>
              </p>
              {!patients.length && (
                <p className="mt-1 text-xs text-zinc-500">
                  Cadastre seu titular ou dependente em <strong>Dependentes</strong> antes de seguir com o agendamento.
                </p>
              )}
            </div>

            <div>
              <label className="label">Período da busca</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  placeholder="dd/mm/aaaa"
                  value={dateInitial}
                  onChange={(e) => setDateInitial(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="dd/mm/aaaa"
                  value={dateFinal}
                  onChange={(e) => setDateFinal(e.target.value)}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setDateInitial('');
                    setDateFinal('');
                  }}
                  className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:bg-emerald-50"
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const n = new Date();
                    n.setDate(d.getDate() + 14);
                    const fmt = (dt: Date) =>
                      `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
                    setDateInitial(fmt(d));
                    setDateFinal(fmt(n));
                  }}
                  className="rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 transition hover:bg-emerald-50"
                >
                  Próximas 2 semanas
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/70 bg-white/80 p-4">
            <div>
              <label className="label">Especialidade</label>
              <select className="select" value={specId} onChange={(event) => onSelectSpec(event.target.value)}>
                <option value="">Selecione…</option>
                {specs.map((spec, index) => {
                  const id = spec.id || spec.uuid || String(index);
                  return (
                    <option key={String(id)} value={String(id)}>
                      {spec.name || `Especialidade ${id}`}
                    </option>
                  );
                })}
              </select>
              <p className="mt-2 text-xs text-zinc-600">
                Todas as especialidades exigem encaminhamento emitido por um clinico geral, exceto Psicologia e Nutricao.
              </p>

            </div>

            <div>
              <label className="label">Encaminhamento</label>
              {loadingReferrals ? (
                <p className="text-sm text-zinc-500">Carregando encaminhamentos…</p>
              ) : referralOptions.length ? (
                <>
                  <select
                    className="select"
                    value={selectedReferralId}
                    onChange={(event) => setSelectedReferralId(event.target.value)}
                  >
                    <option value="">
                      {requiresReferral ? 'Selecione um encaminhamento…' : 'Opcional: sem encaminhamento'}
                    </option>
                    {referralOptions.map((referral) => (
                      <option key={referral.id} value={referral.id}>
                        {referral.label}
                      </option>
                    ))}
                  </select>
                  {requiresReferral && !selectedReferralId && (
                    <p className="mt-2 text-xs text-amber-600">
                      Vincule o encaminhamento correspondente para liberar o agendamento de{' '}
                      {currentSpecName || 'especialidade'}.
                    </p>
                  )}
                  {selectedReferralSummary && selectedReferralId && (
                    <p className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-2 text-xs text-emerald-700">
                      <strong className="block text-[11px] uppercase tracking-wide">Encaminhamento selecionado</strong>
                      {selectedReferralSummary.label}
                    </p>
                  )}
                </>
              ) : requiresReferral ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-700">
                  Solicite uma avaliação com o clínico geral para liberar {currentSpecName || 'a especialidade selecionada'}.
                  Assim que o encaminhamento for emitido, ele aparecerá aqui automaticamente.
                </p>
              ) : (
                <p className="text-xs text-emerald-600">
                  Esta especialidade dispensa encaminhamento para o seu plano. Quando houver encaminhamentos disponíveis,
                  eles aparecerão aqui para uso opcional.
                </p>
              )}
              {referralsError && (
                <p className="mt-2 text-xs text-red-600">{String(referralsError)}</p>
              )}
            </div>

            <div>
              <label className="label">Horário disponível</label>
              <select
                className="select"
                value={slotId}
                onChange={(event) => setSlotId(event.target.value)}
                disabled={!allSlots.length}
              >
                <option value="">{allSlots.length ? 'Selecione…' : 'Sem horários para o período escolhido'}</option>
                {allSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
              </select>
              {selectedSlotSummary && (
                <p className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-2 text-xs text-emerald-700">
                  <strong className="block text-[11px] uppercase tracking-wide">Prévia do atendimento</strong>
                  {selectedSlotSummary.label}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Confirmação do agendamento</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Revise as informações e confirme para registrar o atendimento diretamente na Rapidoc. Você também pode solicitar um
          atendimento imediato via telemedicina quando disponível.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={createAppointment}
            disabled={loading || !canConfirm}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Agendando…' : 'Confirmar agendamento'}
          </button>
          <button
            onClick={async () => {
              setError('');
              setResult(null);
              try {
                if (!beneficiaryUuid) {
                  setError('Selecione o beneficiário.');
                  return;
                }
                const { data } = await axios.get(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/request-appointment`);
                if (data?.url) {
                  window.open(String(data.url), '_blank');
                } else {
                  setResult(data);
                }
              } catch (e: any) {
                setError(e?.response?.data?.message || e?.message || 'Falha ao solicitar atendimento imediato');
              }
            }}
            className="inline-flex items-center justify-center rounded-full border border-emerald-600 px-6 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            style={{ display: isGeneralist ? 'inline-flex' : 'none' }}
          >
            Atendimento imediato
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{String(error)}</p>}

        {result && (
          <details className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-xs text-zinc-600">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-700">Detalhes técnicos do retorno</summary>
            <pre className="mt-3 whitespace-pre-wrap break-all text-[11px] leading-relaxed">
              {JSON.stringify(result, null, 2)}
            </pre>
            {selectedSlotSummary?.raw && (
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/80 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Slot selecionado</p>
                <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                  {JSON.stringify(selectedSlotSummary.raw, null, 2)}
                </pre>
              </div>
            )}
            {selectedReferral?.raw && (
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/80 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Encaminhamento utilizado</p>
                <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                  {JSON.stringify(selectedReferral.raw, null, 2)}
                </pre>
              </div>
            )}
          </details>
        )}
      </section>
    </div>
  );
}
