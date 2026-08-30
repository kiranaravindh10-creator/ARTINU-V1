import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { slugify } from '@artinu/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { badRequest, serverError } from '@/utils/errors';
import { uuid } from '@/utils/ids';
import {
  generateVariants,
  needsTranscode,
  transcodeToJpeg,
} from '@/services/image-variants.service';
import { logger } from '@/utils/logger';

/**
 * The base64 upload flow (SDD §11): the client posts a data URL, the server
 * decodes it once and hands back a public URL. Everything above this file deals
 * in URLs, so moving from local disk to Supabase Storage / Firebase Storage — or
 * to a CDN later — is a driver change and nothing more.
 *
 * This is the only service allowed to import storage SDKs directly;
 * object storage has no equivalent of the Table abstraction.
 */

export type StorageFolder =
  | 'artworks'
  | 'profiles'
  | 'spaces'
  | 'documents'
  | 'invoices'
  | 'thumbnails'
  | 'photographers'
  | 'hero'
  | 'featured'
  | 'cafes'
  | 'collaborations';

export interface StoredFile {
  url: string;
  path: string;
  bytes: number;
  contentType: string;
  /**
   * Read out of the file's own header, not taken from the client. Undefined
   * only for a format whose header we cannot parse (currently AVIF).
   */
  width?: number;
  height?: number;
  /** The decoded bytes, so callers can inspect the image without re-reading it. */
  buffer?: Buffer;
}

/**
 * Smallest edge we accept on an uploaded photograph.
 *
 * This exists to reject blank and degenerate uploads — a 1×1 transparent PNG
 * passes every signature and size check, so without a dimension floor it lands
 * in the public gallery as an empty frame. It is set well below any real
 * photograph and far above a tracking pixel; ARTINU prints at A3 and larger,
 * so anything under this could not be used even if it were genuine.
 *
 * ⚠ NOTHING READS THIS. The constant is declared here and referenced nowhere,
 * and `imageDimensions` below — the function written to feed it — is exported
 * but imported by no module in the server. So the floor described above is not
 * enforced on any upload path: a 1×1 PNG is accepted today, by the gallery as
 * much as by the homepage carousel.
 *
 * Left as-is deliberately rather than switched on in passing. Enforcing it now
 * would start refusing uploads that currently succeed, which is a product call
 * about existing content and not a tidy-up. To wire it up: in `storeBase64`,
 * after the signature check, call `imageDimensions(buffer, contentType)` and
 * reject when a known size has an edge under this — leaving `undefined` (an
 * unreadable container, e.g. AVIF) to pass, as it does now.
 */
const MIN_IMAGE_EDGE = 800;

/** 25 MB, matching the documented ceiling on POST /uploads. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Accepted image types and the extension each is stored under.
 *
 * This list is "every raster format a browser will actually decode", which is
 * the only list that means anything here — everything uploaded through this
 * endpoint ends up in an `<img>` on a public page. GIF was the one real gap and
 * is now in.
 *
 * Deliberately absent, and why:
 *
 *   HEIC/HEIF   what an iPhone shoots by default. Only Safari decodes it, so
 *               accepting it would put a hero on the homepage that is blank in
 *               Chrome and Firefox. Rejected with instructions instead.
 *   TIFF, RAW   (CR2/NEF/ARW/DNG) no browser decodes any of them.
 *   PSD, PDF    not images as far as an `<img>` is concerned.
 *   SVG         a browser *does* render it, and that is the problem: an SVG is
 *               a document that can carry <script> and event handlers, and
 *               these files are served from our own origin. Accepting one would
 *               make this upload form a stored-XSS vector. There is also no
 *               such thing as a photograph in SVG.
 *
 * Widening it further is not a kindness to whoever is uploading: an accepted
 * file that no browser can draw fails later and more confusingly than one
 * refused at the door, and — see `imageDimensions` — a container this module
 * cannot read also slips past the minimum-resolution check.
 *
 * ADDING A FORMAT TAKES THREE EDITS HERE, not one. Miss any and it fails in a
 * way that does not point at the cause:
 *
 *   1. this table + CONTENT_TYPES  — or the type is refused outright
 *   2. `matchesImageSignature`      — default-deny, so a missing signature
 *                                     refuses the upload with "does not contain
 *                                     a valid image of the declared type"
 *   3. `imageDimensions`            — for the resolution floor, which as of
 *                                     today is NOT actually wired up: see the
 *                                     note on MIN_IMAGE_EDGE. Add the case
 *                                     anyway, so the format is covered if and
 *                                     when it is.
 *
 * The client mirrors item 1 in ConsoleContentManagerPage; keep the two in step.
 */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  /*
    HEIC and HEIF are accepted and then CONVERTED - see the transcode step in
    storeBase64. They are listed with a `jpg` extension because by the time a
    name is chosen the bytes are already a JPEG; nothing is ever written to
    storage with a .heic extension.
  */
  'image/heic': 'jpg',
  'image/heif': 'jpg',
};

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

