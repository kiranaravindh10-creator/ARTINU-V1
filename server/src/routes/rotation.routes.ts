import {
  ROTATION_RESCHEDULE_WINDOW_DAYS,
  canReschedule,
  formatDate,
  rescheduleRotationSchema,
  shiftedDueAt,
  type Artwork,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { asyncHandler, requireAuth, requireInternal, validate } from '@/middleware/index';
import { badRequest, forbidden, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { recordAudit } from '@/services/audit.service';
import { notify, notifyRole } from '@/services/notification.service';
import { ensureRotationsDue, openNextCycle } from '@/services/rotation.service';
import { withArtists } from '@/services/user.service';

export const rotationRouter = Router();

const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];

rotationRouter.use(requireAuth);

async function resolveArtworks(ids: string[]) {
  const artworks = (await Promise.all(ids.map((id) => db.artworks.byId(id)))).filter(
    (artwork): artwork is Artwork => Boolean(artwork),
  );
  return withArtists(artworks);
}

rotationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;

    if (INTERNAL.includes(user.role)) {
      await ensureRotationsDue();
      res.json(await db.rotations.find({ orderBy: { field: 'dueAt', direction: 'asc' } }));
      return;
    }

    const spaces = await db.spaces.find({ where: { ownerId: user.id } });
    const spaceIds = spaces.map((space) => space.id);
    if (spaceIds.length === 0) {
      res.json([]);
      return;
    }

    await ensureRotationsDue(spaceIds);

    const cycles = await db.rotations.find({
      where: { spaceId: spaceIds },
      orderBy: { field: 'dueAt', direction: 'asc' },
    });
    res.json(cycles);
  }),
);

rotationRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cycle = await db.rotations.byId(req.params.id);
    if (!cycle) throw notFound('That rotation');

    const space = await db.spaces.byId(cycle.spaceId);
    if (!space) throw notFound('That space');
    if (space.ownerId !== req.user!.id && !INTERNAL.includes(req.user!.role)) {
      throw forbidden('That rotation belongs to another space.');
    }

    res.json({
      ...cycle,
      space,
      current: await resolveArtworks(cycle.currentArtworkIds),
      proposed: await resolveArtworks(cycle.proposedArtworkIds),
    });
  }),
);

