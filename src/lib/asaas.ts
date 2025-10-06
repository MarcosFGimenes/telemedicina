import axios from 'axios';

export const asaas = axios.create({
  baseURL: process.env.ASAAS_API_URL,
  timeout: 20000,
});

asaas.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  const token = process.env.ASAAS_API_KEY ?? '';

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (['post', 'put', 'patch'].includes(method)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.access_token = token.startsWith('$') ? token : `$${token}`;
  }

  config.headers = {
    ...(config.headers as Record<string, string>),
    ...headers,
  };

  return config;
});

export default asaas;