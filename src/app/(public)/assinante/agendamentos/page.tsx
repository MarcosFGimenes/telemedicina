'use client';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/components/auth/AuthProvider';

type Specialty = { id?: string; uuid?: string; name?: string; [key: string]: unknown };
type Availability = unknown;
type AppointmentResp = { uuid?: string; id?: string; [key: string]: unknown };

type SlotOption = {
  id: string;
  label: string;
};

export default function AssinanteAgendamentosPage() {
  const { token } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [specId, setSpecId] = useState("");
  const [disp, setDisp] = useState<Availability[]>([]);
  const [slotId, setSlotId] = useState("");
  const [beneficiaryUuid, setBeneficiaryUuid] = useState("");
  const [patients, setPatients] = useState<{ uuid: string; label: string }[]>([]);
  const [dateInitial, setDateInitial] = useState<string>("");
  const [dateFinal, setDateFinal] = useState<string>("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadSpecs = async () => {
      try {
        setError("");
        const { data } = await axios.get("/api/rapidoc/especialidades");
        setSpecs(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(
          e?.response?.data?.backend?.message ||
            e?.response?.data?.message ||
            e?.message ||
            "Erro ao listar especialidades"
        );
      }
    };

    loadSpecs();
  }, []);

  useEffect(() => {
    const loadPatients = async () => {
      if (!token) return;
      try {
        const [meRes, depRes] = await Promise.all([
          axios.get('/api/me', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/dependents', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const opts: { uuid: string; label: string }[] = [];
        const me = meRes?.data?.user || {};
        if (me?.beneficiaryUuid) {
          opts.push({ uuid: String(me.beneficiaryUuid), label: me?.name ? `${me.name} (Titular)` : 'Titular' });
        }
        const deps = Array.isArray(depRes?.data?.dependents) ? depRes.data.dependents : [];
        deps.forEach((d: any) => {
          if (d?.uuid) opts.push({ uuid: String(d.uuid), label: d?.name ? String(d.name) : `Dependente ${String(d.uuid).slice(0, 6)}…` });
        });
        setPatients(opts);
        if (opts.length) setBeneficiaryUuid(opts[0].uuid);
      } catch {}
    };
    loadPatients();
  }, [token]);

  const onSelectSpec = async (id: string) => {
    setSpecId(id);
    setSlotId("");
    setDisp([]);
    setResult(null);
    setError("");

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
      const { data } = await axios.get("/api/rapidoc/disponibilidade", {
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
          "Erro ao listar disponibilidade",
      );
    }
  };

  // Recarrega disponibilidade quando paciente ou período mudar
  useEffect(() => {
    if (specId) {
      onSelectSpec(specId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beneficiaryUuid, dateInitial, dateFinal]);

  const computeSlotId = (entry: any): string | undefined => {
    if (!entry) {
      return undefined;
    }

    return entry.id ?? entry.uuid ?? entry.slotId ?? entry.code;
  };

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
        rows.push({ id: String(id), label: String(label) });
      });
    });

    return rows;
  }, [disp]);

  const createAppointment = async () => {
    if (!beneficiaryUuid || !specId || !slotId) {
      setError("Preencha beneficiario, especialidade e slot.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const payload = {
        beneficiaryUuid,
        specialtyId: specId,
        slotId,
      };

      const { data } = await axios.post<AppointmentResp>(
        "/api/rapidoc/agendamentos",
        payload
      );

      setResult(data);
    } catch (e: any) {
      setError(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.message ||
          "Erro ao agendar"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Agendamentos</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-3">
          <label className="label">Atendimento para</label>
          <select
            className="select"
            value={beneficiaryUuid}
            onChange={(e) => setBeneficiaryUuid(e.target.value)}
          >
            {!patients.length && <option value="">Nenhum beneficiário encontrado</option>}
            {patients.map((p) => (
              <option key={p.uuid} value={p.uuid}>{p.label}</option>
            ))}
          </select>
          {!patients.length && (
            <p className="mt-1 text-xs text-zinc-500">Cadastre seu beneficiário ou um dependente para agendar.</p>
          )}
        </div>

        <div className="rounded-lg border bg-white p-3">
          <label className="label">Período</label>
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
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => { setDateInitial(''); setDateFinal(''); }}
              className="btn-ghost px-3 py-1 !text-xs"
            >Esta semana</button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(); const n = new Date(); n.setDate(d.getDate() + 14);
                const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
                setDateInitial(fmt(d)); setDateFinal(fmt(n));
              }}
              className="btn-ghost px-3 py-1 !text-xs"
            >Próximas 2 semanas</button>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-3">
          <label className="label">Especialidade</label>
          <select
            className="select"
            value={specId}
            onChange={(event) => onSelectSpec(event.target.value)}
          >
            <option value="">Selecione...</option>
            {specs.map((spec, index) => {
              const id = spec.id || spec.uuid || String(index);
              return (
                <option key={String(id)} value={String(id)}>
                  {spec.name || `Especialidade ${id}`}
                </option>
              );
            })}
          </select>
        </div>

        <div className="rounded-lg border bg-white p-3">
          <label className="label">Horario (slot)</label>
          <select
            className="select"
            value={slotId}
            onChange={(event) => setSlotId(event.target.value)}
            disabled={!allSlots.length}
          >
            <option value="">
              {allSlots.length ? "Selecione..." : "Sem slots"}
            </option>
            {allSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label} ({slot.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={createAppointment}
          disabled={loading}
          className="btn-primary disabled:opacity-60"
        >
          {loading ? "Agendando..." : "Agendar"}
        </button>
        <button
          onClick={async () => {
            setError(''); setResult(null);
            try {
              if (!beneficiaryUuid) { setError('Selecione o beneficiário.'); return; }
              const { data } = await axios.get(`/api/rapidoc/beneficiaries/${beneficiaryUuid}/request-appointment`);
              if (data?.url) {
                window.open(String(data.url), '_blank');
              } else {
                setResult(data);
              }
            } catch (e: any) {
              setError(e?.response?.data?.message || e?.message || 'Falha ao solicitar atendimento');
            }
          }}
          className="btn-outline"
        >Atendimento imediato</button>
      </div>

      {error && <p className="text-sm text-red-600">{String(error)}</p>}

      {result && (
        <pre className="whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
