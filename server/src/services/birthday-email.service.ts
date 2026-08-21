import { db } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { sendBirthdayEmail } from '@/services/email.service';
import { logger } from '@/utils/logger';

/**
 * The ARTINU birthday note, sent once per artist per year at local midnight.
 *
 * ── Where the date comes from ───────────────────────────────────────────────
 *
 * `profiles.date_of_birth`, which artist registration has always collected.
 * Nothing new is asked of anyone and no column is added — the whole feature is
 * a reader of data that was already there.
 *
 * ── How a duplicate is prevented ────────────────────────────────────────────
 *
 * The same marker `welcome-email.service` uses: an `audit_logs` row, claimed
 * *before* the send. The action carries the year, so
 * `user.birthday_email_sent:2026` for a given user is asked once and answered
 * from a table that already exists. No migration, and the record is visible in
 * Console → Audit alongside everything else.
 *
 * Claiming first means a provider outage costs that year's card rather than
 * risking two. For a birthday wish that is plainly the right way round: a
 * missed one is a shame, a duplicate is embarrassing.
 *
 * ── Why "on or before today" rather than "today" ────────────────────────────
 *
 * `runBirthdayGreetings` sweeps a window rather than matching the current date
 * exactly. A server that was asleep, redeploying, or rate-limited at 00:00 on
 * someone's birthday would otherwise skip them silently until next year. The
 * marker makes the sweep safe to repeat, so catching up is free.
 *
 * 29 February is folded onto 28 February in common years, so a leap-day artist
 * hears from us annually rather than every fourth year.
 */

const ACTION = 'user.birthday_email_sent';
const FAILED = 'user.birthday_email_failed';

/** How many days back a missed birthday is still worth acknowledging. */
const CATCH_UP_DAYS = 2;

/** "2026-08-20" → { month: 8, day: 20 }, tolerating a full ISO timestamp. */
function monthAndDay(value: string): { month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;

  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { month, day };
}

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * The dates whose birthdays are due, as "MM-DD" keys — today and the couple of
 * days behind it, so a server that missed midnight still catches up.
 */
export function dueKeys(today: Date, catchUpDays = CATCH_UP_DAYS): Set<string> {
  const keys = new Set<string>();

  for (let back = 0; back <= catchUpDays; back += 1) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back),
    );
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    keys.add(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

    // In a common year nobody has a 29 February, so those artists are greeted
    // on the 28th instead of being skipped for three years at a time.
    if (month === 2 && day === 28 && !isLeapYear(date.getUTCFullYear())) {
      keys.add('02-29');
    }
  }

  return keys;
}

/** Has this artist already been greeted in this calendar year? */
async function alreadyGreeted(userId: string, year: number): Promise<boolean> {
  const existing = await db.auditLogs.findOne({
    action: `${ACTION}:${year}`,
    entityId: userId,
  });
  return existing !== null;
}

/**
 * Sends any birthday greetings that are due.
 *
 * Never throws: it runs from a timer with nobody to report to, and a database
 * blip must not take the process down at midnight.
 *
 * Returns a small summary so the scheduler can log one line and the manual
 * trigger in Console can say what happened.
 */
export async function runBirthdayGreetings(
  today = new Date(),
): Promise<{ considered: number; sent: number; skipped: number; failed: number }> {
  const summary = { considered: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    const due = dueKeys(today);
    const year = today.getUTCFullYear();

    // Only artists. Space owners and staff did not give a date of birth for
    // this, and greeting them would be a use of their data they never agreed to.
    const artists = await db.users.find({ where: { role: 'artist' } });

    for (const artist of artists) {
      const profile = await db.profiles.findOne({ userId: artist.id });
      if (!profile?.dateOfBirth) continue;

      const parts = monthAndDay(String(profile.dateOfBirth));
      if (!parts) {
        logger.warn(
          `Skipping birthday for ${artist.email}: could not read date_of_birth ` +
            `"${profile.dateOfBirth}"`,
        );
        continue;
      }

      const key = `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      if (!due.has(key)) continue;

      summary.considered += 1;

      // A suspended account should not receive a cheerful note from us.
      if (artist.status === 'suspended') {
        summary.skipped += 1;
        continue;
      }

      if (await alreadyGreeted(artist.id, year)) {
        summary.skipped += 1;
        continue;
      }

      // Claim before sending — see the header.
      await recordAudit({
        actor: { id: artist.id, email: artist.email },
        action: `${ACTION}:${year}`,
        entity: 'user',
        entityId: artist.id,
        meta: { year, birthday: key },
      });

      const name = profile.displayName || profile.fullName || 'there';
      const result = await sendBirthdayEmail(artist.email, name);

      if (result.delivered) {
        summary.sent += 1;
      } else {
        summary.failed += 1;
        logger.error(
          `Birthday email to ${artist.email} was not delivered` +
            (result.skippedReason ? ` — ${result.skippedReason}` : ''),
        );
        await recordAudit({
          actor: { id: artist.id, email: artist.email },
          action: FAILED,
          entity: 'user',
          entityId: artist.id,
          meta: { year, reason: result.skippedReason ?? 'provider rejected or errored' },
        }).catch(() => {
          /* the logger line above is the fallback record */
        });
      }
    }
  } catch (error) {
    logger.error('The birthday greeting sweep failed', error);
  }

  return summary;
}
