import { Router } from 'express';
import { z } from 'zod';
import { slideshowSettingsSchema } from '@artinu/shared';
import { db } from '@/database/db';
import { asyncHandler, requireInternal, validate } from '@/middleware/index';
import { forbidden } from '@/utils/errors';

export const contentRouter = Router();

const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];
const PUBLIC_CONTENT_IDS = new Set([
  'homepage_hero',
  'featured_artists',
  'gallery_top_20',
  'dashboard_cafes',
  // Customer quotes on the homepage. Read publicly, written only by staff, so
  // the words attributed to a named business come from the console rather than
  // from whoever last edited the frontend bundle.
  'homepage_testimonials',
  // How the homepage slideshow plays — dwell, transition, which controls show.
  // Read by every visitor, written only from Console → Homepage.
  'homepage_slideshow',
]);

/**
 * Records that are a fixed shape rather than a free-form blob.
 *
 * `ui_content.data` is `jsonb` and this endpoint has always taken `z.any()`,
 * which is right for a list of IDs or a set of quotes. The slideshow settings
 * are different: the homepage reads them straight into a timer and a transition
 * duration, so `intervalMs: 0` or `intervalMs: -1` saved from a hand-rolled
 * request would spin the hero or stop it dead. Parsing on the way in bounds
 * them, and — because every field in that schema has a default — parsing on the
 * way out turns a missing or half-written record into a complete one.
 */
const SHAPED_CONTENT = {
  homepage_slideshow: slideshowSettingsSchema,
} as const;

const shapeOf = (id: string) =>
  (SHAPED_CONTENT as Record<string, z.ZodTypeAny | undefined>)[id];

contentRouter.get(
  '/',
  requireInternal,
  asyncHandler(async (_req, res) => {
    const all = await db.uiContent.find();
    res.json(all);
  }),
);

contentRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!PUBLIC_CONTENT_IDS.has(req.params.id) && !INTERNAL.includes(req.user?.role ?? '')) {
      throw forbidden('That content is not public.');
    }
    const record = await db.uiContent.byId(req.params.id);
    const shape = shapeOf(req.params.id);

    if (!record) {
      // A shaped record that has never been saved still has an answer: the
      // schema's own defaults. The homepage slideshow therefore plays correctly
      // on a fresh install, before anyone has opened the settings panel.
      res.json({
        id: req.params.id,
        data: shape ? shape.parse({}) : null,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (shape) {
      const parsed = shape.safeParse(record.data);
      res.json({
        ...record,
        // A record written by an older build is missing whatever fields have
        // been added since; filling those from the defaults is better than
        // handing the homepage an incomplete object to guess at.
        data: parsed.success ? parsed.data : shape.parse({}),
      });
      return;
    }

    res.json(record);
  }),
);

contentRouter.put(
  '/:id',
  requireInternal,
  validate(
    z.object({
      data: z.any(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shape = shapeOf(id);
    // Throws a 400 with the offending field for a shaped record, rather than
    // storing something the homepage cannot use.
    const data = shape ? shape.parse((req.valid as { data: unknown }).data) : (req.valid as { data: any }).data;

    const existing = await db.uiContent.byId(id);
    let updated;
    
    if (existing) {
      updated = await db.uiContent.update(id, {
        data,
        updatedAt: new Date().toISOString(),
      });
    } else {
      updated = await db.uiContent.insert({
        id,
        data,
        updatedAt: new Date().toISOString(),
      });
    }

    res.json(updated);
  }),
);
