import { asaas } from '@/lib/asaas';

type AsaasListResponse<T> = {
  data: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type AsaasCustomer = {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  city?: string;
  cityName?: string;
  state?: string;
};

export type AsaasPaymentSummary = {
  id: string;
  customer: string;
  value: number;
  status: string;
  dueDate?: string;
  billingType?: string;
  description?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  creditDate?: string | null;
  dateCreated?: string;
  createdDate?: string;
  updatedAt?: string;
};

export async function getAsaasCustomer(customerId: string) {
  const { data } = await asaas.get(`/customers/${customerId}`);
  return data as AsaasCustomer;
}

export async function listAsaasPaymentsByCustomer(customerId: string, limit = 50) {
  const { data } = await asaas.get<AsaasListResponse<AsaasPaymentSummary>>('/payments', {
    params: {
      customer: customerId,
      limit: Math.min(Math.max(limit, 1), 100),
      offset: 0,
      order: 'desc',
      sort: 'dueDate',
    },
  });

  return data.data;
}

export async function getAsaasPayment(paymentId: string) {
  const { data } = await asaas.get(`/payments/${paymentId}`);
  return data as AsaasPaymentSummary;
}
