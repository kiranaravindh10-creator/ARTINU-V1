import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { db, type StoredUser } from '@/database/db';
import { badRequest, tooMany, unauthorized } from '@/utils/errors';
import { minutesFromNow, now } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { sendVerificationCodeEmail } from '@/services/email.service';

/**
 * Email verification by 6-digit code.
 *
 * ── Why this is not a new table ─────────────────────────────────────────────
 *
 * `otp_challenges` already does everything a verification code needs: it
 * expires, counts attempts, and marks itself consumed. Sign-in has used it
 * since the beginning. Adding a second table would mean a second expiry rule
 * and a second place to get attempt-limiting wrong, so this reuses it and
 * separates the two flows with a `purpose` column.
 *
 * ── What it replaces ────────────────────────────────────────────────────────
 *
 * There was already an email verification flow, and it still exists: a
 * single-use token in a link, consumed by `POST /auth/verify-email`. It is left
 * in place so that links already sitting in people's inboxes keep working. New
 * registrations get a code instead, which is what the CEO asked for and what
 * works when someone registers on a laptop and reads mail on a phone.
 *
 * ── The code is never stored ────────────────────────────────────────────────
 *
 * Only `sha256(code)` goes into the database. A code is six digits, so a hash
 * of one is trivially brute-forced *offline* — that is not the point. The point
 * is that a live code cannot be read out of a database dump, a log line, an
 * errant `select *`, or a support screen, and used within its ten minutes. The
 * attempt limit below is what actually defends the code itself.
 */

/** Ten minutes, as specified. */
const TTL_MINUTES = 10;

/** Wrong guesses before the code is burned. Six digits, so this matters. */
const MAX_ATTEMPTS = 5;

/** Nobody needs a new code more than once a minute. */
const RESEND_COOLDOWN_SECONDS = 60;

/** Codes per account per hour, however often they ask. */
const MAX_PER_HOUR = 5;

const PURPOSE = 'email_verification';

const hash = (code: string) => createHash('sha256').update(code.trim()).digest('hex');

/**
 * Compares two hashes without leaking, through timing, how much of the value
 * matched. Overkill for a hex digest of a six-digit number, and cheap enough
 * that there is no reason to reach for `===` and have to justify it.
 */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Cryptographically random, not `Math.random()`. */
const generateCode = () =>
  Array.from({ length: 6 }, () => randomInt(0, 10)).join('');

export interface IssuedVerification {
  challengeId: string;
  expiresAt: string;
  /** Masked, so the UI can say where it went without printing the address. */
  sentTo: string;
}

const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const shown = name.slice(0, 2);
  return `${shown}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

/**
 * Issues a fresh verification code and emails it.
 *
 * Every earlier unconsumed code for the account is retired first, so only the
 * newest one works — asking for a new code must invalidate the old one, or
 * "resend" quietly doubles the number of valid codes.
 */
export async function issueVerificationCode(
  user: Pick<StoredUser, 'id' | 'email'>,
  name = 'there',
): Promise<IssuedVerification> {
  const outstanding = await db.otpChallenges.find({
    where: { userId: user.id, purpose: PURPOSE, consumed: false },
  });

  // Rate limit on issue, not on the route, so every path that can send a code
  // is covered by the same rule.
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = await db.otpChallenges.find({
    where: { userId: user.id, purpose: PURPOSE },
    filter: (row) => new Date(row.createdAt).getTime() > hourAgo,
  });

  if (recent.length >= MAX_PER_HOUR) {
    throw tooMany('Too many codes requested. Please try again in an hour.');
  }

  const newest = recent
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (newest) {
    const since = (Date.now() - new Date(newest.createdAt).getTime()) / 1000;
    if (since < RESEND_COOLDOWN_SECONDS) {
      throw tooMany(
        `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - since)} seconds before asking for another code.`,
      );
    }
  }

  await Promise.all(
    outstanding.map((row) => db.otpChallenges.update(row.id, { consumed: true })),
  );

  const code = generateCode();

  const challenge = await db.otpChallenges.insert({
    userId: user.id,
    // The raw column stays empty for verification codes; only the hash is kept.
    code: '',
    codeHash: hash(code),
    purpose: PURPOSE,
    sentTo: user.email,
    channel: 'email',
    expiresAt: minutesFromNow(TTL_MINUTES),
    attempts: 0,
    consumed: false,
    createdAt: now(),
  });

  await sendVerificationCodeEmail(user.email, name, code, TTL_MINUTES);

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    sentTo: maskEmail(user.email),
  };
}

/**
 * Checks a code and, if it is right, marks the address verified.
 *
 * The challenge is looked up by id *and* by the user making the request, so a
 * challenge id belonging to somebody else is not a way to verify their address.
 */
export async function confirmVerificationCode(
  userId: string,
  challengeId: string,
  code: string,
): Promise<StoredUser> {
  const challenge = await db.otpChallenges.byId(challengeId);

  if (!challenge || challenge.userId !== userId || challenge.purpose !== PURPOSE) {
    throw badRequest('That code is no longer valid. Please request a new one.');
  }
  if (challenge.consumed) {
    throw badRequest('That code has already been used. Please request a new one.');
  }
  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw badRequest('That code has expired. Please request a new one.');
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    throw tooMany('Too many incorrect codes. Please request a new one.');
  }

  const stored = challenge.codeHash;
  if (!stored || !hashesMatch(stored, hash(code))) {
    await db.otpChallenges.update(challenge.id, { attempts: challenge.attempts + 1 });
    const left = MAX_ATTEMPTS - (challenge.attempts + 1);
    throw badRequest(
      left > 0
        ? `That code is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left.`
        : 'That code is not correct, and there are no tries left. Please request a new one.',
    );
  }

  await db.otpChallenges.update(challenge.id, { consumed: true });

  const user = await db.users.byId(userId);
  if (!user) throw unauthorized();

  /*
    Only the two verification fields move.

    `status` is deliberately left alone when it is anything other than
    `pending_verification`: a suspended or banned account that verifies its
    address is still suspended or banned, and writing `verified` here would
    quietly undo an enforcement decision.
  */
  const patch: Record<string, unknown> = { emailVerified: true };
  if (user.status === 'pending_verification') patch.status = 'verified';

  return db.users.update(user.id, patch as never);
}

/**
 * True when this deployment can store verification codes at all.
 *
 * `otp_challenges.purpose` and `.code_hash` arrive with migration 010. Until it
 * is applied the insert above fails, and the caller needs to know that rather
 * than reporting a broken registration to the person signing up.
 */
export function isMissingVerificationColumns(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /PGRST204|could not find|does not exist|schema cache/i.test(message) &&
    /purpose|code_hash/i.test(message)
  );
}

/** Fire-and-forget from a registration handler. Never throws. */
export async function sendVerificationCodeQuietly(
  user: Pick<StoredUser, 'id' | 'email'>,
  name: string,
): Promise<void> {
  try {
    await issueVerificationCode(user, name);
  } catch (error) {
    if (isMissingVerificationColumns(error)) {
      logger.error(
        'otp_challenges.purpose / code_hash are missing — run ' +
          'database/migrations/010_verification_and_enforcement.sql. ' +
          'Registration still works, but no verification code was sent.',
      );
      return;
    }
    logger.error(`Could not send a verification code to ${user.email}`, error);
  }
}
