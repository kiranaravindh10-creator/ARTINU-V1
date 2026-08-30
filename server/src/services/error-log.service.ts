import { createHash } from 'node:crypto';
import { db } from '@/database/db';
import { logger } from '@/utils/logger';
import { now } from '@/utils/ids';
import { currentContext } from '@/utils/request-context';

/**
 * Centralised error capture with bounded auto-recovery (requirements §36).
 *
 * Two things this deliberately does NOT do:
 *
 *  · Retry forever. Every retry is capped and backed off, because a retry loop
 *    against a failing dependency turns one outage into two.
 *  · Retry anything non-idempotent. `withRecovery` is for reads and for sends
 *    that are safe to repeat; charging a card twice is worse than failing once.
 *
 * Identical failures fold onto one row via a fingerprint, so a dependency that
 * fails a thousand times shows up as one incident with a count rather than a
 * thousand rows nobody reads.
 */

export type ErrorSource =
  | 'api'
  | 'auth'
  | 'database'
  | 'upload'
  | 'booking'
  | 'email'
  | 'job'
  | 'client';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorLogRecord {
  id: string;
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  stack?: string | null;
  route?: string | null;
  operation?: string | null;
  userId?: string | null;
  requestId?: string | null;
  meta: Record<string, unknown>;
  retryCount: number;
  recovered: boolean;
  resolution: 'open' | 'auto_recovered' | 'resolved' | 'ignored';
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  fingerprint?: string | null;
  occurrences: number;
  lastSeenAt: string;
  createdAt: string;
}

export interface CaptureInput {
  source: ErrorSource;
  severity?: ErrorSeverity;
  error: unknown;
  operation?: string;
  meta?: Record<string, unknown>;
}

/** Groups the same failure together: source + operation + the message shape. */
function fingerprintOf(source: string, operation: string | undefined, message: string): string {
  // Strip ids, uuids and numbers so "user 41 not found" and "user 42 not found"
  // are recognised as the same incident.
  const shape = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300);
  return createHash('sha1').update(`${source}|${operation ?? ''}|${shape}`).digest('hex');
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);

/**
 * Records a failure. Never throws — a logger that can bring down the request it
 * is reporting on is worse than no logger.
 */
export async function captureError(input: CaptureInput): Promise<ErrorLogRecord | null> {
  try {
    const context = currentContext();
    const message = messageOf(input.error);
    const severity = input.severity ?? 'error';
    const fingerprint = fingerprintOf(input.source, input.operation, message);

    // Fold onto the open incident with the same shape, if there is one.
    const existing = (await db.errorLogs.find({
      where: { fingerprint, resolution: 'open' },
      limit: 1,
    })) as ErrorLogRecord[];

    if (existing[0]) {
      return (await db.errorLogs.update(existing[0].id, {
        occurrences: existing[0].occurrences + 1,
        lastSeenAt: now(),
        // A repeat at higher severity should raise the incident, never lower it.
        severity: rank(severity) > rank(existing[0].severity) ? severity : existing[0].severity,
      } as never)) as ErrorLogRecord;
    }

    const record = (await db.errorLogs.insert({
      source: input.source,
      severity,
      message: message.slice(0, 2000),
      stack: input.error instanceof Error ? (input.error.stack ?? null)?.slice(0, 8000) : null,
      route: context?.route ?? null,
      operation: input.operation ?? null,
      userId: context?.actor?.id ?? null,
      requestId: context?.requestId ?? null,
      meta: input.meta ?? {},
      retryCount: 0,
      recovered: false,
      resolution: 'open',
      resolvedAt: null,
      resolvedBy: null,
      fingerprint,
      occurrences: 1,
      lastSeenAt: now(),
      createdAt: now(),
    } as never)) as ErrorLogRecord;

    if (severity === 'critical') await alertItTeam(record);
    return record;
  } catch (loggingFailure) {
    // Last resort: at least get it into the process log.
    logger.error('Could not record an error in error_logs', loggingFailure);
    logger.error(`Original error (${input.source})`, input.error);
    return null;
  }
}

const rank = (severity: ErrorSeverity) =>
  ({ info: 0, warning: 1, error: 2, critical: 3 })[severity] ?? 2;

