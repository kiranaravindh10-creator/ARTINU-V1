import { INACTIVITY_DAYS, NEW_ACCOUNT_GRACE_DAYS } from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { issueWarning } from '@/services/enforcement.service';
import { notify } from '@/services/notification.service';

/**
 * The two time-based rules in the Community Guidelines.
 *
 *   §13 — a new account that has uploaded nothing in 10 days may be warned.
 *   §14 — 96 days of no activity and no uploads makes an account reviewable.
 *
 * ── Neither of these suspends anybody ───────────────────────────────────────
 *
 * §13 issues a warning and contacts the photographer. §14 flags the account for
 * review. Both stop there, because both guidelines say "may" — an account is
 * only suspended when a person decides to suspend it, from the console. A sweep
 * that banned people at 3am on a timer would be a different policy from the one
 * that was written, and would be indistinguishable from a bug when it went
 * wrong.
 *
 * ── They cannot repeat ──────────────────────────────────────────────────────
 *
 * `inactivity_warned_at` and `inactivity_reviewed_at` are stamped when each
 * rule fires. Without them a daily sweep would warn the same photographer every
 * morning for as long as they stayed quiet, which is how a policy becomes
 * harassment.
 */

const DAY = 24 * 60 * 60 * 1000;

const daysSince = (iso: string | null | undefined): number =>
  iso ? (Date.now() - new Date(iso).getTime()) / DAY : Infinity;

/** Artists only. Space owners and staff are not subject to these rules. */
async function artists(): Promise<StoredUser[]> {
  return db.users.find({ where: { role: 'artist' } });
}

/** Has this artist ever uploaded anything, in any state? */
async function uploadCount(userId: string): Promise<number> {
  return db.artworks.count({ artistId: userId });
}

export interface SweepSummary {
  scanned: number;
  warned: number;
  flagged: number;
  skipped: number;
}

/**
 * §13 — new account, ten days, nothing uploaded.
 *
 * Only accounts that have *never* uploaded are in scope. A photographer who
 * uploaded on day two and went quiet is not a §13 case; they are a §14 case,
 * and 96 days is the number that applies to them.
 */
export async function runNewAccountSweep(today = new Date()): Promise<SweepSummary> {
  const summary: SweepSummary = { scanned: 0, warned: 0, flagged: 0, skipped: 0 };

  for (const artist of await artists()) {
    // Only accounts in the window: old enough to have had their ten days, and
    // not so old that §14 is the rule that applies.
    const age = (today.getTime() - new Date(artist.createdAt).getTime()) / DAY;
    if (age < NEW_ACCOUNT_GRACE_DAYS || age >= INACTIVITY_DAYS) continue;

    summary.scanned += 1;

    if (artist.status === 'suspended' || artist.status === 'banned') {
      summary.skipped += 1;
      continue;
    }
    if (artist.inactivityWarnedAt) {
      summary.skipped += 1;
      continue;
    }
    if ((await uploadCount(artist.id)) > 0) {
      summary.skipped += 1;
      continue;
    }

    // Stamped before the warning is issued, so a failure part-way through
    // cannot produce a second warning on the next run.
    await db.users.update(artist.id, { inactivityWarnedAt: now() } as never);

    await issueWarning({
      userId: artist.id,
      category: 'inactivity',
      reason: `No photographs uploaded in the first ${NEW_ACCOUNT_GRACE_DAYS} days after joining.`,
      notes: 'Issued automatically under Community Guidelines §13.',
    });

    summary.warned += 1;
  }

  return summary;
}

/**
 * §14 — 96 days with no activity and no uploads.
 *
 * "Inactive" is read as the guideline writes it: no sign-in *and* no upload in
 * the period. An artist who signed in last week has not been inactive for 96
 * days even if they last uploaded a year ago, and suspending them would be
 * enforcing a rule nobody wrote.
 *
 * The result is a flag, not a suspension — the account appears in the console's
 * review queue and a person decides.
 */
export async function runInactivitySweep(today = new Date()): Promise<SweepSummary> {
  const summary: SweepSummary = { scanned: 0, warned: 0, flagged: 0, skipped: 0 };

  for (const artist of await artists()) {
    const age = (today.getTime() - new Date(artist.createdAt).getTime()) / DAY;
    if (age < INACTIVITY_DAYS) continue;

    summary.scanned += 1;

    if (artist.status === 'suspended' || artist.status === 'banned') {
      summary.skipped += 1;
      continue;
    }
    if (artist.inactivityReviewedAt) {
      summary.skipped += 1;
      continue;
    }

    // Signed in recently? Then they are not inactive, whatever they last uploaded.
    const sinceSignIn = daysSince(artist.lastLoginAt ?? artist.createdAt);
    if (sinceSignIn < INACTIVITY_DAYS) {
      summary.skipped += 1;
      continue;
    }

    // Uploaded during the window? Then they were active in the sense that
    // matters most to ARTINU.
    const cutoff = new Date(today.getTime() - INACTIVITY_DAYS * DAY).toISOString();
    const recentUploads = await db.artworks.count({ artistId: artist.id }, (artwork) =>
      artwork.createdAt > cutoff,
    );
    if (recentUploads > 0) {
      summary.skipped += 1;
      continue;
    }

    await db.users.update(artist.id, { inactivityReviewedAt: now() } as never);

    // Flagged, not suspended. The console shows the queue; a person acts.
    await notify({
      userId: artist.id,
      type: 'system',
      title: 'Your ARTINU account has been quiet for a while',
      body:
        `We have not seen any activity or uploads on your account for ${INACTIVITY_DAYS} days. ` +
        'Upload something to keep it active — accounts that stay inactive may be suspended.',
      link: '/studio/upload',
    }).catch((error) => logger.error('Could not notify an inactive artist', error));

    summary.flagged += 1;
  }

  return summary;
}

/** Both rules, for the nightly scheduler. Never throws. */
export async function runLifecycleSweeps(today = new Date()): Promise<void> {
  try {
    const newAccounts = await runNewAccountSweep(today);
    const inactive = await runInactivitySweep(today);

    // Quiet unless something happened — a nightly "0 warned" line for months on
    // end is how a log stops being read.
    if (newAccounts.warned || inactive.flagged) {
      logger.info(
        `Lifecycle sweep: ${newAccounts.warned} new-account warning(s), ` +
          `${inactive.flagged} account(s) flagged for inactivity review.`,
      );
    }
  } catch (error) {
    logger.error('The lifecycle sweep failed', error);
  }
}
