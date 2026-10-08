/**
 * Builds sitemap.xml.
 *
 *   npm run sitemap                                    # static routes (live API on Vercel)
 *   SITEMAP_API=http://localhost:4000/api npm run sitemap
 *   SITEMAP_API= npm run sitemap                       # static routes only, even on Vercel
 *   node scripts/generate-sitemap.mjs --out client/public/sitemap.xml
 *
 * Runs as the last step of `npm run build` and writes into the build output
 * (client/dist/sitemap.xml), so what ships is generated at deploy time and a
 * local build never rewrites a tracked file. client/public/sitemap.xml is the
 * static fallback the dev server serves; regenerate it with `--out` when the
 * static route list changes.
 *
 * ── What goes in, and what stays out ────────────────────────────────────────
 *
 * Only URLs that should be indexed. /legal/*, /join/submitted and everything
 * behind sign-in are noindex or disallowed (client/src/lib/seo.ts,
 * client/public/robots.txt), and listing a noindex URL here is a direct
 * contradiction that Search Console reports as an error.
 *
 * Photographers and photographs come from the public API — the same list
 * endpoints the gallery reads — so anything the public site cannot show cannot
 * appear here either: the API serves approved work only, which leaves out
 * deleted, pending, rejected and archived photographs, and lists only
 * photographers with at least one approved photograph.
 *
 * On Vercel the live API is read by default. It sleeps on its free plan, so it
 * is woken first and every request is retried. If it still cannot be reached
 * the static routes are written and the build carries on: a sitemap without
 * the dynamic half is far better than a failed deploy.
 *
 * `lastmod` is a real date — when that photograph, or that photographer's
 * newest photograph, last changed — and is left out where no honest date
 * exists. Stamping every URL with the build date told crawlers that every page
 * changed on every deploy, which teaches them to ignore the field.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = 'https://artinu.in';
const PRODUCTION_API = 'https://artinu-v1.onrender.com/api';

const outFlag = process.argv.indexOf('--out');
const OUTPUT =
  outFlag > -1 && process.argv[outFlag + 1]
    ? resolve(process.cwd(), process.argv[outFlag + 1])
    : resolve(__dirname, '../client/dist/sitemap.xml');

// An explicit SITEMAP_API always wins, including an empty one.
const API = (process.env.SITEMAP_API ?? (process.env.VERCEL ? PRODUCTION_API : ''))
  .trim()
  .replace(/\/+$/, '');

/** Google and Bing ignore changefreq and priority, so only the locations are listed. */
const STATIC_ROUTES = ['/', '/spaces', '/gallery', '/artists', '/about', '/lets-talk', '/join', '/join/apply', '/help'];

/** The sitemap protocol's ceiling for a single file. */
const MAX_URLS = 50_000;
/** How long to wait for a sleeping API to wake before giving up on it. */
const WAKE_BUDGET_MS = 90_000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The newest of several timestamps, never later than now; null if none is a date. */
function newest(...values) {
  let best = null;
  for (const value of values) {
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    if (Number.isFinite(time) && (best === null || time > best)) best = time;
  }
  return best === null ? null : Math.min(best, Date.now());
}

async function wakeApi() {
  const deadline = Date.now() + WAKE_BUDGET_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return true;
    } catch {
      // Still asleep, or unreachable — try again until the budget runs out.
    }
    await sleep(5_000);
  }
  return false;
}

async function fetchJson(path, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return await res.json();
      // A 4xx will be the same on the next attempt; only a busy or failing server is worth retrying.
      if (res.status < 500 && res.status !== 429) return null;
    } catch {
      // Timed out or dropped: retried below.
    }
    if (attempt < attempts) await sleep(2_000 * attempt);
  }
  return null;
}

/**
 * Walks a paginated endpoint. pageSize is capped at 60 by the shared schema
 * (shared/src/schemas.ts), and asking for more returns 422 rather than
 * clamping — so the page size here is a hard API limit, not a preference.
 */
