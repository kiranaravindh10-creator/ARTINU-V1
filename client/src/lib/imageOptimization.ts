import { unsplash, seededPhoto } from '@artinu/shared';

export interface ImageSize {
  width: number;
  height: number;
  suffix: string;
}

export const HERO_SIZES: ImageSize[] = [
  { width: 480, height: 270, suffix: '480w' },
  { width: 768, height: 432, suffix: '768w' },
  { width: 1024, height: 576, suffix: '1024w' },
  { width: 1440, height: 810, suffix: '1440w' },
  { width: 1920, height: 1080, suffix: '1920w' },
  { width: 2560, height: 1440, suffix: '2560w' },
];

export const THUMBNAIL_SIZES: ImageSize[] = [
  { width: 160, height: 90, suffix: '160w' },
  { width: 320, height: 180, suffix: '320w' },
  { width: 480, height: 270, suffix: '480w' },
  { width: 640, height: 360, suffix: '640w' },
];

export function buildUnsplashSrcSet(
  baseId: string,
  sizes: ImageSize[],
  quality = 80
): string {
  return sizes
    .map(({ width, height, suffix }) => {
      const url = `https://images.unsplash.com/photo-${baseId}?auto=format&fit=crop&w=${width}&h=${height}&q=${quality}`;
      return `${url} ${suffix}`;
    })
    .join(', ');
}

