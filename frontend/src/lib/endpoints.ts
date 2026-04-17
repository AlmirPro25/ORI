const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const normalizeConfiguredUrl = (value?: string) => {
  const configured = String(value || '').trim();
  if (!configured) return '';
  return trimTrailingSlash(configured).replace(/\/api\/v1$/i, '');
};

const rewriteLocalhostForBrowser = (url: string) => {
  if (typeof window === 'undefined') return url;

  const browserHostname = window.location.hostname;
  if (!browserHostname || browserHostname === 'localhost' || browserHostname === '127.0.0.1') {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.hostname = browserHostname;
      return trimTrailingSlash(parsed.toString());
    }
  } catch (_) {
    return url;
  }

  return url;
};

const getBrowserHostUrl = (port: number) => {
  if (typeof window === 'undefined') return '';

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname;

  if (!hostname) return '';
  return `${protocol}//${hostname}:${port}`;
};

const resolveServiceUrl = (configuredValue: string | undefined, fallbackPort: number) => {
  const configured = normalizeConfiguredUrl(configuredValue);
  if (configured) return rewriteLocalhostForBrowser(configured);

  const browserUrl = getBrowserHostUrl(fallbackPort);
  if (browserUrl) return browserUrl;

  return `http://127.0.0.1:${fallbackPort}`;
};

export const BACKEND_URL = resolveServiceUrl(import.meta.env.VITE_API_BASE_URL as string | undefined, 3000);
export const NEXUS_URL = resolveServiceUrl(import.meta.env.VITE_NEXUS_URL as string | undefined, 3005);
export const GATEWAY_URL = resolveServiceUrl(import.meta.env.VITE_GATEWAY_URL as string | undefined, 3333);
export const SOCKET_URL = BACKEND_URL;
export const API_BASE_URL = BACKEND_URL;
