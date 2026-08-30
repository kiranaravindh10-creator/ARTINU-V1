/**
 * A tiny localStorage cache for query results that should survive a reload.
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * React Query's cache lives in memory. A hard reload throws it away, so every
 * query starts from `isLoading: true` again — and on the homepage that is
 * visible: the hero renders the standing fallback while `hero_slides` is in
 * flight, so refreshing the site shows the old static hero and then, a moment
 * later, the carousel. The founder's report was exactly this: "whenever I
 * reload I get the previous version, not the carousel".
 *
 * The API is not slow enough to matter locally and is very slow on a cold
 * Render dyno, so the gap ranges from a flicker to tens of seconds. Either way
 * the first thing a visitor sees is not the thing that was curated.
 *
 * ── What this does ─────────────────────────────────────────────────────────
 *
 * Stores the last successful answer under a versioned key, and hands it back as
 * `initialData` on the next load. The carousel paints on the first frame from
 * the previous visit's slides, then the real request lands and React Query
 * swaps in anything that changed.
 *
 * It is deliberately NOT a general query persister. Only content that is safe
 * to show slightly stale belongs here — a hero carousel, slideshow settings.
 * Nothing user-specific, nothing that implies a permission, nothing with a
 * price in it.
 */

const PREFIX = 'artinu.cache.';

interface Envelope<T> {
  /** Bumped by hand when a payload's shape changes, so old entries are ignored. */
  v: number;
  /** When it was stored, so a caller can decide whether to refetch immediately. */
  at: number;
  data: T;
}

/**
 * How long a cached answer may be shown before it is treated as merely a
 * placeholder. Past this it is still painted, because something on screen beats
 * a loading state, but the query refetches straight away.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readCached<T>(key: string, version = 1): { data: T; at: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Envelope<T>;
    if (parsed.v !== version) return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE_MS) return null;
    if (parsed.data === undefined || parsed.data === null) return null;

    return { data: parsed.data, at: parsed.at };
  } catch {
    // Private browsing, a full quota, or a half-written entry. Any of them just
    // means there is no cache, which is a normal state and not an error.
    return null;
  }
}

export function writeCached<T>(key: string, data: T, version = 1): void {
  try {
    const envelope: Envelope<T> = { v: version, at: Date.now(), data };
    localStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    /* Storage full or unavailable — the next load simply starts cold. */
  }
}
