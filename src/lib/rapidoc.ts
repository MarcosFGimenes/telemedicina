import axios from 'axios';

const rapidoc = axios.create({
  baseURL: process.env.RAPIDOC_BASE_URL, // ex.: https://sandbox.rapidoc.tech/tema/api
  timeout: 20000,
  // optional: allow logging non-2xx responses without throwing
  validateStatus: () => true,
});

rapidoc.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  const token = process.env.RAPIDOC_TOKEN;
  const clientId = process.env.RAPIDOC_CLIENT_ID;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (clientId) {
    headers.clientId = clientId;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    // Some Rapidoc endpoints expect a header literal named `access_token`.
    // Set it explicitly and also support legacy header name in case.
    headers.access_token = token;
    headers['access-token'] = token;
  }

  if (['post', 'put', 'patch'].includes(method)) {
    headers['Content-Type'] = 'application/json';
  }

  // AxiosRequestHeaders has methods; cast to any to avoid type mismatch in this small helper.
  config.headers = ({ ...(config.headers as Record<string, string>), ...headers } as any);

  // Debug: print outgoing headers in development to verify token presence
  if (process.env.NODE_ENV !== 'production') {
    try {
      // eslint-disable-next-line no-console
      console.debug('[rapidoc] outgoing headers:', config.headers);
    } catch (e) {
      // ignore
    }
  }
  return config;
});

export default rapidoc;