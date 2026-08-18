/**
 * Builds client/public/sitemap.xml.
 *
 *   npm run sitemap                    # static routes only
 *   SITEMAP_API=https://api.artinu.in/api npm run sitemap
 *
 * Runs as part of `npm run build`, so a deploy can never ship a sitemap older
 * than the code around it.
 *
 * ── Two things this deliberately does ───────────────────────────────────────
 *
 * 1. It does not list /legal/* any more. Those pages are marked noindex in
 *    client/src/lib/seo.ts, and submitting a noindex URL in a sitemap is a
 *    direct contradiction: Search Console reports it as "Submitted URL marked
 *    noindex" and it counts against the property. A sitemap should only ever
 *    contain URLs you want indexed.
 *
 * 2. It will include every photographer and every published photograph when it
 *    can reach the API, because those are the pages most likely to answer a
 *    search nothing else on the site can. When the API is unreachable — which
 *    is the normal case on a static host build — it emits the static routes and
 *    says so, rather than failing the build or silently shipping a stale file.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const SITE_URL = 'https://artinu.in';
const OUTPUT_DIR = resolve(__dirname, '../client/public');
const API = process.env.SITEMAP_API ?? '';

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const staticRoutes = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/spaces', changefreq: 'monthly', priority: 0.9 },
  { path: '/gallery', changefreq: 'weekly', priority: 0.9 },
  { path: '/artists', changefreq: 'weekly', priority: 0.8 },
  { path: '/about', changefreq: 'monthly', priority: 0.8 },
  { path: '/lets-talk', changefreq: 'monthly', priority: 0.8 },
  { path: '/join', changefreq: 'monthly', priority: 0.6 },
  { path: '/join/apply', changefreq: 'yearly', priority: 0.5 },
  { path: '/help', changefreq: 'monthly', priority: 0.5 },
];

const today = new Date().toISOString().split('T')[0];
const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Best-effort: a sitemap without the dynamic half is far better than no build. */
async function fetchJson(path) {
  if (!API) return null;
  try {
    const res = await fetch(`${API.replace(/\/+$/, '')}${path}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const dynamic = [];
let note = 'static routes only (set SITEMAP_API to include photographers and photographs)';

/**
 * Walks a paginated endpoint. pageSize is capped at 60 by the shared schema
 * (shared/src/schemas.ts), and asking for more returns 422 rather than
 * clamping — so the page size here is a hard API limit, not a preference.
 */
async function fetchAll(path, cap = 2000) {
  const rows = [];
  for (let page = 1; rows.length < cap; page += 1) {
    const sep = path.includes('?') ? '&' : '?';
    const body = await fetchJson(`${path}${sep}page=${page}&pageSize=60`);
    const batch = body?.items ?? (Array.isArray(body) ? body : []);
    rows.push(...batch);
    const totalPages = body?.totalPages;
    if (!batch.length || (totalPages && page >= totalPages)) break;
    if (batch.length < 60) break;
  }
  return rows;
}

if (API) {
  const artistRows = await fetchAll('/users/artists');
  for (const artist of artistRows) {
    const slug = artist?.slug ?? artist?.id;
    if (!slug) continue;
    dynamic.push({ path: `/artists/${slug}`, changefreq: 'weekly', priority: 0.7 });
  }

  const artworkRows = await fetchAll('/artworks');
  for (const artwork of artworkRows) {
    if (!artwork?.id) continue;
    dynamic.push({
      path: `/gallery/${artwork.id}`,
      changefreq: 'monthly',
      priority: 0.6,
      // Image sitemap entries let Google Images find work it would otherwise
      // never reach, since the gallery only renders after JavaScript runs.
      image: artwork.imageUrl ? { loc: artwork.imageUrl, title: artwork.title } : null,
    });
  }

  note =
    artistRows.length || artworkRows.length
      ? `${artistRows.length} photographers, ${artworkRows.length} photographs from ${API}`
      : `API at ${API} returned nothing — static routes only`;
}

const all = [...staticRoutes, ...dynamic];

const body = all
  .map((route) => {
    const image = route.image
      ? `\n    <image:image><image:loc>${esc(route.image.loc)}</image:loc>${
          route.image.title ? `<image:title>${esc(route.image.title)}</image:title>` : ''
        }</image:image>`
      : '';
    return `  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>${image}
  </url>`;
  })
  .join('\n');

writeFileSync(
  resolve(OUTPUT_DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`,
);

console.log(`sitemap.xml — ${all.length} URLs (${note})`);
