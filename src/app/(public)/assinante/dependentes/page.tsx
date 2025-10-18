'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';

type BeneficiaryForm = {
  name: string;
  cpf: string;
  birthday: string;
  phone: string;
  email: string;
  zipCode: string;
  address: string;
  city: string;
  state: string;
};

type Dependent = {
  id?: string;
  uuid: string;
  name?: string;
  status?: string;
  serviceType?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const normalizeDependents = (records: unknown[]): Dependent[] => {
  return records
    .filter(isRecord)
    .filter((entry) => readString(entry.uuid).trim().length > 0)
    .map((entry) => {
      const uuid = readString(entry.uuid).trim();
      const name = readString(entry.name);
      const status = readString(entry.status);
      const serviceTypeRaw = readString(entry.serviceType);
      return {
        uuid,
        name: name || undefined,
        status: status || undefined,
        serviceType: serviceTypeRaw ? serviceTypeRaw.toUpperCase() : undefined,
      };
    });
};

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object') {
    const errObj = error as { message?: unknown; response?: unknown };
    const response = errObj.response;
    if (isRecord(response)) {
      const data = response.data;
      if (isRecord(data)) {
        const message = readString(data.message).trim();
        if (message) return message;
        const alt = readString(data.error).trim();
        if (alt) return alt;
      }
      if (typeof response.data === 'string') {
        const text = response.data.trim();
        if (text) return text;
      }
    }
    const message = readString(errObj.message).trim();
    if (message) return message;
  }
  return fallback;
};

