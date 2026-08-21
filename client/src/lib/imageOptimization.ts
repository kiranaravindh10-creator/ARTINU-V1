import { unsplash, seededPhoto } from '@artinu/shared';
import { BLUR, WIDTHS, generatedNameFor } from '@/lib/generated-images';

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

/**
 * srcSet for a photograph we generated ourselves, or '' if this is not one.
 *
 * Local files used to get no srcSet at all — the two builders below only knew
 * how to ask Unsplash and picsum to resize, because those services do it on
 * request. That meant the moment a stock photograph was replaced with a real
 * ARTINU one, every phone started downloading the desktop file. The widths come
 * from the generated manifest rather than a constant, so a srcSet can never
 * offer a file `npm run images` did not write.
 */
function buildGeneratedSrcSet(url: string): string {
  const name = generatedNameFor(url);
  if (!name) return '';
  return WIDTHS[name].map((width) => `/image/${name}-${width}.webp ${width}w`).join(', ');
}

/**
 * Photographs uploaded by artists.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * An upload is stored exactly as the photographer sent it, and `thumbnailUrl`
 * points at that same file. Photographers send full-resolution work: measured
 * against the live gallery, page one was 47.8 MB across 24 photographs, the
 * largest of them 9.6 MB — around a hundred seconds on a normal 4G phone, for
 * one screen of thumbnails. The images were never broken; they had not
 * finished arriving.
 *
 * Supabase Storage will resize on request. Swapping `/object/` for
 * `/render/image/` and asking for a width turns that 9.6 MB into roughly 90 KB,
 * and the browser's own `Accept: image/webp` gets WebP back without asking.
 * Nothing is re-uploaded and no stored URL changes — the original stays exactly
 * where it is, which matters because it is the artist's file.
 */
const SUPABASE_OBJECT = '/storage/v1/object/public/';
const SUPABASE_RENDER = '/storage/v1/render/image/public/';

/** Widths a photograph is actually displayed at, thumbnail through full view. */
const UPLOAD_WIDTHS = [320, 480, 640, 800, 1200, 1600] as const;

export function isSupabaseUpload(url: string): boolean {
  return typeof url === 'string' && url.includes(SUPABASE_OBJECT);
}

/**
 * The same photograph, at a sane size. Returns the URL untouched for anything
 * that is not a Supabase upload, so it is safe to call on any image.
 */
export function resizedUpload(url: string, width: number, quality = 72): string {
  if (!isSupabaseUpload(url)) return url;
  const [base] = url.split('?');
  return `${base.replace(SUPABASE_OBJECT, SUPABASE_RENDER)}?width=${width}&quality=${quality}`;
}

function buildUploadSrcSet(url: string, widths: readonly number[]): string {
  if (!isSupabaseUpload(url)) return '';
  return widths.map((width) => `${resizedUpload(url, width)} ${width}w`).join(', ');
}

export function buildHeroSrcSet(url: string): string {
  const generated = buildGeneratedSrcSet(url);
  if (generated) return generated;

  const upload = buildUploadSrcSet(url, UPLOAD_WIDTHS);
  if (upload) return upload;

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
  const generated = buildGeneratedSrcSet(url);
  if (generated) return generated;

  // A gallery tile is at most a third of a wide viewport, so it never needs the
  // larger end of the range — but a retina phone at 100vw does need 800.
  const upload = buildUploadSrcSet(url, [320, 480, 640, 800]);
  if (upload) return upload;

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

const BLUR_PLACEHOLDER_CACHE = new Map<string, string>();

/*
 * `generateBlurPlaceholder()` and its `blobToBase64()` helper were removed.
 *
 * It downloaded a small copy of a photograph over the network so it could show
 * a blurred version of it while the full photograph downloaded — two requests
 * to display one image, on a page whose problem was already the number of
 * requests. Nothing ever called it.
 *
 * Previews for our own photographs are baked at build time by
 * scripts/generate-images.mjs and inlined through `BLUR` below, which costs no
 * request at all.
 */

/**
 * The neutral placeholder, as a literal.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * `generateCssBlurPlaceholder()` used to create a <canvas>, get a 2d context,
 * paint a three-stop gradient and call `toDataURL('image/jpeg')` — a synchronous
 * raster encode on the main thread. `getBlurPlaceholderSync` called it on a
 * cache miss, and `Photo` calls `getBlurPlaceholderSync` during render, for
 * every photograph on the page. The homepage mounts dozens of them.
 *
 * The punchline is that the function took no arguments and had no randomness,
 * so all that work produced the same handful of bytes every single time. It is
 * a constant. It is now written as one.
 *
 * The gradient it drew is preserved — the same three stops (#1a1815 → #2a2620
 * → #1a1815) across the same 20×11, encoded once as a 70-byte WebP.
 */
const NEUTRAL_BLUR =
  'data:image/webp;base64,UklGRj4AAABXRUJQVlA4IDIAAADwAgCdASoUAAsAPrVInkmnJCKhMAgA4BaJZwC+SDLxQAD+8QwdNSp3dvZ78rM+yAAAAA==';

/**
 * A blur preview for `url`, resolved without touching the network or the DOM.
 *
 * Photographs we generated carry a real 24px preview of themselves, so the
 * frame fills with roughly the right colours before the file arrives. Anything
 * else — Unsplash, picsum, a Firebase upload — gets the neutral tone, because
 * the alternative is a request we would be making purely to blur it.
 */
export function getBlurPlaceholderSync(url: string): string {
  const cached = BLUR_PLACEHOLDER_CACHE.get(url);
  if (cached) return cached;

  const name = generatedNameFor(url);
  const placeholder = (name && BLUR[name]) || NEUTRAL_BLUR;
  BLUR_PLACEHOLDER_CACHE.set(url, placeholder);
  return placeholder;
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