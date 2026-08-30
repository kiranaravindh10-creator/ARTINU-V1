import {
  artworkUploadSchema,
  galleryQuerySchema,
  startingPrice,
  type Artwork,
  type GalleryQuery,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { paginate } from '@/database/table';
import { asyncHandler, requireAuth, requireRole, uploadLimiter, validate } from '@/middleware/index';
import { badRequest, forbidden, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { recordAudit } from '@/services/audit.service';
import { notify, notifyRole } from '@/services/notification.service';
import { sendModerationDecision, sendUploadReceived } from '@/services/email.service';
import { profileFor } from '@/services/auth.service';
import {
  decodeDataUrl,
  removeStored,
  removeVariants,
  storeImageSet,
} from '@/services/storage.service';
import { withArtists } from '@/services/user.service';
import { allocatePhotoId } from '@/services/photo-id.service';
import { moderateImage } from '@/services/image-moderation.service';
import {
  advisories,
  blockingFailure,
  orientationOf,
  runValidationPipeline,
} from '@/services/validation-pipeline.service';

export const artworkRouter = Router();

const isInternal = (role: string) =>
  ['ceo', 'manager', 'accounts', 'operations', 'it_team'].includes(role);

/** True for Postgres unique-violation errors (code 23505 / "duplicate key"). */
const isDuplicateKey = (error: unknown): boolean =>
  error instanceof Error && /duplicate key|23505/i.test(error.message);

/** Popularity blends the three signals we actually record. */
const popularity = (artwork: Artwork) => artwork.likes + artwork.selections * 20 + artwork.views / 10;

function matchesFacets(artwork: Artwork, query: GalleryQuery): boolean {
  // AND across facet groups, OR within a group.
  if (query.category.length && !query.category.includes(artwork.category)) return false;
  if (query.orientation.length && !query.orientation.includes(artwork.orientation)) return false;
  if (query.mood.length && !artwork.mood.some((mood) => query.mood.includes(mood))) return false;
  if (query.colors.length && !artwork.colors.some((color) => query.colors.includes(color))) return false;
  if (
    query.suitableFor.length &&
    !artwork.suitableFor.some((space) => query.suitableFor.includes(space))
  ) {
    return false;
  }
  if (query.minPrice !== undefined && artwork.priceFrom < query.minPrice) return false;
  if (query.maxPrice !== undefined && artwork.priceFrom > query.maxPrice) return false;
  return true;
}

// ── Gallery ──────────────────────────────────────────────────────────────────

artworkRouter.get(
  '/',
  validate(galleryQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.valid as GalleryQuery;

    let artworks = await db.artworks.find({ where: { status: 'approved' } });
    artworks = artworks.filter((artwork) => matchesFacets(artwork, query));

    if (query.ids?.length) {
      artworks = artworks.filter((artwork) => query.ids!.includes(artwork.id));
    }

    if (query.artistId) {
      artworks = artworks.filter((artwork) => artwork.artistId === query.artistId);
    }

    if (query.q) {
      const needle = query.q.toLowerCase();
      const profiles = await db.profiles.find();
      const nameByUser = new Map(
        profiles.map((profile) => [profile.userId, (profile.displayName || profile.fullName).toLowerCase()]),
      );
      artworks = artworks.filter((artwork) =>
        [
          artwork.title,
          artwork.description ?? '',
          artwork.location ?? '',
          artwork.photoId ?? '',
          artwork.tags.join(' '),
          nameByUser.get(artwork.artistId) ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    switch (query.sort) {
      case 'popular':
        artworks.sort((a, b) => popularity(b) - popularity(a));
        break;
      case 'price_asc':
        artworks.sort((a, b) => a.priceFrom - b.priceFrom);
        break;
      case 'price_desc':
        artworks.sort((a, b) => b.priceFrom - a.priceFrom);
        break;
      default:
        artworks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const page = paginate(artworks, query.page, query.pageSize);
    res.json({ ...page, items: await withArtists(page.items, req.user?.id) });
  }),
);

artworkRouter.get(
  '/facets',
  asyncHandler(async (_req, res) => {
    const artworks = await db.artworks.find({ where: { status: 'approved' } });

    const tally = (values: string[], counts: Record<string, number>) => {
      for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    };

    const category: Record<string, number> = {};
    const mood: Record<string, number> = {};
    const colors: Record<string, number> = {};
    const orientation: Record<string, number> = {};
    const suitableFor: Record<string, number> = {};

    for (const artwork of artworks) {
      tally([artwork.category], category);
      tally([artwork.orientation], orientation);
      tally(artwork.mood, mood);
      tally(artwork.colors, colors);
      tally(artwork.suitableFor, suitableFor);
    }

    res.json({ category, mood, colors, orientation, suitableFor });
  }),
);

// ── The artist's own work (before /:id so "mine" is not read as an id) ────────

artworkRouter.get(
  '/mine',
  requireAuth,
  requireRole('artist'),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(60, Number(req.query.pageSize ?? 24));

    const artworks = await db.artworks.find({
      where: { artistId: req.user!.id },
      filter: status && status !== 'all' ? (artwork) => artwork.status === status : undefined,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    res.json(paginate(artworks, page, pageSize));
  }),
);

artworkRouter.get(
  '/wishlist',
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await db.wishlists.find({
      where: { userId: req.user!.id },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const artworks = (
      await Promise.all(entries.map((entry) => db.artworks.byId(entry.artworkId)))
    ).filter((artwork): artwork is Artwork => Boolean(artwork));

    res.json(await withArtists(artworks, req.user!.id));
  }),
);

artworkRouter.post(
  '/:id/wishlist',
  requireAuth,
  asyncHandler(async (req, res) => {
    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');

    const existing = await db.wishlists.findOne({ userId: req.user!.id, artworkId: artwork.id });
    if (existing) {
      await db.wishlists.remove(existing.id);
      await db.artworks.update(artwork.id, { likes: Math.max(0, artwork.likes - 1) });
    } else {
      await db.wishlists.insert({ userId: req.user!.id, artworkId: artwork.id, createdAt: now() });
      await db.artworks.update(artwork.id, { likes: artwork.likes + 1 });
    }

    res.json({ wishlisted: !existing });
  }),
);

// ── Upload ───────────────────────────────────────────────────────────────────

const uploadSchema = artworkUploadSchema.extend({
  width: z.coerce.number().int().min(1).optional(),
  height: z.coerce.number().int().min(1).optional(),
});

artworkRouter.post(
  '/',
  requireAuth,
  requireRole('artist'),
  uploadLimiter,
  validate(uploadSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as z.infer<typeof uploadSchema>;

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentUploads = await db.artworks.find({
      where: { artistId: req.user!.id },
    });
    
    // Filter separately if db.find filter doesn't support complex conditions directly
    const recentCount = recentUploads.filter(a => a.createdAt >= oneWeekAgo).length;
    if (recentCount >= 14) {
      res.status(429).json({ message: 'Upload limit reached: 14 photographs per rolling week.' });
      return;
    }

    /*
     * No image inspection, by product decision.
     *
     * The AI safety check that used to run here has been removed: any
     * photograph, at any size and any resolution, is accepted and published.
     * The only thing still enforced in `storeBase64` is that the payload is
     * genuinely a decodable image of the type it claims and is not empty —
     * without that an upload produces a row pointing at a file no browser can
     * render, which is a broken gallery card rather than a moderation policy.
     *
     * To bring inspection back, restore the `moderateImage` call here; the
     * service in services/image-moderation.service.ts is still intact.
     */
    const imageSet = await storeImageSet(
      input.imageBase64,
      'photographers',
      input.fileName,
      req.user!.id,
    );
    const stored = imageSet.original;

    // Prefer what the file actually says over what the client claimed, so the
    // stored dimensions and the derived orientation describe the real image.
    const width = stored.width ?? input.width ?? 2400;
    const height = stored.height ?? input.height ?? 1600;
    const orientation = orientationOf(width, height);

    // Automated checks replace the manual review queue: there is no
    // pending/approved/rejected workflow any more, so this is the only thing
    // standing between an upload and the public gallery. It previously ran with
    // `validation: []` hardcoded — every check bypassed and nothing recorded.
    const validation = await runValidationPipeline({
      imageBase64: input.imageBase64,
      imageUrl: stored.url,
      width,
      height,
      title: input.title,
      description: input.description,
      tags: input.tags,
      category: input.category,
      location: input.location,
      artistId: req.user!.id,
    });

    const failure = blockingFailure(validation);
    if (failure) {
      // Reject before the artwork row exists, and take the uploaded file back
      // out of storage so a blocked upload does not leave an orphan behind.
      /*
        `stored.path`, not `stored.url`.

        removeStored bails out early on anything isRemoteUrl() calls remote, and
        with STORAGE_DRIVER=supabase `stored.url` IS a remote https url - so
        this cleanup silently did nothing in production and every rejected
        upload has been left sitting in the bucket. `path` is the
        `<folder>/<name>` form it actually wants.
      */
      await Promise.all([
        removeStored(stored.path).catch((error) =>
          logger.warn(`Could not remove the rejected upload ${stored.path}`, error),
        ),
        removeVariants(imageSet.variants).catch((error) =>
          logger.warn('Could not remove the rejected upload variants', error),
        ),
      ]);
      throw badRequest(failure.detail);
    }

    const notes = advisories(validation);
    // Everything that clears the checks publishes immediately.
    const status = 'approved';

    // Photo ID is generated server-side and atomically — the client never
    // supplies it. Retry on a duplicate (possible only on the optimistic
    // allocation fallback, when the atomic DB function is not deployed).
    const widths = Object.keys(imageSet.variants)
      .map(Number)
      .sort((a, b) => a - b);
    const smallestVariant = widths.length > 0 ? imageSet.variants[widths[0]] : null;
    const largestVariant = widths.length > 0 ? imageSet.variants[widths[widths.length - 1]] : null;

    const insertArtwork = async (): Promise<Artwork> => {
      let current = await allocatePhotoId(req.user!.id);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await db.artworks.insert({
            artistId: req.user!.id,
            title: input.title,
            description: input.description ?? null,
            story: input.story ?? null,
            category: input.category,
            mood: input.mood,
            colors: input.colors,
            suitableFor: [],
            tags: input.tags,
            /*
              THREE DIFFERENT URLS, AND THE DIFFERENCE MATTERS.

                originalUrl    the photographer's file, untouched. This is what
                               gets printed - the print shop needs every pixel,
                               so it is stored and never overwritten.
                imageUrl       the largest screen copy (1600px WebP). What the
                               lightbox opens. Was the original, which meant
                               opening a photograph downloaded up to 25 MB.
                thumbnailUrl   the smallest copy (400px WebP). What a grid tile
                               loads. Was ALSO the original: a 15 MB file drawn
                               at 324 pixels wide, forty times a page.

              When no variants could be made every field falls back to the
              original and the behaviour is exactly what it was before.
            */
            imageUrl: largestVariant ?? stored.url,
            thumbnailUrl: smallestVariant ?? stored.url,
            originalUrl: stored.url,
            imageVariants: Object.keys(imageSet.variants).length > 0 ? imageSet.variants : null,
            orientation,
            width,
            height,
            dominantColor: '#141210',
            location: input.location ?? null,
            capturedAt: input.capturedAt ?? null,
            photoId: current.photoId,
            photoNumber: current.photoNumber,
            status,
            validation,
            reviewNote: null,
            reviewedBy: null,
            reviewedAt: null,
            views: 0,
            likes: 0,
            selections: 0,
            priceFrom: startingPrice(),
            featured: false,
            createdAt: now(),
            updatedAt: now(),
          });
        } catch (error) {
          if (attempt >= 4 || !isDuplicateKey(error)) throw error;
          // Another upload grabbed this number — reserve the next one.
          current = await allocatePhotoId(req.user!.id);
        }
      }
      throw new Error('Could not allocate a unique Photo ID.');
    };
    const artwork = await insertArtwork();

    const uploaderProfile = await profileFor(req.user!.id);
      void sendUploadReceived(
        req.user!.email,
        uploaderProfile?.fullName ?? 'there',
        artwork.title,
      );

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'artwork.uploaded',
      entity: 'artwork',
      entityId: artwork.id,
      meta: { status },
      ip: req.ip,
    });

    // Advisories are things worth telling the artist but not worth blocking on
    // — the upload is already live, so these are notes, not errors.
    res.status(201).json({ ...artwork, advisories: notes });
  }),
);