/**
 * Formats people genuinely try to upload that no browser can draw. Named
 * individually so the refusal can say what to do about it — "that file type is
 * not supported" sends someone back to a folder full of .HEIC with no idea why.
 */
/*
  HEIC and HEIF used to be listed here and refused. They are now accepted and
  converted on the way in - an iPhone shoots HEIC by default, and telling a
  photographer to go and export a JPEG first is a chore standing between them
  and uploading, which is the last thing this product can afford.

  The rest stay refused. A camera raw, a PSD or a TIFF is not a photograph
  someone means to publish; it is a working file, and it is usually enormous.
*/
const UNRENDERABLE: Record<string, string> = {
  'image/tiff': 'TIFF cannot be displayed by any browser.',
  'image/vnd.adobe.photoshop': 'A Photoshop file cannot be displayed by a browser.',
  'application/pdf': 'A PDF cannot be used as an image on the site.',
  'image/x-canon-cr2': 'That is a camera raw file.',
  'image/x-nikon-nef': 'That is a camera raw file.',
  'image/x-sony-arw': 'That is a camera raw file.',
  'image/x-adobe-dng': 'That is a camera raw file.',
};

const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(;[^,]*)?;base64,([\s\S]+)$/i;

// ── Public API ───────────────────────────────────────────────────────────────

/** Whether a value already points at a remote asset rather than a payload. */
export function isRemoteUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Map a logical folder + filename to the Supabase Storage path structure.
 * Structure:
 *   /artworks/{photoId}.jpg
 *   /profiles/{photographerId}/avatar.jpg
 *   /spaces/{spaceId}.jpg
 *   /hero/{slideId}.jpg
 *   /featured/{collectionId}/{photoId}.jpg
 *   /cafes/{cafeId}.jpg
 *   /collaborations/{slideId}.jpg
 */
function getSupabasePath(folder: StorageFolder, name: string, photographerId?: string): string {
  switch (folder) {
    case 'photographers':
      return `photographers/${photographerId}/uploads/${name}`;
    case 'profiles':
      return `profile/${photographerId}/${name}`;
    case 'hero':
      return `hero/${name}`;
    case 'featured':
      return `featured/${name}`;
    case 'cafes':
      return `cafes/${name}`;
    case 'collaborations':
      return `collaborations/${name}`;
    case 'artworks':
      return `artworks/${name}`;
    case 'spaces':
      return `spaces/${name}`;
    case 'thumbnails':
      return `thumbnails/${name}`;
    case 'documents':
      return `documents/${name}`;
    case 'invoices':
      return `invoices/${name}`;
    default:
      return `${folder}/${name}`;
  }
}

