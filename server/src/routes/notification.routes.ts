import { Router } from 'express';
import { asyncHandler, requireAuth } from '@/middleware/index';
import {
  archiveNotification,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from '@/services/notification.service';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

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
