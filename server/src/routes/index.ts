import { Router } from 'express';
import { adminRouter } from '@/routes/admin.routes';
import { analyticsRouter } from '@/routes/analytics.routes';
import { artworkRouter } from '@/routes/artwork.routes';
import { authRouter } from '@/routes/auth.routes';
import { invoiceRouter } from '@/routes/invoice.routes';
import { notificationRouter } from '@/routes/notification.routes';
import { moderationRouter } from '@/routes/moderation.routes';
import { operationsRouter } from '@/routes/operations.routes';
import { orderRouter } from '@/routes/order.routes';
import { paymentRouter } from '@/routes/payment.routes';
import { publicRouter } from '@/routes/public.routes';
import { rotationRouter } from '@/routes/rotation.routes';
import { spaceRouter } from '@/routes/space.routes';
import { uploadRouter } from '@/routes/upload.routes';
import { userRouter } from '@/routes/user.routes';
import { contentRouter } from '@/routes/content.routes';
import { placesRouter } from '@/routes/places.routes';
import { announcementRouter } from '@/routes/announcement.routes';
import { contentManagerRouter } from '@/routes/contentManager.routes';
import { peopleRouter, supportSessionRouter } from '@/routes/people.routes';
import { expenseRouter, financeRouter } from '@/routes/finance.routes';
import { clientRouter, consoleOrderRouter } from '@/routes/console-orders.routes';
import { supportSessionGuard } from '@/middleware/index';

/** API modules, one per SDD §17 entry. */
export const apiRouter = Router();

// First, so a support session is held to read-only on every route below.
apiRouter.use(supportSessionGuard);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/spaces', spaceRouter);
apiRouter.use('/artworks', artworkRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/moderation', moderationRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/rotation', rotationRouter);
apiRouter.use('/invoices', invoiceRouter);
apiRouter.use('/admin/people', peopleRouter);
apiRouter.use('/support-session', supportSessionRouter);
apiRouter.use('/admin/finance', financeRouter);
apiRouter.use('/admin/expenses', expenseRouter);
apiRouter.use('/admin/clients', clientRouter);
apiRouter.use('/admin', adminRouter);
// After adminRouter: new order paths sit beside the existing ones, replacing none.
apiRouter.use('/admin/orders', consoleOrderRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/ops', operationsRouter);
apiRouter.use('/content', contentRouter);
apiRouter.use('/places', placesRouter);
apiRouter.use('/announcements', announcementRouter);
apiRouter.use('/content-manager', contentManagerRouter);

// Public forms that do not belong to a single resource module:
// /consultations, /applications, /support
apiRouter.use('/', publicRouter);
