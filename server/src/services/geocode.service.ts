import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * Place suggestions for the location fields.
 *
 * WHY THIS IS ON THE SERVER AND NOT IN THE BROWSER
 *
 * Three reasons, and the first is the one that costs money if you get it wrong:
 *
 *   1. A geocoding key shipped in client JavaScript is a key anyone can read
 *      out of the bundle and spend. Photon needs no key, but Google and Mapbox
 *      do, and the whole point of the adapter below is that switching to one is
 *      an env var rather than a rewrite. Keeping the call server-side means that
 *      switch never puts a key in front of the public.
 *   2. Autocomplete fires per keystroke. One place to debounce, cache and rate
 *      limit is worth more than the round trip it adds — see CACHE below, which
 *      collapses "c", "ch", "che", "chen" from a dozen users into a handful of
 *      upstream calls.
 *   3. The five location fields across the site should all produce the same
 *      shape of string. Normalising once here beats normalising in the client
 *      four times and slightly differently.
 *
 * Follows the MAIL_PROVIDER / PAYMENT_PROVIDER pattern: selected by env,
 * degrades to a no-op rather than an error when unconfigured, so the location
 * fields stay usable as plain text if the provider is off or unreachable.
 */

export interface PlaceSuggestion {
  /** What the field is set to when this is chosen — "Chennai, India". */
  value: string;
  /** What the dropdown row reads — carries the state, for disambiguation. */
  label: string;
}

/** How long a query's results are held. Place names do not move. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/**
 * Where results are ranked from: Bengaluru, the city ARTINU operates out of and
 * where most of the spaces are. Move this if the centre of gravity moves.
 */
const MARKET_CENTRE = { lat: 12.9716, lon: 77.5946 } as const;

/** Upstream is best-effort; a slow lookup must never hold up a form. */
const UPSTREAM_TIMEOUT_MS = 3500;

const CACHE = new Map<string, { at: number; suggestions: PlaceSuggestion[] }>();

function cacheGet(key: string): PlaceSuggestion[] | undefined {
  const hit = CACHE.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return undefined;
  }
  // Refresh insertion order so the eviction below is least-recently-used
  // rather than least-recently-written.
  CACHE.delete(key);
  CACHE.set(key, hit);
  return hit.suggestions;
}

function cacheSet(key: string, suggestions: PlaceSuggestion[]): void {
  if (CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { at: Date.now(), suggestions });
}

/**
 * Builds the stored value from the parts a provider gives back.
 *
 * The brief was "type chennai, get Chennai, India", so the state is deliberately
 * left out of the value — but not of the label, because "Indiranagar" alone is
 * ambiguous and there is more than one of them. A locality keeps its city, so
 * the value reads "Indiranagar, Bengaluru, India" rather than the useless
 * "Indiranagar, India".
 */
function compose(parts: { name?: string; city?: string; state?: string; country?: string }) {
  const { name, city, state, country } = parts;
  if (!name) return null;

  const valueParts = [name];
  if (city && city.toLowerCase() !== name.toLowerCase()) valueParts.push(city);
  if (country) valueParts.push(country);

  const labelParts = [name];
  if (city && city.toLowerCase() !== name.toLowerCase()) labelParts.push(city);
  if (state && state.toLowerCase() !== name.toLowerCase() && state.toLowerCase() !== city?.toLowerCase()) {
    labelParts.push(state);
  }
  if (country) labelParts.push(country);

  return { value: valueParts.join(', '), label: labelParts.join(', ') };
}

