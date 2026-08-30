import { Router } from 'express';
import { z } from 'zod';
import { apiLimiter, asyncHandler, validate } from '@/middleware/index';
import { suggestPlaces } from '@/services/geocode.service';

export const placesRouter = Router();

/**
 * Place suggestions for the location fields.
 *
 * Deliberately public. These fields sit on Let's Talk, Apply and both
 * registration pages — all reachable before anyone has an account — so
 * requiring auth would mean the autocomplete only worked for people who least
 * need it.
 *
 * Public plus an outbound call is an abuse shape worth naming, so it is bounded
 * on three sides: `apiLimiter` per IP, a hard cap on query length, and the
 * ten-minute cache in the service, which means a repeated query costs nothing
 * upstream however often it is asked for.
 */
placesRouter.get(
  '/suggest',
  apiLimiter,
  validate(
    z.object({
      // Two characters is where a prefix stops matching half the planet.
      q: z.string().trim().min(2).max(120),
      limit: z.coerce.number().int().min(1).max(10).default(6),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.valid as { q: string; limit: number };
    const suggestions = await suggestPlaces(q, limit);

    // Suggestions for a given string are stable for far longer than this; the
    // short max-age is only to keep a typo from being remembered by a proxy.
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ suggestions });
  }),
);
