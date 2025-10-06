'use client';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';

type Specialty = { id?: string; uuid?: string; name?: string; [key: string]: unknown };
type Availability = unknown;
type AppointmentResp = { uuid?: string; id?: string; [key: string]: unknown };

type SlotOption = {
  id: string;
  label: string;
};

export default function AssinanteAgendamentosPage() {
  const [loading, setLoading] = useState(false);
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [specId, setSpecId] = useState("");
  const [disp, setDisp] = useState<Availability[]>([]);
  const [slotId, setSlotId] = useState("");
  const [beneficiaryUuid, setBeneficiaryUuid] = useState("");
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
      const { data } = await axios.get("/api/rapidoc/disponibilidade", {
        params: { specialtyId: id },
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
        e?.response?.data?.backend?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "Erro ao listar disponibilidade"
      );
    }
  };

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

        const label = slot?.label || slot?.time || `Slot ${index + 1}`;
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
          <label className="mb-1 block text-sm font-medium">Beneficiary UUID</label>
          <input
            value={beneficiaryUuid}
            onChange={(event) => setBeneficiaryUuid(event.target.value)}
            placeholder="ex.: 1b2c3d-..."
            className="w-full rounded-md border px-3 py-2"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Copie o UUID retornado na criacao do beneficiario ou busque por CPF na area admin.
          </p>
        </div>

        <div className="rounded-lg border bg-white p-3">
          <label className="mb-1 block text-sm font-medium">Especialidade</label>
          <select
            className="w-full rounded-md border px-3 py-2"
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
          <label className="mb-1 block text-sm font-medium">Horario (slot)</label>
          <select
            className="w-full rounded-md border px-3 py-2"
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
          className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {loading ? "Agendando..." : "Agendar"}
        </button>
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