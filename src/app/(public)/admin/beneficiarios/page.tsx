'use client';

import axios from 'axios';
import { FormEvent, useMemo, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';
import PlanChangeDialog from '@/components/plan/PlanChangeDialog';
import PaymentMethodDialog from '@/components/plan/PaymentMethodDialog';
import { normalizeBeneficiaryRecord, type BeneficiaryRecord } from '@/utils/beneficiary';

type ActionResult = Record<string, unknown> | Record<string, unknown>[] | null;

type BeneficiaryForm = {
  name: string;
  birthday: string;
  phone: string;
  email: string;
  zipCode: string;
  address: string;
  city: string;
  state: string;
  paymentType: '' | 'S' | 'A';
  serviceType: string;
};

const initialFormState: BeneficiaryForm = {
  name: '',
  birthday: '',
  phone: '',
  email: '',
  zipCode: '',
  address: '',
  city: '',
  state: '',
  paymentType: '',
  serviceType: '',
};

const sanitizeCpf = (value: string) => value.replace(/\D/g, '');

const ensureRecord = (payload: unknown): Record<string, unknown> | null => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return item as Record<string, unknown>;
      }
    }
  }
  return null;
};

const extractBeneficiaryId = (payload: any): string | undefined => {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return payload.uuid || payload.id || payload.beneficiaryUuid;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const id = extractBeneficiaryId(item);
      if (id) {
        return id;
      }
    }
  }

  return undefined;
};

const paymentTypeLabel = (value?: string | null) => {
  switch ((value || '').toUpperCase()) {
    case 'S':
      return 'Cartão / assinatura (S)';
    case 'A':
      return 'Boleto / avulso (A)';
    default:
      return 'Não informado';
  }
};

const statusLabel = (value?: boolean | null) => {
  if (value === true) return 'Ativo';
  if (value === false) return 'Inativo';
  return 'Desconhecido';
};

const toUpper = (value: string) => value.trim().toUpperCase();

