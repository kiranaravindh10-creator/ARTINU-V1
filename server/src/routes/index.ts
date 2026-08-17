import { Router } from 'express';
import { adminRouter } from '@/routes/admin.routes';
import { analyticsRouter } from '@/routes/analytics.routes';
import { artworkRouter } from '@/routes/artwork.routes';
import { authRouter } from '@/routes/auth.routes';
import { invoiceRouter } from '@/routes/invoice.routes';
import { notificationRouter } from '@/routes/notification.routes';
import { operationsRouter } from '@/routes/operations.routes';
import { orderRouter } from '@/routes/order.routes';
import { paymentRouter } from '@/routes/payment.routes';
import { publicRouter } from '@/routes/public.routes';
import { rotationRouter } from '@/routes/rotation.routes';
import { spaceRouter } from '@/routes/space.routes';
import { uploadRouter } from '@/routes/upload.routes';
import { userRouter } from '@/routes/user.routes';
import { contentRouter } from '@/routes/content.routes';
import { contentManagerRouter } from '@/routes/contentManager.routes';

/** API modules, one per SDD §17 entry. */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/spaces', spaceRouter);
apiRouter.use('/artworks', artworkRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/rotation', rotationRouter);
apiRouter.use('/invoices', invoiceRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/ops', operationsRouter);
apiRouter.use('/content', contentRouter);
apiRouter.use('/content-manager', contentManagerRouter);

// Public forms that do not belong to a single resource module:
// /consultations, /applications, /support
apiRouter.use('/', publicRouter);
