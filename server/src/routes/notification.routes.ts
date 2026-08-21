import {
  ANNOUNCEMENT_SENDER_ROLES,
  announcementSchema,
  type AnnouncementInput,
} from '@artinu/shared';
import { Router } from 'express';
import { asyncHandler, requireAuth, requireRole, validate } from '@/middleware/index';
import { recordAudit } from '@/services/audit.service';
import {
  archiveNotification,
  broadcast,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from '@/services/notification.service';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

/**
 * Send one notification to a whole audience.
 *
 * Manager, IT and CEO only — asked for in the 20 Aug review ("Manager, IT and
 * ceo should have access to send notifications to artists and all other
 * accounts"). It reuses `notifyMany`, so an announcement is an ordinary row in
 * `notifications` and appears in the same bell, with the same read/archive
 * behaviour, as every other message. Nothing new had to be stored to add it.
 *
 * Audited with the audience and the recipient count rather than left implicit:
 * this is the one action in the console that writes to every account at once,
 * and "who sent that to all our artists" has to have an answer.
 */
notificationRouter.post(
  '/announce',
  requireRole(...ANNOUNCEMENT_SENDER_ROLES),
  validate(announcementSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as AnnouncementInput;

    const sent = await broadcast({
      audience: input.audience,
      title: input.title,
      body: input.body,
      link: input.link?.trim() || undefined,
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'notification.announced',
      entity: 'notification',
      meta: { audience: input.audience, recipients: sent, title: input.title },
      ip: req.ip,
    });

    res.status(201).json({ sent, audience: input.audience });
  }),
);

notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(
      await listNotifications(req.user!.id, {
        unreadOnly: req.query.unread === 'true',
        page: Number(req.query.page ?? 1),
        pageSize: Math.min(60, Number(req.query.pageSize ?? 20)),
      }),
    );
  }),
);

notificationRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ count: await unreadCount(req.user!.id) });
  }),
);

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markAllRead(req.user!.id);
    res.json({ ok: true });
  }),
);

notificationRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    res.json(await markRead(req.user!.id, req.params.id));
  }),
);

notificationRouter.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    res.json(await archiveNotification(req.user!.id, req.params.id));
  }),
);