export default function AdminBeneficiariosPage() {
  const { token } = useAuthContext();
  const [cpf, setCpf] = useState('');
  const [lastCpf, setLastCpf] = useState('');
  const [data, setData] = useState<ActionResult>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [selected, setSelected] = useState<BeneficiaryRecord | null>(null);
  const [form, setForm] = useState<BeneficiaryForm>({ ...initialFormState });
  const [updateError, setUpdateError] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showPlanChange, setShowPlanChange] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const updateFormFromBeneficiary = (beneficiary: BeneficiaryRecord | null) => {
    if (!beneficiary) {
      setForm({ ...initialFormState });
      return;
    }
    setForm({
      name: beneficiary.name || '',
      birthday: beneficiary.birthday || '',
      phone: beneficiary.phone || '',
      email: beneficiary.email || '',
      zipCode: beneficiary.zipCode || '',
      address: beneficiary.address || '',
      city: beneficiary.city || '',
      state: beneficiary.state || '',
      paymentType: beneficiary.paymentType === 'A' ? 'A' : beneficiary.paymentType === 'S' ? 'S' : '',
      serviceType: beneficiary.serviceType || '',
    });
  };

  const buscar = async (inputCpf?: string) => {
    const target = inputCpf ?? cpf;
    const digits = sanitizeCpf(target);
    if (!digits) {
      setErr('Informe um CPF para consulta.');
      return;
    }

    setErr('');
    setUpdateError('');
    setUpdateMessage('');
    setData(null);
    setBeneficiaryId('');
    setSelected(null);
    setLoading(true);

    try {
      const { data: response } = await axios.get(`/api/rapidoc/beneficiaries/cpf/${digits}`);
      setData(response as ActionResult);
      setLastCpf(digits);
      setCpf(digits);

      const id = extractBeneficiaryId(response);
      if (id) {
        setBeneficiaryId(String(id));
      }

      const record = ensureRecord(response);
      if (record) {
        const normalized = normalizeBeneficiaryRecord(record, digits);
        setSelected(normalized);
        setBeneficiaryId(normalized.uuid || id || '');
        updateFormFromBeneficiary(normalized);
      } else {
        updateFormFromBeneficiary(null);
      }
    } catch (e: any) {
      setErr(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.message ||
          'Erro ao buscar CPF',
      );
      setSelected(null);
      updateFormFromBeneficiary(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrent = async () => {
    const candidateCpf = selected?.cpf || lastCpf || sanitizeCpf(cpf);
    if (candidateCpf) {
      await buscar(candidateCpf);
      return;
    }
    const id = selected?.uuid || beneficiaryId;
    if (!id) {
      return;
    }
    try {
      setLoading(true);
      const { data: response } = await axios.get(`/api/rapidoc/beneficiaries/${encodeURIComponent(id)}`);
      setData(response as ActionResult);
      const record = ensureRecord(response);
      if (record) {
        const normalized = normalizeBeneficiaryRecord(record, candidateCpf);
        setSelected(normalized);
        setBeneficiaryId(normalized.uuid || id);
        if (normalized.cpf) {
          setCpf(normalized.cpf);
          setLastCpf(normalized.cpf);
        }
        updateFormFromBeneficiary(normalized);
      }
    } catch (error) {
      console.error('[admin][beneficiarios][refresh]', error);
    } finally {
      setLoading(false);
    }
  };

  const inativar = async () => {
    const id = selected?.uuid || beneficiaryId;
    if (!id) {
      setErr('Selecione um beneficiário para inativar.');
      return;
    }

    setErr('');

    try {
      await axios.delete(`/api/rapidoc/beneficiaries/${encodeURIComponent(id)}/inactive`);
      alert('Beneficiário inativado com sucesso');
      await refreshCurrent();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Erro ao inativar');
    }
  };

  const reativar = async () => {
    const id = selected?.uuid || beneficiaryId;
    if (!id) {
      setErr('Selecione um beneficiário para reativar.');
      return;
    }

    setErr('');

    try {
      await axios.put(`/api/rapidoc/beneficiaries/${encodeURIComponent(id)}/reactivate`, {});
      alert('Beneficiário reativado com sucesso');
      await refreshCurrent();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Erro ao reativar');
    }
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = selected?.uuid || beneficiaryId;
    if (!id) {
      setUpdateError('Nenhum beneficiário selecionado para atualização.');
      return;
    }

    const name = form.name.trim() || selected?.name || '';
    const birthday = form.birthday || selected?.birthday || '';
    const phone = form.phone.replace(/\D/g, '') || selected?.phone || '';
    const email = form.email.trim() || selected?.email || '';
    const zipCode = form.zipCode.replace(/\D/g, '') || selected?.zipCode || '';
    const address = form.address.trim() || selected?.address || '';
    const city = form.city.trim() || selected?.city || '';
    const state = form.state.trim().toUpperCase() || selected?.state || '';
    const paymentType = (form.paymentType || selected?.paymentType || 'S').toUpperCase() as 'S' | 'A';
    const serviceType = toUpper(form.serviceType || selected?.serviceType || '');

    if (!name || !birthday || !serviceType) {
      setUpdateError('Nome, data de nascimento e código de plano são obrigatórios.');
      return;
    }

    try {
      setUpdating(true);
      setUpdateError('');
      setUpdateMessage('');

      const payload: Record<string, unknown> = {
        name,
        birthday,
        phone: phone || null,
        email: email || null,
        zipCode: zipCode || null,
        address: address || null,
        city: city || null,
        state: state || null,
        paymentType,
        serviceType,
      };

      await axios.put(`/api/rapidoc/beneficiaries/${encodeURIComponent(id)}`, payload);
      setUpdateMessage('Dados do beneficiário atualizados com sucesso.');
      await refreshCurrent();
    } catch (error: any) {
      setUpdateError(
        error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Falha ao atualizar dados.',
      );
    } finally {
      setUpdating(false);
    }
  };

  const planChangeTarget = useMemo(() => {
    const uuid = selected?.uuid || beneficiaryId || '';
    const targetCpf = selected?.cpf || lastCpf || sanitizeCpf(cpf);
    if (!uuid && !targetCpf) {
      return undefined;
    }
    return {
      beneficiaryUuid: uuid || undefined,
      cpf: targetCpf || undefined,
    };
  }, [beneficiaryId, cpf, lastCpf, selected]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Consulta de beneficiários</h2>
        <p className="mt-1 text-sm text-zinc-600">Busque titulares por CPF, visualize payloads e altere status rapidamente.</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">CPF</label>
            <input
              className="input"
              value={cpf}
              onChange={(event) => setCpf(event.target.value)}
              placeholder="Somente números"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => buscar()}
              disabled={loading}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCpf('');
                setLastCpf('');
                setData(null);
                setBeneficiaryId('');
                setSelected(null);
                setErr('');
                setUpdateError('');
                setUpdateMessage('');
                updateFormFromBeneficiary(null);
              }}
              className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Limpar
            </button>
          </div>
        </div>

        {beneficiaryId && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-semibold text-emerald-700">
              Beneficiário: {beneficiaryId}
            </span>
            <button
              onClick={inativar}
              className="rounded-full border border-red-200 px-3 py-1 font-semibold text-red-600 transition hover:bg-red-50"
            >
              Inativar
            </button>
            <button
              onClick={reativar}
              className="rounded-full border border-emerald-200 px-3 py-1 font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Reativar
            </button>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{String(err)}</p>}
      </section>

      {selected && (
        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Resumo do beneficiário</p>
              <p className="mt-2 text-lg font-semibold text-emerald-800">{selected.name}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-700">
                <span className="rounded-full bg-white/70 px-3 py-1">CPF: {selected.cpf}</span>
                <span className="rounded-full bg-white/70 px-3 py-1">UUID: {selected.uuid}</span>
                <span className="rounded-full bg-white/70 px-3 py-1">Status: {statusLabel(selected.isActive)}</span>
                <span className="rounded-full bg-white/70 px-3 py-1">
                  Plano Rapidoc: {selected.serviceType ? selected.serviceType : '—'}
                </span>
                <span className="rounded-full bg-white/70 px-3 py-1">
                  Pagamento: {paymentTypeLabel(selected.paymentType)}
                </span>
                <span className="rounded-full bg-white/70 px-3 py-1">
                  Dependentes vinculados: {Array.isArray(selected.dependents) ? selected.dependents.length : 0}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowPlanChange(true)}
                  disabled={!planChangeTarget || !token}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  Alterar plano
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaymentDialog(true)}
                  disabled={!planChangeTarget || !token}
                  className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                >
                  Atualizar forma de pagamento
                </button>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleUpdate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Nome completo</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Data de nascimento</label>
                  <input
                    className="input"
                    type="date"
                    value={form.birthday}
                    onChange={(event) => setForm((prev) => ({ ...prev, birthday: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Telefone</label>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="DDD + número"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">E-mail</label>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">CEP</label>
                  <input
                    className="input"
                    value={form.zipCode}
                    onChange={(event) => setForm((prev) => ({ ...prev, zipCode: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Endereço</label>
                  <input
                    className="input"
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Cidade</label>
                  <input
                    className="input"
                    value={form.city}
                    onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Estado</label>
                  <input
                    className="input"
                    value={form.state}
                    onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value.toUpperCase() }))}
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Tipo de pagamento</label>
                  <select
                    className="input"
                    value={form.paymentType}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, paymentType: event.target.value as BeneficiaryForm['paymentType'] }))
                    }
                  >
                    <option value="">Manter atual</option>
                    <option value="S">Cartão / assinatura (S)</option>
                    <option value="A">Boleto / avulso (A)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Código do plano Rapidoc</label>
                  <input
                    className="input"
                    value={form.serviceType}
                    onChange={(event) => setForm((prev) => ({ ...prev, serviceType: event.target.value }))}
                    placeholder="Ex.: GS, GP, GSP"
                    required
                  />
                </div>
              </div>

              {updateError && <p className="text-sm text-red-600">{updateError}</p>}
              {updateMessage && <p className="text-sm text-emerald-600">{updateMessage}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={updating}
                  className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {updating ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {data && (
        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Retorno da Rapidoc</h3>
          <pre className="mt-3 whitespace-pre-wrap break-all rounded-2xl border border-white/60 bg-white/80 p-4 text-[11px] leading-relaxed text-zinc-600">
            {JSON.stringify(data, null, 2)}
          </pre>
        </section>
      )}

      {!data && !loading && !selected && (
        <section className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-sm text-emerald-700">
          <p>
            Consulte um CPF para visualizar o payload completo, identificar o UUID do beneficiário e executar ações de ativação
            ou suspensão diretamente pela API Rapidoc.
          </p>
        </section>
      )}

      <PlanChangeDialog
        open={showPlanChange && Boolean(planChangeTarget)}
        onClose={() => setShowPlanChange(false)}
        token={token || null}
        mode="admin"
        target={planChangeTarget}
        onSuccess={() => {
          setShowPlanChange(false);
          void refreshCurrent();
        }}
      />
      <PaymentMethodDialog
        open={showPaymentDialog && Boolean(planChangeTarget)}
        onClose={() => setShowPaymentDialog(false)}
        token={token || null}
        mode="admin"
        target={planChangeTarget}
        onSuccess={() => {
          setShowPaymentDialog(false);
          void refreshCurrent();
        }}
      />
    </div>
  );
}

