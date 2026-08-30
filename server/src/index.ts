import { createApp } from '@/app';
import { driverSummary, env, reportDriverFallbacks } from '@/config/env';
import { restoredFromDisk } from '@/database/db';
import { ensureSeeded } from '@/database/seed';
import { reconcileReviewQueue } from '@/services/moderation-queue.service';
import { startScheduler } from '@/services/scheduler.service';
import { logger } from '@/utils/logger';

async function main() {
  reportDriverFallbacks((message) => logger.warn(message));

  const seeded = await ensureSeeded();

  // A reviewer should only ever be shown work the checks could not settle.
  const queue = await reconcileReviewQueue();
  if (queue.published.length || queue.rejected.length) {
    logger.info(
      `review queue reconciled - ${queue.published.length} published, ${queue.rejected.length} rejected, ` +
        `${queue.scanned - queue.published.length - queue.rejected.length} genuinely awaiting a photographer`,
    );
  }

  const app = createApp();

  // A port collision is the single most common cold-start failure, and Node's
  // default is an unhandled EADDRINUSE stack trace that says nothing about what
  // to do. Name the port, name the fix.
  const server = app.listen(env.PORT, () => {
    logger.success(`ARTINU API listening on http://localhost:${env.PORT}`);
    logger.info(
      `drivers  data=${driverSummary.data} auth=${driverSummary.auth} storage=${driverSummary.storage} email=${driverSummary.email} payments=${driverSummary.payments}`,
    );
    if (seeded) logger.info('Seeded demo data - sign in with ceo@artinu.in / ARTINU@CEO2026');
    else if (restoredFromDisk) logger.info('Restored the previous session from .data/db.json');

    // Started only once the port is actually ours. Doing this before `listen`
    // succeeds would leave a second copy of the process sweeping for birthdays
    // on every failed cold start.
    startScheduler();
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') throw error;

    logger.error(
      `Port ${env.PORT} is already in use.

` +
        `  Something else is listening there - most likely a copy of this API that is
` +
        `  still running from an earlier attempt.

` +
        `  Free it, or run on another port:
` +
        `    Windows   netstat -ano | findstr :${env.PORT}   then   taskkill /PID <pid> /F
` +
        `    macOS     lsof -ti :${env.PORT} | xargs kill
` +
        `    Linux     fuser -k ${env.PORT}/tcp

` +
        `  Or add this to the .env file at the project root and restart:
` +
        `    PORT=${env.PORT + 1}
` +
        `    VITE_API_URL=http://localhost:${env.PORT + 1}/api
`,
    );

    // Deliberately not process.exit(1). On Windows + Node 24, exiting
    // explicitly while a handle is still closing trips a libuv assertion —
    //
    //   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:76
    //
    // — which printed a crash immediately under the message above and replaced
    // the exit code with 127. The listen attempt already failed, so closing the
    // dead handle and setting the code lets the loop drain and exit as 1, which
    // is what a caller checking $LASTEXITCODE or CI expects.
    process.exitCode = 1;
    server.close();
  });
}

main().catch((error) => {
  logger.error('The API failed to start', error);
  process.exitCode = 1;
});

// Surface anything that escapes a handler instead of dying silently.
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));
process.on('uncaughtException', (error) => logger.error('Uncaught exception', error));
