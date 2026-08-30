import { logger } from '@/utils/logger';

/**
 * RESIZED COPIES OF AN UPLOADED PHOTOGRAPH.
 *
 * ── The problem this exists to solve ────────────────────────────────────────
 *
 * Until this file, `artwork.routes.ts` wrote the SAME url to both `imageUrl`
 * and `thumbnailUrl`. There was no thumbnail. A gallery tile is drawn about
 * 324px wide on a 1440px screen and about 167px on a phone, and what the
 * browser was handed was the photographer's original file - typically a 3-15 MB
 * JPEG, up to the 25 MB upload ceiling, often 6000px across.
 *
 * At forty tiles a screen that is on the order of two hundred megabytes to draw
 * one page. On a café's wifi that is minutes, and it is the whole of "the
 * gallery loads very slowly every single time". No amount of lazy-loading,
 * caching or layout work fixes it, because the bytes are the problem.
 *
 * ── What it produces ───────────────────────────────────────────────────────
 *
 * Three WebP copies at 400 / 800 / 1600 px wide. WebP because every browser
 * ARTINU supports reads it and it is roughly a third the size of an equivalent
 * JPEG; three widths because that covers a phone tile, a desktop tile at 2x,
 * and the lightbox.
 *
 * The ORIGINAL IS NEVER TOUCHED OR REPLACED. It is kept and recorded as
 * `originalUrl`, because ARTINU's actual product is a print on a wall and the
 * print shop needs every pixel the photographer gave us. These derivatives are
 * for screens only.
 *
 * ── Why every failure here is non-fatal ────────────────────────────────────
 *
 * Photographers not uploading is the single biggest problem the business has.
 * An upload that fails because a resize failed would be a self-inflicted wound
 * far worse than a slow gallery, so every path in this module returns an empty
 * list rather than throwing, and the caller falls back to exactly today's
 * behaviour: the original, serving as its own thumbnail. Slower, and it works.
 */

/** Widths generated for every uploaded photograph, smallest first. */
export const VARIANT_WIDTHS = [400, 800, 1600] as const;

export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export interface GeneratedVariant {
  width: number;
  height: number;
  buffer: Buffer;
  contentType: 'image/webp';
}

/**
 * Formats worth deriving from.
 *
 * GIF is deliberately absent. Resizing an animated GIF to a still WebP throws
 * away the animation, and a "thumbnail" that silently drops what the file was
 * for is worse than a large one. GIFs keep serving their original.
 */
const DERIVABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/**
 * A decompression-bomb ceiling. A 100-megapixel input is not a photograph
 * someone took, and decoding one on a 512 MB dyno takes the process down.
 */
const MAX_INPUT_PIXELS = 100_000_000;

/**
 * sharp is loaded on first use rather than at import.
 *
 * It is a native module, and the binary is platform-specific. If it is missing
 * or unloadable - a fresh platform, a partial install, an architecture nobody
 * built for - importing it at module scope would take the entire API down at
 * boot over an image-resizing optimisation. This way the server starts, uploads
 * still work, and the failure is one warning line and no derivatives.
 */
/** The callable factory, i.e. the module's default export - not the namespace. */
type Sharp = (typeof import('sharp'))['default'];

let sharpModule: Sharp | null | undefined;

async function loadSharp(): Promise<Sharp | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    const sharp = (await import('sharp')).default;

    /*
      One resize at a time.

      libvips defaults its thread pool to the number of CPUs. On Render's free
      instance that is a small box with 512 MB of memory, and decoding a
      6000x4000 JPEG costs roughly 72 MB of raw pixels before any work starts.
      Several of those at once is an out-of-memory kill, which on Render looks
      like the API simply disappearing. Serial is slower per upload and it is
      the difference between a slow endpoint and a dead one.
    */
    sharp.concurrency(1);
    sharp.cache(false);

    sharpModule = sharp;
    logger.info('Image variants enabled (sharp loaded).');
  } catch (error) {
    sharpModule = null;
    logger.warn(
      'sharp could not be loaded - uploads will be stored without resized variants, and the gallery will serve originals.',
      error,
    );
  }
  return sharpModule;
}

