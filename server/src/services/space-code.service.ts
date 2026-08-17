import type { Space } from '@artinu/shared';
import { randomInt } from 'node:crypto';
import { db } from '@/database/db';
import { conflict } from '@/utils/errors';
import { now } from '@/utils/ids';

/**
 * Space IDs and issued passwords (requirements §1).
 *
 * The brief: a café owner should not have to invent credentials. When their
 * space is registered ARTINU issues the ID and the password, and both are shown
 * to them once, on screen, at the end of registration.
 *
 * Two deliberate constraints on that:
 *
 *  · The password is never emailed. Mail is the one channel we cannot recall,
 *    cannot expire, and do not control once it lands — the same reason
 *    employee onboarding sends a setup link instead (employee.service.ts).
 *    Showing it once in the response keeps it in the session that asked for it.
 *
 *  · The account is flagged `mustChangePassword`, so the first sign-in has to
 *    replace it. A password ARTINU generated is a password ARTINU has seen; it
 *    is a hand-over credential, not a long-lived one.
 *
 * The ID is the durable half and behaves like the photographer code: permanent,
 * unique, sequential, never reused.
 */

const CODE_PATTERN = /^SPC-(\d+)$/;

/**
 * SPC-0001, in registration order.
 *
 * The unique index on `spaces.code` is the final authority — this only picks the
 * next candidate, and the caller retries on collision.
 */
export async function nextSpaceCode(): Promise<string> {
  const spaces = await db.spaces.find();
  const highest = spaces.reduce((max, row) => {
    const match = CODE_PATTERN.exec(String((row as { code?: string }).code ?? ''));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `SPC-${String(highest + 1).padStart(4, '0')}`;
}

/** A collision is the only error worth retrying — see photo-id.service.ts. */
function isCodeCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate key|23505|unique constraint/i.test(message);
}

/**
 * Gives a space its permanent ID, if it does not have one yet.
 *
 * Returns null rather than throwing when the column is missing — a project that
 * has not run migration 006 should still be able to register a space, just
 * without an ID, instead of failing the registration outright.
 */
export async function ensureSpaceCode(space: Pick<Space, 'id'> & { code?: string | null }) {
  if (space.code) return space.code;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = await nextSpaceCode();
    try {
      await db.spaces.update(space.id, { code: candidate, updatedAt: now() } as never);
      return candidate;
    } catch (error) {
      if (isCodeCollision(error)) continue;
      // A missing column, a dropped connection — the next candidate fails the
      // same way, so stop. The space itself is already saved.
      return null;
    }
  }
  throw conflict('We could not allocate a unique space ID. Please try again.');
}

// ── Issued passwords ────────────────────────────────────────────────────────

/**
 * Deliberately excludes the characters people mistype when reading a password
 * off a screen: O/0, I/l/1, and the letters that look alike in the display
 * face. What is left is unambiguous when spoken over the phone, which is how
 * these actually get handed over.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/**
 * A one-time password the owner can read, type and repeat aloud — four letters,
 * a dash, four digits, e.g. `KRPD-4827`.
 *
 * 23^4 x 8^4 is about 1.1 billion combinations, which is ample for a credential
 * that must be replaced at first sign-in and is never emailed. `randomInt` is
 * the CSPRNG; `Math.random` would not be.
 */
export function issuedPassword(): string {
  const letters = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const digits = Array.from({ length: 4 }, () => DIGITS[randomInt(DIGITS.length)]).join('');
  return `${letters}-${digits}`;
}
