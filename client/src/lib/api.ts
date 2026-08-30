import axios, { AxiosError, type AxiosInstance } from 'axios';
import type { ApiError } from '@artinu/shared';

const TOKEN_KEY = 'artinu.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable — the session simply won't persist */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* no-op */
    }
  },
};

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  /*
    60s, not 30s, and the reason is measured rather than cautious.

    The API runs on a free Render dyno that sleeps after inactivity. A cold start
    was timed at 43 seconds — so at the old 30s ceiling every request after an
    idle period was ABORTED BY US a full 13 seconds before the server would have
    answered. The visitor got "That request took too long", React Query retried,
    and the retry succeeded only because the first attempt had woken the dyno.
    The site looked broken when it was merely asleep.

    A ceiling above the cold start turns that failure back into a wait. It is a
    mitigation, not a fix: the fix is a dyno that does not sleep, and until then
    the homepage renders its standing hero rather than blocking on this at all.
  */
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Emitted when the API rejects our token, so AuthContext can clear the session. */
export const UNAUTHORIZED_EVENT = 'artinu:unauthorized';

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);

/**
 * Every error the UI shows goes through here, so a network failure, a
 * validation failure and a thrown string all end up as one readable sentence.
 */
export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.response?.data?.message) {
      return error.response.data;
    }
    if (error.code === 'ECONNABORTED') {
      return { message: 'That request took too long. Please try again.', code: 'timeout' };
    }
    if (!error.response) {
      return {
        message: 'We could not reach the ARTINU service. Check your connection and try again.',
        code: 'network',
      };
    }
    return { message: error.message, code: String(error.response.status) };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: 'Something went wrong. Please try again.' };
}

export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}

/** Field-level validation errors, keyed by form field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  const details = toApiError(error).details;
  if (!details) return {};
  return Object.fromEntries(
    Object.entries(details).map(([field, messages]) => [field, messages[0] ?? 'Invalid value']),
  );
}