rotationRouter.post(
  '/:id/propose',
  requireInternal,
  validate(z.object({ artworkIds: z.array(z.string()).min(1) })),
  asyncHandler(async (req, res) => {
    const cycle = await db.rotations.byId(req.params.id);
    if (!cycle) throw notFound('That rotation');

    const { artworkIds } = req.valid as { artworkIds: string[] };

    const updated = await db.rotations.update(cycle.id, {
      proposedArtworkIds: artworkIds,
      status: 'awaiting_approval',
    });

    const space = await db.spaces.byId(cycle.spaceId);
    if (space) {
      await notify({
        userId: space.ownerId,
        type: 'rotation_reminder',
        title: 'Your next collection is ready to review',
        body: `We have curated ${artworkIds.length} photographs for ${space.name}. Approve them and we will schedule the swap.`,
        link: '/space/rotation',
      });
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'rotation.proposed',
      entity: 'rotation',
      entityId: cycle.id,
      meta: { count: artworkIds.length },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

/**
 * Move a rotation by a day or two.
 *
 * The space owner's own write, like approve and request-changes - they are the
 * one who knows their room is closed on Tuesday. Bounded so it stays a courtesy
 * rather than a rescheduling system: see ROTATION_RESCHEDULE_WINDOW_DAYS.
 *
 * THE BOUND IS MEASURED FROM THE ORIGINAL DATE.
 *
 * `rescheduledFrom` is stamped on the first move and never overwritten, and
 * every later move is checked against it. Checking against the CURRENT `dueAt`
 * instead would let someone tap "+2 days" five times and walk a rotation a
 * fortnight down the calendar, two days at a time, with every individual
 * request passing validation.
 *
 * Operations is notified because by the time a cycle is due there may already
 * be a print run and a route planned around the old date.
 */
rotationRouter.post(
  '/:id/reschedule',
  validate(rescheduleRotationSchema),
  asyncHandler(async (req, res) => {
    const cycle = await db.rotations.byId(req.params.id);
    if (!cycle) throw notFound('That rotation');

    const space = await db.spaces.byId(cycle.spaceId);
    if (!space) throw notFound('That space');
    if (space.ownerId !== req.user!.id) throw forbidden('That rotation belongs to another space.');

    // Once the crew is on the way the date is not the owner's to move alone.
    if (cycle.status === 'installed') {
      throw badRequest('This rotation has already been installed.');
    }

    const { days } = req.valid as { days: number };

    const anchor = cycle.rescheduledFrom ?? cycle.dueAt;

    // canReschedule / shiftedDueAt are the same functions the calendar uses to
    // decide which days to offer, so the grid cannot light up a date this
    // endpoint would refuse.
    if (!canReschedule(cycle.dueAt, cycle.rescheduledFrom, days)) {
      throw badRequest(
        `A rotation can move at most ${ROTATION_RESCHEDULE_WINDOW_DAYS} days from ${formatDate(anchor, 'long')}. Call us and we will find a date that works.`,
      );
    }

    const nextDueAt = shiftedDueAt(cycle.dueAt, days);

    const updated = await db.rotations.update(cycle.id, {
      dueAt: nextDueAt,
      rescheduledFrom: anchor,
    });

    await notifyRole('operations', {
      type: 'rotation_reminder',
      title: 'A rotation date moved',
      body: `${space.name} moved their rotation to ${formatDate(nextDueAt, 'long')}.`,
      link: '/console/orders',
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'rotation.rescheduled',
      entity: 'rotation',
      entityId: cycle.id,
      meta: { from: cycle.dueAt, to: nextDueAt, days, anchor },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

rotationRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const cycle = await db.rotations.byId(req.params.id);
    if (!cycle) throw notFound('That rotation');

    const space = await db.spaces.byId(cycle.spaceId);
    if (!space) throw notFound('That space');
    if (space.ownerId !== req.user!.id) throw forbidden('That rotation belongs to another space.');
    if (cycle.status !== 'awaiting_approval') {
      throw badRequest('This rotation is not waiting for your approval yet.');
    }

    const updated = await db.rotations.update(cycle.id, {
      status: 'approved',
      approvedAt: now(),
    });

    await notifyRole('operations', {
      type: 'installation_scheduled',
      title: 'Rotation approved - schedule the swap',
      body: `${space.name} has approved their next collection.`,
      link: '/console/orders',
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'rotation.approved',
      entity: 'rotation',
      entityId: cycle.id,
      ip: req.ip,
    });

    res.json(updated);
  }),
);

rotationRouter.post(
  '/:id/request-changes',
  validate(z.object({ note: z.string().min(4).max(600) })),
  asyncHandler(async (req, res) => {
    const cycle = await db.rotations.byId(req.params.id);
    if (!cycle) throw notFound('That rotation');

    const space = await db.spaces.byId(cycle.spaceId);
    if (!space) throw notFound('That space');
    if (space.ownerId !== req.user!.id) throw forbidden('That rotation belongs to another space.');

    const { note } = req.valid as { note: string };
    const updated = await db.rotations.update(cycle.id, {
      status: 'curating',
      proposedArtworkIds: [],
    });

    await notifyRole('manager', {
      type: 'system',
      title: `${space.name} asked for a different selection`,
      body: note,
      link: '/console/spaces',
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'rotation.changes_requested',
      entity: 'rotation',
      entityId: cycle.id,
      meta: { note },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

rotationRouter.post(
  '/:id/installed',
  requireInternal,
  asyncHandler(async (req, res) => {
    const cycle = await db.rotations.byId(req.params.id);
    if (!cycle) throw notFound('That rotation');

    const updated = await db.rotations.update(cycle.id, {
      status: 'installed',
      installedAt: now(),
      currentArtworkIds: cycle.proposedArtworkIds.length
        ? cycle.proposedArtworkIds
        : cycle.currentArtworkIds,
    });

    // Rotation is continuous — closing one cycle opens the next.
    await openNextCycle(updated);

    res.json(updated);
  }),
);
