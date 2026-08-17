import { db, type StoredUser } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { sendWelcomeEmail } from '@/services/email.service';
import { logger } from '@/utils/logger';

/**
 * The welcome email, sent exactly once per registered account.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * Registration already had three entry points — `/auth/sign-up`,
 * `/auth/register/artist` and `/auth/register/space-owner` — and a welcome
 * message dropped inline into each of them would be three chances to send two.
 * The guard belongs in one place that all three call.
 *
 * ── What actually stops a duplicate ─────────────────────────────────────────
 *
 * Two layers, in this order:
 *
 *  1. The `users.email` unique constraint. Every duplicate the brief lists —
 *     a page refresh, a double-submitted form, an axios retry, a React
 *     re-render, a network retry — replays the same POST, and `createUser`
 *     rejects it with a 409 before any mail code is reached. This is the
 *     mechanism that does the real work, and it was already there.
 *
 *  2. This marker. It covers what the constraint cannot: a second call for an
 *     account that already exists — a re-run of a backfill, a future admin
 *     "resend", or a new registration path added later that forgets the rule.
 *     The marker is claimed *before* the send, so two concurrent callers cannot
 *     both pass the check and both deliver.
 *
 * Claiming first means a provider outage costs that one welcome message rather
 * than risking a second copy later. That is the right trade for a courtesy
 * email: a failure is recorded as `user.welcome_email_failed` and the rendered
 * message is still visible in Console → System → Email Log, so it can be seen
 * and re-sent deliberately. Losing a welcome note is recoverable; sending two
 * to a brand-new user is not.
 *
 * ── What it must never do ───────────────────────────────────────────────────
 *
 * Throw. The account, profile and any space rows are committed by the time this
 * runs. An exception escaping here would surface as a failed registration for a
 * user who *does* now exist and whose email address is therefore taken — they
 * could never register again. Every path below is caught.
 */

const SENT = 'user.welcome_email_sent';
const FAILED = 'user.welcome_email_failed';

/** Has this account already been claimed for a welcome message? */
async function alreadySent(userId: string): Promise<boolean> {
  const existing = await db.auditLogs.findOne({ action: SENT, entityId: userId });
  return existing !== null;
}

/**
 * Fire-and-forget from a registration handler:
 *
 *     void sendWelcomeEmailOnce(user, input.fullName, 'artist');
 *
 * Deliberately not awaited at the call sites. A full provider round trip is
 * slow enough to be worth not making a new user wait for it, and its outcome
 * has no bearing on the response they get.
 */
export async function sendWelcomeEmailOnce(
  user: Pick<StoredUser, 'id' | 'email'>,
  name: string,
  role?: string,
): Promise<void> {
  try {
    if (await alreadySent(user.id)) {
      logger.info(`Welcome email already sent to ${user.email} — not sending another`);
      return;
    }

    // Claim before sending. Under two concurrent callers the loser still sends
    // — there is no atomic claim without a unique index on audit_logs, and
    // adding one is not worth a migration when layer 1 already makes the race
    // unreachable through every real registration path.
    await recordAudit({
      actor: { id: user.id, email: user.email },
      action: SENT,
      entity: 'user',
      entityId: user.id,
      meta: { role: role ?? null },
    });

    const result = await sendWelcomeEmail(user.email, name, role);

    if (!result.delivered) {
      // Not an exception: the account is fine and the visitor is already signed
      // in. This is an operational signal, not a user-facing failure.
      logger.error(
        `Welcome email to ${user.email} was not delivered` +
          (result.skippedReason ? ` — ${result.skippedReason}` : ' — see the mail log above for the provider error'),
      );
      await recordAudit({
        actor: { id: user.id, email: user.email },
        action: FAILED,
        entity: 'user',
        entityId: user.id,
        meta: { reason: result.skippedReason ?? 'provider rejected or errored' },
      }).catch(() => {
        /* the logger line above is the fallback record */
      });
    }
  } catch (error) {
    // Reached only if the audit read/write itself failed — a database blip.
    // Swallowed on purpose: see the file header.
    logger.error(`Could not send the welcome email to ${user.email}`, error);
  }
}