async function fetchAll(path, cap = 5_000) {
  const rows = [];
  for (let page = 1; rows.length < cap; page += 1) {
    const sep = path.includes('?') ? '&' : '?';
    const body = await fetchJson(`${path}${sep}page=${page}&pageSize=60`);
    if (!body) return { rows, complete: false };
    const batch = body.items ?? (Array.isArray(body) ? body : []);
    rows.push(...batch);
    if (!batch.length || batch.length < 60 || (body.totalPages && page >= body.totalPages)) break;
  }
  return { rows, complete: true };
}

async function dynamicEntries() {
  if (!API) {
    const why = process.env.SITEMAP_API !== undefined ? 'SITEMAP_API is empty' : 'no SITEMAP_API, not a Vercel build';
    return { entries: [], note: `static routes only (${why})` };
  }
  if (!(await wakeApi())) return { entries: [], note: `static routes only (${API} did not answer)` };

  const [artists, artworks] = [await fetchAll('/users/artists'), await fetchAll('/artworks')];

  // Defensive: the endpoints already filter, but nothing unpublished may slip in here.
  const published = artworks.rows.filter(
    (artwork) => artwork?.id && (!artwork.status || artwork.status === 'approved'),
  );

  const lastByArtist = new Map();
  const artworkEntries = published.map((artwork) => {
    const lastmod = newest(artwork.updatedAt, artwork.reviewedAt, artwork.createdAt);
    const artistId = artwork.artistId ?? artwork.artist?.id;
    if (artistId && lastmod !== null) {
      lastByArtist.set(artistId, Math.max(lastByArtist.get(artistId) ?? 0, lastmod));
    }
    const image = typeof artwork.imageUrl === 'string' && /^https?:\/\//i.test(artwork.imageUrl) ? artwork.imageUrl : null;
    return { path: `/gallery/${encodeURIComponent(artwork.id)}`, lastmod, image, kind: 'artwork' };
  });

  const artistEntries = artists.rows
    .filter((artist) => artist?.slug && artist.artworkCount !== 0)
    .map((artist) => ({
      path: `/artists/${encodeURIComponent(artist.slug)}`,
      lastmod: lastByArtist.get(artist.id) ?? null,
      kind: 'artist',
    }));

  const entries = [...artistEntries, ...artworkEntries];

  const counts = {
    artists: entries.filter((entry) => entry.kind === 'artist').length,
    artworks: entries.filter((entry) => entry.kind === 'artwork').length,
  };
  const partial = [!artists.complete && 'photographers', !artworks.complete && 'photographs'].filter(Boolean);
  return {
    entries,
    counts,
    note:
      `${counts.artists} photographers, ${counts.artworks} photographs from ${API}` +
      (partial.length ? ` — WARNING: ${partial.join(' and ')} list incomplete, the API stopped answering` : ''),
  };
}

let dynamic = { entries: [], note: 'static routes only' };
try {
  dynamic = await dynamicEntries();
} catch (error) {
  dynamic = { entries: [], note: `static routes only (${error instanceof Error ? error.message : error})` };
}

const newestOf = (kind) =>
  dynamic.entries
    .filter((entry) => entry.kind === kind && entry.lastmod !== null)
    .reduce((best, entry) => Math.max(best ?? 0, entry.lastmod), null);

// The two index pages change whenever what they list changes.
const indexLastmod = { '/gallery': newestOf('artwork'), '/artists': newestOf('artist') };

const seen = new Set();
const all = [...STATIC_ROUTES.map((path) => ({ path, lastmod: indexLastmod[path] ?? null })), ...dynamic.entries]
  .filter((entry) => !seen.has(entry.path) && seen.add(entry.path))
  .slice(0, MAX_URLS);

const body = all
  .map((entry) => {
    const lines = [`    <loc>${esc(`${SITE_URL}${entry.path}`)}</loc>`];
    if (entry.lastmod !== null) lines.push(`    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`);
    // Image entries let Google Images find work that only renders after JavaScript runs.
    if (entry.image) lines.push(`    <image:image><image:loc>${esc(entry.image)}</image:loc></image:image>`);
    return `  <url>\n${lines.join('\n')}\n  </url>`;
  })
  .join('\n');

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(
  OUTPUT,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`,
);

console.log(`sitemap.xml — ${all.length} URLs (${dynamic.note}) → ${OUTPUT}`);
