import rapidoc from '@/lib/rapidoc';

export type BeneficiaryInput = {
  name: string;
  cpf: string;
  birthday?: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  paymentType?: string;
  serviceType?: string;
  holder?: string;
  general?: string;
};

export async function getBeneficiaryByCPF(cpf: string) {
  const response = await rapidoc.get(`/beneficiaries/${cpf}`);
  return response.data;
}

export async function createBeneficiaryOne(payload: BeneficiaryInput) {
  const response = await rapidoc.post('/beneficiaries', [payload]);
  const data = Array.isArray(response.data) ? response.data[0] : response.data;
  const uuid = data?.uuid || data?.id;
  return { raw: data, uuid };
}

export async function reactivateBeneficiary(
  beneficiaryId: string,
  payload: BeneficiaryInput,
) {
  const response = await rapidoc.put(`/beneficiaries/${beneficiaryId}/reactivate`, payload);
  return response.data;
}

export async function ensureBeneficiaryByCPF(payload: BeneficiaryInput) {
  try {
    const found = await getBeneficiaryByCPF(payload.cpf);
    const uuid = found?.uuid || found?.id;
    return { uuid, created: false, data: found };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 404) {
      const { uuid, raw } = await createBeneficiaryOne(payload);
      return { uuid, created: true, data: raw };
    }
    throw error;
  }
}