'use client';
import axios from 'axios';
import { useState } from 'react';

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

export default function AssinanteDependentesPage() {
  const [form, setForm] = useState<BeneficiaryForm>({
    name: "",
    cpf: "",
    birthday: "",
    phone: "",
    email: "",
    zipCode: "",
    address: "",
    city: "",
    state: "",
  });
  const [resp, setResp] = useState<unknown>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (key: keyof BeneficiaryForm, value: string) => {
    setForm((state) => ({ ...state, [key]: value }));
  };

  const submit = async () => {
    try {
      setLoading(true);
      setErr("");
      setResp(null);

      const payload = [form];
      const { data } = await axios.post("/api/rapidoc/beneficiaries", payload);
      setResp(data);
    } catch (e: any) {
      setErr(
        e?.response?.data?.backend ||
          e?.response?.data?.message ||
          e?.message ||
          "Erro ao criar beneficiario"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Dependentes e Beneficiarios</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(form).map(([key, value]) => (
          <div key={key} className="rounded-lg border bg-white p-3">
            <label className="mb-1 block text-sm font-medium">{key}</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={value}
              onChange={(event) => onChange(key as keyof BeneficiaryForm, event.target.value)}
              placeholder={key === "birthday" ? "dd/mm/aaaa" : ""}
            />
          </div>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={loading}
        className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
      >
        {loading ? "Enviando..." : "Criar beneficiario"}
      </button>

      {err && <p className="text-sm text-red-600">{String(err)}</p>}
      {resp && (
        <pre className="whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs">
          {JSON.stringify(resp, null, 2)}
        </pre>
      )}
    </div>
  );
}