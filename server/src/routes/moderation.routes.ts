import {
  REMOVAL_REQUEST_STATUSES,
  WARNING_CATEGORIES,
  WARNING_LIMIT,
  type RemovalRequestStatus,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { asyncHandler, requireAuth, requireRole, validate } from '@/middleware/index';
import { notFound } from '@/utils/errors';
import {
  banAccount,
  issueWarning,
  listWarnings,
  restoreAccount,
  suspendAccount,
  withdrawWarning,
} from '@/services/enforcement.service';
import {
  createRemovalRequest,
  listMyRemovalRequests,
  listRemovalRequests,
  markPhysicallyRemoved,
  overdueRemovals,
  updateRemovalStatus,
} from '@/services/removal.service';
import { runNewAccountSweep, runInactivitySweep } from '@/services/lifecycle.service';

export const moderationRouter = Router();

/**
 * Community Guidelines enforcement.
 *
 * ── Two audiences, split by prefix ──────────────────────────────────────────
 *
 * `/me/*` is what a photographer can reach: their own warnings, and their own
 * removal requests. Everything else requires staff, enforced here on the server
 * with `requireRole` rather than by hiding buttons in the console.
 *
 * The roles allowed to enforce are the three that can already reach moderation
 * elsewhere in the product — CEO, manager and IT. Accounts and operations are
 * staff but have no reason to suspend a photographer.
 */

const ENFORCERS = ['ceo', 'manager', 'it_team'] as const;

// ── What a photographer can see about themselves ────────────────────────────

/** My warnings. Read-only: a warning is not something its recipient can edit. */
moderationRouter.get(
  '/me/warnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const warnings = await listWarnings(req.user!.id);
    res.json({ items: warnings, count: warnings.length, limit: WARNING_LIMIT });
  }),
);

/** Marks them read, so the studio can stop drawing attention to them. */
moderationRouter.post(
  '/me/warnings/acknowledge',
  requireAuth,
  asyncHandler(async (req, res) => {
    const warnings = await listWarnings(req.user!.id);
    await Promise.all(
      warnings
        .filter((warning) => !warning.acknowledged)
        .map((warning) => db.warnings.update(warning.id, { acknowledged: true })),
    );
    res.json({ ok: true });
  }),
);

moderationRouter.get(
  '/me/removal-requests',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ items: await listMyRemovalRequests(req.user!.id) });
  }),
);

/** A photographer asking for their work, or their account, to be removed. */
moderationRouter.post(
  '/me/removal-requests',
  requireAuth,
  validate(
    z.object({
      kind: z.enum(['artwork', 'account']),
      artworkId: z.string().optional(),
      reason: z.string().trim().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const input = req.valid as { kind: 'artwork' | 'account'; artworkId?: string; reason?: string };
    const request = await createRemovalRequest({ ...input, userId: req.user!.id });
    res.status(201).json(request);
  }),
);

// ── Staff only, from here down ──────────────────────────────────────────────

moderationRouter.use(requireAuth, requireRole(...ENFORCERS));

/**
 * One photographer, with everything a reviewer needs on one screen: how long
 * they have been here, whether they verified, what they have uploaded, and
 * every warning against them.
 */
moderationRouter.get(
  '/artists/:id',
  asyncHandler(async (req, res) => {
    const user = await db.users.byId(req.params.id);
    if (!user) throw notFound('That account');

    const [profile, warnings, artworks, removals] = await Promise.all([
      db.profiles.findOne({ userId: user.id }),
      listWarnings(user.id),
      db.artworks.find({ where: { artistId: user.id } }),
      listMyRemovalRequests(user.id),
    ]);

    const byStatus = artworks.reduce<Record<string, number>>((counts, artwork) => {
      counts[artwork.status] = (counts[artwork.status] ?? 0) + 1;
      return counts;
    }, {});

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        statusReason: user.statusReason ?? null,
        statusChangedAt: user.statusChangedAt ?? null,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
      },
      profile: profile
        ? {
            fullName: profile.fullName,
            displayName: profile.displayName ?? null,
            photographerCode: profile.photographerCode ?? null,
            guidelinesVersion: profile.guidelinesVersion ?? null,
            guidelinesAcceptedAt: profile.guidelinesAcceptedAt ?? null,
          }
        : null,
      artworks: { total: artworks.length, byStatus },
      warnings,
      warningLimit: WARNING_LIMIT,
      eligibleForEnforcement: warnings.length >= WARNING_LIMIT,
      removalRequests: removals,
    });
  }),
);

