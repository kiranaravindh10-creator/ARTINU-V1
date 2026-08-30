/**
 * Makes the engagement numbers on the site true.
 *
 * `artworks.likes` and the follower counts on `profiles` are running totals the
 * app maintains: toggling a wishlist entry moves `likes`, following an artist
 * moves `followersCount`. The demo seed wrote large random values into those
 * columns without creating the underlying rows, so the site currently shows
 * engagement that never happened — at the time of writing, 158,745 likes
 * against 6 real wishlist rows.
 *
 * That matters beyond tidiness. The brief is explicit that follower counts
 * cannot be fabricated, and a space owner deciding what to hang, or a
 * photographer deciding whether to join, is reading those numbers as real.
 *
 * This recomputes every counter from the rows that actually exist.
 *
 *   npm run reconcile:engagement --workspace server            # report only
 *   npm run reconcile:engagement --workspace server -- --apply # write changes
 *
 * Dry run by default: it prints what would change and touches nothing until
 * you pass --apply.
 */

import { db } from '@/database/db';
import { now } from '@/utils/ids';

const apply = process.argv.includes('--apply');

async function main() {
  const [artworks, wishlists, follows, profiles] = await Promise.all([
    db.artworks.find(),
    db.wishlists.find(),
    db.follows.find(),
    db.profiles.find(),
  ]);

  // Real likes per artwork = wishlist rows pointing at it.
  const likesByArtwork = new Map<string, number>();
  for (const entry of wishlists) {
    likesByArtwork.set(entry.artworkId, (likesByArtwork.get(entry.artworkId) ?? 0) + 1);
  }

  // Real followers per artist, and how many people that artist follows.
  const followersByArtist = new Map<string, number>();
  const followingByUser = new Map<string, number>();
  for (const entry of follows) {
    followersByArtist.set(entry.artistId, (followersByArtist.get(entry.artistId) ?? 0) + 1);
    followingByUser.set(entry.userId, (followingByUser.get(entry.userId) ?? 0) + 1);
  }

  let claimedLikes = 0;
  let realLikes = 0;
  const artworkFixes: { id: string; title: string; from: number; to: number }[] = [];

  for (const artwork of artworks) {
    const current = (artwork as { likes?: number }).likes ?? 0;
    const actual = likesByArtwork.get(artwork.id) ?? 0;
    claimedLikes += current;
    realLikes += actual;
    if (current !== actual) {
      artworkFixes.push({ id: artwork.id, title: artwork.title, from: current, to: actual });
    }
  }

  const profileFixes: { id: string; name: string; field: string; from: number; to: number }[] = [];

  for (const profile of profiles) {
    const record = profile as unknown as Record<string, number | undefined>;
    const checks: [string, number][] = [
      ['followersCount', followersByArtist.get(profile.userId) ?? 0],
      ['followingCount', followingByUser.get(profile.userId) ?? 0],
    ];
    for (const [field, actual] of checks) {
      const current = record[field] ?? 0;
      if (current !== actual) {
        profileFixes.push({
          id: profile.id,
          name: profile.displayName || profile.fullName,
          field,
          from: current,
          to: actual,
        });
      }
    }
  }

  console.log(`\nEngagement reconciliation - ${apply ? 'APPLYING' : 'dry run'}\n`);
  console.log(`  artworks                 ${artworks.length}`);
  console.log(`  likes currently shown    ${claimedLikes.toLocaleString()}`);
  console.log(`  likes actually earned    ${realLikes.toLocaleString()}   (wishlist rows)`);
  console.log(`  follow rows              ${follows.length}`);
  console.log(`  artwork counters wrong   ${artworkFixes.length}`);
  console.log(`  profile counters wrong   ${profileFixes.length}\n`);

  for (const fix of artworkFixes.slice(0, 5)) {
    console.log(`    "${fix.title}"  ${fix.from} → ${fix.to}`);
  }
  if (artworkFixes.length > 5) console.log(`    …and ${artworkFixes.length - 5} more`);

  if (!apply) {
    console.log('\nNothing written. Re-run with --apply to correct these counters.\n');
    return;
  }

  for (const fix of artworkFixes) {
    await db.artworks.update(fix.id, { likes: fix.to, updatedAt: now() } as never);
  }
  for (const fix of profileFixes) {
    await db.profiles.update(fix.id, { [fix.field]: fix.to, updatedAt: now() } as never);
  }

  console.log(
    `\nCorrected ${artworkFixes.length} artwork and ${profileFixes.length} profile counters. ` +
      `Every number on the site now reflects a row that exists.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Reconciliation failed:', error);
    process.exit(1);
  });
