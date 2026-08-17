import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { asyncHandler, requireRole, validate } from '@/middleware/index';
import { forbidden, notFound } from '@/utils/errors';
import { broadcastContentUpdate } from '@/services/sse.service';
import { removeStored } from '@/services/storage.service';
import { logger } from '@/utils/logger';

export const contentManagerRouter = Router();

const MANAGER_ROLE = 'manager' as const;

/**
 * Attaches the photographer's display name to slides that carry only an id.
 *
 * One `profiles` read for the whole carousel rather than one per slide. A slide
 * whose photographer has since been deleted resolves to `null`, which the
 * client renders as no credit at all — an absent byline is honest, a UUID
 * fragment presented as a name is not.
 */
async function withPhotographerNames<T extends { photographerId?: string | null }>(
  slides: T[],
): Promise<(T & { photographerName: string | null })[]> {
  const ids = [...new Set(slides.map((slide) => slide.photographerId).filter(Boolean))] as string[];

  // `where` values accept an array — MemoryTable matches with `includes`,
  // SupabaseTable turns it into a single `in (…)`.
  const profiles = ids.length ? await db.profiles.find({ where: { userId: ids } }) : [];

  const nameById = new Map(
    profiles.map((profile) => [profile.userId, profile.displayName || profile.fullName || null]),
  );

  return slides.map((slide) => ({
    ...slide,
    photographerName: slide.photographerId ? (nameById.get(slide.photographerId) ?? null) : null,
  }));
}