moderationRouter.post(
  '/artists/:id/warnings',
  validate(
    z.object({
      reason: z.string().trim().min(5, 'Say why this warning is being issued').max(600),
      category: z.enum(WARNING_CATEGORIES).optional(),
      notes: z.string().trim().max(1000).optional(),
      artworkId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const input = req.valid as {
      reason: string;
      category?: (typeof WARNING_CATEGORIES)[number];
      notes?: string;
      artworkId?: string;
    };

    const outcome = await issueWarning({
      ...input,
      userId: req.params.id,
      actor: { id: req.user!.id, email: req.user!.email },
    });

    res.status(201).json(outcome);
  }),
);

moderationRouter.delete(
  '/warnings/:id',
  asyncHandler(async (req, res) => {
    await withdrawWarning(req.params.id, { id: req.user!.id, email: req.user!.email });
    res.json({ ok: true });
  }),
);

/**
 * Suspend, ban and restore.
 *
 * A reason is required on all three and is not optional anywhere: it is what
 * the affected photographer is told, and what the next reviewer reads. None of
 * these waits for three warnings — §12 allows immediate action for serious
 * misconduct, and the decision is the reviewer's.
 */
const statusBody = z.object({
  reason: z.string().trim().min(5, 'Give a reason — the photographer is told what it says').max(600),
});

moderationRouter.post(
  '/artists/:id/suspend',
  validate(statusBody),
  asyncHandler(async (req, res) => {
    const { reason } = req.valid as { reason: string };
    const updated = await suspendAccount({
      userId: req.params.id,
      reason,
      actor: { id: req.user!.id, email: req.user!.email },
    });
    res.json({ id: updated.id, status: updated.status });
  }),
);

moderationRouter.post(
  '/artists/:id/ban',
  validate(statusBody),
  asyncHandler(async (req, res) => {
    const { reason } = req.valid as { reason: string };
    const updated = await banAccount({
      userId: req.params.id,
      reason,
      actor: { id: req.user!.id, email: req.user!.email },
    });
    res.json({ id: updated.id, status: updated.status });
  }),
);

moderationRouter.post(
  '/artists/:id/restore',
  validate(statusBody),
  asyncHandler(async (req, res) => {
    const { reason } = req.valid as { reason: string };
    const updated = await restoreAccount({
      userId: req.params.id,
      reason,
      actor: { id: req.user!.id, email: req.user!.email },
    });
    res.json({ id: updated.id, status: updated.status });
  }),
);

/**
 * Take a photograph down (§18).
 *
 * Archived, not deleted: it may already appear on an invoice or in a past
 * rotation, and the review note records who removed it and why.
 */
moderationRouter.post(
  '/artworks/:id/remove',
  validate(
    z.object({
      reason: z.string().trim().min(5, 'Say why this is being removed').max(600),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { reason } = req.valid as { reason: string };
    const artwork = await db.artworks.byId(req.params.id);
    if (!artwork) throw notFound('That photograph');

    const updated = await db.artworks.update(artwork.id, {
      status: 'archived',
      reviewNote: reason,
      reviewedBy: req.user!.id,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ id: updated.id, status: updated.status });
  }),
);

// ── Removal requests ────────────────────────────────────────────────────────

moderationRouter.get(
  '/removal-requests',
  asyncHandler(async (req, res) => {
    const status = req.query.status as RemovalRequestStatus | undefined;
    const items = await listRemovalRequests(
      status && REMOVAL_REQUEST_STATUSES.includes(status) ? status : undefined,
    );
    res.json({ items, overdue: await overdueRemovals() });
  }),
);

/** Starts the five-day clock (§11). */
moderationRouter.post(
  '/removal-requests/:id/physically-removed',
  asyncHandler(async (req, res) => {
    const updated = await markPhysicallyRemoved(req.params.id, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json(updated);
  }),
);

moderationRouter.post(
  '/removal-requests/:id/status',
  validate(
    z.object({
      status: z.enum(REMOVAL_REQUEST_STATUSES),
      notes: z.string().trim().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { status, notes } = req.valid as { status: RemovalRequestStatus; notes?: string };
    const updated = await updateRemovalStatus(
      req.params.id,
      status,
      { id: req.user!.id, email: req.user!.email },
      notes,
    );
    res.json(updated);
  }),
);

/**
 * Runs the §13 and §14 sweeps immediately.
 *
 * They also run nightly. This exists so the CEO can see what the rules would do
 * right now instead of waiting for a night to pass, and so the behaviour can be
 * tested against real data.
 */
moderationRouter.post(
  '/lifecycle/run',
  asyncHandler(async (_req, res) => {
    res.json({
      newAccounts: await runNewAccountSweep(),
      inactivity: await runInactivitySweep(),
    });
  }),
);
