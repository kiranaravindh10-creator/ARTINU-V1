import { db } from '@/database/db';
import { badRequest } from '@/utils/errors';
import { now } from '@/utils/ids';

/**
 * Manager-controlled "Featuring Artist" carousel (requirements §13).
 *
 * Previously an artist appeared here if any of their photographs happened to
 * carry `featured: true` — a side effect of artwork curation, with no ordering
 * and no way to promote a sponsored artist. ARTINU needs to place artists
 * deliberately, so the list is now an explicit, ordered record.
 *
 * It lives in `ui_content` under `featured_artists` rather than a table of its
 * own: it is a short ordered list of ids, `ui_content` is exactly the key/value
 * surface for that (the type's own comment names this id), and it avoids
 * putting the team through another migration for four fields.
 */

const RECORD_ID = 'featured_artists';

export interface FeaturedArtistEntry {
  artistId: string;
  /** Paid placement — surfaced in the UI so it is never disguised as editorial. */
  sponsored: boolean;
  /** Ascending; gaps are fine, ties fall back to insertion order. */
  order: number;
  /** Optional override for the pitch shown under the artist's name. */
  note?: string | null;
}

interface StoredList {
  entries: FeaturedArtistEntry[];
  updatedAt: string;
}

async function read(): Promise<FeaturedArtistEntry[]> {
  const record = await db.uiContent.byId(RECORD_ID);
  const data = record?.data as StoredList | undefined;
  if (!data || !Array.isArray(data.entries)) return [];
  return [...data.entries].sort((a, b) => a.order - b.order);
}

async function write(entries: FeaturedArtistEntry[]): Promise<void> {
  const payload: StoredList = { entries, updatedAt: now() };
  const existing = await db.uiContent.byId(RECORD_ID);
  if (existing) {
    await db.uiContent.update(RECORD_ID, { data: payload, updatedAt: now() });
    return;
  }
  await db.uiContent.insert({ id: RECORD_ID, data: payload, updatedAt: now() });
}

/** The raw list, for the console editor. */
export const listFeaturedArtists = read;

/**
 * Replaces the whole list. A full replacement rather than per-item edits keeps
 * ordering unambiguous — the array index *is* the running order.
 */
export async function setFeaturedArtists(
  entries: { artistId: string; sponsored?: boolean; note?: string | null }[],
): Promise<FeaturedArtistEntry[]> {
  if (entries.length > 24) {
    throw badRequest('The featured carousel holds at most 24 artists.');
  }

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.artistId)) {
      throw badRequest('The same artist appears twice in the featured list.');
    }
    seen.add(entry.artistId);

    // A carousel pointing at a deleted or non-artist account renders as a gap,
    // so the reference is checked here rather than discovered by a visitor.
    const user = await db.users.byId(entry.artistId);
    if (!user || user.role !== 'artist') {
      throw badRequest(`${entry.artistId} is not an artist account.`);
    }
  }

  const normalised = entries.map((entry, index) => ({
    artistId: entry.artistId,
    sponsored: entry.sponsored ?? false,
    note: entry.note ?? null,
    order: index,
  }));

  await write(normalised);
  return normalised;
}

/**
 * The ids the public carousel should show, in order.
 *
 * Returns an empty array when nothing has been curated, which the caller treats
 * as "fall back to the automatic selection" — a manager who has not touched
 * this yet should still see a populated carousel rather than a blank strip.
 */
export async function featuredArtistIds(): Promise<string[]> {
  return (await read()).map((entry) => entry.artistId);
}

export async function sponsoredArtistIds(): Promise<Set<string>> {
  return new Set((await read()).filter((entry) => entry.sponsored).map((entry) => entry.artistId));
}
