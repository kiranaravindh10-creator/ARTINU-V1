/**
 * Link previews for shared photographs.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 *
 * The client is a static single-page app. Its Open Graph tags are written by
 * React once the bundle has run, and the crawlers that build link previews —
 * WhatsApp, Instagram, Facebook, X, Telegram, Slack, LinkedIn — do not run
 * JavaScript. They read the HTML the server hands them, which for every route
 * is the same `index.html` with the same generic site-level tags.
 *
 * So every photograph anyone shared arrived as the ARTINU logo card. The share
 * sheet worked; the thing that came out the other end did not show the
 * photograph. This module produces the small HTML document a crawler needs.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 *
 * Everything here is written to fail open. A crawler that cannot be identified,
 * an API that is asleep, a photograph that no longer exists, a request that
 * takes too long — every one of those returns null, and the caller serves the
 * app exactly as it does today. There is no path where this makes a page worse
 * than it currently is.
 */

export const SITE_URL = 'https://artinu.in';

/**
 * Where a crawler request goes to ask what the photograph is.
 *
 * Read defensively: this module runs on the edge, and a missing `process` there
 * would throw before any of the fail-open handling below could catch it.
 */
export const API_BASE =
  (typeof process !== 'undefined' ? process.env?.SHARE_PREVIEW_API : undefined) ??
  'https://artinu-v1.onrender.com/api';

/**
 * The API sleeps on its free plan and can take half a minute to wake. No
 * crawler waits that long, so neither does this — a slow answer is the same as
 * no answer, and both fall through to the app.
 */
const TIMEOUT_MS = 2500;

/**
 * Crawlers that build link previews and do not execute JavaScript.
 *
 * Matched loosely and deliberately: a user agent that is not on this list is
 * treated as a person, and people get the real application. Being wrong in that
 * direction costs a preview image; being wrong the other way would serve a
 * stub page to a reader.
 */
const CRAWLERS =
  /facebookexternalhit|facebookcatalog|WhatsApp|Instagram|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|redditbot|SkypeUriPreview|vkShare|W3C_Validator|Googlebot|bingbot|Applebot|Iframely|Embedly|nuzzel|outbrain|quora link preview|developers\.google\.com\/\+\/web\/snippet/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return !!userAgent && CRAWLERS.test(userAgent);
}

/** Only the routes whose preview genuinely differs per record. */
export const ARTWORK_PATH = /^\/gallery\/([A-Za-z0-9_-]{6,64})\/?$/;

export function artworkIdFromPath(pathname: string): string | null {
  return pathname.match(ARTWORK_PATH)?.[1] ?? null;
}

/** HTML-attribute escaping. These values are photographer-supplied text. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Trim to a length a preview card will actually show, on a word boundary. */
export function clamp(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The photograph, at a size a preview crawler will accept.
 *
 * Uploads are stored at full resolution — measured on the live gallery, the
 * largest is 9.6 MB. Facebook caps preview images at 8 MB and WhatsApp gives up
 * far sooner than that, so pointing `og:image` at the stored file means the
 * card that finally appears has no photograph in it. Supabase resizes on
 * request; 1200px is the width these cards are rendered at anyway.
 *
 * Anything not stored in Supabase is returned unchanged.
 */
const STORAGE_OBJECT = '/storage/v1/object/public/';
const STORAGE_RENDER = '/storage/v1/render/image/public/';

export function previewSized(url: string, width = 1200): string {
  if (!url.includes(STORAGE_OBJECT)) return url;
  const [base] = url.split('?');
  return `${base.replace(STORAGE_OBJECT, STORAGE_RENDER)}?width=${width}&quality=80`;
}

export interface Artwork {
  id?: string;
  title?: string;
  description?: string | null;
  story?: string | null;
  location?: string | null;
  imageUrl?: string;
  artist?: { name?: string } | null;
}

export interface Preview {
  title: string;
  description: string;
  image: string;
  url: string;
}

/**
 * What the card should say.
 *
 * The photographer is named in the title because that is the point of the
 * platform — the card should read as their work, not as ours.
 */
export function previewFor(artwork: Artwork, id: string): Preview | null {
  const title = (artwork.title ?? '').trim();
  const stored = (artwork.imageUrl ?? '').trim();

  // Without a title or an image there is nothing better than the generic card.
  if (!title || !/^https?:\/\//i.test(stored)) return null;

  const image = previewSized(stored);

  const artist = artwork.artist?.name?.trim();
  const blurb = (artwork.description || artwork.story || '').trim();
  const place = artwork.location?.trim();

  const description =
    blurb ||
    [artist && `A photograph by ${artist}`, place && `Made in ${place}`]
      .filter(Boolean)
      .join('. ') ||
    'A photograph on ARTINU.';

  return {
    title: artist ? `${title} — ${artist}` : title,
    description: clamp(description, 200),
    image,
    url: `${SITE_URL}/gallery/${id}`,
  };
}

/**
 * The document handed to a crawler.
 *
 * A person should never see this, but one might — a crawler user agent can be
 * spoofed, and a browser extension can preview a link. So it carries a real
 * link through to the photograph and a redirect, rather than being a dead end.
 */
export function renderPreviewHtml(preview: Preview): string {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const image = escapeHtml(preview.image);
  const url = escapeHtml(preview.url);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} | ARTINU</title>
<link rel="canonical" href="${url}" />
<meta name="description" content="${description}" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="ARTINU" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:alt" content="${title}" />
<meta property="og:url" content="${url}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />

<meta http-equiv="refresh" content="0; url=${url}" />
</head>
<body>
<p><a href="${url}">${title}</a></p>
<img src="${image}" alt="${title}" width="600" />
</body>
</html>`;
}

/**
 * Fetches one photograph, giving up quickly and quietly.
 *
 * Returns null for anything other than a usable answer, which the caller reads
 * as "serve the app".
 */
export async function fetchArtwork(id: string): Promise<Artwork | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/artworks/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Artwork;
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The whole decision, in one call.
 *
 * `null` means "this is not a crawler asking about a photograph we can describe
 * better than the default" — serve the app.
 */
export async function previewHtmlFor(
  pathname: string,
  userAgent: string | null | undefined,
): Promise<string | null> {
  if (!isCrawler(userAgent)) return null;

  const id = artworkIdFromPath(pathname);
  if (!id) return null;

  const artwork = await fetchArtwork(id);
  if (!artwork) return null;

  const preview = previewFor(artwork, id);
  return preview ? renderPreviewHtml(preview) : null;
}
