import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4006/api';
/** Origin that serves /uploads (API base without the /api suffix). */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/** Turns a stored photo path (`/uploads/...`) into an absolute URL; external http(s) URLs pass through. */
export const resolveAssetUrl = (src: string) => (/^https?:\/\//i.test(src) ? src : `${API_ORIGIN}${src.startsWith('/') ? '' : '/'}${src}`);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
});

// Attach auth + tenant context to every request.
api.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  const { tenant } = useTenantStore.getState();

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (tenant?.id) config.headers['x-tenant-id'] = tenant.id;

  return config;
});

// Drop the session when the API says the token is no longer valid.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url ?? '');
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/forgot-password');
    if (error.response?.status === 401 && !isAuthCall) {
      useAuthStore.getState().logout();
      useTenantStore.getState().clearTenant();
    }
    if (error.response?.status === 403 && (error.response.data as { code?: string })?.code === 'PASSWORD_CHANGE_REQUIRED' && window.location.pathname !== '/change-password') {
      window.location.assign('/change-password');
    }
    return Promise.reject(error);
  },
);

/** Extracts a human-readable message from an Axios/API error. */
export const getErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.') => {
  if (axios.isAxiosError(error)) {
    if (!error.response) return `Tidak dapat menghubungi server. Pastikan API berjalan di ${API_BASE_URL}.`;
    return (error.response.data as { message?: string })?.message ?? fallback;
  }
  return fallback;
};