/**
 * Runs an idempotent operation, retrying transient failures with exponential
 * backoff. Records the incident either way, marked auto_recovered when a later
 * attempt succeeds, and escalates to the IT team when every attempt fails.
 */
export async function withRecovery<T>(
  operation: string,
  source: ErrorSource,
  task: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; meta?: Record<string, unknown> } = {},
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 5));
  const baseDelay = options.baseDelayMs ?? 300;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await task();

      if (attempt > 1) {
        logger.info(`${operation} recovered on attempt ${attempt}`);
        await noteRecovery(source, operation, attempt, options.meta);
      }
      return { ok: true, value };
    } catch (error) {
      lastError = error;

      // A failure that will never fix itself should not be retried.
      if (!isTransient(error) || attempt === attempts) break;

      await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** (attempt - 1)));
    }
  }

  const record = await captureError({
    source,
    severity: 'critical',
    error: lastError,
    operation,
    meta: { ...options.meta, attempts, autoRecoveryFailed: true },
  });
  if (record) await alertItTeam(record);

  return { ok: false, error: lastError };
}

/**
 * Whether retrying could plausibly help. Timeouts, socket resets and 5xx are
 * worth another go; a validation error or a 404 is not.
 */
function isTransient(error: unknown): boolean {
  const message = messageOf(error).toLowerCase();
  const code = (error as { code?: string } | null)?.code ?? '';

  if (['econnreset', 'etimedout', 'econnrefused', 'epipe', 'eai_again'].includes(String(code).toLowerCase())) {
    return true;
  }
  return /timeout|timed out|socket hang up|network|temporarily|rate limit|too many requests|503|502|504|fetch failed/.test(
    message,
  );
}

async function noteRecovery(
  source: ErrorSource,
  operation: string,
  attempt: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  await captureError({
    source,
    severity: 'info',
    error: `${operation} failed then succeeded on attempt ${attempt}`,
    operation,
    meta: { ...meta, autoRecovered: true, attempt },
  });
}

async function alertItTeam(record: ErrorLogRecord): Promise<void> {
  const { notifyRole } = await import('@/services/notification.service');
  await notifyRole('it_team', {
    type: 'system',
    title: `${record.severity === 'critical' ? 'Critical' : 'Recurring'} error - ${record.source}`,
    body: `${record.operation ? `${record.operation}: ` : ''}${record.message.slice(0, 180)}`,
    link: '/console/system',
  }).catch((error) => logger.error('Could not alert the IT team about an error', error));
}

// ── Reading, for the IT dashboard ────────────────────────────────────────────

export async function listErrors(
  options: { resolution?: string; severity?: string; source?: string; limit?: number } = {},
): Promise<ErrorLogRecord[]> {
  const where: Record<string, unknown> = {};
  if (options.resolution) where.resolution = options.resolution;
  if (options.severity) where.severity = options.severity;
  if (options.source) where.source = options.source;

  return (await db.errorLogs.find({
    where,
    orderBy: { field: 'lastSeenAt', direction: 'desc' },
    limit: options.limit ?? 100,
  })) as ErrorLogRecord[];
}

export async function errorSummary(): Promise<{
  open: number;
  critical: number;
  autoRecovered: number;
  last24h: number;
  bySource: Record<string, number>;
}> {
  const all = (await db.errorLogs.find({ limit: 1000 })) as ErrorLogRecord[];
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const bySource: Record<string, number> = {};
  for (const entry of all) {
    if (entry.resolution === 'open') bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
  }

  return {
    open: all.filter((e) => e.resolution === 'open').length,
    critical: all.filter((e) => e.resolution === 'open' && e.severity === 'critical').length,
    autoRecovered: all.filter((e) => e.resolution === 'auto_recovered' || e.recovered).length,
    last24h: all.filter((e) => e.lastSeenAt >= dayAgo).length,
    bySource,
  };
}

export async function resolveError(id: string, userId: string): Promise<ErrorLogRecord> {
  return (await db.errorLogs.update(id, {
    resolution: 'resolved',
    resolvedAt: now(),
    resolvedBy: userId,
  } as never)) as ErrorLogRecord;
}
