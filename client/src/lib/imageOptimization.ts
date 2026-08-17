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

export function buildHeroSrcSet(url: string): string {
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

export async function generateBlurPlaceholder(url: string, width = 20, height = 11): Promise<string> {
  if (BLUR_PLACEHOLDER_CACHE.has(url)) {
    return BLUR_PLACEHOLDER_CACHE.get(url)!;
  }

  try {
    const optimizedUrl = getOptimizedUrl(url, width, height, 20);
    const response = await fetch(optimizedUrl);
    if (!response.ok) throw new Error('Failed to fetch');
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    const placeholder = `data:image/jpeg;base64,${base64}`;
    BLUR_PLACEHOLDER_CACHE.set(url, placeholder);
    return placeholder;
  } catch {
    const fallback = generateCssBlurPlaceholder();
    BLUR_PLACEHOLDER_CACHE.set(url, fallback);
    return fallback;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function generateCssBlurPlaceholder(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 11;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const gradient = ctx.createLinearGradient(0, 0, 20, 11);
  gradient.addColorStop(0, '#1a1815');
  gradient.addColorStop(0.5, '#2a2620');
  gradient.addColorStop(1, '#1a1815');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 20, 11);

  return canvas.toDataURL('image/jpeg', 0.1);
}

export function getBlurPlaceholderSync(url: string): string {
  if (BLUR_PLACEHOLDER_CACHE.has(url)) {
    return BLUR_PLACEHOLDER_CACHE.get(url)!;
  }
  const placeholder = generateCssBlurPlaceholder();
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