/**
 * Build the resized copies of one uploaded photograph.
 *
 * Returns an empty array if anything at all goes wrong, or if the source is
 * smaller than the smallest variant and there is nothing to gain.
 */
export async function generateVariants(
  source: Buffer,
  contentType: string,
): Promise<GeneratedVariant[]> {
  if (!DERIVABLE.has(contentType.toLowerCase())) return [];

  const sharp = await loadSharp();
  if (!sharp) return [];

  try {
    const probe = sharp(source, { limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await probe.metadata();
    const sourceWidth = metadata.width ?? 0;
    if (!sourceWidth) return [];

    /*
      EXIF orientation is applied, not carried.

      A phone photograph is very often stored in one orientation with a rotation
      flag in its EXIF telling the viewer to turn it. `.rotate()` with no
      argument bakes that flag into the pixels. Without it the derivatives come
      out sideways while the original looks correct - which is worse than having
      no derivatives, because the gallery would be full of rotated thumbnails
      that open into upright photographs.

      It also strips metadata as a side effect, which is a second win: uploaded
      photographs routinely carry GPS coordinates of where someone lives.
    */
    const variants: GeneratedVariant[] = [];

    for (const width of VARIANT_WIDTHS) {
      /*
        Never upscale. `withoutEnlargement` means a 500px upload produces a
        400px variant and then stops - there is no point storing an 800px and a
        1600px copy of a 500px file, and the srcset would advertise detail that
        does not exist.
      */
      if (width > sourceWidth && width !== VARIANT_WIDTHS[0]) continue;

      const { data, info } = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer({ resolveWithObject: true });

      variants.push({
        width: info.width,
        height: info.height,
        buffer: data,
        contentType: 'image/webp',
      });
    }

    /*
      Deduplicate by produced width.

      `withoutEnlargement` clamps every requested width above the source to the
      source width, so a 900px upload asked for 400/800/1600 comes back as
      400/800/900/900. Two identical 900px copies is two uploads and two srcset
      candidates for one image.
    */
    const seen = new Set<number>();
    return variants.filter((variant) => {
      if (seen.has(variant.width)) return false;
      seen.add(variant.width);
      return true;
    });
  } catch (error) {
    logger.warn('Could not generate image variants - storing the original only.', error);
    return [];
  }
}

/**
 * Formats a browser cannot draw, which we accept anyway and convert.
 *
 * HEIC is what every iPhone shoots by default. Refusing it - which is what
 * ARTINU did, with a message telling the photographer to go and export a JPEG -
 * put a chore between somebody and uploading their work, on a platform whose
 * single biggest problem is that people sign up and never upload.
 *
 * Accepting it is only half the job. Safari can display HEIC and nothing else
 * can, so storing the file as-is would mean a photograph that is invisible to
 * most of the internet. It has to be converted on the way in.
 */
const NEEDS_TRANSCODE = new Set(['image/heic', 'image/heif']);

export const needsTranscode = (contentType: string) =>
  NEEDS_TRANSCODE.has(contentType.toLowerCase());

export interface Transcoded {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width?: number;
  height?: number;
}

/**
 * Convert a HEIC/HEIF upload to a full-resolution JPEG.
 *
 * ── Why JPEG, at full resolution, replacing the original ───────────────────
 *
 * The rest of this module treats the photographer's file as sacred, because it
 * is the print file. HEIC is the one exception, and deliberately:
 *
 *   - It is stored at FULL resolution and quality 95. Nothing is scaled. For a
 *     print at A2 the difference between this and the HEIC is not visible.
 *   - HEIC is itself a lossy format, so this is not a lossless original being
 *     thrown away - it is one lossy encode being re-encoded once.
 *   - Keeping the HEIC as well would mean storing two full-size files per
 *     upload plus three variants, and the second one could not be opened by the
 *     gallery, the console, the print shop's software, or the founder's laptop.
 *     An archive nothing can read is not an archive.
 *
 * If the conversion fails the caller MUST reject the upload rather than store
 * the HEIC, because a stored HEIC with no derivatives is a photograph nobody
 * can see. That is the one place in this file where a failure is fatal, and it
 * is fatal in the safe direction: the photographer is told to try again rather
 * than believing their work is published when it is invisible.
 */
export async function transcodeToJpeg(source: Buffer): Promise<Transcoded | null> {
  /*
    TWO DECODERS, IN ORDER, AND THE SECOND ONE IS NOT OPTIONAL.

    sharp reports `heif` as a supported input format, and `sharp(heic).metadata()`
    happily returns 1280x854 - which makes it look as though this works. It does
    not. Reading the header and decoding the pixels are different things, and on
    the prebuilt sharp binary the actual decode fails with:

        heif: Error while loading plugin: Support for this compression format
        has not been built in

    because HEVC is patent-encumbered and the shipped libheif has no HEVC
    decoder. Every photograph an iPhone takes is HEVC-coded HEIC. Verified
    against a real one, not assumed.

    So sharp is tried first - if a future sharp or a differently-built host CAN
    decode it, that path is far faster and uses far less memory - and
    `heic-convert` is the fallback. That is libheif compiled to WebAssembly:
    slower (about 800ms for a 1.1MP image) and heavier, but it has no native
    dependency and it actually works.
  */
  const viaSharp = await transcodeWithSharp(source);
  if (viaSharp) return viaSharp;
  return transcodeWithWasm(source);
}

async function transcodeWithSharp(source: Buffer): Promise<Transcoded | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;

  try {
    const { data, info } = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      // Same reasoning as the variants: bake the EXIF rotation in, and drop the
      // GPS coordinates that iPhones attach to everything.
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      contentType: 'image/jpeg',
      extension: 'jpg',
      width: info.width,
      height: info.height,
    };
  } catch {
    // Expected on any host without an HEVC decoder. Not logged as an error -
    // the fallback below is the normal path, not an exception.
    return null;
  }
}

