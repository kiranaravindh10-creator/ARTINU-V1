import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_AUDIENCE_ROLES,
  ANNOUNCEMENT_AUDIENCES,
  announcementSchema,
  type AnnouncementAudience,
  type AnnouncementInput,
  type Role,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { asyncHandler, requireAuth, requireModule, validate } from '@/middleware/index';
import { badRequest } from '@/utils/errors';
import { recordAudit, recentAudit } from '@/services/audit.service';
import { notifyMany } from '@/services/notification.service';

export const announcementRouter = Router();

/*
  Sending a notification to an audience.

  Held by the `announcements` module, which the CEO, the manager and the IT team
  hold and nobody else does. It is a module of its own rather than part of
  `users` because the manager does not hold `users` — see the comment on
  ROLE_MODULES in shared/src/constants.ts.

  Everything here is in-app only. No email is sent, deliberately: a broadcast to
  every artist would be one click away from the monthly SendGrid quota, and a
  notification the recipient sees next time they open the site is a different
  promise from one that lands in their inbox tonight. If email broadcast is
  wanted it should be its own decision, with its own confirmation and its own
  quota accounting.
*/
announcementRouter.use(requireAuth, requireModule('announcements'));

/** Suspended accounts never receive a broadcast. */
async function recipientsFor(audience: AnnouncementAudience) {
  const roles = ANNOUNCEMENT_AUDIENCE_ROLES[audience] as readonly Role[] | undefined;
  if (!roles || roles.length === 0) return [];

  // One read with an `in (…)` rather than a query per role.
  return db.users.find({
    where: { role: roles as unknown as Role },
    filter: (user) => user.status !== 'suspended',
  });
}

/**
 * How many accounts an audience currently covers.
 *
 * Exists so the console can say "this goes to 27 artists" *before* the button is
 * pressed. A broadcast cannot be recalled, so the count is part of the decision
 * rather than something you learn from the success toast.
 */
announcementRouter.get(
  '/audiences',
  asyncHandler(async (_req, res) => {
    const counts = await Promise.all(
      ANNOUNCEMENT_AUDIENCES.map(async (audience) => ({
        value: audience,
        label: ANNOUNCEMENT_AUDIENCE_LABELS[audience],
        recipients: (await recipientsFor(audience)).length,
      })),
    );
    res.json({ audiences: counts });
  }),
);

/** Broadcasts already sent, newest first — read out of the audit log. */
announcementRouter.get(
  '/history',
  asyncHandler(async (_req, res) => {
    const entries = await recentAudit(200);
    const sent = entries
      .filter((entry) => entry.action === 'announcement.sent')
      .slice(0, 30)
      .map((entry) => ({
        id: entry.id,
        at: entry.createdAt,
        by: entry.actorEmail,
        audience: (entry.meta as Record<string, unknown>)?.audience ?? null,
        title: (entry.meta as Record<string, unknown>)?.title ?? null,
        recipients: (entry.meta as Record<string, unknown>)?.recipients ?? null,
      }));
    res.json({ sent });
  }),
);

announcementRouter.post(
  '/',
  validate(announcementSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as AnnouncementInput;
    const actor = req.user!;

    const recipients = await recipientsFor(input.audience);

    if (recipients.length === 0) {
      // A send that reached nobody is a failure worth surfacing, not a success
      // with a zero in it — most likely the audience was misread.
      throw badRequest(
        `There are no active accounts in "${ANNOUNCEMENT_AUDIENCE_LABELS[input.audience]}", so nothing was sent.`,
      );
    }

    const link = input.link?.trim() ? input.link.trim() : undefined;

    await notifyMany(
      recipients.map((user) => ({
        userId: user.id,
        // `system` is the type for anything a human sent rather than an event
        // raised — it keeps a broadcast distinguishable from an order update.
        type: 'system' as const,
        title: input.title,
        body: input.body,
        link,
      })),
    );

    /*
      Audited, and the audit row is also the history feed above.

      A message sent to every artist on the platform is exactly the kind of
      action that should be attributable months later — who sent it, to whom,
      how many it reached, and what it said.
    */
    await recordAudit({
      action: 'announcement.sent',
      entity: 'notification',
      meta: {
        audience: input.audience,
        audienceLabel: ANNOUNCEMENT_AUDIENCE_LABELS[input.audience],
        recipients: recipients.length,
        title: input.title,
        body: input.body,
        link: link ?? null,
      },
      actor: { id: actor.id, email: actor.email },
    });

    res.status(201).json({
      sent: recipients.length,
      audience: input.audience,
      audienceLabel: ANNOUNCEMENT_AUDIENCE_LABELS[input.audience],
    });
  }),
);

/**
 * Send to one named person, by email address.
 *
 * The narrow case the broad one cannot cover: telling a single artist that their
 * payout is on the way, without notifying the other twenty-six.
 */
announcementRouter.post(
  '/direct',
  validate(
    announcementSchema.omit({ audience: true }).extend({
      email: z.string().trim().email('Enter the account email address'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const input = req.valid as Omit<AnnouncementInput, 'audience'> & { email: string };
    const actor = req.user!;

    const user = await db.users.findOne({ email: input.email.toLowerCase() });
    if (!user) throw badRequest(`No account is registered to ${input.email}.`);
    if (user.status === 'suspended') {
      throw badRequest(`${input.email} is suspended, so it was not sent.`);
    }

    const link = input.link?.trim() ? input.link.trim() : undefined;

    await notifyMany([
      { userId: user.id, type: 'system' as const, title: input.title, body: input.body, link },
    ]);

    await recordAudit({
      action: 'announcement.sent',
      entity: 'notification',
      entityId: user.id,
      meta: {
        audience: 'direct',
        audienceLabel: input.email,
        recipients: 1,
        title: input.title,
        body: input.body,
        link: link ?? null,
      },
      actor: { id: actor.id, email: actor.email },
    });

    res.status(201).json({ sent: 1, audience: 'direct', audienceLabel: input.email });
  }),
);
