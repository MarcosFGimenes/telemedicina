'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuthContext } from '@/components/auth/AuthProvider';
import { isValidEmail, isValidPassword } from '@/utils/format';

interface AdminUser {
  uid: string;
  email: string | null;
  beneficiaryUuid: string | null;
  disabled: boolean;
  status?: string | null;
  cpf?: string | null;
  name?: string | null;
  role?: string | null;
  lastSignIn?: string | null;
  createdAt?: string | null;
}

interface UnlinkedBeneficiary {
  uuid: string;
  cpf: string;
  name: string;
  birthday?: string | null;
  phone?: string | null;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function AdminUsersPage() {
  const { token } = useAuthContext();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState('');

  const [beneficiaries, setBeneficiaries] = useState<UnlinkedBeneficiary[]>([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(false);

  const [selectedBeneficiary, setSelectedBeneficiary] = useState<UnlinkedBeneficiary | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetchUsers();
    fetchBeneficiaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  type ErrorWithStatus = Error & { status?: number };
  type ApiErrorPayload = { error?: unknown } | null;

  const callApi = async <T = unknown>(url: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error('missing_token');
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && init?.body) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, { ...init, headers });
    const data = (await response.json().catch(() => null)) as ApiErrorPayload;
    if (!response.ok) {
      const message = data && typeof data.error === 'string' ? data.error : response.statusText;
      const err = new Error(String(message)) as ErrorWithStatus;
      err.status = response.status;
      throw err;
    }
    return (data ?? {}) as T;
  };

  type UsersResponse = { users?: AdminUser[] };
  type BeneficiariesResponse = { beneficiaries?: UnlinkedBeneficiary[] };

  const fetchUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    setUsersError('');
    try {
      const data = await callApi<UsersResponse>('/api/admin/users');
      setUsers(data.users ?? []);
    } catch (error) {
      console.error('[admin][usuarios][fetchUsers]', error);
      setUsersError('Não foi possível carregar a lista de usuários.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchBeneficiaries = async () => {
    if (!token) return;
    setLoadingBeneficiaries(true);
    try {
      const data = await callApi<BeneficiariesResponse>('/api/admin/beneficiaries/unlinked');
      setBeneficiaries(data.beneficiaries ?? []);
    } catch (error) {
      console.error('[admin][usuarios][beneficiaries]', error);
      const status = (error as ErrorWithStatus)?.status;
      if (status === 401 || status === 403) {
        setActionError('Voce precisa de um acesso administrativo para listar beneficiarios.');
      } else {
        setActionError('Nao foi possivel carregar a lista de beneficiarios do prontuario clinico.');
      }
      setBeneficiaries([]);
    } finally {
      setLoadingBeneficiaries(false);
    }
  };

  const handleToggleUser = async (user: AdminUser, disabled: boolean) => {
    try {
      await callApi(`/api/admin/users/${user.uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled }),
      });
      setActionError('');
      setActionMessage(disabled ? 'Usuário desabilitado com sucesso.' : 'Usuário habilitado novamente.');
      await fetchUsers();
    } catch (error) {
      console.error('[admin][usuarios][toggle]', error);
      setActionMessage('');
      setActionError('Não foi possível atualizar o status do usuário.');
    }
  };

  const handleUpdateEmail = async (user: AdminUser) => {
    const current = user.email ?? '';
    const next = window.prompt(`Novo e-mail para ${user.name ?? user.uid}`, current);
    if (!next || next === current) return;
    if (!isValidEmail(next.trim())) {
      setActionError('Informe um e-mail válido.');
      return;
    }
    try {
      await callApi(`/api/admin/users/${user.uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ email: next.trim() }),
      });
      setActionError('');
      setActionMessage('E-mail atualizado com sucesso.');
      await fetchUsers();
    } catch (error) {
      console.error('[admin][usuarios][update-email]', error);
      setActionMessage('');
      setActionError('Não foi possível atualizar o e-mail.');
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    const password = window.prompt(`Informe a nova senha para ${user.email ?? user.uid}`);
    if (!password) return;
    if (!isValidPassword(password)) {
      setActionError('A senha deve conter pelo menos 6 caracteres.');
      return;
    }
    try {
      await callApi(`/api/admin/users/${user.uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      setActionError('');
      setActionMessage('Senha redefinida com sucesso.');
    } catch (error) {
      console.error('[admin][usuarios][reset-password]', error);
      setActionMessage('');
      setActionError('Não foi possível redefinir a senha.');
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    const confirmDelete = window.confirm(`Deseja realmente remover o usuário ${user.email ?? user.uid}?`);
    if (!confirmDelete) return;
    try {
      await callApi(`/api/admin/users/${user.uid}`, { method: 'DELETE' });
      setActionError('');
      setActionMessage('Usuário removido com sucesso.');
      await fetchUsers();
    } catch (error) {
      console.error('[admin][usuarios][delete]', error);
      setActionMessage('');
      setActionError('Não foi possível remover o usuário.');
    }
  };

  const selectedSummary = useMemo(() => {
    if (!selectedBeneficiary) return '';
    const parts = [selectedBeneficiary.name, selectedBeneficiary.cpf];
    if (selectedBeneficiary.phone) parts.push(selectedBeneficiary.phone);
    return parts.filter(Boolean).join(' • ');
  }, [selectedBeneficiary]);

  const handleCreateAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBeneficiary) return;
    if (!isValidEmail(newEmail)) {
      setActionError('Informe um e-mail válido para criar o acesso.');
      return;
    }
    if (!isValidPassword(newPassword)) {
      setActionError('A senha deve conter pelo menos 6 caracteres.');
      return;
    }
    try {
      await callApi('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          beneficiaryUuid: selectedBeneficiary.uuid,
          cpf: selectedBeneficiary.cpf,
          name: selectedBeneficiary.name,
        }),
      });
      setActionError('');
      setActionMessage('Acesso criado e vinculado ao beneficiário.');
      setSelectedBeneficiary(null);
      setNewEmail('');
      setNewPassword('');
      await Promise.all([fetchUsers(), fetchBeneficiaries()]);
    } catch (error) {
      console.error('[admin][usuarios][create-access]', error);
      setActionMessage('');
      setActionError('Não foi possível criar o acesso para o beneficiário.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="card border-emerald-100 p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-emerald-700">Usuários ativos</h2>
            <p className="text-sm text-zinc-500">Acompanhe os acessos vinculados aos beneficiários sincronizados.</p>
          </div>
          <button className="btn-secondary" onClick={fetchUsers} disabled={loadingUsers}>
            {loadingUsers ? 'Atualizando…' : 'Recarregar lista'}
          </button>
        </header>

        {usersError && <p className="mb-4 text-sm text-red-600">{usersError}</p>}
        {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
        {actionMessage && <p className="mb-4 text-sm text-emerald-700">{actionMessage}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Beneficiário</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Último acesso</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {users.map((user) => {
                const isDisabled = user.disabled || user.status === 'disabled';
                return (
                  <tr key={user.uid} className="align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-zinc-800">{user.email ?? 'sem e-mail'}</div>
                      <div className="text-xs text-zinc-500">UID: {user.uid}</div>
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-600">
                      <div>{user.name ?? '—'}</div>
                      <div className="text-xs text-zinc-500">UUID: {user.beneficiaryUuid ?? 'não vinculado'}</div>
                      {user.cpf && <div className="text-xs text-zinc-500">CPF: {user.cpf}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx('inline-flex rounded-full px-3 py-1 text-xs font-semibold', {
                          'bg-emerald-100 text-emerald-700': !isDisabled,
                          'bg-red-100 text-red-600': isDisabled,
                        })}
                      >
                        {isDisabled ? 'Inativo' : 'Ativo'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500">
                      <div>Criado: {formatDateTime(user.createdAt)}</div>
                      <div>Último acesso: {formatDateTime(user.lastSignIn)}</div>
                    </td>
                    <td className="px-3 py-3 space-y-2 text-xs">
                      <button className="btn-secondary w-full" onClick={() => handleUpdateEmail(user)}>
                        Editar e-mail
                      </button>
                      <button className="btn-secondary w-full" onClick={() => handleResetPassword(user)}>
                        Redefinir senha
                      </button>
                      <button
                        className={clsx('btn-secondary w-full', isDisabled ? 'text-emerald-700' : 'text-amber-700')}
                        onClick={() => handleToggleUser(user, !isDisabled)}
                      >
                        {isDisabled ? 'Habilitar acesso' : 'Desabilitar acesso'}
                      </button>
                      <button className="btn-secondary w-full text-red-600" onClick={() => handleDeleteUser(user)}>
                        Excluir usuário
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!users.length && !loadingUsers && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-500">
                    Nenhum usuário cadastrado até o momento.
                  </td>
                </tr>
              )}
              {loadingUsers && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-500">
                    Carregando usuários…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card border-emerald-100 p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-emerald-700">Beneficiários sem acesso</h2>
            <p className="text-sm text-zinc-500">Importamos a listagem do prontuario clinico para identificar quem ainda precisa de login.</p>
          </div>
          <button className="btn-secondary" onClick={fetchBeneficiaries} disabled={loadingBeneficiaries}>
            {loadingBeneficiaries ? 'Atualizando…' : 'Atualizar lista'}
          </button>
        </header>

        {selectedBeneficiary ? (
          <form onSubmit={handleCreateAccess} className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <p className="text-sm font-semibold text-emerald-700">{selectedSummary}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label" htmlFor="newEmail">
                  E-mail para o beneficiário
                </label>
                <input
                  id="newEmail"
                  type="email"
                  className="input"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="beneficiario@exemplo.com"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="newPassword">
                  Senha provisória
                </label>
                <input
                  id="newPassword"
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <div className="flex items-end justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setActionMessage('');
                    setActionError('');
                    setSelectedBeneficiary(null);
                    setNewEmail('');
                    setNewPassword('');
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Criar acesso
                </button>
              </div>
            </div>
          </form>
        ) : (
          <p className="mb-4 text-sm text-zinc-500">
            Selecione um beneficiário para criar o acesso rapidamente.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {beneficiaries.map((beneficiary) => (
            <button
              key={beneficiary.uuid}
              type="button"
              className={clsx(
                'rounded-2xl border p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50',
                selectedBeneficiary?.uuid === beneficiary.uuid ? 'border-emerald-400 bg-emerald-50' : 'border-emerald-100 bg-white',
              )}
              onClick={() => {
                setActionMessage('');
                setActionError('');
                setSelectedBeneficiary(beneficiary);
                setNewEmail('');
                setNewPassword('');
              }}
            >
              <p className="text-sm font-semibold text-emerald-700">{beneficiary.name}</p>
              <p className="text-xs text-zinc-500">CPF: {beneficiary.cpf}</p>
              {beneficiary.phone && <p className="text-xs text-zinc-500">Telefone: {beneficiary.phone}</p>}
              {beneficiary.birthday && <p className="text-xs text-zinc-500">Nascimento: {beneficiary.birthday}</p>}
            </button>
          ))}
        </div>

        {!beneficiaries.length && !loadingBeneficiaries && (
          <p className="mt-4 text-sm text-zinc-500">Todos os beneficiários possuem acesso cadastrado.</p>
        )}
      </section>
    </div>
  );
}