// ── Single artwork ───────────────────────────────────────────────────────────

artworkRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');

    const viewer = req.user;
    const canSeeUnpublished =
      viewer && (viewer.id === artwork.artistId || isInternal(viewer.role));

    if (artwork.status !== 'approved' && !canSeeUnpublished) {
      throw notFound('That photograph');
    }

    // Counting a view should never delay or fail the response.
    void db.artworks.update(artwork.id, { views: artwork.views + 1 }).catch(() => undefined);

    const [withArtist] = await withArtists([artwork], viewer?.id);
    res.json(withArtist);
  }),
);

artworkRouter.get(
  '/:id/related',
  asyncHandler(async (req, res) => {
    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');

    const limit = Math.min(24, Number(req.query.limit ?? 8));
    const pool = await db.artworks.find({ where: { status: 'approved' } });

    const scored = pool
      .filter((candidate) => candidate.id !== artwork.id)
      .map((candidate) => {
        let score = 0;
        if (candidate.category === artwork.category) score += 3;
        score += candidate.mood.filter((mood) => artwork.mood.includes(mood)).length;
        if (candidate.artistId === artwork.artistId) score += 2;
        score += candidate.colors.filter((color) => artwork.colors.includes(color)).length * 0.5;
        return { candidate, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || popularity(b.candidate) - popularity(a.candidate))
      .slice(0, limit)
      .map((entry) => entry.candidate);

    res.json(await withArtists(scored, req.user?.id));
  }),
);

artworkRouter.patch(
  '/:id',
  requireAuth,
  requireRole('artist'),
  asyncHandler(async (req, res) => {
    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');
    if (artwork.artistId !== req.user!.id) throw forbidden('That is not your photograph.');

    const allowed = ['title', 'description', 'story', 'tags', 'mood', 'colors', 'suitableFor', 'location'];
    const patch = Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).filter(([key]) => allowed.includes(key)),
    );

    res.json(await db.artworks.update(artwork.id, { ...patch, updatedAt: now() }));
  }),
);

artworkRouter.delete(
  '/:id',
  requireAuth,
  requireRole('artist'),
  asyncHandler(async (req, res) => {
    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');
    if (artwork.artistId !== req.user!.id) throw forbidden('That is not your photograph.');

    // Archive rather than delete: the piece may already appear on an invoice.
    await db.artworks.update(artwork.id, { status: 'archived', updatedAt: now() });
    res.json({ ok: true });
  }),
);
