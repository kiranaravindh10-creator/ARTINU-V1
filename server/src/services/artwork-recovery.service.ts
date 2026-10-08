import {
  ARTWORK_RECOVERY_DAYS,
  type Artwork,
  type ArtworkStatus,
  type RecentlyDeletedArtwork,
} from '@artinu/shared';
import { db } from '@/database/db';
import { storagePathFromUrl } from '@/services/account-deletion.service';
import { recordAudit } from '@/services/audit.service';
import { removeStored } from '@/services/storage.service';
import { conflict, forbidden, HttpError, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';

/**
 * A photographer deleting their own work, and the 17 days they have to change
 * their mind.
 *
 * ── Three stages ────────────────────────────────────────────────────────────
 *
 *   delete    status -> 'deleted', with deletedAt / deletedBy and the status to
 *             go back to. The row and every file stay exactly as they were, so
 *             a recovery is the original record, not a copy.
 *   recover   inside the window: the old status comes back and the three
 *             deletion fields are cleared. Same id, same files, same metadata.
 *   purge     the nightly sweep, once the window has passed. See below.
 *
 * Every rule is applied here, on the server clock, from the stored timestamp.
 * Nothing a client sends - a date, an expiry, an artist id - is ever read.
 *
 * ── What "permanently deleted" removes, and what it must not ────────────────
 *
 * ARTINU keeps business history. An order item snapshots the photograph's
 * title and image url, a rotation cycle records what hung on a café wall, and a
 * warning or removal request is a moderation record. So a photograph any of
 * those point at keeps its row and its files when its window closes: it is
 * permanently unrecoverable and never public again, but an invoice or a
 * printing record that shows it does not break. Its public pointers (wishlists,
 * the curated lists) are still removed.
 *
 * A photograph nothing points at is removed entirely: its row, the wishlist
 * entries and curated-list pointers that named it, and its files - the
 * original and every screen-sized copy - unless some other record (another
 * photograph, a hero slide, a profile, a café card) uses the very same file.
 */

const DAY = 24 * 60 * 60 * 1000;

/** The recovery window, in milliseconds. Exactly ARTWORK_RECOVERY_DAYS x 24h. */
export const RECOVERY_WINDOW_MS = ARTWORK_RECOVERY_DAYS * DAY;

/** The ARTINU content record holding the gallery's curated Top Picks (artwork ids). */
const CURATED_ARTWORK_LISTS = ['gallery_top_20'];

type Actor = { id: string; email: string };

/** When a deletion stops being recoverable. Null for a missing or unreadable timestamp. */
export function recoverableUntil(deletedAt: string | null | undefined): Date | null {
  if (!deletedAt) return null;
  const at = new Date(deletedAt).getTime();
  return Number.isNaN(at) ? null : new Date(at + RECOVERY_WINDOW_MS);
}

/**
 * Still inside the window, by the server clock?
 *
 * The boundary is exclusive: at exactly 17 x 24h after deletion it is over.
 */
export function isRecoverable(artwork: Pick<Artwork, 'status' | 'deletedAt'>, at: Date = new Date()): boolean {
  if (artwork.status !== 'deleted') return false;
  const until = recoverableUntil(artwork.deletedAt);
  return until !== null && at.getTime() < until.getTime();
}

/** The photograph, if it exists and belongs to the signed-in photographer. */
async function ownArtwork(artworkId: string, userId: string): Promise<Artwork> {
  const artwork = await db.artworks.byId(artworkId);
  if (!artwork) throw notFound('That photograph');
  if (artwork.artistId !== userId) throw forbidden('That is not your photograph.');
  return artwork;
}

const IN_USE = {
  order:
    'This photograph is part of an order that is still in progress, so it cannot be deleted yet. ' +
    'Contact the ARTINU team if it needs to come down.',
  rotation:
    "This photograph is on a space's walls or in its next rotation, so it cannot be deleted yet. " +
    'Contact the ARTINU team and we will arrange for it to be taken down first.',
} as const;

/**
 * Is this photograph in live use by a space right now?
 *
 * An order that has not finished, or a rotation cycle that is still open (its
 * current set is what hangs on the wall, its proposed set is what goes up
 * next). A photograph on a wall stays up until it is physically taken down,
 * which is the team's job, so these refuse a self-service delete.
 */
export async function artworkInUse(artworkId: string): Promise<keyof typeof IN_USE | null> {
  const orders = await db.orders.find();
  const openOrder = orders.some(
    (order) =>
      order.status !== 'completed' &&
      order.status !== 'cancelled' &&
      order.items.some((item) => item.artworkId === artworkId),
  );
  if (openOrder) return 'order';

  const cycles = await db.rotations.find();
  const onAWall = cycles.some(
    (cycle) =>
      cycle.status !== 'installed' &&
      (cycle.currentArtworkIds.includes(artworkId) || cycle.proposedArtworkIds.includes(artworkId)),
  );
  return onAWall ? 'rotation' : null;
}

export interface DeletionResult {
  artwork: Artwork;
  recoverableUntil: string;
}

/** Moves the photographer's own photograph to Recently Deleted. */
export async function deleteArtwork(artworkId: string, actor: Actor, at: Date = new Date()): Promise<DeletionResult> {
  const artwork = await ownArtwork(artworkId, actor.id);

  // Never re-stamp: deleting again must not restart the 17 days.
  if (artwork.status === 'deleted') {
    throw conflict('That photograph is already in Recently Deleted.');
  }

  const use = await artworkInUse(artwork.id);
  if (use) throw conflict(IN_USE[use]);

  const deletedAt = at.toISOString();
  const updated = await db.artworks.update(artwork.id, {
    status: 'deleted',
    deletedAt,
    deletedBy: actor.id,
    deletedFromStatus: artwork.status,
    updatedAt: now(),
  });
  const until = recoverableUntil(deletedAt)!.toISOString();

  await recordAudit({
    actor,
    action: 'artwork.deleted',
    entity: 'artwork',
    entityId: artwork.id,
    meta: { fromStatus: artwork.status, recoverableUntil: until },
  });

  return { artwork: updated, recoverableUntil: until };
}

/** Puts the photographer's own deleted photograph back, if the window is still open. */
export async function recoverArtwork(artworkId: string, actor: Actor, at: Date = new Date()): Promise<Artwork> {
  const artwork = await ownArtwork(artworkId, actor.id);

  if (artwork.status !== 'deleted') {
    throw conflict('That photograph is not in Recently Deleted, so there is nothing to recover.');
  }
  if (!isRecoverable(artwork, at)) {
    throw new HttpError(
      410,
      `The ${ARTWORK_RECOVERY_DAYS}-day recovery period for that photograph has ended.`,
      'recovery_expired',
    );
  }

  // Whatever it was before. A row somehow missing that goes back hidden, never public.
  const restoreTo: ArtworkStatus =
    artwork.deletedFromStatus && artwork.deletedFromStatus !== 'deleted' ? artwork.deletedFromStatus : 'archived';

  const restored = await db.artworks.update(artwork.id, {
    status: restoreTo,
    deletedAt: null,
    deletedBy: null,
    deletedFromStatus: null,
    updatedAt: now(),
  });

  await recordAudit({
    actor,
    action: 'artwork.restored',
    entity: 'artwork',
    entityId: artwork.id,
    meta: { restoredStatus: restoreTo },
  });

  return restored;
}

/** The photographer's own deleted photographs still inside the window, newest first. */
export async function listRecentlyDeleted(artistId: string, at: Date = new Date()): Promise<RecentlyDeletedArtwork[]> {
  const deleted = await db.artworks.find({ where: { artistId, status: 'deleted' } });
  const profile = await db.profiles.findOne({ userId: artistId });
  const artistName = profile?.displayName || profile?.fullName || '';

  return deleted
    .filter((artwork) => isRecoverable(artwork, at))
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
    .map((artwork) => {
      const until = recoverableUntil(artwork.deletedAt)!;
      return {
        id: artwork.id,
        title: artwork.title,
        thumbnailUrl: artwork.thumbnailUrl,
        imageUrl: artwork.imageUrl,
        photoId: artwork.photoId ?? null,
        artistName,
        deletedAt: artwork.deletedAt!,
        recoverableUntil: until.toISOString(),
        remainingMs: Math.max(0, until.getTime() - at.getTime()),
      };
    });
}

// ── The nightly purge ───────────────────────────────────────────────────────

export interface PurgeSummary {
  /** Deleted photographs whose window had closed. */
  expired: number;
  /** Removed entirely: row, pointers and files. */
  purged: number;
  /** Kept as a record because an order, rotation or moderation record names it. */
  retained: number;
  filesRemoved: number;
  /** Left in place because another record uses the same file. */
  filesKept: number;
  failed: number;
}

/** Every file a photograph has: the original and each screen-sized copy. */
function artworkFiles(artwork: Artwork): string[] {
  return [
    artwork.originalUrl,
    artwork.imageUrl,
    artwork.thumbnailUrl,
    ...Object.values(artwork.imageVariants ?? {}),
  ].filter((url): url is string => typeof url === 'string' && url.length > 0);
}

/**
 * Removes photographs whose 17 days have passed. Never touches one still
 * inside its window, one whose status is not 'deleted', or anybody's files but
 * the photograph's own.
 *
 * Safe to run on several instances at once and safe to re-run: every step is
 * "remove if present", and a photograph already gone is simply not found.
 */
export async function purgeExpiredArtworks(at: Date = new Date()): Promise<PurgeSummary> {
  const summary: PurgeSummary = { expired: 0, purged: 0, retained: 0, filesRemoved: 0, filesKept: 0, failed: 0 };

  const expired = (await db.artworks.find({ where: { status: 'deleted' } })).filter((artwork) => {
    // A 'deleted' row with no readable timestamp is left alone and reported,
    // never treated as expired - that would purge it on the very next night.
    if (!recoverableUntil(artwork.deletedAt)) {
      logger.warn(`Artwork ${artwork.id} is marked deleted but has no deletion time - left untouched.`);
      return false;
    }
    return !isRecoverable(artwork, at);
  });
  summary.expired = expired.length;
  if (expired.length === 0) return summary;

  // Business and moderation records that keep a photograph's row alive.
  const [orders, cycles, removals, warnings] = await Promise.all([
    db.orders.find(),
    db.rotations.find(),
    db.removalRequests.find(),
    db.warnings.find(),
  ]);
  const isReferenced = (id: string) =>
    orders.some((order) => order.items.some((item) => item.artworkId === id)) ||
    cycles.some((cycle) => cycle.currentArtworkIds.includes(id) || cycle.proposedArtworkIds.includes(id)) ||
    removals.some((request) => request.artworkId === id) ||
    warnings.some((warning) => warning.artworkId === id);

  for (const artwork of expired) {
    try {
      const user = await db.users.byId(artwork.artistId);
      // Attributed to the photographer who deleted it, as the other nightly jobs do.
      const actor = { id: artwork.artistId, email: user?.email ?? '' };

      await removePublicPointers(artwork.id);

      if (isReferenced(artwork.id)) {
        summary.retained += 1;
        const logged = await db.auditLogs.find({
          where: { entity: 'artwork', entityId: artwork.id, action: 'artwork.purge_retained' },
          limit: 1,
        });
        if (logged.length === 0) {
          await recordAudit({
            actor,
            action: 'artwork.purge_retained',
            entity: 'artwork',
            entityId: artwork.id,
            meta: { title: artwork.title, photoId: artwork.photoId ?? null, reason: 'referenced by business records' },
          });
        }
        continue;
      }

      // Rows first, files last: a storage outage must not leave a half-deleted
      // record, and a stranded file is recoverable and logged.
      const files = artworkFiles(artwork);
      await db.artworks.remove(artwork.id);
      const { removed, kept } = await removeUnsharedFiles(files);
      summary.purged += 1;
      summary.filesRemoved += removed;
      summary.filesKept += kept;

      await recordAudit({
        actor,
        action: 'artwork.purged',
        entity: 'artwork',
        entityId: artwork.id,
        meta: {
          title: artwork.title,
          photoId: artwork.photoId ?? null,
          deletedAt: artwork.deletedAt ?? null,
          filesRemoved: removed,
          filesKept: kept,
        },
      });
    } catch (error) {
      summary.failed += 1;
      logger.error(`Could not purge deleted artwork ${artwork.id}`, error);
    }
  }

  return summary;
}

/** Wishlist entries and curated-list pointers that name the photograph. */
async function removePublicPointers(artworkId: string): Promise<void> {
  const wishlisted = await db.wishlists.find({ where: { artworkId } });
  for (const entry of wishlisted) await db.wishlists.remove(entry.id);

  const featured = await db.featuredCollections.find();
  for (const entry of featured) {
    // A featured collection's `collectionId` is the id of the photograph it shows.
    if (entry.collectionId === artworkId) await db.featuredCollections.remove(entry.id);
  }

  for (const key of CURATED_ARTWORK_LISTS) {
    const record = await db.uiContent.byId(key);
    if (!record || !Array.isArray(record.data) || !record.data.includes(artworkId)) continue;
    await db.uiContent.update(key, {
      data: record.data.filter((id: unknown) => id !== artworkId),
      updatedAt: now(),
    });
  }
}

/**
 * Removes the photograph's own files, skipping any that another record still
 * uses, and any that are not ARTINU's to delete (seed imagery on other hosts).
 */
async function removeUnsharedFiles(urls: string[]): Promise<{ removed: number; kept: number }> {
  const [artworks, heroSlides, cafes, slides, profiles, spaces, orders] = await Promise.all([
    db.artworks.find(),
    db.heroSlides.find(),
    db.cafes.find(),
    db.collaborationSlides.find(),
    db.profiles.find(),
    db.spaces.find(),
    db.orders.find(),
  ]);
  const inUse = new Set<string>([
    ...artworks.flatMap(artworkFiles),
    ...heroSlides.map((slide) => slide.imageUrl),
    ...cafes.map((cafe) => cafe.photoUrl),
    ...slides.map((slide) => slide.imageUrl),
    ...profiles.flatMap((profile) => [profile.avatarUrl, profile.coverUrl]),
    ...spaces.flatMap((space) => space.imageUrls ?? []),
    ...orders.flatMap((order) => order.items.map((item) => item.artworkImageUrl)),
  ].filter((url): url is string => Boolean(url)));

  let removed = 0;
  let kept = 0;
  for (const url of [...new Set(urls)]) {
    if (inUse.has(url)) {
      kept += 1;
      continue;
    }
    const path = storagePathFromUrl(url);
    if (!path) continue;
    await removeStored(path);
    removed += 1;
  }
  return { removed, kept };
}
