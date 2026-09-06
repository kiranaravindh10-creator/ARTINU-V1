import { campaignSchema, campaignStatus } from '@artinu/shared';
import { Router } from 'express';
import { db } from '@/database/db';
import {
  asyncHandler,
  cachePublic,
  requireAuth,
  requireModule,
  validate,
} from '@/middleware/index';
import { notFound } from '@/utils/errors';
import { recordAudit } from '@/services/audit.service';
import {
  activeCampaign,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign,
} from '@/services/campaign.service';
import { listPublicArtists } from '@/services/user.service';

/**
 * THE SOCIAL MEDIA MODULE'S API.
 *
 * ── How access is decided ───────────────────────────────────────────────────
 *
 * One public route, then a hard line, then everything else behind
 * `requireAuth` + `requireModule`.
 *
 * `requireModule` reads ROLE_MODULES in shared/src/constants.ts, which is the
 * same table the client's navigation reads. That matters: the dashboard hiding
 * a button and the API refusing the call are then two consequences of ONE fact
 * rather than two rules that can drift apart. Typing /social-media into the
 * address bar gets a visitor the page shell and a 403 from every request it
 * makes, because the check that counts is the one here (requirements §8).
 *
 * The modules are held by `social_media` and by `ceo` — the CEO because
 * requirements §10 asks that the administrator be able to see and stop a
 * campaign, and by nobody else.
 */
export const campaignRouter = Router();

// ── Public ───────────────────────────────────────────────────────────────────

/*
  The popup, for anonymous visitors. Mounted BEFORE the auth gate below.

  Cached for a minute. This is requested on a large share of page loads and the
  answer changes a few times a week, so without it every visitor costs a
  Supabase round trip to be told there is no campaign. `cachePublic` marks a
  response private the moment credentials are present, so a shared cache cannot
  hand one visitor's response to another.

  It returns 200 with `null` rather than a 404 when nothing is running: "there
  is no campaign" is the ordinary answer to this question, not a failure, and a
  404 would put a red line in the console of every page load.
*/
campaignRouter.get(
  '/active',
  cachePublic(60),
  asyncHandler(async (_req, res) => {
    res.json(await activeCampaign());
  }),
);

// ── Everything below requires the campaigns module ───────────────────────────

campaignRouter.use(requireAuth);

campaignRouter.get(
  '/',
  requireModule('campaigns'),
  asyncHandler(async (_req, res) => {
    const campaigns = await listCampaigns();
    // The status the dashboard groups by is computed from the same function the
    // public endpoint uses, so "Active" in the list means live on the site.
    res.json(campaigns.map((campaign) => ({ ...campaign, status: campaignStatus(campaign) })));
  }),
);

campaignRouter.post(
  '/',
  requireModule('campaigns'),
  validate(campaignSchema),
  asyncHandler(async (req, res) => {
    const campaign = await createCampaign(req.valid, req.user!.id);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'campaign.created',
      entity: 'campaign',
      entityId: campaign.id,
      meta: { title: campaign.title, active: campaign.active },
      ip: req.ip,
    });

    res.status(201).json(campaign);
  }),
);

campaignRouter.put(
  '/:id',
  requireModule('campaigns'),
  validate(campaignSchema),
  asyncHandler(async (req, res) => {
    const campaign = await updateCampaign(req.params.id, req.valid);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'campaign.updated',
      entity: 'campaign',
      entityId: campaign.id,
      meta: { title: campaign.title, active: campaign.active },
      ip: req.ip,
    });

    res.json(campaign);
  }),
);

/**
 * The switch, on its own.
 *
 * Separate from the full update because starting and stopping a campaign is the
 * thing this team does most often and under the most time pressure, and making
 * it a PUT of the whole object means a stale form field can quietly overwrite
 * something else at the moment somebody is trying to pull a live promotion
 * down.
 */
campaignRouter.patch(
  '/:id/active',
  requireModule('campaigns'),
  asyncHandler(async (req, res) => {
    const existing = await db.socialMediaCampaigns.byId(req.params.id);
    if (!existing) throw notFound('That campaign');

    const active = Boolean((req.body as { active?: unknown })?.active);
    const campaign = await db.socialMediaCampaigns.update(req.params.id, {
      active,
      updatedAt: new Date().toISOString(),
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: active ? 'campaign.started' : 'campaign.stopped',
      entity: 'campaign',
      entityId: campaign.id,
      meta: { title: campaign.title },
      ip: req.ip,
    });

    res.json({ ...campaign, status: campaignStatus(campaign) });
  }),
);

campaignRouter.delete(
  '/:id',
  requireModule('campaigns'),
  asyncHandler(async (req, res) => {
    const existing = await db.socialMediaCampaigns.byId(req.params.id);
    if (!existing) throw notFound('That campaign');

    await deleteCampaign(req.params.id);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'campaign.deleted',
      entity: 'campaign',
      entityId: req.params.id,
      meta: { title: existing.title },
      ip: req.ip,
    });

    res.status(204).end();
  }),
);

// ── The promotion pipeline (requirements §7) ─────────────────────────────────

/*
  What the team may build a campaign out of.

  Read-only, and deliberately no more than the public site already shows. The
  artists list is `listPublicArtists` - the very same call behind the public
  /artists page - so this endpoint cannot leak anything a visitor could not
  already read.

  Spaces get an explicit projection instead, because a `Space` row carries
  `contactName`, `contactPhone`, `contactEmail` and the street address of a real
  business. Returning rows and letting the dashboard render four of the fields
  would put the rest in the browser's network tab, which is precisely the
  "access sensitive user information" that requirements §8 rules out. The fields
  below are what a promotion needs and nothing else.
*/
campaignRouter.get(
  '/promotable/artists',
  requireModule('promotions'),
  asyncHandler(async (_req, res) => {
    const artists = await listPublicArtists();
    res.json(artists.filter((artist) => artist.artworkCount > 0));
  }),
);

campaignRouter.get(
  '/promotable/spaces',
  requireModule('promotions'),
  asyncHandler(async (_req, res) => {
    const spaces = await db.spaces.find({
      where: { verified: true },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    res.json(
      spaces.map((space) => ({
        id: space.id,
        code: space.code ?? null,
        name: space.name,
        type: space.type,
        city: space.city,
        imageUrl: space.imageUrls?.[0] ?? null,
      })),
    );
  }),
);
