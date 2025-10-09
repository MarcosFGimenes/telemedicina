'use client';

import Link from 'next/link';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { useEffect, useMemo, useState } from 'react';

type ReferralRecord = {
  uuid: string;
  specialty?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const pickArray = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    if (Array.isArray(raw.value)) return raw.value;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.results)) return raw.results;
  }
  return [];
};

const asReferralRecord = (raw: unknown): ReferralRecord | null => {
  if (!isRecord(raw)) return null;
  const uuid = typeof raw.uuid === 'string' ? raw.uuid : '';
  if (!uuid) return null;
  const specialty = isRecord(raw.specialty) && typeof raw.specialty.name === 'string'
    ? raw.specialty.name
    : typeof raw.specialty === 'string'
      ? raw.specialty
      : undefined;
  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : undefined;
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined;
  const url = typeof raw.urlPath === 'string' ? raw.urlPath : undefined;
  return { uuid, specialty, status, createdAt, updatedAt, url };
};

const parseReferrals = (raw: unknown): ReferralRecord[] => {
  const collection = pickArray(raw);
  const mapped = collection.map(asReferralRecord).filter(Boolean) as ReferralRecord[];
  return mapped;
};

const formatStatus = (value?: string) => {
  if (!value) return 'DESCONHECIDO';
  return value.replace(/[_-]+/g, ' ').toUpperCase();
};

export default function AssinanteEncaminhamentosPage() {
  const { token } = useAuthContext();
  const [beneficiaryUuid, setBeneficiaryUuid] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      if (!token) return;
      try {
        setLoadingProfile(true);
        setError('');
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Nao foi possivel carregar o perfil do assinante.');
        const data = await res.json();
        const uuid =
          typeof data?.user?.beneficiaryUuid === 'string'
            ? data.user.beneficiaryUuid
            : '';
        if (uuid) {
          setBeneficiaryUuid(uuid);
        } else {
          setError('Nao encontramos o identificador do beneficiario vinculado.');
        }
      } catch (err) {
        console.error('[assinante/encaminhamentos] perfil', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Falha ao carregar dados iniciais do assinante.',
        );
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfile();
  }, [token]);

  useEffect(() => {
    const loadReferrals = async () => {
      if (!beneficiaryUuid) return;
      try {
        setLoadingReferrals(true);
        setError('');
        const res = await fetch(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/referrals`);
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (payload && typeof payload.message === 'string' && payload.message) ||
            'Falha ao buscar encaminhamentos.';
          throw new Error(message);
        }
        const items = parseReferrals(payload);
        setReferrals(items);
      } catch (err) {
        console.error('[assinante/encaminhamentos] referrals', err);
        setReferrals([]);
        setError(
          err instanceof Error ? err.message : 'Nao foi possivel carregar os encaminhamentos.',
        );
      } finally {
        setLoadingReferrals(false);
      }
    };
    loadReferrals();
  }, [beneficiaryUuid]);

  const emptyState = !referrals.length && !loadingReferrals;
  const subtitle = useMemo(() => {
    if (!beneficiaryUuid) return 'Identifique o beneficiario para listar encaminhamentos.';
    if (loadingReferrals) return 'Sincronizando encaminhamentos diretamente da Rapidoc.';
    return 'Selecione um encaminhamento para abrir o documento completo.';
  }, [beneficiaryUuid, loadingReferrals]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Encaminhamentos Rapidoc
            </p>
            <h2 className="text-2xl font-semibold text-zinc-900">Documentos liberados</h2>
            <p className="text-sm text-zinc-500">{subtitle}</p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-zinc-500 sm:items-end">
            {beneficiaryUuid && (
              <span className="font-mono text-[11px] text-zinc-600">
                Beneficiario: {beneficiaryUuid}
              </span>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (beneficiaryUuid) {
                  setLoadingReferrals(true);
                  fetch(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/referrals`)
                    .then((res) => res.json().then((payload) => ({ ok: res.ok, payload })))
                    .then(({ ok, payload }) => {
                      if (!ok) {
                        const message =
                          (payload && typeof payload.message === 'string' && payload.message) ||
                          'Falha ao atualizar encaminhamentos.';
                        throw new Error(message);
                      }
                      setReferrals(parseReferrals(payload));
                      setError('');
                    })
                    .catch((err) => {
                      console.error('[assinante/encaminhamentos] refresh', err);
                      setError(
                        err instanceof Error
                          ? err.message
                          : 'Nao foi possivel atualizar os encaminhamentos.',
                      );
                    })
                    .finally(() => setLoadingReferrals(false));
                }
              }}
              disabled={!beneficiaryUuid || loadingReferrals}
            >
              {loadingReferrals ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {loadingProfile && (
          <p className="mt-4 text-sm text-zinc-500">Carregando dados do titular...</p>
        )}
      </section>

      <section className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-sm">
        {emptyState && (
          <p className="text-sm text-zinc-500">
            Nenhum encaminhamento disponivel no momento. Assim que a Rapidoc liberar um novo
            documento ele aparecera automaticamente aqui.
          </p>
        )}

        {!!referrals.length && (
          <div className="divide-y divide-emerald-50 rounded-2xl border border-emerald-100 bg-white/80">
            {referrals.map((ref) => (
              <div key={ref.uuid} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">
                    {ref.specialty || 'Encaminhamento sem especialidade'}
                  </p>
                  <p className="font-mono text-[11px] text-zinc-500">{ref.uuid}</p>
                  <p className="text-xs text-zinc-500">
                    Status: <span className="font-semibold text-emerald-700">{formatStatus(ref.status)}</span>
                  </p>
                  {ref.createdAt && (
                    <p className="text-xs text-zinc-500">Criado em: {ref.createdAt}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {ref.url ? (
                    <Link
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary text-xs"
                    >
                      Abrir PDF
                    </Link>
                  ) : (
                    <span className="text-xs text-zinc-400">Documento indisponivel</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