/** De-duplicates on the composed value, preserving upstream ordering. */
function dedupe(suggestions: PlaceSuggestion[], limit: number): PlaceSuggestion[] {
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = suggestion.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Providers ────────────────────────────────────────────────────────────────

interface PhotonFeature {
  properties?: {
    name?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

/**
 * Photon (Komoot) — OpenStreetMap data, and the OSM-based geocoder that is
 * actually built for autocomplete.
 *
 * Nominatim is the obvious free alternative and is deliberately not used: its
 * usage policy rules out per-keystroke autocomplete, so wiring it up here would
 * mean running the site against terms it breaks.
 *
 * `osm_key` is filtered to place-like results. Without it a search for a city
 * also returns the restaurants and bus stops that share its name.
 */
async function photon(query: string, limit: number): Promise<PlaceSuggestion[]> {
  const url = new URL('https://photon.komoot.io/api');
  url.searchParams.set('q', query);
  // Over-fetch, because filtering and de-duplication both discard rows.
  url.searchParams.set('limit', String(limit * 4));
  url.searchParams.set('lang', 'en');

  /*
    Rank Indian results first. This BIASES, it does not restrict — somewhere
    abroad still appears, just below the local match.

    It is not cosmetic. Unbiased, "whitefield" returned Whitefield New Hampshire
    and Whitefield near Bury above the Bengaluru neighbourhood, and "indiran"
    returned Indiranagara in Hassan while never reaching Bengaluru's Indiranagar
    at all — the two most likely things a customer of this business would be
    typing. With the bias both lead.

    Values were chosen by testing, not from the docs: zoom 10 with a 0.3 scale
    fixed both cases, while a wider zoom 6 pushed "indiran" back to Hassan.
  */
  url.searchParams.set('lat', String(MARKET_CENTRE.lat));
  url.searchParams.set('lon', String(MARKET_CENTRE.lon));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('location_bias_scale', '0.3');

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ARTINU/1.0 (location autocomplete)' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`photon responded ${response.status}`);

  const body = (await response.json()) as { features?: PhotonFeature[] };

  const PLACE_KEYS = new Set(['place', 'boundary']);

  return (body.features ?? [])
    .filter((feature) => {
      const key = feature.properties?.osm_key;
      return !key || PLACE_KEYS.has(key);
    })
    .map((feature) => compose(feature.properties ?? {}))
    .filter((entry): entry is PlaceSuggestion => entry !== null);
}

interface GoogleAutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
}

/**
 * Google Places Autocomplete. Not the configured default, but wired so that
 * moving to it is `GEOCODE_PROVIDER=google` plus a key — the reason the call
 * lives on the server in the first place.
 *
 * Google returns a formatted main/secondary pair rather than discrete parts, so
 * `compose` is bypassed: re-splitting a string Google already composed would
 * only lose information.
 */
async function google(query: string, limit: number): Promise<PlaceSuggestion[]> {
  const key = env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set');

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input: query,
      includedPrimaryTypes: ['(regions)'],
      // Biases towards India without excluding anywhere else — the market is
      // Indian, the customer base need not be.
      regionCode: 'IN',
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`google places responded ${response.status}`);

  const body = (await response.json()) as GoogleAutocompleteResponse;

  return (body.suggestions ?? [])
    .map((suggestion) => {
      const format = suggestion.placePrediction?.structuredFormat;
      const main = format?.mainText?.text?.trim();
      if (!main) return null;
      const secondary = format?.secondaryText?.text?.trim();
      const label = secondary ? `${main}, ${secondary}` : main;
      return { value: label, label };
    })
    .filter((entry): entry is PlaceSuggestion => entry !== null)
    .slice(0, limit);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Suggestions for a partial place name. Never throws.
 *
 * A location field is a text box that happens to offer help; if the help is
 * unavailable the box still works. Every failure path — provider off, upstream
 * down, upstream slow, upstream returning nonsense — resolves to an empty list,
 * and the field falls back to accepting whatever was typed.
 */
export async function suggestPlaces(rawQuery: string, limit = 6): Promise<PlaceSuggestion[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const provider = env.GEOCODE_PROVIDER;
  if (provider === 'none') return [];

  const cacheKey = `${provider}:${limit}:${query.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const raw = provider === 'google' ? await google(query, limit) : await photon(query, limit);
    const suggestions = dedupe(raw, limit);
    cacheSet(cacheKey, suggestions);
    return suggestions;
  } catch (error) {
    // Cached as empty for the full TTL on purpose. If the upstream is down,
    // hammering it once per keystroke per visitor makes it worse, and the field
    // is perfectly usable without suggestions in the meantime.
    cacheSet(cacheKey, []);
    logger.warn(
      `Place lookup failed via ${provider}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
