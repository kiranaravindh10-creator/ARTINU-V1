import type { Artwork } from '@artinu/shared';
import { slugify, type ArtworkWithArtist, type Profile, type PublicArtist } from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { notFound } from '@/utils/errors';

/**
 * Public artist profiles are assembled rather than stored: the counts, likes and
 * "spaces" figures all come from live artwork and order data, so a profile can
 * never drift out of date with the work behind it.
 */

/** Slugs are derived from the display name, disambiguated by id when they clash. */
export function artistSlug(profile: Profile, userId: string): string {
  const base = slugify(profile.displayName || profile.fullName);
  return base || `artist-${userId.slice(0, 6)}`;
}

async function slugIndex(): Promise<Map<string, { user: StoredUser; profile: Profile }>> {
  const artists = await db.users.find({ where: { role: 'artist' } });
  const profiles = await db.profiles.find();
  const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));

  const index = new Map<string, { user: StoredUser; profile: Profile }>();
  for (const user of artists) {
    const profile = byUser.get(user.id);
    if (!profile) continue;

    let slug = artistSlug(profile, user.id);
    if (index.has(slug)) slug = `${slug}-${user.id.slice(0, 4)}`;
    index.set(slug, { user, profile });
  }
  return index;
}

/**
 * Everything a batch of artist profiles needs, read once.
 *
 * Building a profile requires the artist's work, the spaces their work reached,
 * and their follower count. Read per artist, that was four round trips each —
 * including a full scan of `orders` — run one after another, which put the
 * space dashboard's recommendation rail at seven to ten seconds. Loaded once
 * for the whole batch it is four round trips total, whatever the batch size.
 */
export interface ArtistContext {
  artworksByArtist: Map<string, Artwork[]>;
  spaceIdsByArtist: Map<string, Set<string>>;
  followersByArtist: Map<string, number>;
  followingByArtist: Map<string, number>;
  followedByViewer: Set<string>;
}

export async function loadArtistContext(viewerId?: string): Promise<ArtistContext> {
  const [artworks, orders, follows] = await Promise.all([
    db.artworks.find(),
    db.orders.find(),
    db.follows.find(),
  ]);

  const artworksByArtist = new Map<string, Artwork[]>();
  for (const artwork of artworks) {
    const bucket = artworksByArtist.get(artwork.artistId) ?? [];
    bucket.push(artwork);
    artworksByArtist.set(artwork.artistId, bucket);
  }

  const spaceIdsByArtist = new Map<string, Set<string>>();
  for (const order of orders) {
    if (order.status === 'cancelled' || order.status === 'pending_payment') continue;
    for (const artistId of new Set(order.items.map((item) => item.artistId))) {
      const spaces = spaceIdsByArtist.get(artistId) ?? new Set<string>();
      spaces.add(order.spaceId);
      spaceIdsByArtist.set(artistId, spaces);
    }
  }

  const followersByArtist = new Map<string, number>();
  const followingByArtist = new Map<string, number>();
  const followedByViewer = new Set<string>();
  for (const follow of follows) {
    followersByArtist.set(follow.artistId, (followersByArtist.get(follow.artistId) ?? 0) + 1);
    followingByArtist.set(follow.userId, (followingByArtist.get(follow.userId) ?? 0) + 1);
    if (viewerId && follow.userId === viewerId) followedByViewer.add(follow.artistId);
  }

  return { artworksByArtist, spaceIdsByArtist, followersByArtist, followingByArtist, followedByViewer };
}

