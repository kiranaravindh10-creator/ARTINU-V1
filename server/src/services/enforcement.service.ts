import {
  WARNING_LIMIT,
  type UserStatus,
  type Warning,
  type WarningCategory,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { badRequest, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { recordAudit } from '@/services/audit.service';
import { notify } from '@/services/notification.service';
import { sendWarningEmail, sendAccountStatusEmail } from '@/services/email.service';

/**
 * Community Guidelines enforcement: warnings, suspension, ban, restore.
 *
 * ── The three-warning policy is not automatic ───────────────────────────────
 *
 * §12 says three warnings "may result in" permanent suspension or banning. That
 * word is doing real work, and the implementation honours it: reaching three
 * marks the account *eligible* for serious enforcement and surfaces it for
 * review. It does not ban anybody. A person decides.
 *
 * Serious violations — fraud, copyright, harassment, impersonation — do not
 * wait for three. `suspendAccount` and `banAccount` can be called at any warning
 * count, which is what the same section asks for.
 *
 * ── Nothing here deletes anything ───────────────────────────────────────────
 *
 * §16 and §17: a suspended or banned account keeps its row, its profile and its
 * photographs. Enforcement changes `status`, and the auth layer reads it. It is
 * reversible for a suspension and recorded either way.
 */

export interface IssueWarningInput {
  userId: string;
  reason: string;
  category?: WarningCategory;
  notes?: string;
  artworkId?: string;
  actor?: { id: string; email: string } | null;
  /** Skip the email — used by the automated sweeps, which send their own. */
  silent?: boolean;
}

export interface WarningOutcome {
  warning: Warning;
  count: number;
  /** True once the account has reached the limit and needs a human decision. */
  eligibleForEnforcement: boolean;
}

/** Warnings against an account, newest first. */
export async function listWarnings(userId: string): Promise<Warning[]> {
  return db.warnings.find({
    where: { userId },
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
}

export async function countWarnings(userId: string): Promise<number> {
  return db.warnings.count({ userId });
}

/**
 * Records a warning and tells the photographer about it.
 *
 * The number is computed from the existing rows rather than read off a counter
 * on the user, so there is exactly one source of truth and it cannot drift.
 */
export async function issueWarning(input: IssueWarningInput): Promise<WarningOutcome> {
  const user = await db.users.byId(input.userId);
  if (!user) throw notFound('That account');

  const existing = await countWarnings(user.id);
  const number = existing + 1;

  const warning = await db.warnings.insert({
    userId: user.id,
    number,
    category: input.category ?? 'guidelines',
    reason: input.reason.trim(),
    notes: input.notes?.trim() || null,
    artworkId: input.artworkId ?? null,
    issuedBy: input.actor?.id ?? null,
    issuedByEmail: input.actor?.email ?? null,
    acknowledged: false,
    createdAt: now(),
  });

  await recordAudit({
    actor: input.actor ?? undefined,
    action: 'user.warning_issued',
    entity: 'user',
    entityId: user.id,
    meta: { number, category: warning.category, reason: warning.reason },
  });

  // In-product first: the bell is the channel ARTINU controls.
  await notify({
    userId: user.id,
    type: 'system',
    title: `Community Guidelines warning (${number} of ${WARNING_LIMIT})`,
    body: warning.reason,
    link: '/studio/account',
  }).catch((error) => logger.error('Could not record the warning notification', error));

  if (!input.silent) {
    const profile = await db.profiles.findOne({ userId: user.id });
    await sendWarningEmail(
      user.email,
      profile?.fullName ?? 'there',
      warning.reason,
      number,
      WARNING_LIMIT,
    ).catch((error) => logger.error(`Could not email the warning to ${user.email}`, error));
  }

  return {
    warning,
    count: number,
    eligibleForEnforcement: number >= WARNING_LIMIT,
  };
}

/** Withdraws a warning. The row is deleted; the audit entry is not. */
export async function withdrawWarning(
  warningId: string,
  actor: { id: string; email: string },
): Promise<void> {
  const warning = await db.warnings.byId(warningId);
  if (!warning) throw notFound('That warning');

  await db.warnings.remove(warning.id);

  await recordAudit({
    actor,
    action: 'user.warning_withdrawn',
    entity: 'user',
    entityId: warning.userId,
    meta: { number: warning.number, reason: warning.reason },
  });
}

interface StatusChange {
  userId: string;
  status: Extract<UserStatus, 'suspended' | 'banned' | 'verified'>;
  reason: string;
  actor: { id: string; email: string };
}

/**
 * Moves an account between active, suspended and banned.
 *
 * Staff accounts are refused outright. Suspending the CEO from the console
 * would be a way to lock ARTINU out of ARTINU, and there is no legitimate
 * reason to reach an internal account through Community Guidelines enforcement.
 */
async function changeStatus({ userId, status, reason, actor }: StatusChange): Promise<StoredUser> {
  const user = await db.users.byId(userId);
  if (!user) throw notFound('That account');

  const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];
  if (INTERNAL.includes(user.role)) {
    throw badRequest('Staff accounts cannot be suspended or banned from here.');
  }

  if (user.status === status) {
    throw badRequest(`That account is already ${status}.`);
  }

  const updated = await db.users.update(user.id, {
    status,
    statusReason: reason.trim(),
    statusChangedAt: now(),
    statusChangedBy: actor.id,
  } as never);

  await recordAudit({
    actor,
    action: `user.${status === 'verified' ? 'restored' : status}`,
    entity: 'user',
    entityId: user.id,
    meta: { from: user.status, to: status, reason },
  });

  const profile = await db.profiles.findOne({ userId: user.id });
  await sendAccountStatusEmail(user.email, profile?.fullName ?? 'there', status, reason).catch(
    (error) => logger.error(`Could not email the status change to ${user.email}`, error),
  );

  return updated;
}

/** Reversible. The account keeps everything; it just cannot sign in. */
export const suspendAccount = (input: Omit<StatusChange, 'status'>) =>
  changeStatus({ ...input, status: 'suspended' });

/** Permanent. Still not a deletion — §17 is explicit that data is preserved. */
export const banAccount = (input: Omit<StatusChange, 'status'>) =>
  changeStatus({ ...input, status: 'banned' });

/**
 * Puts a suspended account back.
 *
 * Deliberately available for `suspended` only. A ban is described as permanent,
 * and an "undo" button beside it invites exactly the accidental reversal the
 * word permanent is meant to prevent — lifting one is a deliberate act that
 * goes through the same call with an explicit reason.
 */
export async function restoreAccount(input: Omit<StatusChange, 'status'>): Promise<StoredUser> {
  const user = await db.users.byId(input.userId);
  if (!user) throw notFound('That account');
  if (user.status !== 'suspended' && user.status !== 'banned') {
    throw badRequest('That account is not suspended.');
  }
  return changeStatus({ ...input, status: 'verified' });
}
