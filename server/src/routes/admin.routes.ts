import {
  API_ROUTES,
  artworkReviewSchema,
  formatCurrency,
  ORDER_STATUS_LABELS,
  ROLE_MODULES,
  ROLES,
  updateOrderCostSchema,
  updateOrderStatusSchema,
  USER_STATUSES,
  type Artwork,
  type CostBreakdown,
  type OrderStatus,
  type Role,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { driverSummary, env } from '@/config/env';
import { clearMail, getMail, listMail, mailboxSummary } from '@/services/mailbox.service';
import { db } from '@/database/db';
import { paginate } from '@/database/table';
import {
  asyncHandler,
  metrics,
  recentErrors,
  requireInternal,
  requireModule,
  validate,
} from '@/middleware/index';
import { badRequest, conflict, forbidden, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import {
  consoleAnalytics,
  reportBundle,
} from '@/services/analytics.service';
import { recordAudit, recentAudit } from '@/services/audit.service';
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
  sendInstallationUpdate,
  sendMail,
  sendModerationDecision,
  sendPasswordResetEmail,
  sendPayoutProcessed,
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
      title: `${order.reference} — ${ORDER_STATUS_LABELS[status] ?? status}`,
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
      const theirTitles = order.items
        .filter((item) => item.artistId === artistId)
        .map((item) => `“${item.artworkTitle}”`)
        .join(', ');

      if (artistUser) {
        const theirProfile = await profileFor(artistId);
        void sendArtistInstallationUpdate(
          artistUser.email,
          theirProfile?.fullName ?? 'there',
          theirTitles,
          space?.name ?? 'an ARTINU space',
          space?.city ?? 'India',
          input.scheduledFor,
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
        orderReference: referenceById.get(payment.orderId) ?? '—',
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
      reason: z.string().min(4, 'Say why — the customer sees this.').max(400),
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
      failureReason: `Refunded ${formatCurrency(refunded)} — ${reason}`,
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
          subject: `Refund issued — ${order.reference}`,
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
        orderReference: payout.orderId ? (referenceById.get(payout.orderId) ?? '—') : '—',
      })),
    });
  }),
);

adminRouter.post(
  '/payouts/:id/pay',
  requireModule('accounts'),
  asyncHandler(async (req, res) => {
    const payout = await db.payouts.byId(req.params.id);
    if (!payout) throw notFound('That payout');
    if (payout.status === 'paid') throw badRequest('That payout has already been paid.');

    const updated = await db.payouts.update(payout.id, { status: 'paid', paidAt: now() });

    await notify({
      userId: payout.artistId,
      type: 'payout_processed',
      title: 'Your payout has been sent',
      body: `Your earnings for ${payout.periodLabel} have been transferred.`,
      link: '/studio/payouts',
    });

    const paidArtist = await db.users.byId(payout.artistId);
    if (paidArtist) {
      const paidProfile = await profileFor(payout.artistId);
      void sendPayoutProcessed(
        paidArtist.email,
        paidProfile?.fullName ?? 'there',
        payout.amount,
        payout.periodLabel,
      );
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'payout.paid',
      entity: 'payout',
      entityId: payout.id,
      meta: { amount: payout.amount, artistId: payout.artistId },
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
      ...mailboxSummary(),
      // Kept under its original name so the Console contract does not change;
      // it now means "a real provider is configured", SendGrid or SMTP.
      smtpConfigured: env.mailConfigured,
      mailProvider: env.MAIL_PROVIDER,
      // The HTML body is large; it is fetched per message instead.
      items: listMail({ to, actor, requestId, limit }).map(({ html: _html, ...rest }) => rest),
    });
  }),
);

adminRouter.get(
  '/mail/:id',
  requireModule('system'),
  asyncHandler(async (req, res) => {
    const mail = getMail(req.params.id);
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
        ? `Sent to ${to} via ${env.MAIL_PROVIDER}. Check the inbox — and the spam folder.`
        : env.mailConfigured
          ? `${env.MAIL_PROVIDER} rejected it. The server log has the reason — an unverified sender is the usual cause.`
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

adminRouter.post(
  '/spaces/provision',
  requireModule('spaces'),
  validate(
    z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      businessName: z.string().min(2),
      location: z.string().min(2),
    })
  ),
  asyncHandler(async (req, res) => {
    const { fullName, email, businessName, location } = req.valid as {
      fullName: string;
      email: string;
      businessName: string;
      location: string;
    };

    const existing = await findByEmail(email);
    if (existing) {
      throw conflict('A user with that email already exists.');
    }

    const password = temporaryPassword();
    const user = await createUser({
      email,
      password,
      role: 'space_owner',
      emailVerified: true,
    });

    await createProfile(user.id, {
      fullName,
    });

    db.spaces.insert({
      id: `spc_${now()}`,
      ownerId: user.id,
      name: businessName,
      type: 'cafe',
      addressLine1: location,
      city: location,
      contactName: fullName,
      contactEmail: email,
      contactPhone: '',
      verified: true,
      imageUrls: [],
      rotationIntervalMonths: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await sendMail({
      to: email,
      subject: 'Welcome to ARTINU',
      heading: 'Your space has been provisioned.',
      body: `Your manager has created a space account for you.\n\nEmail: ${email}\nPassword: ${password}\n\nPlease sign in and change your password.`,
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'user.provisioned',
      entity: 'system',
      meta: { email, role: 'space_owner' },
      ip: req.ip,
    });

    res.json({ ok: true, userId: user.id });
  })
);