/** Decode a data URL, store it, and return where it landed. */
export async function storeBase64(
  dataUrl: string,
  folder: StorageFolder,
  fileName?: string,
  photographerId?: string,
): Promise<StoredFile> {
  const match = DATA_URL.exec((dataUrl ?? '').trim());
  if (!match) {
    throw badRequest('Attach the image as a base64 data URL, e.g. data:image/jpeg;base64,…');
  }

  const contentType = match[1].toLowerCase();
  const extension = EXTENSIONS[contentType];
  if (!extension) {
    const reason = UNRENDERABLE[contentType];
    if (reason) {
      throw badRequest(`${reason} Export it as a JPEG or PNG and upload that instead.`);
    }
    if (contentType === 'image/svg+xml') {
      // Not merely unsupported — actively refused. See EXTENSIONS.
      throw badRequest('SVG files are not accepted. Upload a photograph as a JPEG, PNG, WebP, AVIF or GIF.');
    }
    throw badRequest(
      `${contentType} is not an image format browsers can display. Upload a JPEG, PNG, WebP, AVIF or GIF.`,
    );
  }

  const base64 = match[3].replace(/\s+/g, '');

  // Size is checked from the encoded length first so an oversized payload is
  // rejected before a 12 MB+ Buffer is allocated for it.
  if (encodedSize(base64) > MAX_BYTES) {
    throw badRequest(`That image is larger than ${MAX_BYTES / (1024 * 1024)} MB.`);
  }

  let buffer: Buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength === 0) throw badRequest('That image appears to be empty.');
  if (buffer.byteLength > MAX_BYTES) {
    throw badRequest(`That image is larger than ${MAX_BYTES / (1024 * 1024)} MB.`);
  }
  if (!matchesImageSignature(buffer, contentType)) {
    throw badRequest('That file does not contain a valid image of the declared type.');
  }

  /*
    HEIC IS CONVERTED HERE, NOT STORED.

    An iPhone shoots HEIC by default and Safari is the only browser that can
    draw one, so storing the file as uploaded would publish a photograph that
    most of the internet cannot see. It becomes a full-resolution JPEG before
    anything else happens, and everything downstream - the name, the extension,
    the dimension probe, the variants - sees a JPEG.

    This is the one conversion failure that is FATAL rather than degrading. Every
    other image-processing failure in this codebase falls back to storing the
    original, because the original is viewable. Here it is not: a stored HEIC
    with no JPEG is invisible, and telling the photographer their upload
    succeeded would be a lie. Better to fail loudly and let them retry.
  */
  let effectiveType = contentType;
  let effectiveExtension = extension;

  if (needsTranscode(contentType)) {
    const converted = await transcodeToJpeg(buffer);
    if (!converted) {
      throw badRequest(
        'That HEIC photograph could not be converted. Try exporting it as a JPEG from your phone or Photos app and uploading that.',
      );
    }
    buffer = converted.buffer;
    effectiveType = converted.contentType;
    effectiveExtension = converted.extension;
  }

  // Dimensions are still read from the file itself rather than trusted from
  // the JSON body — a 1×1 pixel can claim to be 2400×1600, and the stored
  // width/height drive the gallery's layout and orientation. They are recorded,
  // not judged: there is no minimum size or resolution any more, so a phone
  // screenshot uploads exactly like a 50-megapixel raw export.
  const size = imageDimensions(buffer, effectiveType);

  const name = storedName(fileName, effectiveExtension);

  const stored =
    env.STORAGE_DRIVER === 'supabase'
      ? await uploadToSupabase(folder, name, buffer, effectiveType)
      : await writeToDisk(folder, name, buffer, effectiveType);

  return { ...stored, width: size?.width, height: size?.height, buffer };
}

/**
 * One stored photograph and the resized copies that go with it.
 *
 * `variants` maps a width in pixels to a public WebP url. It is empty whenever
 * derivatives could not be made - an unsupported format, a source too small to
 * be worth it, or sharp being unavailable - and every consumer has to treat
 * empty as normal rather than as an error.
 */
export interface StoredImageSet {
  /** The photographer's file, byte for byte. Never a derivative. */
  original: StoredFile;
  /** width -> public url, WebP. Possibly empty. */
  variants: Record<number, string>;
}

