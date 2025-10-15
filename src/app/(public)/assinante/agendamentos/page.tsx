'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';

type Specialty = { id?: string; uuid?: string; name?: string; [key: string]: unknown };
type AppointmentResp = { uuid?: string; id?: string; [key: string]: unknown };
type AppointmentListItem = {
  uuid: string;
  scheduledAt?: string;
  dateLabel?: string;
  timeLabel?: string;
  status?: string;
  specialtyName?: string;
  professionalName?: string;
  meetingUrl?: string;
  raw?: Record<string, unknown>;
};

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

const firstNonEmpty = (...values: (string | null | undefined)[]): string | undefined => {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
};

const sanitizeTimeFragment = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const firstSegment = trimmed.split(/[\s-–—]+/)[0];
  const segments = firstSegment
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return undefined;
  }
  if (segments.length === 1) {
    const hours = segments[0].padStart(2, '0');
    return `${hours}:00:00`;
  }
  if (segments.length === 2) {
    const [hour, minute] = segments;
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
  }
  const [hour, minute = '00', second = '00'] = segments;
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
};

const composeDateTimeFromParts = (
  datePart?: string | null,
  timePart?: string | null,
): string | undefined => {
  if (!datePart) return undefined;
  const trimmedDate = datePart.trim();
  if (!trimmedDate) return undefined;
  if (trimmedDate.includes('T')) {
    return trimmedDate;
  }
  const sanitizedTime = timePart && timePart.trim() ? timePart.trim() : undefined;
  const dmyMatch = trimmedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const base = `${yyyy}-${mm}-${dd}`;
    if (sanitizedTime) {
      return `${base}T${sanitizedTime}`;
    }
    return `${base}T00:00:00`;
  }
  const ymdMatch = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const base = `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    if (sanitizedTime) {
      return `${base}T${sanitizedTime}`;
    }
    return `${base}T00:00:00`;
  }
  if (sanitizedTime) {
    return `${trimmedDate} ${sanitizedTime}`;
  }
  return trimmedDate;
};

const parseAppointments = (raw: unknown): AppointmentListItem[] => {
  const containers: Record<string, unknown>[] = [];
  const queue: unknown[] = [raw];
  const keysToExplore = ['data', 'appointments', 'items', 'results'];

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
    .map((record) => {
      const uuid = firstNonEmpty(stringFrom(record['uuid']), stringFrom(record['id']));
      if (!uuid) return null;

      const rawDate = firstNonEmpty(
        stringFrom(record['scheduledDate']),
        stringFrom(record['scheduleDate']),
        stringFrom(record['date']),
        stringFrom(record['day']),
      );
      const rawTime = firstNonEmpty(
        stringFrom(record['scheduledTime']),
        stringFrom(record['time']),
        stringFrom(record['hour']),
        stringFrom(record['from']),
        stringFrom(record['startTime']),
      );
      const normalizedTime = sanitizeTimeFragment(rawTime);
      const scheduledAt = firstNonEmpty(
        stringFrom(record['scheduledAt']),
        stringFrom(record['scheduleDateTime']),
        stringFrom(record['scheduleDate']),
        stringFrom(record['scheduledDateTime']),
        stringFrom(record['scheduledDatetime']),
        stringFrom(record['startAt']),
        stringFrom(record['startDateTime']),
        stringFrom(record['start']),
        stringFrom(record['dateTime']),
        composeDateTimeFromParts(rawDate, normalizedTime),
      );

      const specialty = asRecord(record['specialty']);
      const professional =
        asRecord(record['professional']) || asRecord(record['doctor']) || asRecord(record['physician']);

      const specialtyName = firstNonEmpty(
        stringFrom(record['specialtyName']),
        stringFrom(specialty?.['name']),
        stringFrom(specialty?.['description']),
      );
      const professionalName = firstNonEmpty(
        stringFrom(record['professionalName']),
        stringFrom(professional?.['name']),
      );
      const meetingUrl = firstNonEmpty(
        stringFrom(record['meetingUrl']),
        stringFrom(record['beneficiaryUrl']),
        stringFrom(record['url']),
        stringFrom(record['redirectUrl']),
      );
      const status = firstNonEmpty(stringFrom(record['status']), stringFrom(record['situation']));

      return {
        uuid,
        scheduledAt,
        dateLabel: rawDate,
        timeLabel: rawTime,
        status,
        specialtyName,
        professionalName,
        meetingUrl,
        raw: record,
      } as AppointmentListItem;
    })
    .filter(Boolean) as AppointmentListItem[];
};

const appointmentDateFrom = (item: AppointmentListItem): Date | null => {
  const candidate = firstNonEmpty(
    item.scheduledAt,
    composeDateTimeFromParts(item.dateLabel, sanitizeTimeFragment(item.timeLabel)),
  );
  if (!candidate) return null;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatAppointmentDateTime = (item: AppointmentListItem): string => {
  const date = appointmentDateFrom(item);
  if (date) {
    try {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    } catch {
      // ignore formatting errors and fallback below
    }
  }
  const labelParts = [item.dateLabel, item.timeLabel].filter(Boolean) as string[];
  if (labelParts.length) {
    return labelParts.join(' • ');
  }
  return item.scheduledAt || '—';
};

const isCanceledStatus = (value?: string): boolean => {
  const normalized = (value || '').toUpperCase();
  return normalized.includes('CANCEL');
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
      return '';
  }
};

const messageFromAxiosError = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }
  const payload = asRecord(error.response?.data);
  const backend = payload ? asRecord(payload['backend']) : null;
  return (
    stringFrom(backend?.['message']) ||
    stringFrom(payload?.['message']) ||
    stringFrom(payload?.['error']) ||
    error.message ||
    fallback
  );
};

export default function AssinanteAgendamentosPage() {
  const { token } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [specId, setSpecId] = useState('');
  const [disp, setDisp] = useState<unknown[]>([]);
  const [slotId, setSlotId] = useState('');
  const [beneficiaryUuid, setBeneficiaryUuid] = useState('');
  const [patients, setPatients] = useState<{ uuid: string; label: string }[]>([]);
  const [planName, setPlanName] = useState('');
  const [dateInitial, setDateInitial] = useState<string>('');
  const [dateFinal, setDateFinal] = useState<string>('');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [referrals, setReferrals] = useState<ReferralOption[]>([]);
  const [selectedReferralId, setSelectedReferralId] = useState('');
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [referralsError, setReferralsError] = useState('');
  const [beneficiarySnapshot, setBeneficiarySnapshot] = useState<Record<string, unknown> | null>(null);
  const [loadingBeneficiarySnapshot, setLoadingBeneficiarySnapshot] = useState(false);
  const [beneficiarySnapshotError, setBeneficiarySnapshotError] = useState('');
  const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [appointmentsMessage, setAppointmentsMessage] = useState('');
  const [cancelingUuid, setCancelingUuid] = useState('');

  const requestAppointments = useCallback(async (uuid: string) => {
    const { data } = await axios.get(`/api/rapidoc/beneficiaries/${uuid}/appointments`);
    return parseAppointments(data);
  }, []);

  useEffect(() => {
    setAppointmentsMessage('');
    if (!beneficiaryUuid) {
      setAppointments([]);
      setAppointmentsError('');
      setAppointmentsLoading(false);
      return;
    }

    let active = true;
    const loadAppointments = async () => {
      try {
        setAppointmentsLoading(true);
        setAppointmentsError('');
        const list = await requestAppointments(beneficiaryUuid);
        if (!active) return;
        setAppointments(list);
      } catch (error: unknown) {
        if (!active) return;
        setAppointments([]);
        setAppointmentsError(messageFromAxiosError(error, 'Falha ao carregar agendamentos.'));
      } finally {
        if (active) {
          setAppointmentsLoading(false);
        }
      }
    };

    void loadAppointments();

    return () => {
      active = false;
    };
  }, [beneficiaryUuid, requestAppointments]);

  const reloadAppointments = useCallback(async () => {
    setAppointmentsMessage('');
    if (!beneficiaryUuid) {
      setAppointments([]);
      setAppointmentsError('');
      setAppointmentsLoading(false);
      return;
    }

    try {
      setAppointmentsLoading(true);
      setAppointmentsError('');
      const list = await requestAppointments(beneficiaryUuid);
      setAppointments(list);
      setAppointmentsMessage('Agendamentos atualizados.');
    } catch (error: unknown) {
      setAppointmentsError(messageFromAxiosError(error, 'Falha ao carregar agendamentos.'));
    } finally {
      setAppointmentsLoading(false);
    }
  }, [beneficiaryUuid, requestAppointments]);

  const upcomingAppointments = useMemo(() => {
    const now = Date.now();
    const filtered = appointments.filter((item) => {
      if (isCanceledStatus(item.status)) {
        return false;
      }
      const date = appointmentDateFrom(item);
      if (!date) {
        return true;
      }
      return date.getTime() >= now;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aDate = appointmentDateFrom(a);
      const bDate = appointmentDateFrom(b);
      if (aDate && bDate) {
        return aDate.getTime() - bDate.getTime();
      }
      if (aDate) return -1;
      if (bDate) return 1;
      return a.uuid.localeCompare(b.uuid);
    });
    return sorted;
  }, [appointments]);

  const cancelAppointment = useCallback(
    async (uuid: string) => {
      const trimmed = uuid.trim();
      if (!trimmed) return;
      if (!window.confirm('Deseja cancelar este agendamento?')) return;
      try {
        setCancelingUuid(trimmed);
        setAppointmentsError('');
        setAppointmentsMessage('');
        await axios.delete(`/api/rapidoc/agendamentos/${trimmed}`);
        setAppointments((prev) => prev.filter((item) => item.uuid !== trimmed));
        setAppointmentsMessage('Agendamento cancelado com sucesso.');
      } catch (error: unknown) {
        setAppointmentsError(messageFromAxiosError(error, 'Falha ao cancelar o agendamento.'));
      } finally {
        setCancelingUuid('');
      }
    },
    [],
  );

  useEffect(() => {
    const loadSpecs = async () => {
      try {
        setError('');
        const { data } = await axios.get('/api/rapidoc/especialidades');
        setSpecs(Array.isArray(data) ? data : []);
      } catch (error: unknown) {
        setError(messageFromAxiosError(error, 'Erro ao listar especialidades'));
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
        if (me?.beneficiaryUuid) {
          opts.push({ uuid: String(me.beneficiaryUuid), label: me?.name ? `${me.name} (Titular)` : 'Titular' });
        }
        const depsRaw = Array.isArray(depRes?.data?.dependents)
          ? (depRes.data.dependents as unknown[])
          : [];
        depsRaw.forEach((raw) => {
          const dep = asRecord(raw);
          if (!dep) return;
          const uuidValue = stringFrom(dep['uuid']);
          if (!uuidValue) return;
          const displayName = stringFrom(dep['name']);
          const shortId = uuidValue.length > 6 ? `${uuidValue.slice(0, 6)}…` : uuidValue;
          opts.push({ uuid: uuidValue, label: displayName ? displayName : `Dependente ${shortId}` });
        });
        setPatients(opts);
        if (opts.length) setBeneficiaryUuid(opts[0].uuid);

        // Refina o nome do plano a partir do serviceType atual da Rapidoc do titular, se disponível
        const primaryUuid = me?.beneficiaryUuid ? String(me.beneficiaryUuid) : '';
        if (primaryUuid) {
          try {
            const { data: b } = await axios.get(`/api/rapidoc/beneficiaries/${primaryUuid}`);
            const st = String((b as Record<string, unknown> | null)?.['serviceType'] || '').toUpperCase();
            const derived = serviceTypeLabel(st);
            if (derived) setPlanName(derived);
          } catch (error: unknown) {
            console.info('[agendamentos] falha ao refinar plano do titular', error);
          }
      }
      } catch (error: unknown) {
        console.warn('[agendamentos] falha ao carregar titulares/dependentes', error);
        setPlanName('');
      }
    };
    loadPatients();
  }, [token]);

  useEffect(() => {
    if (!beneficiaryUuid) {
      setBeneficiarySnapshot(null);
      setBeneficiarySnapshotError('');
      return;
    }

    let active = true;
    const loadSnapshot = async () => {
      try {
        setLoadingBeneficiarySnapshot(true);
        setBeneficiarySnapshotError('');
        const { data } = await axios.get(`/api/rapidoc/beneficiaries/${beneficiaryUuid}`);
        if (!active) return;
        const container = asRecord(data);
        const record = container || (container && asRecord(container['beneficiary'])) || null;
        setBeneficiarySnapshot(record);
        if (record) {
          const info = extractPlanInfo(record);
          if (info.planName) setPlanName(info.planName);
        }
      } catch (error: unknown) {
        if (!active) return;
        setBeneficiarySnapshot(null);
        setBeneficiarySnapshotError(
          messageFromAxiosError(error, 'Falha ao carregar informações do beneficiário na Rapidoc.'),
        );
      } finally {
        if (active) {
          setLoadingBeneficiarySnapshot(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      active = false;
    };
  }, [beneficiaryUuid]);

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
        setDisp(data);
      } else {
        const container = asRecord(data);
        const inner = container && Array.isArray(container['data']) ? (container['data'] as unknown[]) : [];
        setDisp(inner);
      }
    } catch (error: unknown) {
      setError(messageFromAxiosError(error, 'Erro ao listar disponibilidade'));
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
      } catch (error: unknown) {
        if (!active) return;
        setReferrals([]);
        setReferralsError(
          messageFromAxiosError(error, 'Falha ao carregar encaminhamentos do beneficiário.'),
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

  const computeSlotId = (entry: unknown): string | undefined => {
    const record = asRecord(entry);
    if (!record) {
      return undefined;
    }

    return (
      stringFrom(record['id']) ||
      stringFrom(record['uuid']) ||
      stringFrom(record['slotId']) ||
      stringFrom(record['code']) ||
      undefined
    );
  };

  const currentSpec = useMemo<Specialty | null>(() => {
    if (!specId) return null;
    return (
      specs.find((spec, index) => {
        const id = spec.id ?? spec.uuid ?? stringFrom(spec?.['code']) ?? index;
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

  const beneficiaryPlanSummary = useMemo(() => {
    if (!beneficiarySnapshot) return null;
    const serviceType = stringFrom(beneficiarySnapshot['serviceType']);
    const paymentType = stringFrom(beneficiarySnapshot['paymentType']);
    const status = stringFrom(beneficiarySnapshot['status']);
    const name = stringFrom(beneficiarySnapshot['name']);
    const uuid = stringFrom(beneficiarySnapshot['uuid']) || stringFrom(beneficiarySnapshot['id']) || '';
    const planLabel = serviceTypeLabel(serviceType) || planName;
    const url =
      stringFrom(beneficiarySnapshot['beneficiaryUrl']) ||
      stringFrom(beneficiarySnapshot['url']) ||
      stringFrom(beneficiarySnapshot['portalUrl']) ||
      '';

    const normalizedPayment = paymentType ? paymentType.toUpperCase() : '';
    const paymentLabel =
      normalizedPayment === 'A'
        ? 'Anual'
        : normalizedPayment === 'S'
        ? 'Mensal'
        : normalizedPayment || '';

    return {
      name,
      status,
      statusLabel: status ? status.toUpperCase() : '',
      planLabel,
      serviceType,
      paymentType: normalizedPayment,
      paymentLabel,
      url,
      uuid,
    };
  }, [beneficiarySnapshot, planName]);

  const canConfirm = Boolean(
    beneficiaryUuid &&
      specId &&
      slotId &&
      (!requiresReferral || (!!selectedReferral && selectedReferral.id)),
  );

  const allSlots = useMemo<SlotOption[]>(() => {
    const rows: SlotOption[] = [];

    const pushSlot = (
      slot: unknown,
      index: number,
      parent: Record<string, unknown> | null,
    ) => {
      const slotRecord = asRecord(slot);
      if (!slotRecord) {
        return;
      }
      const id = computeSlotId(slotRecord);
      if (!id) {
        return;
      }

      const date =
        stringFrom(slotRecord['date']) ||
        stringFrom(slotRecord['day']) ||
        (parent ? stringFrom(parent['date']) : undefined);
      const from = stringFrom(slotRecord['from']) || stringFrom(slotRecord['start']) || stringFrom(slotRecord['time']);
      const to = stringFrom(slotRecord['to']) || stringFrom(slotRecord['end']);
      const base = [date, from && to ? `${from}-${to}` : from].filter(Boolean).join(' ');
      const label = base || stringFrom(slotRecord['label']) || `Slot ${index + 1}`;
      rows.push({ id, label: label || `Slot ${index + 1}`, raw: slotRecord });
    };

    disp.forEach((entry) => {
      if (Array.isArray(entry)) {
        entry.forEach((slot, index) => pushSlot(slot, index, null));
        return;
      }
      const record = asRecord(entry);
      if (!record) {
        return;
      }
      if (Array.isArray(record['slots'])) {
        (record['slots'] as unknown[]).forEach((slot, index) => pushSlot(slot, index, record));
      } else {
        pushSlot(record, 0, record);
      }
    });

    return rows;
  }, [disp]);

  const selectedSlotSummary = useMemo<SelectedSlotSummary | null>(() => {
    if (!slotId) return null;
    const option = allSlots.find((slot) => slot.id === slotId);
    if (!option) return null;
    return { label: option.label, raw: option.raw };
  }, [slotId, allSlots]);

  const meetingUrl = useMemo(() => {
    const record = asRecord(result);
    if (!record) return '';
    return (
      stringFrom(record['beneficiaryUrl']) ||
      stringFrom(record['url']) ||
      stringFrom(record['meetingUrl']) ||
      stringFrom(record['redirectUrl']) ||
      ''
    );
  }, [result]);

  useEffect(() => {
    if (!beneficiaryPlanSummary?.planLabel) return;
    if (beneficiaryPlanSummary.planLabel !== planName) {
      setPlanName(beneficiaryPlanSummary.planLabel);
    }
  }, [beneficiaryPlanSummary?.planLabel, planName]);

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
        const rawReferral = asRecord(selectedReferral.raw);
        const referralUuid =
          stringFrom(rawReferral?.['uuid']) ||
          stringFrom(rawReferral?.['id']) ||
          stringFrom(rawReferral?.['referralUuid']) ||
          stringFrom(rawReferral?.['referralId']) ||
          selectedReferral.id;
        const referralId = stringFrom(rawReferral?.['id']) || selectedReferral.id;
        payload.referralUuid = referralUuid;
        payload.referralId = referralId;
      }

      const { data } = await axios.post<AppointmentResp>('/api/rapidoc/agendamentos', payload);

      setResult(data);
    } catch (error: unknown) {
      setError(messageFromAxiosError(error, 'Erro ao agendar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Seus agendamentos</h2>
            <p className="text-sm text-zinc-600">Consulte e gerencie suas consultas futuras registradas na Rapidoc.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => void reloadAppointments()}
              disabled={appointmentsLoading || !beneficiaryUuid}
              className="rounded-full border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              Recarregar
            </button>
          </div>
        </div>
        {appointmentsError && <p className="mt-3 text-sm text-red-600">{appointmentsError}</p>}
        {appointmentsMessage && <p className="mt-3 text-sm text-emerald-600">{appointmentsMessage}</p>}
        {!beneficiaryUuid ? (
          <p className="mt-4 text-sm text-zinc-500">Selecione um beneficiário para visualizar os agendamentos futuros.</p>
        ) : (
          <>
            <p className="mt-3 text-xs text-zinc-500">
              {appointmentsLoading
                ? 'Sincronizando com Rapidoc…'
                : upcomingAppointments.length === 1
                ? '1 agendamento futuro encontrado.'
                : `${upcomingAppointments.length} agendamentos futuros encontrados.`}
            </p>
            <div className="mt-4 space-y-3">
              {appointmentsLoading && <p className="text-sm text-zinc-500">Carregando agendamentos…</p>}
              {!appointmentsLoading && !upcomingAppointments.length && (
                <p className="text-sm text-zinc-500">Nenhum agendamento futuro disponível no momento.</p>
              )}
              {!appointmentsLoading &&
                upcomingAppointments.map((appointment) => {
                  const busy = cancelingUuid === appointment.uuid;
                  const canceled = isCanceledStatus(appointment.status);
                  const statusLabel = (appointment.status || '').toUpperCase();
                  return (
                    <article
                      key={appointment.uuid}
                      className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-[11px] text-emerald-700">{appointment.uuid}</span>
                        {statusLabel && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            {statusLabel}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                        <p>
                          <span className="font-semibold text-zinc-800">Data e horário:</span>{' '}
                          {formatAppointmentDateTime(appointment)}
                        </p>
                        <p>
                          <span className="font-semibold text-zinc-800">Especialidade:</span>{' '}
                          {appointment.specialtyName || '—'}
                        </p>
                        {appointment.professionalName && (
                          <p>
                            <span className="font-semibold text-zinc-800">Profissional:</span>{' '}
                            {appointment.professionalName}
                          </p>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => cancelAppointment(appointment.uuid)}
                          disabled={busy || canceled}
                          className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          {busy ? 'Cancelando…' : 'Cancelar agendamento'}
                        </button>
                        {appointment.meetingUrl && (
                          <a
                            href={appointment.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                          >
                            Abrir link da consulta
                          </a>
                        )}
                      </div>
                      {appointment.raw && (
                        <details className="mt-3 text-xs text-zinc-500">
                          <summary className="cursor-pointer text-emerald-700">Ver detalhes técnicos</summary>
                          <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                            {JSON.stringify(appointment.raw, null, 2)}
                          </pre>
                        </details>
                      )}
                    </article>
                  );
                })}
            </div>
          </>
        )}
      </section>
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
              {loadingBeneficiarySnapshot && (
                <p className="mt-2 text-xs text-zinc-500">Sincronizando informações do plano na Rapidoc…</p>
              )}
              {beneficiarySnapshotError && (
                <p className="mt-2 text-xs text-red-600">{beneficiarySnapshotError}</p>
              )}
              {beneficiaryPlanSummary && !beneficiarySnapshotError && (
                <div className="mt-3 space-y-1 rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 text-xs text-emerald-700">
                  <p className="text-[11px] font-semibold uppercase tracking-wide">Resumo Rapidoc</p>
                  {beneficiaryPlanSummary.name && (
                    <p className="text-sm font-semibold text-emerald-800">{beneficiaryPlanSummary.name}</p>
                  )}
                  {beneficiaryPlanSummary.planLabel && (
                    <p>
                      Plano: <strong>{beneficiaryPlanSummary.planLabel}</strong>
                    </p>
                  )}
                  {beneficiaryPlanSummary.paymentLabel && (
                    <p>Pagamento: {beneficiaryPlanSummary.paymentLabel}</p>
                  )}
                  {beneficiaryPlanSummary.statusLabel && (
                    <p>Status: {beneficiaryPlanSummary.statusLabel}</p>
                  )}
                  {beneficiaryPlanSummary.url && (
                    <a
                      href={beneficiaryPlanSummary.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 underline-offset-2 hover:underline"
                    >
                      Abrir portal da consulta
                    </a>
                  )}
                </div>
              )}
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
              } catch (error: unknown) {
                setError(messageFromAxiosError(error, 'Falha ao solicitar atendimento imediato'));
              }
            }}
            className="inline-flex items-center justify-center rounded-full border border-emerald-600 px-6 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            style={{ display: isGeneralist ? 'inline-flex' : 'none' }}
          >
            Atendimento imediato
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{String(error)}</p>}

        {meetingUrl && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
            <p className="text-sm font-semibold text-emerald-800">Consulta confirmada!</p>
            <p className="mt-1 text-xs text-emerald-700">
              Acesse a sala virtual diretamente pelo link a seguir. Ele também está disponível na Rapidoc para futuras consultas.
            </p>
            <a
              href={meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700"
            >
              Abrir consulta na Rapidoc
            </a>
          </div>
        )}

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
