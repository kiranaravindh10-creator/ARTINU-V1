import {
  adminCreateOrderSchema,
  adminProvisionSpaceSchema,
  API_ROUTES,
  artworkReviewSchema,
  formatCurrency,
  PRICING,
  ORDER_STATUS_LABELS,
  ROLE_MODULES,
  ROLES,
  updateOrderCostSchema,
  updateOrderStatusSchema,
  USER_STATUSES,
  type AdminCreateOrderInput,
  type AdminProvisionSpaceInput,
  type Artwork,
  type CostBreakdown,
  type OrderStatus,
  type Role,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { driverSummary, env } from '@/config/env';
import {
  clearMail,
  getMailDurable,
  listMailDurable,
  mailboxSummaryDurable,
} from '@/services/mailbox.service';
import { db } from '@/database/db';
import { paginate } from '@/database/table';
import {
  asyncHandler,
  metrics,
  recentErrors,
  requireInternal,
  requireModule,
  requireRole,
  validate,
} from '@/middleware/index';
import { badRequest, conflict, forbidden, notFound } from '@/utils/errors';
import { now, paymentReference } from '@/utils/ids';
import {
  consoleAnalytics,
  reportBundle,
} from '@/services/analytics.service';
import { ensureSpaceCode, issuedPassword } from '@/services/space-code.service';
import { sendWelcomeEmailOnce } from '@/services/welcome-email.service';
import { recordAudit, recentAudit } from '@/services/audit.service';
import { createOrderForSpace } from '@/services/order.service';
import { settlePayment } from '@/services/settlement.service';
import { findCoupon } from '@/services/coupon.service';
import { deleteAccountCompletely } from '@/services/account-deletion.service';
import { logger } from '@/utils/logger';
import {
  createProfile,
  createUser,
  findByEmail,
  issueToken,
  profileFor,
  sanitizeUser,
  temporaryPassword,
} from '@/services/auth.service';
import {
  sendArtistInstallationUpdate,
  sendArtworkRemoved,
  sendInstallationUpdate,
  sendMail,
  sendModerationDecision,
  sendPasswordResetEmail,
} from '@/services/email.service';
import { notify, notifyRole } from '@/services/notification.service';
import { advanceOrder, canTransition } from '@/services/order.service';
import { ensureRotationStarted } from '@/services/rotation.service';
import { buildPublicArtist, loadArtistContext } from '@/services/user.service';

export const adminRouter = Router();

adminRouter.use(requireInternal);

const pageOf = (req: { query: Record<string, unknown> }) => ({
  page: Number(req.query.page ?? 1),
  pageSize: Math.min(100, Number(req.query.pageSize ?? 20)),
});

const search = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;

// ── Overview ─────────────────────────────────────────────────────────────────

/**
 * Everyone internal gets an overview, but the money on it is scoped to role
 * (requirements §15: the IT team gets technical modules only). Rather than
 * denying the page outright — which would leave IT staff with no landing screen
 * — the financial fields are stripped for roles that cannot open Reports or
 * Accounts, so the operational counts still render.
 */
adminRouter.get(
  '/analytics',
  requireModule('overview'),
  asyncHandler(async (req, res) => {
    const analytics = await consoleAnalytics();
    const modules = ROLE_MODULES[req.user!.role] ?? [];
    const maySeeMoney = modules.includes('reports') || modules.includes('accounts');

    if (maySeeMoney) {
      res.json(analytics);
      return;
    }

    res.json({
      ...analytics,
      revenue: null,
      revenueThisMonth: null,
      averageOrderValue: null,
      revenueTrend: [],
      topSpaces: analytics.topSpaces.map(({ revenue: _revenue, ...space }) => ({ ...space, revenue: null })),
      topArtists: analytics.topArtists.map(({ earnings: _earnings, ...artist }) => ({
        ...artist,
        earnings: null,
      })),
      financialAccess: false,
    });
  }),
);

adminRouter.get(
  '/reports',
  requireModule('reports'),
  asyncHandler(async (_req, res) => {
    res.json(await reportBundle());
  }),
);

// ── Orders ───────────────────────────────────────────────────────────────────

/**
 * Place an order on a space's behalf.
 *
 * THE CASE THIS EXISTS FOR
 *
 * Not every café owner is going to log in. A good number will say "you know
 * what we want, just do it" over the phone or across a counter, and until now
 * there was no way to turn that into an order: `POST /orders` is
 * `requireRole('space_owner')` and `createOrder` asserts the caller owns the
 * space, so staff were blocked twice over.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not take a price. `items` and `spaceId` are the only things trusted
 * from the body, and every rupee is recomputed server-side by the same
 * `priceDraft` a self-service checkout uses. Staff can decide WHAT is being
 * bought, never what it costs.
 *
 * It does not change who the order belongs to. `createOrderForSpace` attributes
 * it to the space's owner, so the moment it exists it shows up on their
 * dashboard, invoices to them, and rotates on their schedule. The staff member
 * appears in the audit log and nowhere else.
 *
 * PAID vs UNPAID
 *
 * `markPaid: false` leaves it at `pending_payment`, identical to a cart that
 * has not been through checkout - the owner can still pay it online later.
 *
 * `markPaid: true` records a `manual` payment and runs it through
 * `settlePayment`, the SAME function the Razorpay webhook uses. That matters:
 * simply patching the status to `confirmed` is permitted by `canTransition`
 * and would look correct in the console while silently skipping the invoice,
 * the artist notifications, the selection counts and - most importantly - the
 * artists' payout accrual. An order nobody gets paid for is worse than no
 * order.
 */
adminRouter.post(
  '/orders',
  requireModule('orders'),
  validate(adminCreateOrderSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as AdminCreateOrderInput;

    const space = await db.spaces.byId(input.spaceId);
    if (!space) throw notFound('That space');

    const owner = await db.users.byId(space.ownerId);
    if (!owner) {
      throw badRequest('That space has no account attached, so an order cannot be placed on it.');
    }

    const order = await createOrderForSpace(
      {
        spaceId: input.spaceId,
        items: input.items,
        couponCode: input.couponCode ?? null,
        includeSecurityDeposit: input.includeSecurityDeposit,
        notes: input.notes ?? null,
      },
      space,
    );

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'order.created_by_staff',
      entity: 'order',
      entityId: order.id,
      meta: {
        spaceId: space.id,
        ownerId: space.ownerId,
        total: order.pricing.total,
        markPaid: input.markPaid,
      },
      ip: req.ip,
    });

    if (!input.markPaid) {
      // Unpaid: tell the owner there is something waiting for them.
      await notify({
        userId: space.ownerId,
        type: 'order_update',
        title: `Order ${order.reference} is ready to pay`,
        body: `We have put together ${order.pricing.quantity} frames for ${space.name}.`,
        link: `/space/orders/${order.id}`,
      });
      res.status(201).json(order);
      return;
    }

    /*
      Paid offline. The payment row is created already settled in intent and
      then handed to `settlePayment`, which flips it to `succeeded` and does the
      other seven things. `reference` is what finance matches against the bank
      statement, so an operator-supplied one wins over the generated one.
    */
    const reference = input.paymentReference?.trim() || paymentReference();

    const payment = await db.payments.insert({
      orderId: order.id,
      provider: 'manual',
      amount: order.pricing.total,
      currency: PRICING.CURRENCY,
      status: 'awaiting_payment',
      qrPayload: null,
      qrImageDataUrl: null,
      reference,
      gatewayOrderId: null,
      gatewayPaymentId: null,
      expiresAt: null,
      attempts: 1,
      failureReason: `Recorded by staff (${input.paymentMethod}).`,
      createdAt: now(),
      updatedAt: now(),
    });

    await db.orders.update(order.id, { paymentId: payment.id, updatedAt: now() });

    const settled = await settlePayment(payment, order, null, {
      reference,
      actor: { id: req.user!.id, email: req.user!.email },
      ip: req.ip,
    });

    res.status(201).json(settled.order);
  }),
);

