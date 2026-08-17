import { db } from '@/database/db';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { removeStored } from '@/services/storage.service';

/**
 * Permanent deletion of an account and everything belonging to it.
 *
 * ── Why this is not just `db.users.remove(id)` ──────────────────────────────
 *
 * Two reasons, and both bite.
 *
 * 1. `orders.owner_id` and `invoices.owner_id` are ON DELETE RESTRICT, and
 *    `orders.space_id` / `invoices.space_id` restrict against spaces — which
 *    themselves cascade from the user. So Postgres refuses to delete anyone who
 *    has ever placed an order, and the only symptom is a foreign-key error. The
 *    dependents have to go first, deepest first.
 *
 * 2. The in-memory driver has no foreign keys at all, so nothing cascades
 *    there. Relying on Postgres cascades would mean "delete account" removed
 *    everything against Supabase and left orphans against the memory store.
 *
 * So every dependent row is removed explicitly, in dependency order. The result
 * is identical under both drivers, which is the whole point of the Table
 * abstraction this sits on.
 *
 * ── What is deliberately kept ───────────────────────────────────────────────
 *
 * Audit log entries. `audit_logs.actor_id` is ON DELETE SET NULL precisely so
 * the trail outlives the actor: an audit record that disappears when the
 * account it indicts is deleted is not an audit trail. The rows remain with
 * `actor_email` intact.
 *
 * Consultation requests and artist applications are also kept — they are keyed
 * by the email address typed into a public form, carry no foreign key to
 * `users`, and may belong to someone who never had an account.
 */

export interface DeletionSummary {
  email: string;
  role: string;
  spaces: number;
  artworks: number;
  orders: number;
  invoices: number;
  payments: number;
  installations: number;
  notifications: number;
  payouts: number;
  filesRemoved: number;
  /** Files storage refused to give up. Rows are gone either way. */
  filesFailed: number;
}

/**
 * Supabase public URLs look like
 *   {SUPABASE_URL}/storage/v1/object/public/{bucket}/{name}
 * and `removeStored` wants `{bucket}/{name}`, refusing anything that still
 * looks like an http URL. Convert rather than widen removeStored, which other
 * callers depend on.
 */
function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = '/storage/v1/object/public/';
  const at = url.indexOf(marker);
  if (at === -1) {
    // Local-disk driver: STORAGE_PUBLIC_BASE_URL + /{folder}/{name}
    const base = env.STORAGE_PUBLIC_BASE_URL.replace(/\/+$/, '');
    if (url.startsWith(base)) return url.slice(base.length).replace(/^\/+/, '') || null;
    return null; // Unsplash/picsum seed imagery — not ours to delete.
  }
  return decodeURIComponent(url.slice(at + marker.length)) || null;
}

async function removeFiles(urls: (string | null | undefined)[]): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const url of urls) {
    const path = storagePathFromUrl(url);
    if (!path) continue;
    try {
      await removeStored(path);
      removed += 1;
    } catch (error) {
      // A stranded file costs storage; it must not abort the deletion.
      failed += 1;
      logger.warn(`Could not remove ${path} while deleting an account`, error);
    }
  }
  return { removed, failed };
}

/** Removes every row a predicate matches, returning how many went. */
async function purge<T extends { id: string }>(
  table: { find: (o: { filter: (r: T) => boolean }) => Promise<T[]>; remove: (id: string) => Promise<boolean> },
  matches: (row: T) => boolean,
): Promise<T[]> {
  const rows = await table.find({ filter: matches });
  for (const row of rows) await table.remove(row.id);
  return rows;
}

export async function deleteAccountCompletely(userId: string): Promise<DeletionSummary> {
  const user = await db.users.byId(userId);
  if (!user) throw new Error(`No user with id ${userId}`);

  const profile = await db.profiles.findOne({ userId });
  const spaces = await db.spaces.find({ where: { ownerId: userId } as never });
  const spaceIds = new Set(spaces.map((space) => space.id));

  // Orders and invoices belong to the owner and to their spaces; either link is
  // enough to block the delete, so both are matched.
  const ownsOrder = (row: { ownerId?: string; spaceId?: string }) =>
    row.ownerId === userId || (row.spaceId !== undefined && spaceIds.has(row.spaceId));

  // ── Deepest first ─────────────────────────────────────────────────────────
  const invoices = await purge(db.invoices as never, ownsOrder as never);
  const orders = await purge(db.orders as never, ownsOrder as never);
  const orderIds = new Set(orders.map((order: { id: string }) => order.id));

  const payments = await purge(
    db.payments as never,
    ((row: { orderId?: string }) => row.orderId !== undefined && orderIds.has(row.orderId)) as never,
  );
  const installations = await purge(
    db.installations as never,
    ((row: { orderId?: string; spaceId?: string }) =>
      (row.orderId !== undefined && orderIds.has(row.orderId)) ||
      (row.spaceId !== undefined && spaceIds.has(row.spaceId))) as never,
  );
  const rotations = await purge(
    db.rotations as never,
    ((row: { spaceId?: string }) => row.spaceId !== undefined && spaceIds.has(row.spaceId)) as never,
  );

  // Artwork images are the bulk of what this account put in storage.
  const artworks = await db.artworks.find({ where: { artistId: userId } as never });
  const artworkIds = new Set(artworks.map((artwork) => artwork.id));

  // Other people's wishlists point at these artworks and would otherwise dangle.
  await purge(
    db.wishlists as never,
    ((row: { userId?: string; artworkId?: string }) =>
      row.userId === userId || (row.artworkId !== undefined && artworkIds.has(row.artworkId))) as never,
  );
  // Follows in both directions: this user's, and everyone following them.
  await purge(
    db.follows as never,
    ((row: { userId?: string; artistId?: string }) =>
      row.userId === userId || row.artistId === userId) as never,
  );

  for (const artwork of artworks) await db.artworks.remove(artwork.id);

  const notifications = await purge(
    db.notifications as never,
    ((row: { userId?: string }) => row.userId === userId) as never,
  );
  const payouts = await purge(
    db.payouts as never,
    ((row: { artistId?: string }) => row.artistId === userId) as never,
  );
  await purge(db.supportTickets as never, ((row: { userId?: string }) => row.userId === userId) as never);
  await purge(db.otpChallenges as never, ((row: { userId?: string }) => row.userId === userId) as never);
  await purge(db.tokens as never, ((row: { userId?: string }) => row.userId === userId) as never);

  for (const space of spaces) await db.spaces.remove(space.id);
  if (profile) await db.profiles.remove(profile.id);

  // ── The account itself ────────────────────────────────────────────────────
  await db.users.remove(userId);

  // ── Storage, after the rows are gone ──────────────────────────────────────
  // Last on purpose: a storage outage must not leave the account half-deleted.
  // The reverse — rows gone, a few files stranded — is recoverable and logged.
  const files = await removeFiles([
    profile?.avatarUrl,
    (profile as { coverUrl?: string } | null)?.coverUrl,
    ...artworks.flatMap((artwork) => [artwork.imageUrl, artwork.thumbnailUrl, artwork.originalUrl]),
    ...spaces.flatMap((space) => space.imageUrls ?? []),
  ]);

  return {
    email: user.email,
    role: user.role,
    spaces: spaces.length,
    artworks: artworks.length,
    orders: orders.length,
    invoices: invoices.length,
    payments: payments.length,
    installations: installations.length + rotations.length,
    notifications: notifications.length,
    payouts: payouts.length,
    filesRemoved: files.removed,
    filesFailed: files.failed,
  };
}
