/**
 * Correct the stored size of photographs whose pixels are stored sideways.
 *
 *   npx tsx src/scripts/repair-image-orientation.ts
 *       DRY RUN. Reads only - safe with READ_ONLY_MODE=true. Lists every
 *       published photograph whose original JPEG carries an EXIF Orientation of
 *       5-8 (a quarter turn) while its record still holds the unturned size,
 *       and prints the exact --expect value to execute with.
 *
 *   READ_ONLY_MODE=false npx tsx src/scripts/repair-image-orientation.ts --execute --expect <count>
 *       Swaps width and height on exactly those records and re-derives
 *       `orientation`. Stops without writing anything if the count found no
 *       longer equals the reviewed one.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 *
 * Uploads recorded the size from the JPEG frame header, which describes the
 * pixels as stored. A phone stores a portrait photograph sideways and flags it
 * to be turned, and every browser and the resizer obey the flag - so a
 * 4000x3000 record was shown 3000x4000, called "landscape", and framed 3:2 in
 * the gallery and on its page. `imageDimensions` now reads the flag, so new
 * uploads are recorded turned; this fixes the records made before that. The
 * client also reframes by the decoded size, so this is about the stored facts
 * (and the first paint), not about the image shown.
 *
 * Nothing but `width`, `height`, `orientation` and `updatedAt` is written. No
 * file is read beyond its first bytes, and none is changed.
 */
import type { Artwork } from '@artinu/shared';
import { db, flushPersistedStore, writesAreLocked } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { exifOrientation } from '@/services/exif.service';
import { imageDimensions } from '@/services/storage.service';
import { orientationOf } from '@/services/validation-pipeline.service';
import { now } from '@/utils/ids';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const expectAt = args.indexOf('--expect');
const expected = expectAt > -1 ? Number(args[expectAt + 1]) : null;

async function head(url: string, bytes: number | null): Promise<Buffer | null> {
  try {
    const response = await fetch(url, bytes ? { headers: { Range: `bytes=0-${bytes - 1}` } } : {});
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

interface Fix {
  artwork: Artwork;
  turn: number;
  from: { width: number; height: number };
  to: { width: number; height: number };
}

async function plan(): Promise<{ fixes: Fix[]; unreadable: string[] }> {
  const published = (await db.artworks.find()).filter((artwork) => artwork.status === 'approved');
  const fixes: Fix[] = [];
  const unreadable: string[] = [];
  for (const artwork of published) {
    const url = artwork.originalUrl || artwork.imageUrl;
    if (!url || !/^https?:\/\//.test(url)) continue;
    let bytes = await head(url, 256 * 1024);
    // The frame header sits behind every APP segment; a big one can push it past the first read.
    let shown = bytes ? imageDimensions(bytes, 'image/jpeg') : undefined;
    if (bytes && !shown && bytes[0] === 0xff && bytes[1] === 0xd8) {
      bytes = await head(url, null);
      shown = bytes ? imageDimensions(bytes, 'image/jpeg') : undefined;
    }
    if (!bytes) {
      unreadable.push(artwork.photoId ?? artwork.id);
      continue;
    }
    const turn = exifOrientation(bytes);
    if (!shown || turn === null || turn < 5) continue;
    // Already turned (a newer upload, or a second run): nothing to do.
    if (artwork.width === shown.width && artwork.height === shown.height) continue;
    // Only the unturned size is corrected - anything else is not this problem.
    if (artwork.width !== shown.height || artwork.height !== shown.width) continue;
    fixes.push({ artwork, turn, from: { width: artwork.width, height: artwork.height }, to: shown });
  }
  return { fixes, unreadable };
}

async function main() {
  const { fixes, unreadable } = await plan();
  console.log(`${execute ? 'EXECUTE' : 'DRY RUN'} - ${fixes.length} photograph(s) recorded at their unturned size:\n`);
  for (const fix of fixes) {
    console.log(
      `  ${(fix.artwork.photoId ?? fix.artwork.id).padEnd(8)} EXIF ${fix.turn}  ${fix.from.width}x${fix.from.height} ${fix.artwork.orientation} -> ${fix.to.width}x${fix.to.height} ${orientationOf(fix.to.width, fix.to.height)}`,
    );
  }
  if (unreadable.length) console.log(`\n  Could not read: ${unreadable.join(', ')}`);

  if (!execute) {
    console.log(`\nNothing was written. To apply exactly these: READ_ONLY_MODE=false ... --execute --expect ${fixes.length}`);
    return;
  }
  if (writesAreLocked()) {
    console.error('\nREFUSED: READ_ONLY_MODE is on. Nothing was written.');
    process.exitCode = 2;
    return;
  }
  if (expected === null || expected !== fixes.length) {
    console.error(`\nSTOPPED: found ${fixes.length}, but --expect says ${expected ?? 'nothing'}. Re-run the dry run and review it. Nothing was written.`);
    process.exitCode = 2;
    return;
  }
  for (const fix of fixes) {
    await db.artworks.update(fix.artwork.id, {
      width: fix.to.width,
      height: fix.to.height,
      orientation: orientationOf(fix.to.width, fix.to.height),
      updatedAt: now(),
    });
    await recordAudit({
      action: 'artwork.dimensions_corrected',
      entity: 'artwork',
      entityId: fix.artwork.id,
      meta: { photoId: fix.artwork.photoId, exifOrientation: fix.turn, from: fix.from, to: fix.to, source: 'repair-image-orientation' },
    });
  }
  // Read back: every record now holds the size it is shown at.
  const again = await plan();
  console.log(`\nUpdated ${fixes.length}. Still unturned after the update: ${again.fixes.length}.`);
  if (again.fixes.length) process.exitCode = 1;
  await flushPersistedStore();
}

void main();
