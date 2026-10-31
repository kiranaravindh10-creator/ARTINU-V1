import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import * as React from 'react';
import { api } from '@/lib/api';

const HEIGHT = 36;

interface Health {
  drivers?: { data?: string; readOnly?: boolean };
}

/**
 * Read-only mode, said on every screen (READ_ONLY_MODE on the server).
 *
 * The server is the authority: it refuses every change itself, whatever this
 * bar says, and the bar only reports what /api/health reports. It cannot be
 * dismissed - whoever is looking at live data has to know that nothing they
 * press will be saved, before they press it.
 *
 * Sets --app-banner so the sticky headers (Console sidebar, site navigation)
 * sit below it instead of sliding underneath.
 */
export function ReadOnlyBanner() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get<Health>('/health')).data,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
  const readOnly = data?.drivers?.readOnly === true;
  const live = data?.drivers?.data === 'supabase';

  React.useEffect(() => {
    if (!readOnly) return;
    const root = document.documentElement;
    const previous = document.body.style.paddingTop;
    root.style.setProperty('--app-banner', `${HEIGHT}px`);
    document.body.style.paddingTop = `${HEIGHT}px`;
    return () => {
      root.style.removeProperty('--app-banner');
      document.body.style.paddingTop = previous;
    };
  }, [readOnly]);

  if (!readOnly) return null;

  return (
    <div
      role="status"
      aria-label="Read-only mode"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 border-b border-bronze/60 bg-ink px-4 text-canvas"
      style={{ height: HEIGHT }}
    >
      <Lock className="size-3.5 shrink-0 text-bronze" aria-hidden />
      {live ? (
        <p className="min-w-0 truncate text-[0.8125rem]">
          <span className="sm:hidden">Live ARTINU data — READ ONLY</span>
          <span className="hidden sm:inline">
            Connected to live ARTINU data — READ ONLY. Changes are disabled in local development.
          </span>
        </p>
      ) : (
        <p className="min-w-0 truncate text-[0.8125rem]">Read-only mode — changes are disabled on this server.</p>
      )}
    </div>
  );
}
