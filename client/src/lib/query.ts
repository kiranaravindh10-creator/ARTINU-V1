import { QueryCache, QueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';

/**
 * Surfaces every failed query once, wherever it happened.
 *
 * Most pages render `{isLoading ? <Skeleton/> : data ? <list/> : <EmptyState/>}`.
 * When a request fails, `data` stays undefined and that chain lands on the
 * empty state — so the screen says "no employees yet" when the truth is "we
 * could not reach the server". That is the more damaging of the two, because
 * it reads as data loss rather than a network blip.
 *
 * Pages that need it still render an inline ErrorState with a retry. This is
 * the floor beneath them: no failure is ever completely silent, in any of the
 * thirty-odd screens, without touching thirty files.
 */
const recentlyReported = new Map<string, number>();

/** One message per query key per minute — a retry storm is one problem, not six. */
function reportOnce(key: string, message: string) {
  const now = Date.now();
  const last = recentlyReported.get(key) ?? 0;
  if (now - last < 60_000) return;

  recentlyReported.set(key, now);
  // Unbounded growth would be a slow leak in a long-lived tab.
  if (recentlyReported.size > 100) {
    for (const [k, at] of recentlyReported) {
      if (now - at > 60_000) recentlyReported.delete(k);
    }
  }
  toast.error(message);
}

function describe(error: unknown): string | null {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;

    // 401 is handled by the auth layer, which redirects to sign-in — a toast
    // here would just add noise to an expected sign-out.
    if (status === 401) return null;

    const server = (error.response?.data as { message?: string } | undefined)?.message;
    if (server) return server;
    if (status === 403) return 'You do not have access to that.';
    if (status === 404) return 'We could not find that.';
    if (status >= 500) return 'The server had a problem. Please try again.';
    if (!error.response) return 'No response from the server - check your connection.';
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // A background refetch that fails while good data is already on screen
      // is not worth interrupting anyone for.
      if (query.state.data !== undefined) return;

      const message = describe(error);
      if (message) reportOnce(JSON.stringify(query.queryKey), message);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a request the server has already judged — a 4xx won't change.
        if (axios.isAxiosError(error)) {
          const status = error.response?.status ?? 0;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/**
 * Query keys in one place so invalidation after a mutation cannot miss a
 * cache entry that lives in another feature folder.
 */
export const qk = {
  session: ['session'] as const,

  gallery: (params: Record<string, unknown>) => ['gallery', params] as const,
  galleryInfinite: (params: Record<string, unknown>) => ['gallery', 'infinite', params] as const,
  artwork: (id: string) => ['artwork', id] as const,
  artworkRelated: (id: string) => ['artwork', id, 'related'] as const,

  artists: (params?: Record<string, unknown>) => ['artists', params ?? {}] as const,
  artist: (slug: string) => ['artist', slug] as const,

  spaces: ['spaces'] as const,
  space: (id: string) => ['space', id] as const,

  cart: ['cart'] as const,
  wishlist: ['wishlist'] as const,

  orders: (params?: Record<string, unknown>) => ['orders', params ?? {}] as const,
  order: (id: string) => ['order', id] as const,

  payment: (id: string) => ['payment', id] as const,

  invoices: ['invoices'] as const,
  rotation: ['rotation'] as const,
  installations: ['installations'] as const,

  notifications: ['notifications'] as const,
  supportTickets: ['support-tickets'] as const,

  myArtworks: (params?: Record<string, unknown>) => ['my-artworks', params ?? {}] as const,
  payouts: ['payouts'] as const,

  analytics: (scope: string) => ['analytics', scope] as const,

  admin: {
    orders: (params?: Record<string, unknown>) => ['admin', 'orders', params ?? {}] as const,
    moderation: (params?: Record<string, unknown>) => ['admin', 'moderation', params ?? {}] as const,
    users: (params?: Record<string, unknown>) => ['admin', 'users', params ?? {}] as const,
    spaces: (params?: Record<string, unknown>) => ['admin', 'spaces', params ?? {}] as const,
    artists: (params?: Record<string, unknown>) => ['admin', 'artists', params ?? {}] as const,
    applications: (params?: Record<string, unknown>) =>
      ['admin', 'applications', params ?? {}] as const,
    consultations: (params?: Record<string, unknown>) =>
      ['admin', 'consultations', params ?? {}] as const,
    payments: (params?: Record<string, unknown>) => ['admin', 'payments', params ?? {}] as const,
    audit: (params?: Record<string, unknown>) => ['admin', 'audit', params ?? {}] as const,
    system: ['admin', 'system'] as const,
  },
} as const;