const heroSlideSchema = z.object({
  imageUrl: z.string().url(),
  photographerId: z.string().uuid(),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const updateHeroSlideSchema = z.object({
  imageUrl: z.string().url().optional(),
  photographerId: z.string().uuid().optional(),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const featuredCollectionSchema = z.object({
  collectionId: z.string().uuid(),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const updateFeaturedCollectionSchema = z.object({
  collectionId: z.string().uuid().optional(),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const cafeSchema = z.object({
  name: z.string().min(1).max(200),
  photoUrl: z.string().url(),
  description: z.string().min(1).max(1000),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const updateCafeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  photoUrl: z.string().url().optional(),
  description: z.string().min(1).max(1000).optional(),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const collaborationSlideSchema = z.object({
  imageUrl: z.string().url(),
  photographerId: z.string().uuid().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const updateCollaborationSlideSchema = z.object({
  imageUrl: z.string().url().optional(),
  photographerId: z.string().uuid().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

/**
 * Sync content pointers to Firestore for real-time client updates.
 * Firestore doc structure:
 *   /contentPointers/{type} -> { ids: string[], updatedAt: timestamp }
 */
async function syncContentPointer(type: string, ids: string[]) {
  // Content pointers are now managed server-side via the ARTINU API.
  // Firestore sync is no longer used — this is a no-op placeholder.
  // If real-time content sync is needed, migrate to Supabase Realtime.
  console.log(`Content pointer sync for ${type} with ${ids.length} IDs (no-op, using API instead)`);
}

// ── Reorder ──────────────────────────────────────────────────────────────────
// These must be registered before the `/:id` handlers below. Express matches in
// registration order, so with `/hero-slides/:id` first, `PUT /hero-slides/reorder`
// binds id="reorder" and fails with "Hero slide not found" instead of reordering.

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), order: z.number().int().nonnegative() })),
});

contentManagerRouter.put(
  '/hero-slides/reorder',
  requireRole(MANAGER_ROLE),
  validate(reorderSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.valid as { items: { id: string; order: number }[] };
    const now = new Date().toISOString();
    await Promise.all(
      items.map(({ id, order }) => db.heroSlides.update(id, { order, updatedAt: now })),
    );
    const slides = await db.heroSlides.find({ orderBy: { field: 'order', direction: 'asc' } });
    broadcastContentUpdate('hero-slides', 'reorder', { ids: items.map((i) => i.id) });
    await syncContentPointer('heroSlides', slides.map((s) => s.id));
    res.json(slides);
  }),
);

contentManagerRouter.put(
  '/featured-collections/reorder',
  requireRole(MANAGER_ROLE),
  validate(reorderSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.valid as { items: { id: string; order: number }[] };
    const now = new Date().toISOString();
    await Promise.all(
      items.map(({ id, order }) => db.featuredCollections.update(id, { order, updatedAt: now })),
    );
    const collections = await db.featuredCollections.find({
      orderBy: { field: 'order', direction: 'asc' },
    });
    broadcastContentUpdate('featured-collections', 'reorder', { ids: items.map((i) => i.id) });
    await syncContentPointer('featuredCollections', collections.map((c) => c.id));
    res.json(collections);
  }),
);

contentManagerRouter.put(
  '/cafes/reorder',
  requireRole(MANAGER_ROLE),
  validate(reorderSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.valid as { items: { id: string; order: number }[] };
    const now = new Date().toISOString();
    await Promise.all(items.map(({ id, order }) => db.cafes.update(id, { order, updatedAt: now })));
    const cafes = await db.cafes.find({ orderBy: { field: 'order', direction: 'asc' } });
    broadcastContentUpdate('cafes', 'reorder', { ids: items.map((i) => i.id) });
    await syncContentPointer('cafes', cafes.map((c) => c.id));
    res.json(cafes);
  }),
);

contentManagerRouter.put(
  '/collaboration-slides/reorder',
  requireRole(MANAGER_ROLE),
  validate(reorderSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.valid as { items: { id: string; order: number }[] };
    const now = new Date().toISOString();
    await Promise.all(
      items.map(({ id, order }) => db.collaborationSlides.update(id, { order, updatedAt: now })),
    );
    const slides = await db.collaborationSlides.find({
      orderBy: { field: 'order', direction: 'asc' },
    });
    broadcastContentUpdate('collaboration-slides', 'reorder', { ids: items.map((i) => i.id) });
    await syncContentPointer('collaborationSlides', slides.map((s) => s.id));
    res.json(slides);
  }),
);

// ── Hero Slides ──────────────────────────────────────────────────────────────

contentManagerRouter.get(
  '/hero-slides',
  requireRole(MANAGER_ROLE),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, isActive, search } = req.valid as {
      page: number;
      pageSize: number;
      isActive?: boolean;
      search?: string;
    };

    const where: Record<string, unknown> = {};
    if (isActive !== undefined) where.isActive = isActive;

    const filter = search
      ? (slide: { id: string; photographerId: string; imageUrl: string }) =>
          slide.imageUrl.toLowerCase().includes(search.toLowerCase()) ||
          slide.photographerId.toLowerCase().includes(search.toLowerCase())
      : undefined;

    const [items, total] = await Promise.all([
      db.heroSlides.find({ where, filter, orderBy: { field: 'order', direction: 'asc' }, limit: pageSize, offset: (page - 1) * pageSize }),
      db.heroSlides.count(where, filter),
    ]);

    res.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);

contentManagerRouter.get(
  '/hero-slides/active',
  asyncHandler(async (_req, res) => {
    const slides = await db.heroSlides.find({
      where: { isActive: true },
      orderBy: { field: 'order', direction: 'asc' },
    });

    // The homepage credits the photographer under each slide. It only had the
    // id, so it printed the first eight characters of a UUID — "Photographer:
    // 3f9a1c2b…" — as a name. Resolve the real names here, in one query for
    // the whole carousel, rather than leaving the client to guess or fan out.
    res.json(await withPhotographerNames(slides));
  }),
);

contentManagerRouter.get(
  '/hero-slides/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const slide = await db.heroSlides.byId(req.params.id);
    if (!slide) throw notFound('Hero slide');
    res.json(slide);
  }),
);

contentManagerRouter.post(
  '/hero-slides',
  requireRole(MANAGER_ROLE),
  validate(heroSlideSchema),
  asyncHandler(async (req, res) => {
    const { imageUrl, photographerId, order, isActive } = req.valid as {
      imageUrl: string;
      photographerId: string;
      order?: number;
      isActive?: boolean;
    };

    const maxOrder = await db.heroSlides.find({ orderBy: { field: 'order', direction: 'desc' }, limit: 1 });
    const nextOrder = order ?? (maxOrder[0]?.order ?? 0) + 1;

    const now = new Date().toISOString();
    const slide = await db.heroSlides.insert({
      imageUrl,
      photographerId,
      order: nextOrder,
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    broadcastContentUpdate('hero-slides', 'create', { id: slide.id });
    const slides = await db.heroSlides.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('heroSlides', slides.map(s => s.id));

    res.status(201).json(slide);
  }),
);

contentManagerRouter.put(
  '/hero-slides/:id',
  requireRole(MANAGER_ROLE),
  validate(updateHeroSlideSchema),
  asyncHandler(async (req, res) => {
    const slide = await db.heroSlides.byId(req.params.id);
    if (!slide) throw notFound('Hero slide');

    const updated = await db.heroSlides.update(req.params.id, {
      ...req.valid,
      updatedAt: new Date().toISOString(),
    });

    broadcastContentUpdate('hero-slides', 'update', { id: updated.id });
    const slides = await db.heroSlides.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('heroSlides', slides.map(s => s.id));

    res.json(updated);
  }),
);

contentManagerRouter.delete(
  '/hero-slides/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const slide = await db.heroSlides.byId(req.params.id);
    if (!slide) throw notFound('Hero slide');

    // Delete the associated file from storage
    await removeStored(slide.imageUrl);

    await db.heroSlides.remove(req.params.id);

    broadcastContentUpdate('hero-slides', 'delete', { id: req.params.id });
    const slides = await db.heroSlides.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('heroSlides', slides.map(s => s.id));

    res.status(204).send();
  }),
);

// ── Featured Collections ─────────────────────────────────────────────────────

contentManagerRouter.get(
  '/featured-collections',
  requireRole(MANAGER_ROLE),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, isActive, search } = req.valid as {
      page: number;
      pageSize: number;
      isActive?: boolean;
      search?: string;
    };

    const where: Record<string, unknown> = {};
    if (isActive !== undefined) where.isActive = isActive;

    const filter = search
      ? (fc: { collectionId: string }) =>
          fc.collectionId.toLowerCase().includes(search.toLowerCase())
      : undefined;

    const [items, total] = await Promise.all([
      db.featuredCollections.find({ where, filter, orderBy: { field: 'order', direction: 'asc' }, limit: pageSize, offset: (page - 1) * pageSize }),
      db.featuredCollections.count(where, filter),
    ]);

    res.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);

