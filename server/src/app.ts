import { existsSync, mkdirSync } from 'node:fs';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { driverSummary, env } from '@/config/env';
import {
  apiLimiter,
  attachUser,
  countRequests,
  errorHandler,
  notFoundHandler,
} from '@/middleware/index';
import { apiRouter } from '@/routes/index';
import { metrics } from '@/middleware/index';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Images come from Unsplash/picsum and uploads are served from disk, so
      // the default same-origin resource policy would block them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: env.isProduction ? env.CLIENT_URL : true,
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(cookieParser());

  /*
    The payment webhook needs the RAW body, and must be mounted before the JSON
    parser sees it.

    Razorpay signs the exact bytes it posted. `express.json()` parses and discards
    them, and re-serialising the parsed object changes key order and whitespace,
    so the recomputed HMAC would never match. `express.raw` on this one path keeps
    the original buffer; every other route still gets parsed JSON.
  */
  app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));

  // Uploads arrive as base64 data URLs (SDD §11), so the JSON body limit has to
  // clear a full-resolution photograph plus encoding overhead.
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  if (!env.isProduction) {
    app.use(morgan('dev', { skip: (req) => req.url === '/api/health' }));
  }

  app.use(countRequests);

  // Locally stored uploads are served straight off disk.
  if (env.STORAGE_DRIVER === 'local') {
    if (!existsSync(env.uploadsDir)) mkdirSync(env.uploadsDir, { recursive: true });
    app.use('/uploads', express.static(env.uploadsDir, { maxAge: '7d', fallthrough: true }));
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      startedAt: metrics.startedAt,
      drivers: driverSummary,
    });
  });

  app.use('/api', apiLimiter, attachUser, apiRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
