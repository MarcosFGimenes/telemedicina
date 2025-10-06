export type BillingType = 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED' | 'PIX';

export type CheckoutRequestBody = {
  billingType: BillingType;
  value: number;
  description?: string;
  dueDate?: string;
  customerId?: string;
  name: string;
  cpf: string;
  email?: string;
  mobilePhone?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  birthday?: string;
  paymentType?: string;
  serviceType?: string;
  holder?: string;
  general?: string;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
};

export type AsaasPayment = {
  id: string;
  status: string;
  invoiceUrl?: string | null;
  customer?: string;
  dueDate?: string;
  value?: number;
  billingType?: BillingType;
  creditCard?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AsaasPixQrCode = {
  encodedImage: string;
  payload: string;
  expirationDate?: string | null;
  [key: string]: unknown;
};

export type CheckoutResponse = {
  paymentId: string;
  status: string;
  invoiceUrl?: string | null;
  pix?: {
    encodedImage?: string;
    payload?: string;
    expirationDate?: string | null;
  } | null;
  customerId: string;
};

export type StatusResponse = {
  status: string;
  raw: AsaasPayment;
};

export type FinalizeRequestBody = {
  cpf: string;
  paymentId: string;
};

export type FinalizeResponseBody = {
  ok: boolean;
  ensured?: {
    uuid: string;
    created: boolean;
  } | null;
  status: string;
};

export const PAYMENT_SUCCESS_STATUSES = ['RECEIVED', 'CONFIRMED'] as const;
