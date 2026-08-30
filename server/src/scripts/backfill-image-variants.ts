/**
 * One-time backfill: generate resized copies for photographs uploaded before
 * variants existed.
 *
 * Run AFTER applying database/migrations/010_image_variants.sql.
 *
 *   npm run backfill:image-variants --workspace server -- --dry-run
 *   npm run backfill:image-variants --workspace server
 *   npm run backfill:image-variants --workspace server -- --limit 20
 *
 * ── What it does ───────────────────────────────────────────────────────────
 *
 * For every artwork with no `imageVariants`, it downloads the stored original,
 * produces 400/800/1600px WebP copies, uploads them, and rewrites the row:
 *
 *   originalUrl    <- the file that is there now (the photographer's upload)
 *   imageUrl       <- the 1600px copy
 *   thumbnailUrl   <- the 400px copy
 *   imageVariants  <- the map
 *
 * ── Why it is careful ──────────────────────────────────────────────────────
 *
 * This rewrites rows in the live gallery, one at a time, and it is the sort of
 * script that gets run once at 1am against production. So:
 *
 *   - `--dry-run` reports exactly what it would do and writes nothing.
 *   - It NEVER overwrites `originalUrl` if one is already set. On a row that
 *     has been backfilled, `imageUrl` is a derivative; taking that as the
 *     original would permanently lose the print file.
 *   - It skips rows whose image is a remote URL it does not own (seeded
 *     Unsplash and picsum imagery), because there is nothing to re-host and
 *     those hosts already resize on request.
 *   - One photograph at a time, deliberately. Downloading and re-encoding a
 *     dozen 20 MB files in parallel is how you get an out-of-memory kill on a
 *     512 MB instance.
 *   - A failure on one artwork is logged and skipped, never fatal. Re-running
 *     picks up exactly what is still missing, so it is safe to run repeatedly.
 */
import { db } from '@/database/db';
import { generateVariants } from '@/services/image-variants.service';
import { isRemoteUrl, removeStored, storeDerivative } from '@/services/storage.service';
import { env } from '@/config/env';
import { now } from '@/utils/ids';
import type { Artwork } from '@artinu/shared';

const DRY_RUN = process.argv.includes('--dry-run');
const limitFlag = process.argv.indexOf('--limit');
const LIMIT = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) || Infinity : Infinity;

/** Hosts whose images we do not own and which already resize on request. */
const FOREIGN = ['unsplash.com', 'picsum.photos', 'images.unsplash.com'];

const isForeign = (url: string) => FOREIGN.some((host) => url.includes(host));

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function download(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`  ! ${response.status} fetching ${url}`);
      return null;
    }
    const contentType = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
  } catch (error) {
    console.warn(`  ! could not fetch ${url}:`, (error as Error).message);
    return null;
  }
}

async function main() {
  const all = await db.artworks.find({});
  const pending = all.filter((artwork) => !artwork.imageVariants).slice(0, LIMIT);

  console.log(
    `${all.length} artwork(s) total, ${all.length - pending.length} already done, ${pending.length} to process.`,
  );
  console.log(`Storage driver: ${env.STORAGE_DRIVER}${DRY_RUN ? '   [DRY RUN - nothing will be written]' : ''}\n`);

  let done = 0;
  let skipped = 0;
  let failedCount = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const artwork of pending) {
    const source = artwork.originalUrl || artwork.imageUrl;
    const label = `${artwork.photoId ?? artwork.id.slice(0, 8)} "${artwork.title}"`;

    if (!source || !isRemoteUrl(source)) {
      console.log(`  - ${label}: no usable source url, skipped`);
      skipped += 1;
      continue;
    }

    if (isForeign(source)) {
      console.log(`  - ${label}: seeded stock imagery, skipped`);
      skipped += 1;
      continue;
    }

    const downloaded = await download(source);
    if (!downloaded) {
      failedCount += 1;
      continue;
    }

    const variants = await generateVariants(downloaded.buffer, downloaded.contentType);
    if (variants.length === 0) {
      console.log(`  - ${label}: no variants could be produced, skipped`);
      skipped += 1;
      continue;
    }

    const originalBytes = downloaded.buffer.byteLength;
    const smallestBytes = variants[0].buffer.byteLength;
    bytesBefore += originalBytes;
    bytesAfter += smallestBytes;

    const summary = variants.map((v) => `${v.width}w`).join('/');
    console.log(
      `  ✓ ${label}: ${mb(originalBytes)} -> ${summary}, tile ${(smallestBytes / 1024).toFixed(0)} KB`,
    );

    if (DRY_RUN) {
      done += 1;
      continue;
    }

    const stem = source.split('/').pop()?.replace(/\.[^.]+$/, '') ?? artwork.id;
    const stored: Record<number, string> = {};
    const storedPaths: string[] = [];

    try {
      for (const variant of variants) {
        const result = await storeDerivative(
          'thumbnails',
          `${stem}-${variant.width}.webp`,
          variant.buffer,
          'image/webp',
        );
        stored[variant.width] = result.url;
        storedPaths.push(result.path);
      }
    } catch (error) {
      console.warn(`  ! ${label}: upload failed, rolling back -`, (error as Error).message);
      await Promise.all(storedPaths.map((p) => removeStored(p)));
      failedCount += 1;
      continue;
    }

    const widths = Object.keys(stored).map(Number).sort((a, b) => a - b);

    const patch: Partial<Artwork> = {
      // Only set originalUrl if it is not already recorded - on a row that has
      // been through this once, imageUrl is a derivative and would be the wrong
      // thing to preserve as the print file.
      originalUrl: artwork.originalUrl ?? source,
      imageUrl: stored[widths[widths.length - 1]],
      thumbnailUrl: stored[widths[0]],
      imageVariants: stored as unknown as Artwork['imageVariants'],
      updatedAt: now(),
    };

    await db.artworks.update(artwork.id, patch);
    done += 1;
  }

  console.log();
  console.log(
    `${DRY_RUN ? 'Would process' : 'Processed'} ${done}, skipped ${skipped}, failed ${failedCount}.`,
  );
  if (bytesBefore > 0) {
    console.log(
      `Gallery tile weight: ${mb(bytesBefore)} of originals -> ${mb(bytesAfter)} of thumbnails ` +
        `(${Math.round(bytesBefore / Math.max(bytesAfter, 1))}x smaller across ${done} photograph(s)).`,
    );
  }
  if (DRY_RUN) console.log('\nNothing was written. Re-run without --dry-run to apply.');
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