contentManagerRouter.get(
  '/featured-collections/active',
  asyncHandler(async (_req, res) => {
    const collections = await db.featuredCollections.find({
      where: { isActive: true },
      orderBy: { field: 'order', direction: 'asc' },
    });
    res.json(collections);
  }),
);

contentManagerRouter.get(
  '/featured-collections/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const fc = await db.featuredCollections.byId(req.params.id);
    if (!fc) throw notFound('Featured collection');
    res.json(fc);
  }),
);

contentManagerRouter.post(
  '/featured-collections',
  requireRole(MANAGER_ROLE),
  validate(featuredCollectionSchema),
  asyncHandler(async (req, res) => {
    const { collectionId, order, isActive } = req.valid as {
      collectionId: string;
      order?: number;
      isActive?: boolean;
    };

    const maxOrder = await db.featuredCollections.find({ orderBy: { field: 'order', direction: 'desc' }, limit: 1 });
    const nextOrder = order ?? (maxOrder[0]?.order ?? 0) + 1;

    const now = new Date().toISOString();
    const fc = await db.featuredCollections.insert({
      collectionId,
      order: nextOrder,
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    broadcastContentUpdate('featured-collections', 'create', { id: fc.id });
    const collections = await db.featuredCollections.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('featuredCollections', collections.map(c => c.id));

    res.status(201).json(fc);
  }),
);

contentManagerRouter.put(
  '/featured-collections/:id',
  requireRole(MANAGER_ROLE),
  validate(updateFeaturedCollectionSchema),
  asyncHandler(async (req, res) => {
    const fc = await db.featuredCollections.byId(req.params.id);
    if (!fc) throw notFound('Featured collection');

    const updated = await db.featuredCollections.update(req.params.id, {
      ...req.valid,
      updatedAt: new Date().toISOString(),
    });

    broadcastContentUpdate('featured-collections', 'update', { id: updated.id });
    const collections = await db.featuredCollections.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('featuredCollections', collections.map(c => c.id));

    res.json(updated);
  }),
);

contentManagerRouter.delete(
  '/featured-collections/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const fc = await db.featuredCollections.byId(req.params.id);
    if (!fc) throw notFound('Featured collection');

    // Note: featured collections reference artwork images, not their own uploaded files
    // The artwork images are managed separately, so no storage cleanup needed here

    await db.featuredCollections.remove(req.params.id);

    broadcastContentUpdate('featured-collections', 'delete', { id: req.params.id });
    const collections = await db.featuredCollections.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('featuredCollections', collections.map(c => c.id));

    res.status(204).send();
  }),
);