export function buildSeededSrcSet(
  seed: string,
  sizes: ImageSize[],
  quality = 80
): string {
  return sizes
    .map(({ width, height, suffix }) => {
      const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}?quality=${quality}&auto=format`;
      return `${url} ${suffix}`;
    })
    .join(', ');
}

/*
  SUPABASE STORAGE RESIZES ON REQUEST, AND UNTIL NOW NOTHING ASKED IT TO.

  Every photograph a member uploads lands in Supabase Storage and is served
  straight from `/storage/v1/object/public/…` — the original file, byte for
  byte. Measured on the live gallery: the first seven tiles alone are 17 MB, and
  a full page of twenty-four is roughly 62 MB, to draw images about 324px wide.
  That is the whole of "the gallery is slow", and it is a bytes problem, so no
  amount of lazy-loading or caching touches it.

  Swapping `/object/public/` for `/render/image/public/` and adding a width
  turns the same file into a resized one. Measured on a real 3.4 MB PNG upload:

      original            3,522,426 bytes
      render, width=800     339,270 bytes   (WebP)     ~10x smaller
      render, width=1600    403,398 bytes   (WebP)

  WebP is negotiated from the browser's Accept header, which every browser
  ARTINU supports sends, so no format parameter is needed.

  ── How this relates to the stored variants ────────────────────────────────

  `buildVariantSrcSet` (shared/src/media.ts) is still the better answer and
  still wins when an artwork has variants: those are generated once at upload
  and served as plain files. Supabase charges per transformation, so this path
  costs money per unique size served, where stored variants do not.

  This exists because it needs no migration and no backfill — it makes all 53
  photographs already in the database fast today, and it keeps working for any
  upload whose resize did not run.

  NOTE: image transformations are a paid Supabase feature. If the plan is
  downgraded these URLs stop resolving, which is why `looksLikeSupabaseStorage`
  is deliberately narrow and everything else falls through to the original.
*/
const SUPABASE_OBJECT = '/storage/v1/object/public/';
const SUPABASE_RENDER = '/storage/v1/render/image/public/';

/** Widths served for a gallery tile. Matches the stored-variant widths. */
const SUPABASE_THUMB_WIDTHS = [400, 800, 1600];
const SUPABASE_HERO_WIDTHS = [640, 1024, 1440, 1920];

const looksLikeSupabaseStorage = (url: string) =>
  url.includes('.supabase.co') && url.includes(SUPABASE_OBJECT);

/**
 * The same object, asked for at a given width.
 *
 * Returns the url untouched when it is not a Supabase object. Without that
 * guard an Unsplash url - which already carries a query string - would come
 * back with a second "?" appended and resolve to nothing.
 */
export function supabaseResized(url: string, width: number, quality = 75): string {
  if (!looksLikeSupabaseStorage(url)) return url;
  return `${url.replace(SUPABASE_OBJECT, SUPABASE_RENDER)}?width=${width}&quality=${quality}`;
}

/**
 * A srcset of on-the-fly resizes, or '' when this is not a Supabase object.
 *
 * Widths above the source are harmless: Supabase clamps to the original rather
 * than upscaling, so the largest candidates simply resolve to the same pixels.
 */
export function buildSupabaseSrcSet(url: string, widths: number[]): string {
  if (!looksLikeSupabaseStorage(url)) return '';
  return widths.map((width) => `${supabaseResized(url, width)} ${width}w`).join(', ');
}

export function buildHeroSrcSet(url: string): string {
  const supabase = buildSupabaseSrcSet(url, SUPABASE_HERO_WIDTHS);
  if (supabase) return supabase;

  if (url.includes('unsplash.com')) {
    const match = url.match(/photo-([^?]+)/);
    if (match) {
      return buildUnsplashSrcSet(match[1], HERO_SIZES);
    }
  }
  if (url.includes('picsum.photos')) {
    const match = url.match(/seed\/([^\/]+)/);
    if (match) {
      return buildSeededSrcSet(decodeURIComponent(match[1]), HERO_SIZES);
    }
  }
  return '';
}

export function buildThumbnailSrcSet(url: string): string {
  const supabase = buildSupabaseSrcSet(url, SUPABASE_THUMB_WIDTHS);
  if (supabase) return supabase;

  if (url.includes('unsplash.com')) {
    const match = url.match(/photo-([^?]+)/);
    if (match) {
      return buildUnsplashSrcSet(match[1], THUMBNAIL_SIZES);
    }
  }
  if (url.includes('picsum.photos')) {
    const match = url.match(/seed\/([^\/]+)/);
    if (match) {
      return buildSeededSrcSet(decodeURIComponent(match[1]), THUMBNAIL_SIZES);
    }
  }
  return '';
}

export function getUnsplashUrl(id: string, width: number, height: number, quality = 80): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&h=${height}&q=${quality}`;
}

export function getSeededUrl(seed: string, width: number, height: number, quality = 80): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}?quality=${quality}&auto=format`;
}

export function getOptimizedUrl(url: string, width: number, height: number, quality = 80): string {
  if (url.includes('unsplash.com')) {
    const match = url.match(/photo-([^?]+)/);
    if (match) {
      return getUnsplashUrl(match[1], width, height, quality);
    }
  }
  if (url.includes('picsum.photos')) {
    const match = url.match(/seed\/([^\/]+)/);
    if (match) {
      return getSeededUrl(decodeURIComponent(match[1]), width, height, quality);
    }
  }
  return url;
}

/*
  `generateBlurPlaceholder` and its cache lived here: an async function that
  fetched a real 20x11 preview of each photograph to use as its placeholder.

  Nothing called it. `Photo` has always used the synchronous constant below, so
  the only thing this code did was ship. It is removed rather than wired up
  because a fetch per tile to decide what colour to show before the tile loads is
  the wrong trade on the exact page that is already too slow - forty extra
  round trips to avoid forty grey rectangles.

  A real low-quality preview belongs in the upload pipeline, encoded once and
  stored on the artwork row, not computed in the browser on every visit.
*/

/*
  The placeholder every photograph sits on until it loads.

  Two things were wrong with the old one.

  It was NEAR-BLACK - a #1a1815 to #2a2620 gradient - on a #f7f5f2 page. So the
  gallery's first paint was a grid of forty dark rectangles on warm paper, each
  of which then faded to a photograph. That is what "the gallery loads slowly"
  looks like even when the network is fine: the page is legibly, obviously
  unfinished, in the highest-contrast way available.

  And it was produced by painting a canvas and calling toDataURL('image/jpeg'),
  a synchronous encode on the main thread, to arrive at a value that never
  varies. That work is now gone entirely: the same gradient is written once, by
  hand, as an inline SVG data URI. No canvas, no context, no encode, and nothing
  for the DOM to be present for.

  Sand rather than paper white on purpose - a tile has to read as "a photograph
  is arriving here", and pure canvas would read as empty space.
*/
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='11'%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23efeae2'/%3E%3Cstop offset='.5' stop-color='%23e6dfd4'/%3E%3Cstop offset='1' stop-color='%23efeae2'/%3E%3C/linearGradient%3E%3Crect width='20' height='11' fill='url(%23g)'/%3E%3C/svg%3E";

/**
 * The placeholder every photograph sits on until it loads.
 *
 * Takes a url and ignores it. The signature is kept because `Photo` and the
 * homepage hero both call it with one, and because a per-image placeholder is
 * the thing that should eventually live here - see the note above.
 */
export function getBlurPlaceholderSync(_url?: string): string {
  return PLACEHOLDER;
}

export function preloadImage(url: string, as = 'image', type = 'image/webp'): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = as;
  link.href = url;
  link.type = type;
  return link;
}

export function preloadImages(urls: string[]): HTMLLinkElement[] {
  return urls.map((url) => preloadImage(url));
}

export function injectPreloadLinks(links: HTMLLinkElement[]): void {
  const head = document.head;
  links.forEach((link) => {
    if (!document.querySelector(`link[href="${link.href}"]`)) {
      head.appendChild(link);
    }
  });
}

export interface HeroImageConfig {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
}

export function createHeroImageProps(config: HeroImageConfig, index: number): React.ImgHTMLAttributes<HTMLImageElement> {
  const isPriority = config.priority ?? index === 0;
  const srcSet = buildHeroSrcSet(config.src);
  const blurPlaceholder = getBlurPlaceholderSync(config.src);

  return {
    src: config.src,
    srcSet: srcSet || undefined,
    alt: config.alt,
    loading: isPriority ? 'eager' : 'lazy',
    decoding: isPriority ? 'sync' : 'async',
    fetchPriority: isPriority ? 'high' : 'low',
    sizes: config.sizes || '100vw',
    style: {
      backgroundImage: `url(${blurPlaceholder})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      minHeight: '100%',
      minWidth: '100%',
    } as React.CSSProperties,
  };
}