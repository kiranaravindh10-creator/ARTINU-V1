import { INTERNAL_ROLES, type Installation } from '@artinu/shared';
import { Router } from 'express';
import { db } from '@/database/db';
import { asyncHandler, requireAuth } from '@/middleware/index';
import {
  artistAnalytics,
  consoleAnalytics,
  spaceOwnerAnalytics,
} from '@/services/analytics.service';

/**
 * Dashboard data for whoever is asking. One endpoint rather than three keeps the
 * client simple: the shell asks for "my analytics" and gets the shape that fits
 * its role.
 */
export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = req.user!;

    if (user.role === 'artist') {
      res.json(await artistAnalytics(user.id));
      return;
    }
    if (user.role === 'space_owner') {
      res.json(await spaceOwnerAnalytics(user.id));
      return;
    }
    if ((INTERNAL_ROLES as readonly string[]).includes(user.role)) {
      res.json(await consoleAnalytics());
      return;
    }

    res.json({});
  }),
);

/**
 * Installations relevant to the caller: the spaces they own, or — for an artist —
 * every space where one of their photographs currently hangs.
 */
analyticsRouter.get(
  '/me/installations',
  asyncHandler(async (req, res) => {
    const user = req.user!;

    if (user.role === 'space_owner') {
      const spaces = await db.spaces.find({ where: { ownerId: user.id } });
      const spaceIds = new Set(spaces.map((space) => space.id));
      const installations = await db.installations.find({
        orderBy: { field: 'scheduledFor', direction: 'desc' },
      });
      res.json(installations.filter((installation) => spaceIds.has(installation.spaceId)));
      return;
    }

    if (user.role === 'artist') {
      const artworks = await db.artworks.find({ where: { artistId: user.id } });
      const artworkIds = new Set(artworks.map((artwork) => artwork.id));

      const orders = await db.orders.find();
      const ordersWithTheirWork = new Set(
        orders
          .filter((order) => order.items.some((item) => artworkIds.has(item.artworkId)))
          .map((order) => order.id),
      );

      const installations = await db.installations.find({
        orderBy: { field: 'scheduledFor', direction: 'desc' },
      });
      res.json(installations.filter((entry) => ordersWithTheirWork.has(entry.orderId)));
      return;
    }

    const all: Installation[] = await db.installations.find({
      orderBy: { field: 'scheduledFor', direction: 'desc' },
      limit: 100,
    });
    res.json(all);
  }),
);

/** An artist's own payout history. The console reads everyone's via /admin. */
analyticsRouter.get(
  '/me/payouts',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.role !== 'artist') {
      res.json([]);
      return;
    }

    res.json(
      await db.payouts.find({
        where: { artistId: user.id },
        orderBy: { field: 'createdAt', direction: 'desc' },
      }),
    );
  }),
);