// ── Cafes ────────────────────────────────────────────────────────────────────

contentManagerRouter.get(
  '/cafes',
  requireRole(MANAGER_ROLE),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, isActive, search } = req.valid as {
      page: number;
      pageSize: number;
      isActive?: boolean;
      search?: string;
    };

    const where: Record<string, unknown> = {};
    if (isActive !== undefined) where.isActive = isActive;

    const filter = search
      ? (cafe: { name: string; description: string }) =>
          cafe.name.toLowerCase().includes(search.toLowerCase()) ||
          cafe.description.toLowerCase().includes(search.toLowerCase())
      : undefined;

    const [items, total] = await Promise.all([
      db.cafes.find({ where, filter, orderBy: { field: 'order', direction: 'asc' }, limit: pageSize, offset: (page - 1) * pageSize }),
      db.cafes.count(where, filter),
    ]);

    res.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);

contentManagerRouter.get(
  '/cafes/active',
  asyncHandler(async (_req, res) => {
    const cafes = await db.cafes.find({
      where: { isActive: true },
      orderBy: { field: 'order', direction: 'asc' },
    });
    res.json(cafes);
  }),
);

contentManagerRouter.get(
  '/cafes/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const cafe = await db.cafes.byId(req.params.id);
    if (!cafe) throw notFound('Cafe');
    res.json(cafe);
  }),
);

contentManagerRouter.post(
  '/cafes',
  requireRole(MANAGER_ROLE),
  validate(cafeSchema),
  asyncHandler(async (req, res) => {
    const { name, photoUrl, description, order, isActive } = req.valid as {
      name: string;
      photoUrl: string;
      description: string;
      order?: number;
      isActive?: boolean;
    };

    const maxOrder = await db.cafes.find({ orderBy: { field: 'order', direction: 'desc' }, limit: 1 });
    const nextOrder = order ?? (maxOrder[0]?.order ?? 0) + 1;

    const now = new Date().toISOString();
    const cafe = await db.cafes.insert({
      name,
      photoUrl,
      description,
      order: nextOrder,
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    broadcastContentUpdate('cafes', 'create', { id: cafe.id });
    const cafes = await db.cafes.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('cafes', cafes.map(c => c.id));

    res.status(201).json(cafe);
  }),
);

contentManagerRouter.put(
  '/cafes/:id',
  requireRole(MANAGER_ROLE),
  validate(updateCafeSchema),
  asyncHandler(async (req, res) => {
    const cafe = await db.cafes.byId(req.params.id);
    if (!cafe) throw notFound('Cafe');

    const updated = await db.cafes.update(req.params.id, {
      ...req.valid,
      updatedAt: new Date().toISOString(),
    });

    broadcastContentUpdate('cafes', 'update', { id: updated.id });
    const cafes = await db.cafes.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('cafes', cafes.map(c => c.id));

    res.json(updated);
  }),
);

contentManagerRouter.delete(
  '/cafes/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const cafe = await db.cafes.byId(req.params.id);
    if (!cafe) throw notFound('Cafe');

    // Delete the associated photo from storage
    await removeStored(cafe.photoUrl);

    await db.cafes.remove(req.params.id);

    broadcastContentUpdate('cafes', 'delete', { id: req.params.id });
    const cafes = await db.cafes.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('cafes', cafes.map(c => c.id));

    res.status(204).send();
  }),
);

