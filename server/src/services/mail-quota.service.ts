import { db } from '@/database/db';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { now } from '@/utils/ids';

/**
 * Monthly SMTP allowance tracking (requirements §33).
 *
 * ARTINU is on a 3,000 messages/month plan. Running into that ceiling silently
 * is the worst outcome: OTP sign-in is the primary route in for Artists and Art
 * Philes, so the first symptom of exhaustion would be nobody being able to log
 * in, with no explanation anywhere.
 *
 * So the count is durable (it survives restarts and is shared across instances
 * via the database, unlike the file-backed dev mailbox which trims at 200), and
 * the last of the allowance is reserved for mail that authentication depends on.
 *
 * Counters live in `ui_content` under `mail_quota` as { "2026-08": 143 }, which
 * avoids a migration for what is a handful of integers.
 */

const RECORD_ID = 'mail_quota';

/** Anything authentication depends on. Sent even when the allowance is spent. */
export type MailPriority = 'critical' | 'normal';

export interface QuotaStatus {
  month: string;
  limit: number;
  used: number;
  remaining: number;
  /** 0–100, rounded. */
  percentage: number;
  state: 'ok' | 'info' | 'warning' | 'critical' | 'exhausted';
  /** Straight-line projection from the run rate so far this month. */
  projectedMonthEnd: number;
  /** True when only critical mail is still going out. */
  reservedForCriticalOnly: boolean;
}

/** Alert bands, matching the storage-monitoring thresholds in the brief. */
const THRESHOLDS = { info: 70, warning: 80, critical: 90 } as const;

/**
 * Below this many remaining, only authentication mail is sent. Without a
 * reserve, a burst of notifications on the 28th could lock every user out for
 * the rest of the month.
 */
const CRITICAL_RESERVE = 150;

const monthKey = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

type Counters = Record<string, number>;

async function readCounters(): Promise<Counters> {
  const record = await db.uiContent.byId(RECORD_ID);
  const data = record?.data as Counters | undefined;
  return data && typeof data === 'object' ? data : {};
}

async function writeCounters(counters: Counters): Promise<void> {
  const existing = await db.uiContent.byId(RECORD_ID);
  if (existing) {
    await db.uiContent.update(RECORD_ID, { data: counters, updatedAt: now() });
    return;
  }
  await db.uiContent.insert({ id: RECORD_ID, data: counters, updatedAt: now() });
}

function describe(used: number, limit: number): QuotaStatus {
  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;

  const day = new Date().getUTCDate();
  const daysInMonth = new Date(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth() + 1,
    0,
  ).getUTCDate();

  return {
    month: monthKey(),
    limit,
    used,
    remaining,
    percentage,
    state:
      remaining === 0
        ? 'exhausted'
        : percentage >= THRESHOLDS.critical
          ? 'critical'
          : percentage >= THRESHOLDS.warning
            ? 'warning'
            : percentage >= THRESHOLDS.info
              ? 'info'
              : 'ok',
    projectedMonthEnd: day > 0 ? Math.round((used / day) * daysInMonth) : used,
    reservedForCriticalOnly: remaining <= CRITICAL_RESERVE,
  };
}

export async function quotaStatus(): Promise<QuotaStatus> {
  const counters = await readCounters();
  return describe(counters[monthKey()] ?? 0, env.MAIL_MONTHLY_LIMIT);
}

/**
 * Asked before every send. Normal mail stops once the reserve is reached;
 * critical mail stops only when the allowance is genuinely gone, because
 * sending past the provider's limit just produces a hard bounce anyway.
 */
export async function canSend(priority: MailPriority): Promise<{ allowed: boolean; reason?: string }> {
  const status = await quotaStatus();

  if (status.remaining <= 0) {
    return {
      allowed: false,
      reason: `The ${status.limit}-message monthly SMTP allowance is spent (resets next month).`,
    };
  }
  if (priority === 'normal' && status.reservedForCriticalOnly) {
    return {
      allowed: false,
      reason:
        `Only ${status.remaining} messages remain this month; these are being held for ` +
        `sign-in codes and password resets.`,
    };
  }
  return { allowed: true };
}

/**
 * Records one accepted message and raises an alert the first time a band is
 * crossed. Alerting on the crossing rather than on every send afterwards is
 * what keeps this from becoming noise the IT team learns to ignore.
 */
export async function recordSend(): Promise<QuotaStatus> {
  const counters = await readCounters();
  const key = monthKey();

  const before = describe(counters[key] ?? 0, env.MAIL_MONTHLY_LIMIT);
  counters[key] = (counters[key] ?? 0) + 1;

  // Keep the trailing year for the usage chart, drop anything older.
  const keys = Object.keys(counters).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 12))) delete counters[old];

  await writeCounters(counters);
  const after = describe(counters[key], env.MAIL_MONTHLY_LIMIT);

  if (after.state !== before.state && after.state !== 'ok') {
    await alertItTeam(after);
  }

  return after;
}

async function alertItTeam(status: QuotaStatus): Promise<void> {
  const message =
    `SMTP usage is at ${status.percentage}% (${status.used} of ${status.limit}) for ${status.month}. ` +
    `Projected month end: ${status.projectedMonthEnd}.`;

  logger.warn(`Mail quota ${status.state}: ${message}`);

  // Imported lazily: notification.service sends mail, and a static import here
  // would close a cycle back through email.service.
  const { notifyRole } = await import('@/services/notification.service');
  await notifyRole('it_team', {
    type: 'system',
    title: `SMTP allowance ${status.state === 'exhausted' ? 'exhausted' : `at ${status.percentage}%`}`,
    body:
      status.state === 'exhausted'
        ? `${message} Sign-in codes cannot be delivered until the allowance resets or the plan is upgraded.`
        : `${message} Consider upgrading before sign-in codes are affected.`,
    link: '/console/system',
  }).catch((error) => logger.error('Could not alert the IT team about mail quota', error));
}

/** Usage for the trailing months, oldest first — for the IT dashboard chart. */
export async function usageHistory(): Promise<{ month: string; sent: number }[]> {
  const counters = await readCounters();
  return Object.keys(counters)
    .sort()
    .map((month) => ({ month, sent: counters[month]! }));
}
