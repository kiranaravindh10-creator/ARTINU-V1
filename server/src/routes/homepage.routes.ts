import { DEFAULT_SLIDESHOW_SETTINGS, slideshowSettingsSchema } from '@artinu/shared';
import { Router } from 'express';
import { db } from '@/database/db';
import { asyncHandler, cachePublic } from '@/middleware/index';
import { withPhotographerNames } from '@/routes/contentManager.routes';

/**
 * THE WHOLE HOMEPAGE, IN ONE REQUEST.
 *
 * ── The problem this exists to solve ────────────────────────────────────────
 *
 * Opening artinu.in fired FIVE separate calls for homepage furniture — the hero
 * slides, the slideshow settings, the collaborations, the featured collections
 * and the testimonials. Measured against the live API in Singapore, each one
 * costs about 1 to 1.5 seconds of round trip, and together they carry a little
 * over four kilobytes. Four kilobytes should not cost six seconds.
 *
 * Worse is what happened when the API was asleep. It runs on a free Render
 * instance that spins down after inactivity, and a cold start was measured at
 * 31.7 seconds against 1.1 warm. Every one of those five calls was a separate
 * chance to be the one still in flight when the visitor gave up or scrolled —
 * and the sections are written to render NOTHING rather than a broken frame
 * when their data has not arrived. So the collaborations and the testimonials
 * did not appear "slowly". They were simply absent, and then present on the
 * next visit once somebody's first request had woken the dyno. That is exactly
 * the "sometimes it comes, sometimes it doesn't" this endpoint answers.
 *
 * One request means one cold start to wait through instead of five, one cache
 * entry to warm, and — with the client storing the payload — one thing to paint
 * instantly on the next visit.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 *
 * It does not replace the five endpoints it aggregates. The Console's content
 * manager still reads and writes through those, and they are unchanged. This is
 * a read-only view assembled for one screen, added beside them.
 *
 * The gallery calls are deliberately left out. They are an order of magnitude
 * larger (24 KB for eight photographs against 4 KB for all of this), they are
 * already paginated and cached on their own terms, and folding them in would
 * make the one thing the homepage blocks on five times heavier.
 */
export const homepageRouter = Router();

/** The content records the homepage reads, by their `ui_content` id. */
const TESTIMONIALS_ID = 'homepage_testimonials';
const SLIDESHOW_ID = 'homepage_slideshow';

homepageRouter.get(
  '/',
  /*
    Sixty seconds, matching the endpoints this replaces.

    The homepage is the most requested URL on the site and this content changes
    a few times a month, so the visitor's own browser answering the second load
    without a round trip is most of the win. `cachePublic` downgrades itself to
    `private, no-store` if the request carries credentials, so a signed-in
    manager previewing a change never gets a stranger's cached copy — or gives
    one to a shared cache.
  */
  cachePublic(60),
  asyncHandler(async (_req, res) => {
    /*
      Every read at once.

      These are five independent tables and nothing here depends on anything
      else here, so awaiting them in sequence would spend five round trips to
      Postgres to answer one round trip from the browser — reproducing on the
      server the exact problem this endpoint removes from the client.
    */
    const [slides, cafes, collections, testimonials, slideshow] = await Promise.all([
      db.heroSlides.find({ where: { isActive: true }, orderBy: { field: 'order', direction: 'asc' } }),
      db.cafes.find({ where: { isActive: true }, orderBy: { field: 'order', direction: 'asc' } }),
      db.featuredCollections.find({
        where: { isActive: true },
        orderBy: { field: 'order', direction: 'asc' },
      }),
      db.uiContent.byId(TESTIMONIALS_ID),
      db.uiContent.byId(SLIDESHOW_ID),
    ]);

    res.json({
      // Same shape the carousel already expects, names resolved server-side in
      // one query rather than left as raw uuids.
      heroSlides: await withPhotographerNames(slides),
      cafes,
      featuredCollections: collections,
      /*
        `data` unwrapped here, not on the client.

        `GET /content/:id` answers with the whole record — `{ id, data,
        updatedAt }` — because it is generic over every content id. The homepage
        only ever wants the payload, and unwrapping it here means the client has
        one less shape to know about and one less place to get it wrong.
      */
      testimonials: Array.isArray(testimonials?.data) ? testimonials.data : [],
      /*
        Parsed through the schema exactly as `GET /content/:id` does, so a
        record that has never been saved still yields complete settings rather
        than undefined. Every field in that schema has a default, which is what
        makes the hero play correctly on a fresh install.
      */
      slideshow: slideshow?.data
        ? slideshowSettingsSchema.parse(slideshow.data)
        : { ...DEFAULT_SLIDESHOW_SETTINGS },
    });
  }),
);
