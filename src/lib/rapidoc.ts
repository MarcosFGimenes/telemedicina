import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';

export const sanitizeCPF = (cpf: string) => cpf.replace(/\D/g, '');

type RapidocRequestMeta = {
  id: string;
  start: number;
  url: string;
  method: string;
};

declare module 'axios' {
  interface AxiosRequestConfig {
    metadata?: RapidocRequestMeta;
  }
}

const MAX_LOG_BODY = 2000;
let warnedInsecureBaseUrl = false;

const rawBaseURL = (process.env.RAPIDOC_BASE_URL ?? '').trim();
if (!rawBaseURL) {
  throw new Error('RAPIDOC_BASE_URL is not defined');
}

let baseURL = rawBaseURL;
if (baseURL.startsWith('http://')) {
  baseURL = baseURL.replace(/^http:\/\//, 'https://');
  if (!warnedInsecureBaseUrl) {
    console.warn('[rapidoc] Normalizing RAPIDOC_BASE_URL to https. Original:', rawBaseURL);
    warnedInsecureBaseUrl = true;
  }
}

const rapidoc = axios.create({
  baseURL,
  timeout: 30000,
});

const buildUrl = (config: AxiosRequestConfig, fallbackBase: string) => {
  const url = config.url ?? '';
  const base = config.baseURL ?? fallbackBase;
  const target = new URL(url, base);
  if (config.params && typeof config.params === 'object') {
    Object.entries(config.params).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      target.searchParams.set(key, String(value));
    });
  }
  return target.toString();
};

const maskUrl = (value: string) => value.replace(/\d{5,}/g, '*********');

const truncate = (value: string) => (value.length <= 8 ? value : `${value.slice(0, 8)}…`);

const sanitizeHeadersForLog = (headers: Record<string, unknown>) => {
  const sanitized: Record<string, string> = {};
  Object.entries(headers || {}).forEach(([key, rawValue]) => {
    if (rawValue === undefined || rawValue === null) {
      return;
    }
    const value = String(rawValue);
    if (key.toLowerCase() === 'authorization') {
      sanitized[key] = value.startsWith('Bearer ')
        ? `Bearer ${truncate(value.slice(7))}`
        : truncate(value);
      return;
    }
    if (key.toLowerCase().includes('token')) {
      sanitized[key] = truncate(value);
      return;
    }
    sanitized[key] = value.length > 64 ? `${value.slice(0, 32)}…` : value;
  });
  return sanitized;
};

const stringifyBody = (data: unknown) => {
  if (data === undefined || data === null) {
    return 'null';
  }
  let serialized: string;
  if (typeof data === 'string') {
    serialized = data;
  } else {
    try {
      serialized = JSON.stringify(data);
    } catch {
      serialized = '[unserializable]';
    }
  }
  if (serialized.length > MAX_LOG_BODY) {
    return `${serialized.slice(0, MAX_LOG_BODY)}…`;
  }
  return serialized;
};

const byteLength = (value: string) => {
  try {
    return Buffer.byteLength(value, 'utf8');
  } catch {
    return value.length;
  }
};

rapidoc.interceptors.request.use((config) => {
  const id = Math.random().toString(36).slice(2, 10);
  const method = (config.method ?? 'get').toUpperCase();
  const token = process.env.RAPIDOC_TOKEN ?? '';
  const clientId = process.env.RAPIDOC_CLIENT_ID ?? '';

  const existingHeaders: Record<string, unknown> = {
    ...(config.headers ? (typeof config.headers === 'object' ? config.headers : {}) : {}),
  };

  delete existingHeaders.access_token;
  delete existingHeaders['access-token'];
  delete existingHeaders.AccessToken;

  const hasCustomContentType = Object.keys(existingHeaders).some(
    (key) => key.toLowerCase() === 'content-type',
  );

  const mergedHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (clientId) {
    mergedHeaders.clientId = clientId;
  }

  if (token) {
    mergedHeaders.Authorization = `Bearer ${token}`;
  }

  if (!['GET', 'DELETE'].includes(method) && !hasCustomContentType) {
    mergedHeaders['Content-Type'] = 'application/vnd.rapidoc.tema-v2+json';
  }

  Object.entries(existingHeaders).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    mergedHeaders[key] = String(value);
  });

  if (method === 'GET' || method === 'DELETE') {
    delete mergedHeaders['Content-Type'];
    delete mergedHeaders['content-type'];
  }

  config.headers = mergedHeaders;

  const requestUrl = buildUrl(config, baseURL);
  config.metadata = {
    id,
    start: Date.now(),
    url: requestUrl,
    method,
  };

  const logHeaders = sanitizeHeadersForLog(mergedHeaders as Record<string, unknown>);
  console.info(
    `[rapidoc:req:${id}] ${method} ${maskUrl(requestUrl)} headers=${JSON.stringify(logHeaders)}`,
  );

  return config;
});

rapidoc.interceptors.response.use(
  (response: AxiosResponse) => {
    const meta = response.config.metadata;
    const duration = meta ? Date.now() - meta.start : 0;
    const snippet = stringifyBody(response.data);
    console.info(
      `[rapidoc:res:${meta?.id ?? 'unknown'}] ${response.status} (${duration}ms) size=${byteLength(snippet)}`,
    );
    return response;
  },
  (error: AxiosError) => {
    const config = error.config as AxiosRequestConfig;
    const meta = config?.metadata;
    const duration = meta ? Date.now() - meta.start : 0;
    const status = error.response?.status ?? 'ERR';
    const snippet = error.response ? stringifyBody(error.response.data) : 'null';
    console.error(
      `[rapidoc:err:${meta?.id ?? 'unknown'}] ${status} (${duration}ms) data=${snippet}`,
    );
    return Promise.reject(error);
  },
);

export default rapidoc;