/**
 * Store an uploaded photograph together with screen-sized copies of it.
 *
 * The original is stored first and returned no matter what happens next: if
 * variant generation or variant upload fails, this degrades to exactly what
 * `storeBase64` did on its own, and the caller serves the original. An upload
 * must never fail because a thumbnail could not be made - see the note at the
 * top of image-variants.service.ts.
 */
export async function storeImageSet(
  dataUrl: string,
  folder: StorageFolder,
  fileName?: string,
  photographerId?: string,
): Promise<StoredImageSet> {
  const original = await storeBase64(dataUrl, folder, fileName, photographerId);

  if (!original.buffer) return { original, variants: {} };

  const derived = await generateVariants(original.buffer, original.contentType);
  if (derived.length === 0) return { original, variants: {} };

  /*
    Derivatives are named from the original's filename, so `abc-uuid.jpg`
    becomes `abc-uuid-400.webp`. That keeps a photograph's files adjacent in a
    bucket listing, which matters the first time someone has to find or delete
    one by hand.
  */
  const stem = original.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? uuid();

  const variants: Record<number, string> = {};
  const storedPaths: string[] = [];

  try {
    for (const variant of derived) {
      const name = `${stem}-${variant.width}.webp`;
      const stored = await storeDerivative('thumbnails', name, variant.buffer, 'image/webp');
      variants[variant.width] = stored.url;
      storedPaths.push(stored.path);
    }
  } catch (error) {
    /*
      A partial set is worse than none.

      If the 400 uploaded and the 800 failed, a srcset advertising both would
      break for any viewport that picks the missing one. Roll the whole set back
      and serve the original.
    */
    logger.warn('Could not store image variants - rolling back and serving the original.', error);
    await Promise.all(storedPaths.map((storedPath) => removeStored(storedPath)));
    return { original, variants: {} };
  }

  return { original, variants };
}

/**
 * Store one already-encoded derivative under a known name.
 *
 * Exported for the backfill script, which produces variants for photographs
 * that were uploaded long ago and so has bytes to store but no data URL to
 * decode. `storeImageSet` is the path for new uploads.
 */
export async function storeDerivative(
  folder: StorageFolder,
  name: string,
  buffer: Buffer,
  contentType: string,
): Promise<StoredFile> {
  return env.STORAGE_DRIVER === 'supabase'
    ? uploadToSupabase(folder, name, buffer, contentType)
    : writeToDisk(folder, name, buffer, contentType);
}

/**
 * Remove a photograph's derivatives. Takes the values of a `variants` map.
 *
 * Deleting an artwork has to take its thumbnails with it, or the bucket fills
 * with files nothing references and nobody can identify.
 */
export async function removeVariants(variants: Record<number, string> | null | undefined): Promise<void> {
  const urls = Object.values(variants ?? {});
  if (urls.length === 0) return;
  await Promise.all(
    urls.map((url) => {
      // Stored under `thumbnails/<name>`; removeStored wants that path, not the url.
      const name = url.split('/').pop();
      return name ? removeStored(`thumbnails/${name}`) : Promise.resolve();
    }),
  );
}

/**
 * Decodes a data URL without storing it, so a caller can inspect the pixels
 * before deciding whether the file should exist at all.
 */
export function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = DATA_URL.exec((dataUrl ?? '').trim());
  if (!match) return null;
  return {
    buffer: Buffer.from(match[3].replace(/\s+/g, ''), 'base64'),
    contentType: match[1].toLowerCase(),
  };
}

/**
 * Pulls width and height straight out of the image header.
 *
 * Deliberately dependency-free: the server has no image library, and reading a
 * few bytes of each container is far cheaper than decoding the pixels. Returns
 * undefined for a format we cannot read rather than guessing, so an unknown
 * container is allowed through rather than wrongly rejected.
 */
