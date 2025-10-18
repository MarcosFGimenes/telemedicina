'use client';

import Link from 'next/link';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type PlanCancellationRecord = {
  status?: string;
  effectiveDate?: string;
  runAt?: string;
  requestedAt?: string;
  monthReference?: string;
};

type UserDoc = {
  name?: string;
  email?: string;
  cpf?: string;
  beneficiaryUuid?: string;
  status?: string;
  serviceType?: string;
  planName?: string;
  planCancellation?: PlanCancellationRecord | null;
};

type MeResponse = {
  ok: boolean;
  user?: UserDoc;
};

type Beneficiary = {
  uuid?: string;
  id?: string;
  name?: string;
  cpf?: string;
  status?: string;
  serviceType?: string;
};

type CancellationResponse = {
  ok?: boolean;
  status?: string;
  alreadyScheduled?: boolean;
  effectiveDate?: string;
  message?: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
  dueDate?: string | null;
  status?: string | null;
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

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message) {
      return message;
    }
  }
  return fallback;
};

export default function CancelarPlanoPage() {
  const { token } = useAuthContext();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [beneficiaryError, setBeneficiaryError] = useState('');
  const [loadingBeneficiary, setLoadingBeneficiary] = useState(false);

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [pendingInvoice, setPendingInvoice] = useState<{ dueDate: string | null; status: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancellation, setCancellation] = useState<PlanCancellationRecord | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      try {
        setLoadingProfile(true);
        setProfileError('');
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json().catch(() => null)) as MeResponse | null;
        if (!active) return;
        if (!res.ok || !data?.ok) {
          throw new Error((data as ApiErrorResponse)?.message || 'Falha ao carregar seus dados.');
        }
        setMe(data);
        setCancellation(data.user?.planCancellation ?? null);
      } catch (error) {
        if (!active) return;
        setProfileError(getErrorMessage(error, 'Não foi possível carregar as informações do assinante.'));
      } finally {
        if (active) setLoadingProfile(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [token]);

  const beneficiaryUuid = useMemo(() => {
    const fromBeneficiary = beneficiary?.uuid || beneficiary?.id;
    if (fromBeneficiary) return fromBeneficiary;
    return me?.user?.beneficiaryUuid || '';
  }, [beneficiary?.uuid, beneficiary?.id, me?.user?.beneficiaryUuid]);

  const cpf = useMemo(() => {
    if (beneficiary?.cpf) return beneficiary.cpf;
    if (me?.user?.cpf) return me.user.cpf;
    return '';
  }, [beneficiary?.cpf, me?.user?.cpf]);

  const cancellationStatus = useMemo(() => {
    return (cancellation?.status || '').toLowerCase();
  }, [cancellation?.status]);

  const cancellationEffectiveDate = useMemo(() => {
    return formatDate(cancellation?.effectiveDate || cancellation?.runAt || null);
  }, [cancellation?.effectiveDate, cancellation?.runAt]);

  const statusLabel = useMemo(() => {
    if (beneficiary?.status) return String(beneficiary.status).toUpperCase();
    if (me?.user?.status) return String(me.user.status).toUpperCase();
    return 'PENDENTE';
  }, [beneficiary?.status, me?.user?.status]);

  const derivedPlanName = useMemo(() => {
    if (beneficiary?.serviceType) return serviceTypeLabel(beneficiary.serviceType);
    if (me?.user?.planName) return me.user.planName;
    if (me?.user?.serviceType) return serviceTypeLabel(me.user.serviceType);
    return 'Plano não identificado';
  }, [beneficiary?.serviceType, me?.user?.planName, me?.user?.serviceType]);

  const fetchBeneficiary = useCallback(async () => {
    const uuid = me?.user?.beneficiaryUuid;
    const currentCpf = me?.user?.cpf;
    if (!uuid && !currentCpf) {
      setBeneficiary(null);
      return;
    }

    try {
      setLoadingBeneficiary(true);
      setBeneficiaryError('');
      const url = uuid ? `/api/rapidoc/beneficiaries/${uuid}` : `/api/rapidoc/beneficiaries/cpf/${currentCpf}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data as ApiErrorResponse)?.message || 'Falha ao carregar dados do prontuario clinico.');
      }
      setBeneficiary((data || null) as Beneficiary | null);
    } catch (error) {
      setBeneficiary(null);
      setBeneficiaryError(getErrorMessage(error, 'Não foi possível carregar dados do prontuario clinico.'));
    } finally {
      setLoadingBeneficiary(false);
    }
  }, [me?.user?.beneficiaryUuid, me?.user?.cpf]);

  useEffect(() => {
    if (!me?.user) return;
    fetchBeneficiary();
  }, [me?.user, fetchBeneficiary]);

  const missingIdentifiers = useMemo(() => {
    return !cpf && !beneficiaryUuid;
  }, [cpf, beneficiaryUuid]);

  const requestCancellation = async () => {
    if (!token) {
      setActionError('Você precisa estar autenticado para solicitar o cancelamento.');
      return;
    }

    if (missingIdentifiers) {
      setActionError('Não encontramos um CPF ou beneficiário vinculado ao seu perfil.');
      return;
    }

    try {
      setSubmitting(true);
      setActionError('');
      setActionSuccess('');
      setPendingInvoice(null);

      const payload: Record<string, string> = {};
      if (cpf) {
        payload.cpf = cpf;
      } else if (beneficiaryUuid) {
        payload.beneficiaryUuid = beneficiaryUuid;
      }

      const res = await fetch('/api/plano/cancelar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as CancellationResponse | ApiErrorResponse | null;

      if (!res.ok) {
        const apiError = data as ApiErrorResponse | null;
        if (apiError?.error === 'invoice_pending') {
          setPendingInvoice({
            dueDate: apiError?.dueDate || null,
            status: apiError?.status || null,
          });
        }
        const message = apiError?.message || 'Não foi possível solicitar o cancelamento do plano.';
        setActionError(message);
        return;
      }

      const success = data as CancellationResponse | null;
      const newStatus = success?.status || (success?.alreadyScheduled ? 'scheduled' : '');
      const effectiveDate = success?.effectiveDate || null;

      setActionSuccess(success?.message || 'Cancelamento solicitado com sucesso.');
      setCancellation({
        status: newStatus,
        effectiveDate: effectiveDate || undefined,
        runAt: effectiveDate || undefined,
      });
      setPendingInvoice(null);
      setMe((prev) => {
        if (!prev?.user) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            planCancellation: {
              ...(prev.user.planCancellation || {}),
              status: newStatus || prev.user.planCancellation?.status,
              effectiveDate: effectiveDate || prev.user.planCancellation?.effectiveDate,
              runAt: effectiveDate || prev.user.planCancellation?.runAt,
            },
          },
        };
      });
    } catch (error) {
      setActionError(getErrorMessage(error, 'Não foi possível concluir sua solicitação.'));
    } finally {
      setSubmitting(false);
    }
  };

  const isScheduled = cancellationStatus === 'scheduled';
  const isCompleted = cancellationStatus === 'completed';

  return (
    <div className="space-y-6">
      <Link
        href="/assinante/perfil"
        className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.6"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Voltar para meu perfil
      </Link>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Solicitar cancelamento do plano</h1>
            <p className="text-sm text-zinc-600">
              Ao solicitar o cancelamento, sua assinatura permanecerá ativa até o último dia útil do mês corrente. Após essa
              data, o beneficiário sincronizado será inativado automaticamente.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span>Status atual</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] tracking-wide text-emerald-600">
              {loadingBeneficiary ? 'Carregando…' : statusLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Plano atual</p>
            <p className="mt-1 font-semibold text-zinc-900">{derivedPlanName}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">CPF vinculado</p>
            <p className="mt-1 font-mono text-sm text-zinc-900">{cpf || '—'}</p>
          </div>
        </div>

        {loadingProfile && <p className="mt-4 text-sm text-zinc-500">Carregando informações…</p>}
        {profileError && <p className="mt-4 text-sm text-red-600">{profileError}</p>}
        {beneficiaryError && <p className="mt-2 text-sm text-red-600">{beneficiaryError}</p>}
        {actionError && <p className="mt-4 text-sm text-red-600">{actionError}</p>}
        {pendingInvoice && (
          <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-700">
            {pendingInvoice.dueDate
              ? `Existe uma fatura com vencimento em ${pendingInvoice.dueDate} com status ${pendingInvoice.status}. `
              : 'Identificamos uma fatura pendente neste mês. '}
            Efetue o pagamento para prosseguir com o cancelamento.
          </p>
        )}
        {actionSuccess && <p className="mt-4 text-sm text-emerald-700">{actionSuccess}</p>}

        {isCompleted ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
            <p className="font-semibold">Plano já cancelado</p>
            <p>
              Identificamos que o cancelamento do seu plano foi concluído anteriormente. Para qualquer dúvida ou solicitação de
              reativação, entre em contato com a nossa central de atendimento.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-zinc-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">O que acontece após o pedido</p>
              <ul className="mt-3 list-disc space-y-2 pl-4">
                <li>Novas cobranças no Asaas serão suspensas imediatamente.</li>
                <li>
                  O beneficiário sincronizado permanecerá ativo até o último dia útil do mês e será inativado automaticamente após essa
                  data.
                </li>
                <li>Após o cancelamento efetivo, a reativação só poderá ser feita pelo time de atendimento.</li>
              </ul>
            </div>

            {isScheduled && cancellationEffectiveDate && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
                <p className="font-semibold">Cancelamento agendado</p>
                <p>
                  Seu plano permanecerá ativo até {cancellationEffectiveDate}. Após essa data, nenhum novo acesso será permitido e o
                  beneficiário será inativado automaticamente.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={requestCancellation}
              disabled={submitting || isScheduled || missingIdentifiers}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Enviando solicitação…' : isScheduled ? 'Cancelamento já agendado' : 'Solicitar cancelamento do plano'}
            </button>
          </div>
        )}

        {missingIdentifiers && !isCompleted && (
          <p className="mt-4 text-sm text-amber-700">
            Não foi possível identificar um CPF ou beneficiário vinculado ao seu perfil. Entre em contato com o suporte para atualizar
            seus dados antes de solicitar o cancelamento.
          </p>
        )}
      </section>
    </div>
  );
}
