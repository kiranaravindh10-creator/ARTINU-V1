/**
 * One-time backfill for existing photographers (run after applying
 * database/migrations/002_photo_id_system.sql on the live Supabase project).
 *
 *   npm run backfill:photo-ids --workspace server
 *
 * Assigns a permanent photographer code to every artist that does not have one,
 * then allocates sequential Photo IDs (in upload order) to every artwork that
 * has none. Existing Photo IDs are never touched.
 */
import { db } from '@/database/db';
import { now } from '@/utils/ids';
import { allocatePhotoId, assignPhotographerCodeIfArtist } from '@/services/photo-id.service';

async function main() {
  const artists = await db.users.find({ where: { role: 'artist' } });
  let codesAssigned = 0;
  let idsAssigned = 0;

  for (const artist of artists) {
    const profile = await db.profiles.findOne({ userId: artist.id });
    if (!profile) continue;

    if (!profile.photographerCode) {
      await assignPhotographerCodeIfArtist(artist.id, 'artist');
      codesAssigned += 1;
    }

    const artworks = await db.artworks.find({
      where: { artistId: artist.id },
      orderBy: { field: 'createdAt', direction: 'asc' },
    });

    for (const artwork of artworks) {
      if (artwork.photoId) continue;
      const { photoId, photoNumber } = await allocatePhotoId(artist.id);
      await db.artworks.update(artwork.id, { photoId, photoNumber, updatedAt: now() });
      idsAssigned += 1;
    }
  }

  console.log(
    `Photo ID backfill complete - ${codesAssigned} photographer code(s) assigned, ${idsAssigned} Photo ID(s) assigned.`,
  );
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});