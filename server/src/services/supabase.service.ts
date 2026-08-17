import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * Get the Supabase client configured for the server environment.
 * Uses the service-role key for admin privileges (RLS bypass).
 * Never use this from the browser.
 */
let supabase: SupabaseClient | null = null;
/**
 * The anon client is memoised separately.
 *
 * Both getters used to share the single `supabase` variable, so whichever ran
 * first won: one call to `getSupabaseAnon()` before `getSupabase()` would leave
 * every later "service-role" caller holding an anon client, silently subject to
 * RLS. Nothing in the app reaches this file today — `database/db.ts` and
 * `storage.service.ts` build their own clients — but a latent privilege mix-up
 * is not worth leaving armed for the next person who imports it.
 */
let supabaseAnon: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    logger.info('Supabase client initialized (service-role key)');
  }
  return supabase;
}

/**
 * Get the Supabase anon client for browser/front-end use.
 * Uses the public anon key — never the service-role key.
 */
export function getSupabaseAnon(): SupabaseClient | null {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!supabaseAnon) {
    try {
      supabaseAnon = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch {
      return null;
    }
  }
  return supabaseAnon;
}

/**
 * Initialize Supabase — called once at startup to ensure the client is ready.
 */
export function initializeSupabase(): SupabaseClient {
  return getSupabase();
}

export default { getSupabase, getSupabaseAnon, initializeSupabase };