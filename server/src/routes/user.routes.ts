import { profileUpdateSchema } from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { asyncHandler, requireAuth, validate } from '@/middleware/index';
import { paginate } from '@/database/table';
import { HttpError, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { profileFor, sanitizeUser } from '@/services/auth.service';
import { storeBase64 } from '@/services/storage.service';
import { featuredArtistIds, sponsoredArtistIds } from '@/services/featured-artists.service';
import {
  artistSlug,
  findArtistBySlug,
  findArtistIdBySlug,
  listPublicArtists,
  withArtists,
} from '@/services/user.service';

export const userRouter = Router();

// ── The signed-in user ───────────────────────────────────────────────────────

userRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: sanitizeUser(req.user!), profile: await profileFor(req.user!.id) });
  }),
);

userRouter.patch(
  '/me',
  requireAuth,
  validate(profileUpdateSchema),
  asyncHandler(async (req, res) => {
    const profile = await profileFor(req.user!.id);
    if (!profile) throw notFound('Your profile');

    const patch = req.valid as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === '') patch[key] = null;
    }

    res.json(await db.profiles.update(profile.id, { ...patch, updatedAt: now() }));
  }),
);

userRouter.post(
  '/me/avatar',
  requireAuth,
  validate(z.object({ imageBase64: z.string().min(16) })),
  asyncHandler(async (req, res) => {
    const { imageBase64 } = req.valid as { imageBase64: string };
    const stored = await storeBase64(imageBase64, 'profiles', undefined, req.user!.id);

    const profile = await profileFor(req.user!.id);
    if (profile) {
      await db.profiles.update(profile.id, { avatarUrl: stored.url, updatedAt: now() });
    }

    res.json({ avatarUrl: stored.url });
  }),
);

userRouter.post(
  '/me/cover',
  requireAuth,
  validate(z.object({ imageBase64: z.string().min(16) })),
  asyncHandler(async (req, res) => {
    const { imageBase64 } = req.valid as { imageBase64: string };
    const stored = await storeBase64(imageBase64, 'profiles', undefined, req.user!.id);
    const profile = await profileFor(req.user!.id);
    if (!profile) throw notFound('Your profile');
    await db.profiles.update(profile.id, { coverUrl: stored.url, updatedAt: now() });
    res.json({ coverUrl: stored.url });
  }),
);

// ── Follow system ──────────────────────────────────────────────────────────────

const followTargetSchema = z.object({
  targetId: z.string().min(1),
  targetType: z.enum(['artist', 'user']).default('artist'),
});

/*
  Follower counts are derived, not stored.

  This used to keep denormalised `followersCount` / `followingCount` columns on
  `profiles` in step with every follow. Two problems with that: those columns do
  not exist on the deployed database, so **every follow returned a 500** — the
  feature was entirely broken — and even where they do exist, a counter that is
  updated separately from the row it counts will eventually disagree with it.
  A follower total that drifts from the follow rows is precisely the "fake
  followers" the brief rules out.

  Nothing reads them: listPublicArtists builds its totals from the `follows`
  table on every request, and the endpoints below return freshly counted
  figures. So the cache is removed rather than repaired, and the follow row is
  the only fact.
*/

userRouter.post(
  '/follow',
  requireAuth,
  validate(followTargetSchema),
  asyncHandler(async (req, res) => {
    const { targetId, targetType } = req.valid as { targetId: string; targetType: 'artist' | 'user' };
    const userId = req.user!.id;

    if (targetId === userId) throw new HttpError(422, 'You cannot follow yourself.', 'validation_failed');

    const target = await db.users.byId(targetId);
    if (!target) throw notFound('That user');
    if (targetType === 'artist' && target.role !== 'artist') throw notFound('That artist');

    const existing = await db.follows.findOne({ artistId: targetId, userId });

    if (existing) {
      await db.follows.remove(existing.id);
    } else {
      await db.follows.insert({ userId, artistId: targetId, createdAt: now() });
    }

    const followers = await db.follows.count({ artistId: targetId });
    const following = await db.follows.count({ userId });

    res.json({
      following: !existing,
      followers,
      followingCount: following,
    });
  }),
);

userRouter.delete(
  '/follow/:targetId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const targetId = req.params.targetId;
    const userId = req.user!.id;

    const existing = await db.follows.findOne({ artistId: targetId, userId });
    if (!existing) throw notFound('Follow relationship');

    await db.follows.remove(existing.id);

    const followers = await db.follows.count({ artistId: targetId });
    const following = await db.follows.count({ userId });

    res.json({
      following: false,
      followers,
      followingCount: following,
    });
  }),
);

const followListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

