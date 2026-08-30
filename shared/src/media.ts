/**
 * Image URL builders.
 *
 * Seeded and Unsplash imagery is addressed by URL with the width requested from
 * the source. UPLOADED photography no longer works that way: since
 * `010_image_variants`, every upload is resized server-side into 400/800/1600px
 * WebP copies and the map of them is stored on the artwork row. Use
 * `buildVariantSrcSet` for those - see below.
 */

import type { ImageVariants } from './types.js';

/**
 * A real `srcset` from an artwork's stored variants.
 *
 * Returns an empty string when there are none, which is the signal for a caller
 * to fall back to a plain `src`. That is the correct behaviour for every
 * artwork uploaded before variants existed and for any upload whose resize did
 * not run, so it is a normal path and not a failure.
 */
export function buildVariantSrcSet(variants: ImageVariants | null | undefined): string {
  if (!variants) return '';
  return variantWidths(variants)
    .map((width) => `${variants[String(width)]} ${width}w`)
    .join(', ');
}

/** The widths present on a variants map, ascending. */
export function variantWidths(variants: ImageVariants | null | undefined): number[] {
  if (!variants) return [];
  return Object.keys(variants)
    .map(Number)
    .filter((width) => Number.isFinite(width) && width > 0)
    .sort((a, b) => a - b);
}

/**
 * The largest stored copy, for the lightbox.
 *
 * Deliberately NOT the original: the original is the print file and can be
 * 25 MB. Falls back to `fallback` when there are no variants.
 */
export function largestVariant(
  variants: ImageVariants | null | undefined,
  fallback: string,
): string {
  const widths = variantWidths(variants);
  return widths.length > 0 ? (variants as ImageVariants)[String(widths[widths.length - 1])] : fallback;
}

/** Editorial photography — verified Unsplash asset ids. */
export function unsplash(id: string, width = 1400, quality = 80): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=${quality}`;
}

/**
 * Gallery photography, addressed by a stable seed so the same artwork always
 * renders the same image across reloads and between client and server.
 */
export function seededPhoto(seed: string, width: number, height: number): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

/** Display-resolution render of an artwork. */
export function artworkImage(seed: string, orientation: 'landscape' | 'portrait' | 'square'): string {
  const [w, h] =
    orientation === 'portrait' ? [900, 1350] : orientation === 'square' ? [1100, 1100] : [1400, 933];
  return seededPhoto(seed, w, h);
}

/** Grid thumbnail — smaller request, same photograph. */
export function artworkThumb(seed: string, orientation: 'landscape' | 'portrait' | 'square'): string {
  const [w, h] =
    orientation === 'portrait' ? [500, 750] : orientation === 'square' ? [600, 600] : [700, 467];
  return seededPhoto(seed, w, h);
}

/** Whether a URL points at a data: payload rather than a remote asset. */
export function isDataUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith('data:');
}
