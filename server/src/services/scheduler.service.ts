import { env } from '@/config/env';
import { runBirthdayGreetings } from '@/services/birthday-email.service';
import { runLifecycleSweeps } from '@/services/lifecycle.service';
import { logger } from '@/utils/logger';

/**
 * The one recurring job ARTINU runs: birthday greetings, at local midnight.
 *
 * ── Why a timer and not a cron dependency ───────────────────────────────────
 *
 * There is exactly one scheduled task in the product. `node-cron` would add a
 * dependency, a second scheduling vocabulary and a parser, to express "once a
 * day" — which `setTimeout` already expresses. `rotation.service` makes the
 * same call for the same reason, and says so in its header.
 *
 * ── Midnight where? ─────────────────────────────────────────────────────────
 *
 * The artists are in India, so midnight means IST, not the UTC the container
 * happens to run in. Firing at 00:00 UTC would deliver birthday cards at 5:30
 * in the morning on the wrong day. `BIRTHDAY_TZ_OFFSET_MINUTES` carries the
 * offset (330 = IST) rather than a timezone name, because a fixed offset needs
 * no tz database and India has no daylight saving to track.
 *
 * ── Running more than one instance ──────────────────────────────────────────
 *
 * Every instance will wake at midnight and start the same sweep. That is safe
 * rather than lucky: `runBirthdayGreetings` claims an `audit_logs` marker per
 * artist per year before it sends, so the second instance finds the marker and
 * skips. Scaling out costs a few redundant reads, not duplicate mail.
 *
 * ── Restarts ────────────────────────────────────────────────────────────────
 *
 * A deploy at 23:59 would otherwise miss the whole night. The sweep therefore
 * also runs shortly after boot, and looks back a couple of days, so a restart
 * or an outage delays a greeting rather than losing it.
 */

/** Handles kept so tests and a clean shutdown can stop the timers. */
let midnightTimer: NodeJS.Timeout | null = null;
let bootTimer: NodeJS.Timeout | null = null;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Wait before the catch-up sweep, so boot is not competing with first traffic. */
const BOOT_DELAY = 30_000;

/**
 * Milliseconds from `from` until the next 00:00 in the configured offset.
 *
 * Exported for the tests: getting this wrong is a whole-day error that would
 * otherwise only be visible in production once a year, per artist.
 */
export function msUntilLocalMidnight(from: Date, offsetMinutes: number): number {
  const offsetMs = offsetMinutes * MINUTE;

  // Shift into local time, so "the next midnight" is a plain day boundary.
  const local = from.getTime() + offsetMs;
  const sinceLocalMidnight = ((local % DAY) + DAY) % DAY;

  const remaining = DAY - sinceLocalMidnight;

  // Exactly at midnight, wait a full day rather than firing twice in one tick.
  return remaining === 0 ? DAY : remaining;
}

/** "today" in the configured offset — what the sweep should treat as the date. */
function localToday(offsetMinutes: number): Date {
  return new Date(Date.now() + offsetMinutes * MINUTE);
}

/**
 * Everything that runs once a night.
 *
 * The two jobs are independent and are gated separately: turning birthday
 * emails off must not also turn off Community Guidelines enforcement, which is
 * what a single early return would have done.
 *
 * Neither is allowed to take the other down — a failure inside one is caught by
 * the service itself, and this awaits them in sequence rather than in parallel
 * so a slow night does not run two full table scans at once.
 */
async function sweep(reason: string): Promise<void> {
  const today = localToday(env.BIRTHDAY_TZ_OFFSET_MINUTES);

  if (env.BIRTHDAY_EMAILS_ENABLED) {
    const summary = await runBirthdayGreetings(today);

    // Silent unless there was something to do — a daily "0 sent" line for the
    // 360-odd days nobody has a birthday is noise that hides the real ones.
    if (summary.considered > 0 || summary.failed > 0) {
      logger.info(
        `Birthday sweep (${reason}): ${summary.sent} sent, ${summary.skipped} already greeted, ` +
          `${summary.failed} failed, ${summary.considered} due.`,
      );
    }
  }

  // Community Guidelines §13 (10 days, no upload) and §14 (96 days inactive).
  // Both warn or flag; neither suspends. See lifecycle.service.
  if (env.LIFECYCLE_SWEEPS_ENABLED) {
    await runLifecycleSweeps(today);
  }
}

function scheduleNextMidnight(): void {
  const delay = msUntilLocalMidnight(new Date(), env.BIRTHDAY_TZ_OFFSET_MINUTES);

  midnightTimer = setTimeout(() => {
    void sweep('midnight').finally(() => {
      // Recompute rather than adding 24h, so the timer cannot drift out of
      // alignment with midnight over weeks of uptime.
      scheduleNextMidnight();
    });
  }, delay);

  // Do not hold the process open for this.
  midnightTimer.unref?.();

  const hours = Math.floor(delay / 3_600_000);
  const minutes = Math.round((delay % 3_600_000) / MINUTE);
  logger.info(`Next birthday sweep in ${hours}h ${minutes}m.`);
}

/** Called once from the server entrypoint. */
export function startScheduler(): void {
  if (midnightTimer) return;

  if (!env.BIRTHDAY_EMAILS_ENABLED) {
    logger.info('Birthday emails are disabled (BIRTHDAY_EMAILS_ENABLED=false).');
  }
  if (!env.LIFECYCLE_SWEEPS_ENABLED) {
    logger.info('Guideline lifecycle sweeps are disabled (LIFECYCLE_SWEEPS_ENABLED=false).');
  }

  // Nothing to do at all — do not hold a timer for it.
  if (!env.BIRTHDAY_EMAILS_ENABLED && !env.LIFECYCLE_SWEEPS_ENABLED) return;

  bootTimer = setTimeout(() => void sweep('catch-up'), BOOT_DELAY);
  bootTimer.unref?.();

  scheduleNextMidnight();
}

/** Stops both timers. Used by tests and on shutdown. */
export function stopScheduler(): void {
  if (midnightTimer) clearTimeout(midnightTimer);
  if (bootTimer) clearTimeout(bootTimer);
  midnightTimer = null;
  bootTimer = null;
}