userRouter.get(
  '/followers/:userId',
  validate(followListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.valid as z.infer<typeof followListQuerySchema>;
    const targetId = req.params.userId;

    const target = await db.users.byId(targetId);
    if (!target) throw notFound('That user');

    const follows = await db.follows.find({
      where: { artistId: targetId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const followerIds = follows.map((f) => f.userId);
    const [followers, profiles] = await Promise.all([
      db.users.find({ where: { id: followerIds } }),
      db.profiles.find({ where: { userId: followerIds } }),
    ]);

    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const items = followers.map((user) => ({
      id: user.id,
      name: profileByUser.get(user.id)?.fullName ?? user.email,
      avatarUrl: profileByUser.get(user.id)?.avatarUrl ?? null,
      slug: profileByUser.get(user.id)
        ? artistSlug(profileByUser.get(user.id)!, user.id)
        : null,
    }));

    res.json(paginate(items, page, pageSize));
  }),
);

userRouter.get(
  '/following/:userId',
  validate(followListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.valid as z.infer<typeof followListQuerySchema>;
    const targetId = req.params.userId;

    const target = await db.users.byId(targetId);
    if (!target) throw notFound('That user');

    const follows = await db.follows.find({
      where: { userId: targetId },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const followingIds = follows.map((f) => f.artistId);
    const [following, profiles] = await Promise.all([
      db.users.find({ where: { id: followingIds } }),
      db.profiles.find({ where: { userId: followingIds } }),
    ]);

    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const items = following.map((user) => ({
      id: user.id,
      name: profileByUser.get(user.id)?.fullName ?? user.email,
      avatarUrl: profileByUser.get(user.id)?.avatarUrl ?? null,
      slug: profileByUser.get(user.id)
        ? artistSlug(profileByUser.get(user.id)!, user.id)
        : null,
    }));

    res.json(paginate(items, page, pageSize));
  }),
);

// ── Public artist directory ──────────────────────────────────────────────────

const artistQuerySchema = z.object({
  q: z.string().optional(),
  genre: z.string().optional(),
  featured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

userRouter.get(
  '/artists',
  validate(artistQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q, genre, featured, page, pageSize } = req.valid as z.infer<typeof artistQuerySchema>;

    let artists = await listPublicArtists(req.user?.id);
    artists = artists.filter((artist) => artist.artworkCount > 0);

    // The featured carousel is placed by a manager (requirements §13), so a
    // curated list wins outright and keeps its exact running order. Falling
    // back to the automatic selection only when nothing has been curated means
    // the carousel is never empty just because nobody has opened the console.
    if (featured) {
      const curated = await featuredArtistIds();

      if (curated.length > 0) {
        const rank = new Map(curated.map((id, index) => [id, index]));
        const sponsored = await sponsoredArtistIds();

        artists = artists
          .filter((artist) => rank.has(artist.id))
          .map((artist) => ({ ...artist, sponsored: sponsored.has(artist.id) }))
          .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);

        res.json(paginate(artists, page, pageSize));
        return;
      }

      artists = artists.filter((artist) => artist.featured);
    }

    if (genre) artists = artists.filter((artist) => artist.genres.includes(genre));
    if (q) {
      const needle = q.toLowerCase();
      artists = artists.filter((artist) =>
        [artist.name, artist.city, artist.country, artist.bio, ...artist.genres]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      );
    }

    artists.sort((a, b) => Number(b.featured) - Number(a.featured) || b.likes - a.likes);
    res.json(paginate(artists, page, pageSize));
  }),
);

userRouter.get(
  '/artists/:slug',
  asyncHandler(async (req, res) => {
    res.json(await findArtistBySlug(req.params.slug, req.user?.id));
  }),
);

userRouter.get(
  '/artists/:slug/artworks',
  asyncHandler(async (req, res) => {
    const artistId = await findArtistIdBySlug(req.params.slug);
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(60, Number(req.query.pageSize ?? 24));

    const artworks = await db.artworks.find({
      where: { artistId, status: 'approved' },
      filter: category && category !== 'all' ? (artwork) => artwork.category === category : undefined,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const page$ = paginate(artworks, page, pageSize);
    res.json({ ...page$, items: await withArtists(page$.items, req.user?.id) });
  }),
);

// Legacy toggle endpoint (kept for backward compatibility)
userRouter.post(
  '/artists/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    const artistId = req.params.id;
    const userId = req.user!.id;

    if (artistId === userId) throw new HttpError(422, 'You cannot follow yourself.', 'validation_failed');
    const artist = await db.users.byId(artistId);
    if (!artist || artist.role !== 'artist') throw notFound('That artist');

    const existing = await db.follows.findOne({ artistId, userId });
    if (existing) {
      await db.follows.remove(existing.id);
    } else {
      await db.follows.insert({ userId, artistId, createdAt: now() });
    }

    const followers = await db.follows.count({ artistId });
    const following = await db.follows.count({ userId });

    res.json({
      following: !existing,
      followers,
      followingCount: following,
    });
  }),
);