import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Is this a HEIC/HEIF, whatever the OS claimed?
 *
 * `file.type` is frequently EMPTY for a .heic chosen through a desktop file
 * picker - macOS and Windows both do it - so the extension has to be consulted
 * too. Everything that decides whether to accept a photograph has to agree on
 * this, hence one exported predicate rather than three regexes.
 */
export const isHeicFile = (file: File): boolean =>
  /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/**
 * A data URL whose MIME type the server will recognise.
 *
 * FileReader labels the data URL with `file.type`, and when that is empty - the
 * common case for HEIC - the result is `data:base64,...` with no type at all,
 * which the server's data-URL parser rejects outright. The photograph would be
 * refused for having no format rather than for anything wrong with it.
 */
export async function fileToImageDataUrl(file: File): Promise<string> {
  const raw = await fileToBase64(file);
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(raw)) return raw;

  const assumed = isHeicFile(file) ? 'image/heic' : (file.type || 'image/jpeg');
  return raw.replace(/^data:[^;]*;base64,/i, `data:${assumed};base64,`);
}

/** Read a File as a data URL — the first half of the SDD's base64 upload flow. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read the intrinsic dimensions of an image already loaded as a data URL. */
export function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = dataUrl;
  });
}

/**
 * Dimensions if the browser can read them, zeroes if it cannot.
 *
 * Only Safari can decode HEIC, so `new Image()` fails on one in every other
 * browser - and the upload flow used to `await readImageSize` unguarded, which
 * meant a rejected promise took the whole picker down the moment somebody added
 * an iPhone photograph.
 *
 * Zero is a safe answer because these numbers are a convenience: the server
 * reads the real width and height out of the file itself and stores those. It
 * never trusts what the browser sent.
 */
export async function readImageSizeOrZero(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  try {
    return await readImageSize(dataUrl);
  } catch {
    return { width: 0, height: 0 };
  }
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Stable pseudo-random in [0,1) from a string — keeps seeded/demo values consistent. */
export function hashRatio(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
