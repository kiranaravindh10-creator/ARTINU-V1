/**
 * Image URL builders.
 *
 * The MVP has no asset pipeline (tech stack: "no image optimization pipeline,
 * no Sharp, no thumbnail generation"), so imagery is addressed by URL and the
 * width is requested from the source. Swapping these two functions for a CDN
 * or Supabase Storage transform later changes nothing else in the codebase.
 */

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
