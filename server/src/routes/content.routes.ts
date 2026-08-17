import { Router } from 'express';
import { z } from 'zod';
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
]);

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
    if (!record) {
      // Return empty record if not set yet, so client can just PUT
      res.json({ id: req.params.id, data: null, updatedAt: new Date().toISOString() });
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
    const { data } = req.valid as { data: any };
    
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