// ── Collaboration Slides ──────────────────────────────────────────────────────

contentManagerRouter.get(
  '/collaboration-slides',
  requireRole(MANAGER_ROLE),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, isActive, search } = req.valid as {
      page: number;
      pageSize: number;
      isActive?: boolean;
      search?: string;
    };

    const where: Record<string, unknown> = {};
    if (isActive !== undefined) where.isActive = isActive;

    const filter = search
      ? (slide: { id: string; photographerId: string | null; imageUrl: string }) =>
          slide.imageUrl.toLowerCase().includes(search.toLowerCase()) ||
          (slide.photographerId?.toLowerCase().includes(search.toLowerCase()) ?? false)
      : undefined;

    const [items, total] = await Promise.all([
      db.collaborationSlides.find({ where, filter, orderBy: { field: 'order', direction: 'asc' }, limit: pageSize, offset: (page - 1) * pageSize }),
      db.collaborationSlides.count(where, filter),
    ]);

    res.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);

contentManagerRouter.get(
  '/collaboration-slides/active',
  asyncHandler(async (req, res) => {
    const photographerId = typeof req.query.photographerId === 'string' ? req.query.photographerId : undefined;
    const where: Record<string, unknown> = { isActive: true };
    if (photographerId) where.photographerId = photographerId;

    const slides = await db.collaborationSlides.find({
      where,
      orderBy: { field: 'order', direction: 'asc' },
    });
    res.json(slides);
  }),
);

contentManagerRouter.get(
  '/collaboration-slides/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const slide = await db.collaborationSlides.byId(req.params.id);
    if (!slide) throw notFound('Collaboration slide');
    res.json(slide);
  }),
);

contentManagerRouter.post(
  '/collaboration-slides',
  requireRole(MANAGER_ROLE),
  validate(collaborationSlideSchema),
  asyncHandler(async (req, res) => {
    const { imageUrl, photographerId, order, isActive } = req.valid as {
      imageUrl: string;
      photographerId?: string | null;
      order?: number;
      isActive?: boolean;
    };

    const maxOrder = await db.collaborationSlides.find({ orderBy: { field: 'order', direction: 'desc' }, limit: 1 });
    const nextOrder = order ?? (maxOrder[0]?.order ?? 0) + 1;

    const now = new Date().toISOString();
    const slide = await db.collaborationSlides.insert({
      imageUrl,
      photographerId: photographerId ?? null,
      order: nextOrder,
      isActive: isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    broadcastContentUpdate('collaboration-slides', 'create', { id: slide.id });
    const slides = await db.collaborationSlides.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('collaborationSlides', slides.map(s => s.id));

    res.status(201).json(slide);
  }),
);

contentManagerRouter.put(
  '/collaboration-slides/:id',
  requireRole(MANAGER_ROLE),
  validate(updateCollaborationSlideSchema),
  asyncHandler(async (req, res) => {
    const slide = await db.collaborationSlides.byId(req.params.id);
    if (!slide) throw notFound('Collaboration slide');

    const updated = await db.collaborationSlides.update(req.params.id, {
      ...req.valid,
      updatedAt: new Date().toISOString(),
    });

    broadcastContentUpdate('collaboration-slides', 'update', { id: updated.id });
    const slides = await db.collaborationSlides.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('collaborationSlides', slides.map(s => s.id));

    res.json(updated);
  }),
);

contentManagerRouter.delete(
  '/collaboration-slides/:id',
  requireRole(MANAGER_ROLE),
  asyncHandler(async (req, res) => {
    const slide = await db.collaborationSlides.byId(req.params.id);
    if (!slide) throw notFound('Collaboration slide');

    // Delete the associated file from storage
    await removeStored(slide.imageUrl);

    await db.collaborationSlides.remove(req.params.id);

    broadcastContentUpdate('collaboration-slides', 'delete', { id: req.params.id });
    const slides = await db.collaborationSlides.find({ orderBy: { field: 'order', direction: 'asc' } });
    await syncContentPointer('collaborationSlides', slides.map(s => s.id));

    res.status(204).send();
  }),
);