adminRouter.get(
  '/orders',
  requireModule('orders'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = search(req.query.q);

    const spaces = await db.spaces.find();
    const spaceById = new Map(spaces.map((space) => [space.id, space]));

    const orders = await db.orders.find({
      filter: (order) => {
        if (status && status !== 'all' && order.status !== status) return false;
        if (!q) return true;
        const space = spaceById.get(order.spaceId);
        return `${order.reference} ${space?.name ?? ''} ${space?.city ?? ''}`.toLowerCase().includes(q);
      },
      orderBy: { field: 'placedAt', direction: 'desc' },
    });

    const result = paginate(orders, page, pageSize);
    res.json({
      ...result,
      items: result.items.map((order) => ({
        ...order,
        spaceName: spaceById.get(order.spaceId)?.name ?? 'Unknown space',
      })),
    });
  }),
);

adminRouter.patch(
  '/orders/:id/status',
  requireModule('orders'),
  validate(updateOrderStatusSchema),
  asyncHandler(async (req, res) => {
    const order = await db.orders.byId(req.params.id);
    if (!order) throw notFound('That order');

    const { status, note } = req.valid as { status: OrderStatus; note?: string | null };
    if (!canTransition(order.status, status)) {
      throw badRequest(
        `An order cannot move from ${ORDER_STATUS_LABELS[order.status]} to ${ORDER_STATUS_LABELS[status] ?? status}.`,
      );
    }

    const updated = await advanceOrder(order, status, { note, by: req.user!.email });

    const SENTENCE: Partial<Record<OrderStatus, string>> = {
      printing: 'Your photographs are on the press.',
      framing: 'Your prints are being framed by hand.',
      dispatched: 'Your collection has left our studio.',
      out_for_delivery: 'Your collection is out for delivery today.',
      installation_scheduled: 'Your installation has been scheduled.',
      completed: 'Your collection is up. We would love to hear what you think.',
      cancelled: 'Your order has been cancelled.',
    };

    await notify({
      userId: order.ownerId,
      type: status === 'completed' ? 'order_completed' : 'order_update',
      title: `${order.reference} - ${ORDER_STATUS_LABELS[status] ?? status}`,
      body: note || SENTENCE[status] || 'Your order has moved to the next stage.',
      link: `/space/orders/${order.id}`,
    });

    if (status === 'installation_scheduled' || status === 'completed') {
      const owner = await db.users.byId(order.ownerId);
      const installation = order.installationId
        ? await db.installations.byId(order.installationId)
        : null;
      if (owner) {
        void sendInstallationUpdate(
          owner.email,
          'there',
          updated,
          installation?.scheduledFor ?? new Date().toISOString(),
        );
      }
    }

    // Walls are full — start (or extend) the rotation the customer is paying for.
    if (status === 'completed') {
      await ensureRotationStarted(
        order.spaceId,
        order.items.map((item) => item.artworkId),
      );
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'order.status_changed',
      entity: 'order',
      entityId: order.id,
      meta: { from: order.status, to: status },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

adminRouter.patch(
  '/orders/:id/cost',
  requireModule('accounts'),
  validate(updateOrderCostSchema),
  asyncHandler(async (req, res) => {
    const order = await db.orders.byId(req.params.id);
    if (!order) throw notFound('That order');

    const { frame, printing, logistics, misc } = req.valid as {
      frame: number;
      printing: number;
      logistics: number;
      misc: number;
    };

    const total = frame + printing + logistics + misc;
    const revenue = order.pricing.total;
    const margin = revenue - total;
    const marginPercent = revenue > 0 ? margin / revenue : 0;

    const cost: CostBreakdown = {
      frame,
      printing,
      logistics,
      misc,
      total,
      margin,
      marginPercent,
    };

    const updated = await db.orders.update(order.id, {
      cost,
      updatedAt: now(),
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'order.cost_updated',
      entity: 'order',
      entityId: order.id,
      meta: { cost },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

adminRouter.post(
  '/orders/:id/installation',
  requireModule('orders'),
  validate(
    z.object({
      scheduledFor: z.string().min(4),
      installationWindow: z.string().max(60).optional(),
      technician: z.string().max(120).optional(),
      notes: z.string().max(400).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const order = await db.orders.byId(req.params.id);
    if (!order) throw notFound('That order');

    const input = req.valid as {
      scheduledFor: string;
      installationWindow?: string;
      technician?: string;
      notes?: string;
    };

    const installation = await db.installations.insert({
      orderId: order.id,
      spaceId: order.spaceId,
      scheduledFor: input.scheduledFor,
      installationWindow: input.installationWindow ?? null,
      status: 'scheduled',
      technician: input.technician ?? null,
      notes: input.notes ?? null,
      completedAt: null,
    });

    await db.orders.update(order.id, { installationId: installation.id, updatedAt: now() });

    if (canTransition(order.status, 'installation_scheduled')) {
      await advanceOrder(order, 'installation_scheduled', {
        note: `Installation booked for ${input.scheduledFor}.`,
        by: req.user!.email,
      });
    }

    const space = await db.spaces.byId(order.spaceId);
    await notify({
      userId: order.ownerId,
      type: 'installation_scheduled',
      title: 'Installation scheduled',
      body: `Our team will be at ${space?.name ?? 'your space'} on ${input.scheduledFor}${input.installationWindow ? `, ${input.installationWindow}` : ''}.`,
      link: `/space/orders/${order.id}`,
    });

    // The owner has to let the crew in, so booking the slot must reach their
    // inbox too — not only the in-app notification.
    const owner = await db.users.byId(order.ownerId);
    if (owner) {
      const ownerProfile = await profileFor(order.ownerId);
      void sendInstallationUpdate(
        owner.email,
        ownerProfile?.fullName ?? 'there',
        order,
        input.scheduledFor,
      );
    }

    for (const artistId of new Set(order.items.map((item) => item.artistId))) {
      await notify({
        userId: artistId,
        type: 'installation_scheduled',
        title: 'Your work is going up',
        body: `Installation at ${space?.name ?? 'an ARTINU space'} is scheduled for ${input.scheduledFor}.`,
        link: '/studio/installations',
      });

      const artistUser = await db.users.byId(artistId);

      if (artistUser) {
        // Same reason as in settlement.service: the Photo ID lives on the
        // artwork, not on the order item, so it is resolved here.
        const placements = [];
        for (const item of order.items.filter((line) => line.artistId === artistId)) {
          const artwork = await db.artworks.byId(item.artworkId);
          placements.push({ title: item.artworkTitle, photoId: artwork?.photoId ?? null });
        }

        const theirProfile = await profileFor(artistId);
        void sendArtistInstallationUpdate(
          artistUser.email,
          theirProfile?.fullName ?? 'there',
          placements,
          space?.name ?? 'an ARTINU space',
          space?.city ?? 'India',
          input.scheduledFor,
          space?.type === 'home_decor',
        );
      }
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'installation.scheduled',
      entity: 'installation',
      entityId: installation.id,
      meta: { orderId: order.id },
      ip: req.ip,
    });

    res.status(201).json(installation);
  }),
);

adminRouter.get(
  '/printing',
  requireModule('printing'),
  asyncHandler(async (_req, res) => {
    const orders = await db.orders.find({
      filter: (order) => ['confirmed', 'printing', 'framing'].includes(order.status),
      orderBy: { field: 'placedAt', direction: 'asc' },
    });

    const spaces = await db.spaces.find();
    const spaceById = new Map(spaces.map((space) => [space.id, space]));

    res.json(
      orders.map((order) => ({
        ...order,
        spaceName: spaceById.get(order.spaceId)?.name ?? 'Unknown space',
        spaceCity: spaceById.get(order.spaceId)?.city ?? '',
      })),
    );
  }),
);

// ── Moderation ───────────────────────────────────────────────────────────────

adminRouter.get(
  '/moderation',
  requireModule('moderation'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending_review';

    const artworks = await db.artworks.find({
      filter: status === 'all' ? undefined : (artwork) => artwork.status === status,
      orderBy: { field: 'createdAt', direction: 'asc' },
    });

    const result = paginate(artworks, page, pageSize);
    const profiles = await db.profiles.find();
    const users = await db.users.find({ where: { role: 'artist' } });
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));

    const items = await Promise.all(
      result.items.map(async (artwork) => {
        const user = users.find((candidate) => candidate.id === artwork.artistId);
        const profile = profileByUser.get(artwork.artistId);
        return {
          ...artwork,
          artist: user && profile ? await buildPublicArtist(user, profile) : null,
        };
      }),
    );

    res.json({ ...result, items });
  }),
);

adminRouter.post(
  '/moderation/:id',
  requireModule('moderation'),
  validate(artworkReviewSchema),
  asyncHandler(async (req, res) => {
    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');

    const { decision, note } = req.valid as { decision: 'approve' | 'reject'; note?: string | null };
    const approved = decision === 'approve';

    const updated = await db.artworks.update(artwork.id, {
      status: approved ? 'approved' : 'rejected',
      reviewNote: note ?? null,
      reviewedBy: req.user!.email,
      reviewedAt: now(),
      updatedAt: now(),
    });

    await notify({
      userId: artwork.artistId,
      type: approved ? 'upload_approved' : 'upload_rejected',
      title: approved ? `“${artwork.title}” is live` : `“${artwork.title}” was not published`,
      body: approved
        ? 'Your photograph is now in the gallery and can be selected by spaces.'
        : note || 'Our curation team could not publish this one.',
      link: approved ? '/studio/portfolio' : '/studio/submissions',
    });

    const artist = await db.users.byId(artwork.artistId);
    const artistProfile = artist ? await profileFor(artist.id) : null;
    if (artist) {
      void sendModerationDecision(
        artist.email,
        artistProfile?.fullName ?? 'there',
        artwork.title,
        approved,
        note,
      );
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: approved ? 'artwork.approved' : 'artwork.rejected',
      entity: 'artwork',
      entityId: artwork.id,
      meta: { note: note ?? null },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

// ── Artists and applications ─────────────────────────────────────────────────

adminRouter.get(
  '/artists',
  requireModule('artists'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const q = search(req.query.q);

    const [users, profiles, artistContext] = await Promise.all([
      db.users.find({ where: { role: 'artist' } }),
      db.profiles.find(),
      loadArtistContext(),
    ]);
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));

    let artists = await Promise.all(
      users
        .filter((user) => profileByUser.has(user.id))
        .map((user) => buildPublicArtist(user, profileByUser.get(user.id)!, undefined, artistContext)),
    );

    if (q) {
      artists = artists.filter((artist) =>
        `${artist.name} ${artist.city ?? ''} ${artist.genres.join(' ')}`.toLowerCase().includes(q),
      );
    }

    artists.sort((a, b) => b.artworkCount - a.artworkCount);
    res.json(paginate(artists, page, pageSize));
  }),
);

adminRouter.get(
  '/applications',
  requireModule('artists'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const applications = await db.applications.find({
      filter: status && status !== 'all' ? (entry) => entry.status === status : undefined,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    res.json(paginate(applications, page, pageSize));
  }),
);

adminRouter.post(
  '/applications/:id',
  requireModule('artists'),
  validate(
    z.object({
      decision: z.enum(['accept', 'reject']),
      note: z.string().max(600).optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const application = await db.applications.byId(req.params.id);
    if (!application) throw notFound('That application');

    const { decision, note } = req.valid as { decision: 'accept' | 'reject'; note?: string | null };

    if (decision === 'reject') {
      const updated = await db.applications.update(application.id, {
        status: 'rejected',
        reviewNote: note ?? null,
        updatedAt: now(),
      });

      void sendMail({
        to: application.email,
        subject: 'About your ARTINU application',
        heading: 'Thank you for applying.',
        body:
          note ||
          'We have reviewed your portfolio carefully. It is not a fit for the collection right now, but we would genuinely welcome another application in six months.',
      });

      await recordAudit({
        actor: { id: req.user!.id, email: req.user!.email },
        action: 'application.rejected',
        entity: 'application',
        entityId: application.id,
        ip: req.ip,
      });

      res.json(updated);
      return;
    }

    // Accepting creates the artist's account and emails them a set-password link.
    let user = await findByEmail(application.email);
    if (!user) {
      user = await createUser({
        email: application.email,
        password: temporaryPassword(),
        role: 'artist',
        emailVerified: true,
      });

      const [city, country] = application.location.split(',').map((part) => part.trim());
      await createProfile(user.id, {
        fullName: application.fullName,
        displayName: application.fullName,
        city: city ?? application.location,
        country: country ?? null,
        bio: application.journey.slice(0, 400),
        website: application.website ?? null,
        instagram: application.instagram ?? null,
        genres: application.genres,
        avatarUrl: application.portfolioUrls[0] ?? null,
      });

      const reset = await issueToken(user.id, 'password_reset', 60 * 24 * 7);
      void sendPasswordResetEmail(user.email, application.fullName, reset.token);
    }

    const updated = await db.applications.update(application.id, {
      status: 'accepted',
      reviewNote: note ?? null,
      updatedAt: now(),
    });

    await notify({
      userId: user.id,
      type: 'application_update',
      title: 'Welcome to ARTINU',
      body: 'Your application was accepted. Set your password from the email we just sent and upload your first photographs.',
      link: '/studio/upload',
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'application.accepted',
      entity: 'application',
      entityId: application.id,
      meta: { userId: user.id },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

// ── Spaces and consultations ─────────────────────────────────────────────────

adminRouter.get(
  '/spaces',
  requireModule('spaces'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const q = search(req.query.q);
    const onlyUnverified = req.query.unverified === 'true';

    const profiles = await db.profiles.find();
    const nameByUser = new Map(profiles.map((profile) => [profile.userId, profile.fullName]));
    const orders = await db.orders.find();

    const spaces = await db.spaces.find({
      filter: (space) => {
        if (onlyUnverified && space.verified) return false;
        if (!q) return true;
        return `${space.name} ${space.city} ${space.type}`.toLowerCase().includes(q);
      },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const result = paginate(spaces, page, pageSize);
    res.json({
      ...result,
      items: result.items.map((space) => ({
        ...space,
        ownerName: nameByUser.get(space.ownerId) ?? 'Unknown',
        orderCount: orders.filter((order) => order.spaceId === space.id).length,
      })),
    });
  }),
);

adminRouter.post(
  '/spaces/:id/verify',
  requireModule('spaces'),
  validate(z.object({ verified: z.boolean() })),
  asyncHandler(async (req, res) => {
    const space = await db.spaces.byId(req.params.id);
    if (!space) throw notFound('That space');

    const { verified } = req.valid as { verified: boolean };
    const updated = await db.spaces.update(space.id, { verified, updatedAt: now() });

    if (verified) {
      await notify({
        userId: space.ownerId,
        type: 'system',
        title: `${space.name} is verified`,
        body: 'Your space is confirmed. You can order a collection whenever you are ready.',
        link: '/space/collections',
      });
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'space.verified',
      entity: 'space',
      entityId: space.id,
      meta: { verified },
      ip: req.ip,
    });

    res.json(updated);
  }),
);

adminRouter.get(
  '/consultations',
  requireModule('spaces'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const consultations = await db.consultations.find({
      filter: status && status !== 'all' ? (entry) => entry.status === status : undefined,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    res.json(paginate(consultations, page, pageSize));
  }),
);

adminRouter.post(
  '/consultations/:id',
  requireModule('spaces'),
  validate(z.object({ status: z.enum(['new', 'scheduled', 'completed', 'cancelled']) })),
  asyncHandler(async (req, res) => {
    const consultation = await db.consultations.byId(req.params.id);
    if (!consultation) throw notFound('That consultation');

    const { status } = req.valid as { status: 'new' | 'scheduled' | 'completed' | 'cancelled' };
    const updated = await db.consultations.update(consultation.id, { status });

    if (status === 'scheduled') {
      void sendMail({
        to: consultation.email,
        subject: 'Your ARTINU consultation is confirmed',
        heading: 'You are booked in.',
        body: `We will see you on ${consultation.preferredDate} at ${consultation.preferredSlot}, ${
          consultation.mode === 'video' ? 'over a video call' : 'at your space'
        }.`,
      });
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: `consultation.${status}`,
      entity: 'consultation',
      entityId: consultation.id,
      ip: req.ip,
    });

    res.json(updated);
  }),
);

// ── Payments, payouts ────────────────────────────────────────────────────────

adminRouter.get(
  '/payments',
  requireModule('payments'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const payments = await db.payments.find({
      filter: status && status !== 'all' ? (payment) => payment.status === status : undefined,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const orders = await db.orders.find();
    const referenceById = new Map(orders.map((order) => [order.id, order.reference]));

    const result = paginate(payments, page, pageSize);
    res.json({
      ...result,
      items: result.items.map((payment) => ({
        ...payment,
        // The QR is large and irrelevant in a list — drop it.
        qrImageDataUrl: null,
        orderReference: referenceById.get(payment.orderId) ?? '-',
      })),
    });
  }),
);

/**
 * Refunds.
 *
 * The published Refund Policy promises money back on cancellation, damage and
 * failed delivery — but nothing could mark a payment refunded, so the promise
 * was unenforceable. This records the decision, the amount and the reason, and
 * tells the customer. Moving the money still happens in the payment provider's
 * dashboard: recording a refund here that was never actually paid out would be
 * worse than not having the button, so the note says so explicitly.
 */
adminRouter.post(
  '/payments/:id/refund',
  requireModule('accounts'),
  validate(
    z.object({
      amount: z.coerce.number().positive().optional(),
      reason: z.string().min(4, 'Say why - the customer sees this.').max(400),
    }),
  ),
  asyncHandler(async (req, res) => {
    const payment = await db.payments.byId(req.params.id);
    if (!payment) throw notFound('That payment');
    if (payment.status !== 'succeeded') {
      throw badRequest('Only a successful payment can be refunded.');
    }

    const { amount, reason } = req.valid as { amount?: number; reason: string };
    const refunded = amount ?? payment.amount;
    if (refunded > payment.amount) {
      throw badRequest('A refund cannot exceed what was paid.');
    }

    const updated = await db.payments.update(payment.id, {
      status: 'refunded',
      failureReason: `Refunded ${formatCurrency(refunded)} - ${reason}`,
      updatedAt: now(),
    });

    const order = await db.orders.byId(payment.orderId);
    if (order && order.status !== 'cancelled' && order.status !== 'completed') {
      await advanceOrder(order, 'cancelled', {
        note: `Refunded: ${reason}`,
        by: req.user!.email,
      });
    }

    if (order) {
      await notify({
        userId: order.ownerId,
        type: 'payment_received',
        title: `Refund issued for ${order.reference}`,
        body: `${formatCurrency(refunded)} is on its way back to you. ${reason}`,
        link: `/space/orders/${order.id}`,
      });

      const owner = await db.users.byId(order.ownerId);
      if (owner) {
        const ownerProfile = await profileFor(order.ownerId);
        void sendMail({
          to: owner.email,
          subject: `Refund issued - ${order.reference}`,
          heading: `${formatCurrency(refunded)} is being returned.`,
          body: `${ownerProfile?.fullName ?? 'Hello'}, we have issued a refund on order ${order.reference}.

${reason}

It goes back to the method you paid with. UPI usually settles in three to five working days; cards can take up to ten.`,
          cta: { label: 'View the order', url: `${env.CLIENT_URL}/space/orders/${order.id}` },
        });
      }
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'payment.refunded',
      entity: 'payment',
      entityId: payment.id,
      meta: { amount: refunded, reason, orderId: payment.orderId },
      ip: req.ip,
    });

    res.json({
      payment: updated,
      note: 'Recorded in ARTINU. Move the money in your payment provider to complete it.',
    });
  }),
);

adminRouter.get(
  '/payouts',
  requireModule('accounts'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const payouts = await db.payouts.find({
      filter: status && status !== 'all' ? (payout) => payout.status === status : undefined,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const profiles = await db.profiles.find();
    const nameByUser = new Map(
      profiles.map((profile) => [profile.userId, profile.displayName || profile.fullName]),
    );
    const orders = await db.orders.find();
    const referenceById = new Map(orders.map((order) => [order.id, order.reference]));

    const result = paginate(payouts, page, pageSize);
    res.json({
      ...result,
      items: result.items.map((payout) => ({
        ...payout,
        artistName: nameByUser.get(payout.artistId) ?? 'ARTINU artist',
        orderReference: payout.orderId ? (referenceById.get(payout.orderId) ?? '-') : '-',
      })),
    });
  }),
);

/*
  The "mark this payout paid" route is gone, along with the payout it settled.

  ARTINU does not pay photographers. The endpoint existed to move a payout row
  to 'paid', notify the artist that "your earnings have been transferred" and
  email them an amount - three statements about money that was never going to
  move. Nothing opens a payout row any more (see settlement.service), so the
  route had nothing left to act on but historical rows, where marking one paid
  would have been simply untrue.

  The payouts table and its read-only listing above are left in place so any
  historical row still reads back.
*/

/**
 * Take a photograph down, with a reason.
 *
 * ── Who ─────────────────────────────────────────────────────────────────────
 *
 * Manager, IT and CEO, named explicitly rather than gated on a module. The
 * only module all three share is `content`, which means the homepage - the
 * carousel and the collaborations - and hanging a takedown off it would give
 * anyone who could edit the homepage the power to remove a photographer's
 * work. These are different jobs and should not share a key.
 *
 * ── Archive, not delete ─────────────────────────────────────────────────────
 *
 * Same as the artist's own delete: the photograph may already be on an invoice
 * or hanging on a wall, and a row that vanishes takes the order history with
 * it. Archiving hides it from the gallery and stops it being selected again,
 * which is what "removed" actually needs to mean.
 *
 * ── The reason is mandatory ─────────────────────────────────────────────────
 *
 * Not optional, not defaulted. It is the only thing the photographer will be
 * told, and a takedown with no explanation is how you lose the person who
 * uploaded it. It is stored on the audit record and sent to them verbatim.
 */
adminRouter.delete(
  '/artworks/:id',
  requireRole('ceo', 'manager', 'it_team'),
  validate(
    z.object({
      reason: z
        .string()
        .trim()
        .min(5, 'Give the photographer a reason - it is the only explanation they get')
        .max(400),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { reason } = req.valid as { reason: string };

    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');
    if (artwork.status === 'archived') {
      throw badRequest('That photograph has already been removed.');
    }

    const removed = await db.artworks.update(artwork.id, {
      status: 'archived',
      updatedAt: now(),
    });

    /*
      Tell the photographer, in the app and by email.

      The email is fire-and-forget: a takedown that has already been written to
      the database must not be reported as a failure because SMTP was down, and
      the notification below survives regardless.
    */
    await notify({
      userId: artwork.artistId,
      type: 'upload_rejected',
      title: `"${artwork.title}" has been removed`,
      body: reason,
      link: '/studio/portfolio',
    });

    const artist = await db.users.byId(artwork.artistId);
    if (artist) {
      const artistProfile = await profileFor(artwork.artistId);
      void sendArtworkRemoved(
        artist.email,
        artistProfile?.fullName ?? 'there',
        artwork.title,
        reason,
        artwork.photoId ?? null,
      );
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'artwork.removed',
      entity: 'artwork',
      entityId: artwork.id,
      meta: { reason, photoId: artwork.photoId ?? null, artistId: artwork.artistId },
      ip: req.ip,
    });

    res.json(removed);
  }),
);

/**
 * Release a payment somebody has checked against the account.
 *
 * ── Why these roles ─────────────────────────────────────────────────────────
 *
 * Manager and operations, plus the CEO. They are the two desks that actually
 * reconcile a UPI transfer - one opens the Google Pay ledger or the bank
 * statement, the other is holding an order that cannot go to print until the
 * money is confirmed. The `payments` MODULE is CEO and accounts only, so
 * gating on it would have locked out both of the people who do this job.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 *
 * Hands off to `settlePayment`, the same function a real gateway webhook uses.
 * That is deliberate: the invoice, the artist notifications, the order advance
 * and the audit entry all happen in one place, so a manually verified payment
 * is indistinguishable downstream from a gateway one.
 */
adminRouter.post(
  '/payments/:id/verify',
  requireRole('ceo', 'manager', 'operations'),
  asyncHandler(async (req, res) => {
    const payment = await db.payments.byId(req.params.id);
    if (!payment) throw notFound('That payment');

    if (payment.status === 'succeeded') {
      throw badRequest('That payment has already been verified.');
    }
    if (payment.status !== 'verifying') {
      throw badRequest('That payment is not waiting to be verified.');
    }

    const order = await db.orders.byId(payment.orderId);
    if (!order) throw notFound('The order for that payment');

    const settled = await settlePayment(payment, order, null, {
      reference: payment.reference,
      actor: { id: req.user!.id, email: req.user!.email },
      ip: req.ip,
    });

    res.json(settled);
  }),
);

/**
 * The money did not arrive, or the reference does not match anything.
 *
 * The reason is required and is sent to the customer: somebody who believes
 * they have paid needs to know what to do next, and "rejected" on its own
 * tells them nothing. The order returns to `payment_failed`, which is the same
 * state a declined card leaves it in, so they can retry from their order.
 */
adminRouter.post(
  '/payments/:id/reject',
  requireRole('ceo', 'manager', 'operations'),
  validate(
    z.object({
      reason: z
        .string()
        .trim()
        .min(5, 'Say why, so the customer knows what to do next')
        .max(400),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { reason } = req.valid as { reason: string };

    const payment = await db.payments.byId(req.params.id);
    if (!payment) throw notFound('That payment');
    if (payment.status !== 'verifying') {
      throw badRequest('That payment is not waiting to be verified.');
    }

    const order = await db.orders.byId(payment.orderId);
    if (!order) throw notFound('The order for that payment');

    const rejected = await db.payments.update(payment.id, {
      status: 'failed',
      failureReason: reason,
      updatedAt: now(),
    });
    const failedOrder = await advanceOrder(order, 'payment_failed', { note: reason });

    await notify({
      userId: order.ownerId,
      type: 'payment_failed',
      title: `We could not confirm your payment for ${order.reference}`,
      body: `${reason} You can submit a new reference or pay again from your order.`,
      link: `/space/orders/${order.id}`,
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'payment.rejected',
      entity: 'payment',
      entityId: payment.id,
      meta: { reason, reference: payment.reference, amount: payment.amount },
      ip: req.ip,
    });

    res.json({ payment: rejected, order: failedOrder });
  }),
);

/**
 * Coupons: list, create, update, deactivate.
 *
 * ── Who ─────────────────────────────────────────────────────────────────────
 *
 * CEO, manager and IT, named explicitly. A coupon is money off a real order,
 * so this is deliberately not hung on a broad module that other roles happen
 * to share.
 *
 * ── Why there is no delete ──────────────────────────────────────────────────
 *
 * Deactivating stops a code working immediately and keeps the record of what
 * it was worth. Deleting one that has already discounted orders leaves those
 * orders pointing at a code nobody can look up.
 */
adminRouter.get(
  '/coupons',
  requireRole('ceo', 'manager', 'it_team'),
  asyncHandler(async (_req, res) => {
    const coupons = await db.coupons.find({
      orderBy: { field: 'createdAt', direction: 'desc' },
    });
    res.json(coupons);
  }),
);

const couponBody = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    // Stored upper case so lookup never depends on how it was typed.
    .transform((value) => value.toUpperCase()),
  type: z.enum(['percent', 'flat']),
  value: z.coerce.number().positive(),
  label: z.string().trim().min(3).max(120),
  active: z.boolean().default(true),
  startsAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  minOrderAmount: z.coerce.number().nonnegative().optional().nullable(),
  maxDiscount: z.coerce.number().positive().optional().nullable(),
  categories: z.array(z.string()).default([]),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
});

adminRouter.post(
  '/coupons',
  requireRole('ceo', 'manager', 'it_team'),
  validate(couponBody),
  asyncHandler(async (req, res) => {
    const input = req.valid as z.infer<typeof couponBody>;

    // A percentage over 100 discounts more than the order is worth.
    if (input.type === 'percent' && input.value > 100) {
      throw badRequest('A percentage discount cannot be more than 100%.');
    }

    const clash = await findCoupon(input.code);
    if (clash) throw badRequest('That code already exists.');

    const coupon = await db.coupons.insert({
      ...input,
      usedCount: 0,
      createdAt: now(),
      updatedAt: now(),
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'coupon.created',
      entity: 'coupon',
      entityId: coupon.id,
      meta: { code: coupon.code, type: coupon.type, value: coupon.value },
      ip: req.ip,
    });

    res.status(201).json(coupon);
  }),
);

adminRouter.patch(
  '/coupons/:id',
  requireRole('ceo', 'manager', 'it_team'),
  validate(couponBody.partial()),
  asyncHandler(async (req, res) => {
    const existing = await db.coupons.byId(req.params.id);
    if (!existing) throw notFound('That coupon');

    const updated = await db.coupons.update(existing.id, {
      ...(req.valid as Record<string, unknown>),
      updatedAt: now(),
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'coupon.updated',
      entity: 'coupon',
      entityId: existing.id,
      meta: req.valid as Record<string, unknown>,
      ip: req.ip,
    });

    res.json(updated);
  }),
);

// ── Users, audit, system ─────────────────────────────────────────────────────

adminRouter.get(
  '/users',
  requireModule('users'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = search(req.query.q);

    const profiles = await db.profiles.find();
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));

    const users = await db.users.find({
      filter: (user) => {
        if (role && role !== 'all' && user.role !== role) return false;
        if (status && status !== 'all' && user.status !== status) return false;
        if (!q) return true;
        const profile = profileByUser.get(user.id);
        return `${user.email} ${profile?.fullName ?? ''}`.toLowerCase().includes(q);
      },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    const result = paginate(users, page, pageSize);
    res.json({
      ...result,
      items: result.items.map((user) => ({
        ...sanitizeUser(user),
        profile: profileByUser.get(user.id) ?? null,
      })),
    });
  }),
);

adminRouter.post(
  '/users',
  requireModule('users'),
  validate(
    z.object({
      email: z.string().email('Enter a valid work email address'),
      role: z.enum(ROLES as unknown as [string, ...string[]]),
      fullName: z.string().trim().min(1).max(120).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { email, role, fullName } = req.valid as {
      email: string;
      role: Role;
      fullName?: string;
    };

    if (await findByEmail(email)) {
      throw conflict('An account already exists for that email address.');
    }

    // New employees start with a temporary password and are told how to set
    // their own; same flow that accepting an application uses.
    const user = await createUser({
      email,
      password: temporaryPassword(),
      role,
      emailVerified: true,
    });

    if (role === 'it_team') {
      await db.users.update(user.id, { status: 'pending_ceo_approval' });
      user.status = 'pending_ceo_approval';
    }

    if (fullName) {
      await createProfile(user.id, { fullName, displayName: fullName });
    }

    const reset = await issueToken(user.id, 'password_reset', 60 * 24 * 7);
    void sendPasswordResetEmail(user.email, fullName ?? 'there', reset.token);

    await notify({
      userId: user.id,
      type: 'system',
      title: 'Welcome to ARTINU',
      body: 'An administrator created your account. Set your password from the email we just sent.',
      link: '/login',
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'user.created',
      entity: 'user',
      entityId: user.id,
      meta: { email: user.email, role: user.role },
      ip: req.ip,
    });

    res.status(201).json(sanitizeUser(user));
  }),
);

adminRouter.patch(
  '/users/:id',
  requireModule('users'),
  validate(
    z.object({
      role: z.enum(ROLES as unknown as [string, ...string[]]).optional(),
      status: z.enum(USER_STATUSES as unknown as [string, ...string[]]).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const target = await db.users.byId(req.params.id);
    if (!target) throw notFound('That user');

    const patch = req.valid as { role?: string; status?: string };

    // Nobody may change their own role — that is how an admin locks themselves
    // out, or quietly promotes themselves.
    if (target.id === req.user!.id && patch.role && patch.role !== target.role) {
      throw forbidden('You cannot change your own role.');
    }

    const updated = await db.users.update(target.id, patch as never);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'user.updated',
      entity: 'user',
      entityId: target.id,
      meta: { from: { role: target.role, status: target.status }, to: patch },
      ip: req.ip,
    });

    if (patch.role && patch.role !== target.role) {
      await notify({
        userId: target.id,
        type: 'system',
        title: 'Your access has changed',
        body: `Your role is now ${patch.role.replace('_', ' ')}.`,
      });
    }

    res.json(sanitizeUser(updated));
  }),
);

/**
 * Permanently delete an account and everything belonging to it.
 *
 * Reachable by the roles that already hold the `users` module — CEO and IT.
 * Irreversible, so the guards below matter more than the deletion itself:
 * neither an accidental self-delete nor the removal of the last CEO can be
 * undone from inside the product.
 */
adminRouter.delete(
  '/users/:id',
  requireModule('users'),
  asyncHandler(async (req, res) => {
    const target = await db.users.byId(req.params.id);
    if (!target) throw notFound('That user');

    // Deleting yourself ends your own session mid-request and cannot be undone.
    if (target.id === req.user!.id) {
      throw forbidden('You cannot delete your own account.');
    }

    // The CEO role is the only one that reaches every module. Removing the last
    // one leaves nobody able to restore it.
    if (target.role === 'ceo') {
      const remaining = await db.users.count({ role: 'ceo' } as never);
      if (remaining <= 1) {
        throw forbidden('This is the last CEO account. Assign the role to someone else first.');
      }
    }

    // Recorded before the rows go, so the trail survives the account.
    // audit_logs.actor_id is ON DELETE SET NULL for exactly this reason.
    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'user.deleted',
      entity: 'user',
      entityId: target.id,
      meta: { email: target.email, role: target.role, status: target.status },
      ip: req.ip,
    });

    const summary = await deleteAccountCompletely(target.id);

    logger.warn(
      `Account ${summary.email} (${summary.role}) permanently deleted by ${req.user!.email} - ` +
        `${summary.artworks} artworks, ${summary.orders} orders, ${summary.invoices} invoices, ` +
        `${summary.spaces} spaces, ${summary.filesRemoved} files`,
    );

    res.json(summary);
  }),
);

adminRouter.get(
  '/audit',
  requireModule('users'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageOf(req);
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const q = search(req.query.q);

    const entries = await db.auditLogs.find({
      filter: (entry) => {
        if (action && action !== 'all' && entry.action !== action) return false;
        if (!q) return true;
        return `${entry.actorEmail ?? ''} ${entry.action} ${entry.entity}`.toLowerCase().includes(q);
      },
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    res.json(paginate(entries, page, pageSize));
  }),
);

/**
 * The development inbox. Every message the app has sent, with the rendered HTML,
 * so flows can be verified without a mail provider — and audited once there is one.
 */
adminRouter.get(
  '/mail',
  requireModule('system'),
  asyncHandler(async (req, res) => {
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const actor = typeof req.query.actor === 'string' ? req.query.actor : undefined;
    const requestId = typeof req.query.requestId === 'string' ? req.query.requestId : undefined;
    const limit = Math.min(200, Number(req.query.limit ?? 100));

    res.json({
      ...(await mailboxSummaryDurable()),
      // Kept under its original name so the Console contract does not change;
      // it now means "a real provider is configured", SendGrid or SMTP.
      smtpConfigured: env.mailConfigured,
      mailProvider: env.MAIL_PROVIDER,
      // The HTML body is large; it is fetched per message instead.
      items: (await listMailDurable({ to, actor, requestId, limit })).map(
        ({ html: _html, ...rest }) => rest,
      ),
    });
  }),
);

adminRouter.get(
  '/mail/:id',
  requireModule('system'),
  asyncHandler(async (req, res) => {
    const mail = await getMailDurable(req.params.id);
    if (!mail) throw notFound('That email');
    res.json(mail);
  }),
);

/** One-click proof that SMTP is actually wired up, before running a real flow. */
adminRouter.post(
  '/mail/test',
  requireModule('system'),
  validate(z.object({ to: z.string().email('Enter a valid email address') })),
  asyncHandler(async (req, res) => {
    const { to } = req.valid as { to: string };

    const result = await sendMail({
      to,
      subject: 'ARTINU mail test',
      heading: 'Your mail setup works.',
      body: `If you are reading this in your inbox, ARTINU can send email through your provider.

Sent at ${new Date().toISOString()} by ${req.user!.email}.`,
      cta: { label: 'Open the Console', url: `${env.CLIENT_URL}/console/system/mail` },
      footnote: 'You can trigger this from Console → System → Email Log.',
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'mailbox.test_sent',
      entity: 'system',
      meta: { to, delivered: result.delivered },
      ip: req.ip,
    });

    res.json({
      ...result,
      smtpConfigured: env.mailConfigured,
      mailProvider: env.MAIL_PROVIDER,
      message: result.delivered
        ? `Sent to ${to} via ${env.MAIL_PROVIDER}. Check the inbox - and the spam folder.`
        : env.mailConfigured
          ? `${env.MAIL_PROVIDER} rejected it. The server log has the reason - an unverified sender is the usual cause.`
          : 'No mail provider configured, so it was captured here instead of being delivered.',
    });
  }),
);

adminRouter.post(
  '/mail/clear',
  requireModule('system'),
  asyncHandler(async (req, res) => {
    const cleared = clearMail();
    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'mailbox.cleared',
      entity: 'system',
      meta: { cleared },
      ip: req.ip,
    });
    res.json({ cleared });
  }),
);

adminRouter.get(
  '/system',
  requireModule('system'),
  asyncHandler(async (_req, res) => {
    const memory = process.memoryUsage();
    res.json({
      uptime: Math.round(process.uptime()),
      startedAt: metrics.startedAt,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
      },
      drivers: driverSummary,
      requestCount: metrics.requests,
      errorCount: metrics.errors,
      recentErrors,
      routes: [...API_ROUTES],
      node: process.version,
    });
  }),
);

/**
 * Register a space on an owner's behalf.
 *
 * ── Why this was rewritten rather than wired up ────────────────────────────
 *
 * A route with this path already existed and nothing called it, which turned
 * out to be a mercy. It could not work on Postgres: it supplied
 * `id: \`spc_${now()}\``, and `now()` is an ISO timestamp, so the insert into a
 * `uuid primary key` column fails with SQLSTATE 22P02. Worse, the insert was
 * NOT awaited, so that failure became an unhandled rejection while the handler
 * cheerfully returned `{ ok: true }`. On the memory driver it appeared to work;
 * against the real database it created an owner with no space and reported
 * success.
 *
 * The rest of what it did wrong, all now fixed:
 *
 *   - It emailed the plaintext password. Mail cannot be recalled; the password
 *     is returned once, in the response, for staff to read out.
 *   - It never set `mustChangePassword`, so a generated password became a
 *     permanent one.
 *   - It never allocated a space code, so the row showed "-" in the console.
 *   - It wrote a row `spaceSchema` rejects - empty phone, empty photographs,
 *     the address duplicated into the city, and a withdrawn 3-month cadence -
 *     so the space broke the first time its owner opened their own edit form.
 *   - It set `verified: true`, bypassing the verification step the Verify
 *     button exists to perform.
 *   - It refused an email that already had an account, when a chain with three
 *     cafés is one owner with three spaces.
 *   - Its audit row was `entity: 'system'` with no id, so it could not be found.
 *   - If any write failed, the half-created user permanently burned the email
 *     address: `findByEmail` then rejected every retry.
 */
adminRouter.post(
  '/spaces/provision',
  requireModule('spaces'),
  validate(adminProvisionSpaceSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as AdminProvisionSpaceInput;
    const { ownerName, ownerEmail, ownerPhone, ...space } = input;

    /*
      An existing owner gets another space, not a 409.

      This is the common case rather than the edge case: the people who ask
      staff to set things up for them are the ones opening their second and
      third café.
    */
    const existing = await findByEmail(ownerEmail);
    const ownerExisted = Boolean(existing);

    let owner = existing;
    let temporary: string | null = null;

    if (!owner) {
      temporary = issuedPassword();
      owner = await createUser({
        email: ownerEmail,
        password: temporary,
        role: 'space_owner',
        emailVerified: true,
        // Staff generated this password and will read it down a phone. It is a
        // way in, not a credential - the owner sets a real one on first sign-in.
        mustChangePassword: true,
      });
      await createProfile(owner.id, { fullName: ownerName, phone: ownerPhone ?? null });
    } else if (owner.role !== 'space_owner') {
      throw conflict(
        `${ownerEmail} already has an ARTINU account, but it is not a space owner account.`,
      );
    }

    let created;
    try {
      created = await db.spaces.insert({
        // No `id`. The table layer fills it with a real uuid - see the note above.
        ownerId: owner.id,
        name: space.name,
        type: space.type,
        theme: space.theme ?? null,
        cuisine: space.cuisine ?? null,
        wallColor: space.wallColor ?? null,
        lighting: space.lighting ?? null,
        addressLine1: space.addressLine1,
        addressLine2: space.addressLine2 ?? null,
        city: space.city,
        state: space.state ?? null,
        pin: space.pin || null,
        contactName: space.contactName,
        contactPhone: space.contactPhone,
        contactEmail: space.contactEmail,
        wallCount: space.wallCount ?? null,
        imageUrls: space.imageUrls ?? [],
        rotationIntervalMonths: space.rotationIntervalMonths,
        // Staff entering a room they visited is not the same as verifying it.
        verified: false,
        createdAt: now(),
        updatedAt: now(),
      });
    } catch (error) {
      /*
        Roll the new account back.

        Without this a failed space insert leaves a user and profile committed
        on that email address, and every retry is refused by findByEmail above -
        the address is burned and the owner can never be registered again.
        Only a NEW account is removed; an existing owner is left alone.
      */
      if (!ownerExisted && owner) {
        /*
          The profile is keyed by its OWN uuid with `userId` as a separate
          column, so it has to be looked up rather than removed by the user id -
          `db.profiles.remove(owner.id)` deletes nothing and leaves an orphan.
        */
        const profile = await db.profiles.findOne({ userId: owner.id }).catch(() => null);
        if (profile) await db.profiles.remove(profile.id).catch(() => undefined);
        await db.users.remove(owner.id).catch(() => undefined);
        logger.warn(`Rolled back the account for ${ownerEmail} after the space insert failed.`);
      }
      throw error;
    }

    // Never blocking: a project that has not run migration 006 gets a null code
    // and a working space rather than a failed creation.
    const spaceCode = await ensureSpaceCode(created).catch((error) => {
      logger.error(`Could not allocate a space ID for ${created.name}`, error);
      return null;
    });

    if (!ownerExisted) {
      void sendWelcomeEmailOnce(owner, ownerName, 'space_owner');
    }

    await notify({
      userId: owner.id,
      type: 'system',
      title: ownerExisted ? `${created.name} was added to your account` : 'Welcome to ARTINU',
      body: 'Add a few photographs of the room so we can curate a collection that actually fits it.',
      link: '/space/register-space',
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'space.provisioned',
      entity: 'space',
      entityId: created.id,
      meta: { ownerEmail, ownerExisted, spaceCode },
      ip: req.ip,
    });

    res.status(201).json({
      space: created,
      spaceCode,
      ownerExisted,
      // Read it out, then it is gone. Deliberately not emailed.
      temporaryPassword: temporary,
    });
  }),
);