export default function AssinanteDependentesPage() {
  const { token } = useAuthContext();
  const [form, setForm] = useState<BeneficiaryForm>({
    name: '',
    cpf: '',
    birthday: '',
    phone: '',
    email: '',
    zipCode: '',
    address: '',
    city: '',
    state: '',
  });
  const [resp, setResp] = useState<unknown>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [ownerServiceType, setOwnerServiceType] = useState('');
  const [manageTarget, setManageTarget] = useState<Dependent | null>(null);
  const [manageStatus, setManageStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [manageError, setManageError] = useState('');
  const [manageServiceType, setManageServiceType] = useState('');
  const currentManagedServiceType = String(
    manageServiceType || manageTarget?.serviceType || '',
  )
    .trim()
    .toUpperCase();

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const [meRes, depRes] = await Promise.all([
          axios.get('/api/me', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setLimit(Number(meRes?.data?.user?.maxDependents ?? NaN));
        const serviceTypeRaw = meRes?.data?.user?.serviceType;
        setOwnerServiceType(
          typeof serviceTypeRaw === 'string' ? serviceTypeRaw.trim().toUpperCase() : '',
        );
        const items = Array.isArray(depRes?.data?.dependents) ? depRes.data.dependents : [];
        setDependents(normalizeDependents(items));
      } catch {}
    };
    load();
  }, [token]);

  const onChange = (key: keyof BeneficiaryForm, value: string) => {
    setForm((state) => ({ ...state, [key]: value }));
  };

  const closeManage = () => {
    setManageTarget(null);
    setManageStatus('idle');
    setManageError('');
    setManageServiceType('');
  };

  const syncServiceType = async (target: Dependent) => {
    if (!token) {
      setManageStatus('error');
      setManageError('Token ausente. Faça login novamente.');
      return;
    }
    setManageStatus('loading');
    setManageError('');
    setManageServiceType('');
    try {
      const { data } = await axios.post(
        '/api/dependents/sync-service-type',
        { uuid: target.uuid },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const serviceTypeRaw = typeof data?.serviceType === 'string' ? data.serviceType : '';
      const normalizedServiceType = serviceTypeRaw.trim().toUpperCase();
      const responseUuid = readString(data?.uuid).trim();
      const nextUuid = responseUuid || target.uuid;
      setManageServiceType(normalizedServiceType);
      setManageStatus('success');
      setManageTarget((prev) => {
        if (!prev) return prev;
        if (prev.uuid === target.uuid) {
          return { ...prev, uuid: nextUuid, serviceType: normalizedServiceType || prev.serviceType };
        }
        if (nextUuid !== target.uuid && prev.uuid === nextUuid) {
          return { ...prev, serviceType: normalizedServiceType || prev.serviceType };
        }
        return prev;
      });
      setDependents((prev) =>
        prev.map((item) => {
          if (item.uuid === target.uuid) {
            return { ...item, uuid: nextUuid, serviceType: normalizedServiceType || item.serviceType };
          }
          if (nextUuid !== target.uuid && item.uuid === nextUuid) {
            return { ...item, serviceType: normalizedServiceType || item.serviceType };
          }
          return item;
        }),
      );
    } catch (error: unknown) {
      const message = extractErrorMessage(
        error,
        'Não foi possível sincronizar o plano do dependente.',
      );
      setManageError(message);
      setManageServiceType('');
      setManageStatus('error');
    }
  };

  const openManage = (dependent: Dependent) => {
    setManageTarget(dependent);
    setManageStatus('loading');
    setManageError('');
    setManageServiceType('');
    void syncServiceType(dependent);
  };

  const submit = async () => {
    try {
      setLoading(true);
      setErr('');
      setResp(null);

      const { data } = await axios.post(
        '/api/dependents/create',
        form,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setResp(data);

      const li = await axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } });
      const items = Array.isArray(li?.data?.dependents) ? li.data.dependents : [];
      setDependents(normalizeDependents(items));
    } catch (error: unknown) {
      const response = isRecord(error) ? error.response : null;
      const data = isRecord(response) ? response.data : null;
      if (isRecord(data)) {
        const code = readString(data.error).trim();
        if (code === 'dependents_limit_reached') {
          const limitValue = readNumber(data.limit);
          setErr(
            `Limite de dependentes atingido${
              typeof limitValue === 'number' ? ` (${limitValue})` : ''
            }. Remova um dependente ou altere seu plano.`,
          );
          return;
        }
        const backend = readString(data.backend).trim();
        const message = readString(data.message).trim();
        if (backend || message) {
          setErr(backend || message);
          return;
        }
      }
      setErr(extractErrorMessage(error, 'Erro ao criar beneficiário'));
    } finally {
      setLoading(false);
    }
  };

  const reachedLimit = limit != null && !Number.isNaN(limit) && dependents.length >= Number(limit);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Dependentes vinculados</h2>
            <p className="text-sm text-zinc-600">Cadastre novos beneficiários e acompanhe o limite disponível.</p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-1 text-xs font-semibold text-emerald-700">
            {dependents.length} cadastrados{limit && !Number.isNaN(limit) ? ` / ${limit}` : ''}
          </div>
        </div>

        {!!dependents.length && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dependents.map((dependent) => (
              <li key={dependent.uuid} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
                <p className="text-base font-semibold text-emerald-700">{dependent.name || 'Dependente sem nome'}</p>
                <p className="mt-1 font-mono text-[11px] text-zinc-400">{dependent.uuid}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-emerald-600">
                  {String(dependent.status || 'ATIVO').toUpperCase()}
                </p>
                <p className="mt-2 text-xs text-zinc-600">
                  Plano sincronizado:{' '}
                  <span className="font-semibold text-emerald-600">
                    {dependent.serviceType ? dependent.serviceType.toUpperCase() : '—'}
                  </span>
                </p>
                <div className="mt-3">
                  <button
                    onClick={() => openManage(dependent)}
                    className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                  >
                    Gerenciar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!dependents.length && (
          <p className="mt-4 text-sm text-zinc-500">
            Nenhum dependente cadastrado. Utilize o formulário abaixo para adicionar familiares ao seu plano.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Cadastrar novo dependente</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Os dados abaixo são enviados diretamente para o prontuario clínico e vinculados ao seu contrato após confirmação.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['name', 'Nome completo'],
              ['cpf', 'CPF (somente números)'],
              ['birthday', 'Data de nascimento (aaaa-mm-dd)'],
              ['phone', 'Telefone'],
              ['email', 'E-mail'],
              ['zipCode', 'CEP'],
              ['address', 'Endereço'],
              ['city', 'Cidade'],
              ['state', 'UF'],
            ] as [keyof BeneficiaryForm, string][]
          ).map(([key, label]) => (
            <div key={key} className="space-y-2 rounded-2xl border border-white/70 bg-white/80 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{label}</label>
              <input
                className="input"
                value={form[key]}
                onChange={(event) => onChange(key, event.target.value)}
                placeholder={label}
              />
            </div>
          ))}
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{String(err)}</p>}
        {resp && (
          <details className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-xs text-zinc-600">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-700">Resposta da integração</summary>
            <pre className="mt-3 whitespace-pre-wrap break-all text-[11px] leading-relaxed">{JSON.stringify(resp, null, 2)}</pre>
          </details>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={submit}
            disabled={loading || reachedLimit}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Enviando…' : 'Criar beneficiário'}
          </button>
          {reachedLimit && (
            <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
              Limite de dependentes atingido
            </span>
          )}
        </div>
      </section>
      {manageTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Gerenciar dependente</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  Sempre que este painel é aberto, o plano sincronizado do dependente é alinhado com o do titular.
                </p>
              </div>
              <button
                onClick={closeManage}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-50"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-2xl border border-white/80 bg-emerald-50/40 p-4 text-sm text-zinc-700">
              <p>
                <span className="font-semibold text-emerald-700">Nome:</span>{' '}
                {manageTarget.name || 'Dependente sem nome'}
              </p>
              <p className="font-mono text-[11px] text-zinc-500">UUID: {manageTarget.uuid}</p>
              <p>
                <span className="font-semibold text-emerald-700">Status:</span>{' '}
                {String(manageTarget.status || 'ATIVO').toUpperCase()}
              </p>
              <p>
                <span className="font-semibold text-emerald-700">Plano do titular:</span>{' '}
                {ownerServiceType || '—'}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-white p-4">
              {manageStatus === 'loading' && (
                <p className="text-sm text-emerald-700">Sincronizando plano do dependente…</p>
              )}
              {manageStatus === 'success' && (
                <div className="space-y-2 text-sm text-emerald-700">
                  <p className="font-semibold">Plano atualizado com sucesso!</p>
                  <p>
                    Dependente vinculado ao código{' '}
                    <span className="font-mono text-xs uppercase">{currentManagedServiceType || '—'}</span>.
                  </p>
                </div>
              )}
              {manageStatus === 'error' && (
                <div className="space-y-2 text-sm text-red-600">
                  <p className="font-semibold">Não foi possível sincronizar o plano.</p>
                  <p>{manageError}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => manageTarget && syncServiceType(manageTarget)}
                disabled={manageStatus === 'loading'}
                className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {manageStatus === 'loading' ? 'Sincronizando…' : 'Sincronizar novamente'}
              </button>
              <span className="text-xs text-zinc-500">
                Plano do dependente agora: {currentManagedServiceType || '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