/**
 * One HEIC conversion at a time.
 *
 * The WASM decoder expands the image to raw RGBA in memory - a 12-megapixel
 * photograph is ~48MB of pixels before the JPEG encoder even starts, and the
 * measured resident set for a 1.1MP file was already 133MB. The API runs on a
 * 512MB instance. Two of these at once is an out-of-memory kill, which on
 * Render looks like the whole API vanishing mid-upload.
 *
 * A promise chain is enough: uploads queue rather than run together, and a
 * batch of ten HEICs takes ten times as long instead of taking the server down.
 */
let heicQueue: Promise<unknown> = Promise.resolve();

function serialise<T>(work: () => Promise<T>): Promise<T> {
  const next = heicQueue.then(work, work);
  // Keep the chain alive even when a link rejects.
  heicQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function transcodeWithWasm(source: Buffer): Promise<Transcoded | null> {
  return serialise(async () => {
    try {
      const convert = (await import('heic-convert')).default;
      const decoded = await convert({ buffer: source, format: 'JPEG', quality: 0.95 });
      // The decoder returns an ArrayBuffer on some paths and a Uint8Array on
      // others; normalise before handing it to sharp.
      const buffer = Buffer.from(
        decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded),
      );

      /*
        Re-read the dimensions through sharp rather than trusting the decoder,
        and re-encode nothing. `heic-convert` does not apply EXIF orientation,
        so the rotate below is what stops iPhone photographs coming out sideways
        - the same trap the variants have.
      */
      const sharp = await loadSharp();
      if (!sharp) {
        return { buffer, contentType: 'image/jpeg', extension: 'jpg' };
      }

      const { data, info } = await sharp(buffer)
        .rotate()
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        contentType: 'image/jpeg',
        extension: 'jpg',
        width: info.width,
        height: info.height,
      };
    } catch (error) {
      logger.warn('Could not convert that HEIC upload to JPEG.', error);
      return null;
    }
  });
}