export async function buildPublicArtist(
  user: StoredUser,
  profile: Profile,
  viewerId?: string,
  /** Pass one when building several artists, so the shared reads happen once. */
  context?: ArtistContext,
): Promise<PublicArtist> {
  const ctx = context ?? (await loadArtistContext(viewerId));

  const artworks = ctx.artworksByArtist.get(user.id) ?? [];
  const approved = artworks.filter((artwork) => artwork.status === 'approved');
  const spaceIds = ctx.spaceIdsByArtist.get(user.id) ?? new Set<string>();
  const followers = ctx.followersByArtist.get(user.id) ?? 0;
  const followingCount = ctx.followingByArtist.get(user.id) ?? 0;
  const following = viewerId ? ctx.followedByViewer.has(user.id) : undefined;

  // Collections are derived by grouping the artist's approved work by category —
  // a real grouping rather than an empty tab.
  const byCategory = new Map<string, typeof approved>();
  for (const artwork of approved) {
    const bucket = byCategory.get(artwork.category) ?? [];
    bucket.push(artwork);
    byCategory.set(artwork.category, bucket);
  }

  const collections = [...byCategory.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([category, items]) => ({
      id: `${user.id}-${category}`,
      title: category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: `${items.length} photographs`,
      coverUrl: items[0]!.thumbnailUrl,
      artworkIds: items.map((item) => item.id),
    }));

  const achievements = approved.length
    ? [
        {
          id: `${user.id}-first`,
          title: 'Joined ARTINU',
          detail: 'Accepted into the ARTINU artist community.',
          year: new Date(user.createdAt).getFullYear().toString(),
        },
        ...(spaceIds.size > 0
          ? [
              {
                id: `${user.id}-spaces`,
                title: `Installed in ${spaceIds.size} ${spaceIds.size === 1 ? 'space' : 'spaces'}`,
                detail: 'Work selected by space owners and installed on real walls.',
                year: new Date().getFullYear().toString(),
              },
            ]
          : []),
        ...(approved.some((artwork) => artwork.featured)
          ? [
              {
                id: `${user.id}-featured`,
                title: 'Featured collection',
                detail: 'Selected by the ARTINU curation team for the featured gallery.',
                year: new Date().getFullYear().toString(),
              },
            ]
          : []),
      ]
    : [];

return {
    id: user.id,
    slug: artistSlug(profile, user.id),
    name: profile.displayName || profile.fullName,
    city: profile.city,
    country: profile.country,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl ?? approved[0]?.imageUrl ?? profile.avatarUrl ?? null,
    bio: profile.bio,
    genres: profile.genres ?? [],
    artworkCount: approved.length,
    likes: approved.reduce((sum, artwork) => sum + artwork.likes, 0),
    spacesCount: spaceIds.size,
    followers,
    followingCount,
    verified: user.status === 'verified' && approved.length > 0,
    featured: approved.some((artwork) => artwork.featured),
    website: profile.website,
    instagram: profile.instagram,
    photographerCode: profile.photographerCode,
    achievements,
    collections,
    following,
  };
}

export async function listPublicArtists(viewerId?: string): Promise<PublicArtist[]> {
  const [index, context] = await Promise.all([slugIndex(), loadArtistContext(viewerId)]);
  return Promise.all(
    [...index.values()].map(({ user, profile }) =>
      buildPublicArtist(user, profile, viewerId, context),
    ),
  );
}

export async function findArtistBySlug(slug: string, viewerId?: string): Promise<PublicArtist> {
  const index = await slugIndex();
  const entry = index.get(slug);
  if (!entry) throw notFound('That artist');
  return buildPublicArtist(entry.user, entry.profile, viewerId);
}

export async function findArtistIdBySlug(slug: string): Promise<string> {
  const index = await slugIndex();
  const entry = index.get(slug);
  if (!entry) throw notFound('That artist');
  return entry.user.id;
}

/** Attaches the artist (and wishlist state) to artworks for public rendering. */
export async function withArtists(
  artworks: Awaited<ReturnType<typeof db.artworks.find>>,
  viewerId?: string,
): Promise<ArtworkWithArtist[]> {
  const artistIds = [...new Set(artworks.map((artwork) => artwork.artistId))];

  const [profiles, users, context, wishlistEntries] = await Promise.all([
    db.profiles.find(),
    db.users.find({ where: { id: artistIds } }),
    loadArtistContext(viewerId),
    viewerId ? db.wishlists.find({ where: { userId: viewerId } }) : Promise.resolve([]),
  ]);

  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));

  const built = await Promise.all(
    users
      .filter((user) => profileByUser.has(user.id))
      .map(async (user) =>
        [
          user.id,
          await buildPublicArtist(user, profileByUser.get(user.id)!, viewerId, context),
        ] as const,
      ),
  );
  const artists = new Map<string, PublicArtist>(built);

  const wishlisted = new Set(wishlistEntries.map((entry) => entry.artworkId));

  return artworks.map((artwork) => ({
    ...artwork,
    artist:
      artists.get(artwork.artistId) ??
      ({
        id: artwork.artistId,
        slug: 'unknown',
        name: 'ARTINU artist',
        genres: [],
        artworkCount: 0,
        likes: 0,
        spacesCount: 0,
        followers: 0,
        followingCount: 0,
        verified: false,
        featured: false,
      } as PublicArtist),
    wishlisted: viewerId ? wishlisted.has(artwork.id) : undefined,
  }));
}
