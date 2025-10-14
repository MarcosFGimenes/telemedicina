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
  phone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  city?: string;
  cityName?: string;
  state?: string;
  birthDate?: string;
};

export type AsaasSubscription = {
  id: string;
  customer: string;
  status: string;
  value?: number;
  description?: string;
  cycle?: string;
  nextDueDate?: string;
  billingType?: string;
  creditCardToken?: string | null;
  creditCard?: unknown;
  endDate?: string | null;
  paymentLink?: string | null;
};

export const ASAAS_PAID_STATUSES = new Set([
  'CONFIRMED',
  'RECEIVED',
  'RECEIVED_IN_CASH',
  'RECEIVED_PIX',
  'RECEIVED_BANK',
]);

export const ASAAS_PENDING_STATUSES = new Set([
  'PENDING',
  'OVERDUE',
  'AWAITING_RISK_ANALYSIS',
  'AWAITING_CHARGEBACK_REVERSAL',
  'AWAITING_PAYMENT',
]);

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
  subscription?: string | null;
  subscriptionId?: string | null;
};

const clampLimit = (limit?: number) => {
  const value = typeof limit === 'number' ? limit : 50;
  return Math.min(Math.max(value, 1), 100);
};

const sanitizeDocument = (value: string) => value.replace(/\D/g, '');

export async function getAsaasCustomer(customerId: string) {
  const { data } = await asaas.get(`/customers/${customerId}`);
  return data as AsaasCustomer;
}

export async function searchAsaasCustomersByCpf(cpf: string) {
  const document = sanitizeDocument(cpf);
  const { data } = await asaas.get<AsaasListResponse<AsaasCustomer>>('/customers', {
    params: {
      cpfCnpj: document,
      limit: 1,
      offset: 0,
    },
  });

  return data.data;
}

export async function findAsaasCustomerByCpf(cpf: string) {
  const [customer] = await searchAsaasCustomersByCpf(cpf);
  return customer ?? null;
}

export async function listAsaasSubscriptionsByCustomer(
  customerId: string,
  options: { status?: string; limit?: number } = {},
) {
  const params: Record<string, string | number> = {
    customer: customerId,
    limit: clampLimit(options.limit),
    offset: 0,
  };

  if (options.status) {
    params.status = options.status;
  }

  const { data } = await asaas.get<AsaasListResponse<AsaasSubscription>>('/subscriptions', {
    params,
  });

  return data.data;
}

export async function listAsaasPaymentsByCustomer(
  customerId: string,
  options: { limit?: number; status?: string; subscription?: string } = {},
) {
  const params: Record<string, string | number> = {
    customer: customerId,
    limit: clampLimit(options.limit),
    offset: 0,
    order: 'desc',
    sort: 'dueDate',
  };

  if (options.status) {
    params.status = options.status;
  }

  if (options.subscription) {
    params.subscription = options.subscription;
  }

  const { data } = await asaas.get<AsaasListResponse<AsaasPaymentSummary>>('/payments', {
    params,
  });

  return data.data;
}

export async function getAsaasPayment(paymentId: string) {
  const { data } = await asaas.get(`/payments/${paymentId}`);
  return data as AsaasPaymentSummary;
}

export async function getAsaasSubscription(subscriptionId: string) {
  const { data } = await asaas.get<AsaasSubscription>(`/subscriptions/${subscriptionId}`);
  return data;
}

export type UpdateSubscriptionPayload = Partial<
  Pick<AsaasSubscription, 'value' | 'description' | 'nextDueDate' | 'billingType' | 'cycle' | 'status' | 'creditCardToken'>
> & {
  updatePendingPayments?: boolean;
  creditCard?: null;
};

export async function updateAsaasSubscription(
  subscriptionId: string,
  payload: UpdateSubscriptionPayload,
) {
  const { data } = await asaas.put(`/subscriptions/${subscriptionId}`, payload);
  return data as AsaasSubscription;
}

export async function findCustomerByCpf(cpf: string) {
  return findAsaasCustomerByCpf(cpf);
}

export async function listSubscriptionsByCustomer(customerId: string, status?: string) {
  return listAsaasSubscriptionsByCustomer(customerId, { status, limit: 100 });
}

export async function listPaymentsOfSubscription(subscriptionId: string, status?: string) {
  const params: Record<string, string> = {};
  if (status) {
    params.status = status;
  }

  const { data } = await asaas.get<AsaasListResponse<AsaasPaymentSummary>>(
    `/subscriptions/${subscriptionId}/payments`,
    { params },
  );

  return data.data;
}

export async function updateSubscriptionStatus(subscriptionId: string, status: 'ACTIVE' | 'INACTIVE') {
  const { data } = await asaas.put(`/subscriptions/${subscriptionId}`, { status });
  return data as AsaasSubscription;
}
