import { asaas } from '@/lib/asaas';

export async function getAsaasCustomer(customerId: string) {
  const { data } = await asaas.get(`/customers/${customerId}`);
  return data as {
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
}