/*
  Header-only dimension probing. There is deliberately no HEIC branch: a HEIC
  upload is converted to a JPEG in `storeBase64` before this is called, so by
  the time dimensions are read the bytes are always one of the formats below.
*/
export function imageDimensions(
  buffer: Buffer,
  contentType: string,
): { width: number; height: number } | undefined {
  if (contentType === 'image/png') {
    // IHDR is always the first chunk: width at byte 16, height at byte 20.
    if (buffer.length < 24) return undefined;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    // Walk the marker segments to the start-of-frame, which carries the size.
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1]!;
      // SOF0–SOF15 hold the dimensions; C4/C8/CC are tables, not frames.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2; // standalone marker, no payload
        continue;
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return undefined;
  }

  if (contentType === 'image/webp') {
    if (buffer.length < 30) return undefined;
    const format = buffer.subarray(12, 16).toString('ascii');
    if (format === 'VP8 ') {
      // Lossy: 14-bit dimensions after the 3-byte start code.
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (format === 'VP8L') {
      // Lossless: 14 bits each, packed across four bytes after the signature.
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (format === 'VP8X') {
      // Extended: 24-bit canvas size, stored minus one.
      const width = buffer.readUIntLE(24, 3) + 1;
      const height = buffer.readUIntLE(27, 3) + 1;
      return { width, height };
    }
    return undefined;
  }

  if (contentType === 'image/gif') {
    // Logical screen descriptor: width then height, little-endian uint16 each,
    // immediately after the 6-byte GIF87a/GIF89a signature.
    //
    // Added with GIF support so this function stays complete for every format
    // the module accepts. Note that no caller currently acts on the result —
    // see MIN_IMAGE_EDGE — so this does not by itself keep a small GIF off the
    // homepage.
    if (buffer.length < 10) return undefined;
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  // AVIF dimensions live in an ispe box inside the meta hierarchy; not worth
  // parsing here, so the size check is skipped for it.
  return undefined;
}

/**
 * Accepts either a data URL or an already-public http(s) URL. Remote URLs pass
 * straight through unchanged, so seeded imagery and freshly uploaded files can
 * travel the same code path in artwork, profile and space services.
 */
export async function storeImage(
  value: string,
  folder: StorageFolder,
  fileName?: string,
  photographerId?: string,
): Promise<StoredFile> {
  const trimmed = (value ?? '').trim();
  if (isRemoteUrl(trimmed)) {
    return {
      url: trimmed,
      path: trimmed,
      bytes: 0,
      contentType: contentTypeFromName(trimmed),
    };
  }
  return storeBase64(trimmed, folder, fileName, photographerId);
}

/** Delete a file previously returned as `StoredFile.path` (`<folder>/<name>` or full Firebase path). */
export async function removeStored(storedPath: string): Promise<void> {
  const target = (storedPath ?? '').trim();
  if (!target || isRemoteUrl(target)) return;

  try {
    if (env.STORAGE_DRIVER === 'supabase') {
      const [folder, ...rest] = target.split('/');
      const name = rest.join('/');
      if (!folder || !name || target.includes('..')) return;
      const { error } = await storageClient().storage.from(folder).remove([name]);
      if (error) throw new Error(error.message);
    } else {
      const [folder, ...rest] = target.split('/');
      const name = rest.join('/');
      if (!folder || !name || target.includes('..')) return;
      await rm(path.join(env.uploadsDir, folder, name), { force: true });
    }
  } catch (error) {
    logger.warn(`Could not remove stored file ${target}`, error);
  }
}

// ── Drivers ──────────────────────────────────────────────────────────────────

async function writeToDisk(
  folder: StorageFolder,
  name: string,
  buffer: Buffer,
  contentType: string,
): Promise<StoredFile> {
  const directory = path.join(env.uploadsDir, folder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), buffer);

  return {
    url: `${env.STORAGE_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${folder}/${name}`,
    path: `${folder}/${name}`,
    bytes: buffer.byteLength,
    contentType,
  };
}

let client: SupabaseClient | null = null;

function storageClient(): SupabaseClient {
  if (!client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw serverError('Supabase storage is selected but its credentials are missing.');
    }
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

async function uploadToSupabase(
  folder: StorageFolder,
  name: string,
  buffer: Buffer,
  contentType: string,
): Promise<StoredFile> {
  const bucket = storageClient().storage.from(folder);

  const { error } = await bucket.upload(name, buffer, {
    contentType,
    // getCacheControl already decides this per folder, and this line ignored
    // it - every upload got seven days, including the artwork derivatives that
    // are content-addressed by a uuid and can never change.
    cacheControl: getCacheControl(folder),
    upsert: false,
  });
  if (error) throw serverError(`The upload could not be stored: ${error.message}`);

  const { data } = bucket.getPublicUrl(name);

  return {
    url: data.publicUrl,
    path: `${folder}/${name}`,
    bytes: buffer.byteLength,
    contentType,
  };
}

/** Threshold above which to use resumable upload (5 MB). */
const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

/** Cache-Control profiles by folder type. */
function getCacheControl(folder: StorageFolder): string {
  // Immutable assets (photographer uploads, profile images, artwork originals) — long cache
  if (['photographers', 'profiles', 'artworks', 'thumbnails', 'spaces'].includes(folder)) {
    return 'public, max-age=31536000, immutable'; // 1 year
  }
  // Manager-controlled assets that may be updated in-place — shorter cache, must-revalidate
  if (['hero', 'featured', 'cafes', 'collaborations'].includes(folder)) {
    return 'public, max-age=3600, must-revalidate'; // 1 hour, revalidate
  }
  // Documents/invoices — medium cache
  if (['documents', 'invoices'].includes(folder)) {
    return 'public, max-age=86400'; // 1 day
  }
  return 'public, max-age=3600';
}

async function uploadToFirebase(
  _folder: StorageFolder,
  _name: string,
  _buffer: Buffer,
  _contentType: string,
  _photographerId?: string,
): Promise<StoredFile> {
  throw new Error('Firebase storage is no longer used. Use Supabase or local driver.');
}

/**
 * Legacy function kept for reference — Firebase storage is no longer the active driver.
 * Use uploadToSupabase or writeToDisk instead.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Decoded byte count of a base64 string, without decoding it. */
function encodedSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * `<uuid>.<ext>`, prefixed with the original name when the client sent one so
 * a directory listing is readable. The uuid still guarantees uniqueness.
 */
function storedName(fileName: string | undefined, extension: string): string {
  const id = uuid();
  const stem = fileName ? slugify(path.parse(fileName).name).slice(0, 40).replace(/^-+|-+$/g, '') : '';
  return stem ? `${stem}-${id}.${extension}` : `${id}.${extension}`;
}

function contentTypeFromName(value: string): string {
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(value)?.[1]?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? 'image/jpeg';
}

/** Reject payloads merely labelled as images before they ever reach storage. */
function matchesImageSignature(buffer: Buffer, contentType: string): boolean {
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (contentType === 'image/avif') {
    return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp' && buffer.subarray(8, 12).toString('ascii').includes('avif');
  }
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    /*
      HEIC is an ISO base media file: a `ftyp` box at offset 4, then a brand.
      Apple writes `heic` for a single still and `heix`/`hevc` for the 10-bit
      and burst variants; `mif1`/`msf1` turn up from Android and from files that
      have been through a converter. The brand list is checked rather than just
      `ftyp`, because MP4 and AVIF share the same header shape.
    */
    if (buffer.length < 12) return false;
    if (buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
    const brand = buffer.subarray(8, 12).toString('ascii');
    return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(
      brand,
    );
  }
  if (contentType === 'image/gif') {
    // GIF87a or GIF89a. Both are still in the wild; only the second supports
    // animation and transparency, and neither is worth distinguishing here.
    const signature = buffer.length >= 6 ? buffer.subarray(0, 6).toString('ascii') : '';
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  // Default deny, which is the right default: an unrecognised type reaching this
  // point means the format was added to EXTENSIONS without a signature to match
  // it, and refusing is better than storing whatever it turned out to be.
  return false;
}