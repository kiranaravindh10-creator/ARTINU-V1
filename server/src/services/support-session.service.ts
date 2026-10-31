import {
  ASSISTABLE_ROLES,
  hasPermission,
  SUPPORT_SESSION_MINUTES,
  type SupportSession,
  type SupportSessionGrant,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { profileFor } from '@/services/auth.service';
import { notify } from '@/services/notification.service';
import { signSupportToken } from '@/services/token.service';
import { badRequest, forbidden, notFound } from '@/utils/errors';
import { minutesFromNow, now } from '@/utils/ids';

/**
 * "Assist User": an administrator looking at the product as one customer or
 * artist sees it, to troubleshoot what they are seeing.
 *
 * ── What keeps this safe ────────────────────────────────────────────────────
 *
 *   - A reason is required and recorded, with who, for whom and when.
 *   - Only customers and artists can be assisted. Never staff: assisting
 *     another administrator would be borrowing their privileges.
 *   - The credential is separate and short-lived. It is not the user's session
 *     and cannot be turned into one (see /auth/session in support mode).
 *   - The session is read-only: supportSessionGuard refuses every write that is
 *     not explicitly allowed, and records each attempt.
 *   - It ends on exit, on expiry, if the administrator loses users.assist or is
 *     suspended, or if their own sessions are revoked.
 *   - No password is involved at any point.
 *   - The person being assisted is told, in their notifications, that it
 *     happened and why.
 */

const BLOCKED_STATUSES = ['suspended', 'banned', 'pending_ceo_approval'];

export async function startSupportSession(
  admin: StoredUser,
  targetUserId: string,
  reason: string,
  ip: string | null,
): Promise<SupportSessionGrant> {
  if (!hasPermission(admin.role, 'users.assist')) {
    throw forbidden('Your role does not allow support sessions.');
  }

  const target = await db.users.byId(targetUserId);
  if (!target) throw notFound('That user');
  if (target.id === admin.id) throw badRequest('You cannot open a support session on your own account.');
  if (!(ASSISTABLE_ROLES as readonly string[]).includes(target.role)) {
    throw forbidden('Support sessions are for customers and artists only - never for staff accounts.');
  }
  if (BLOCKED_STATUSES.includes(target.status)) {
    throw badRequest(
      'This account is suspended or awaiting approval, so the product would not load for it. Restore it first, or look at it from People & access.',
    );
  }

  // One open session per administrator: starting another closes the last.
  const open = await db.supportSessions.find({
    filter: (session) => session.adminId === admin.id && !session.endedAt,
  });
  for (const session of open) {
    await db.supportSessions.update(session.id, { endedAt: now(), endReason: 'replaced' });
  }

  const expiresAt = minutesFromNow(SUPPORT_SESSION_MINUTES);
  const session = await db.supportSessions.insert({
    adminId: admin.id,
    adminEmail: admin.email,
    targetUserId: target.id,
    targetEmail: target.email,
    targetRole: target.role,
    reason: reason.trim(),
    startedAt: now(),
    expiresAt,
    endedAt: null,
    endReason: null,
    requestCount: 0,
    blockedCount: 0,
    ip,
  });

  const token = signSupportToken(
    { sub: target.id, email: target.email, role: target.role, sid: session.id, act: admin.id },
    SUPPORT_SESSION_MINUTES * 60,
  );

  await recordAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'support_session.started',
    entity: 'user',
    entityId: target.id,
    meta: { sessionId: session.id, reason: session.reason, expiresAt, targetEmail: target.email },
    ip,
  });

  // Transparency: the account holder can see that someone from ARTINU looked.
  await notify({
    userId: target.id,
    type: 'system',
    title: 'ARTINU support opened your account',
    body: `A member of the ARTINU team viewed your account to help with: ${session.reason}. They could not change anything or see your password.`,
  });

  const profile = await profileFor(target.id);
  return {
    token,
    expiresAt,
    session,
    target: {
      id: target.id,
      email: target.email,
      role: target.role,
      name: profile?.displayName || profile?.fullName || target.email,
    },
  };
}

export async function endSupportSession(
  sessionId: string,
  endReason: 'exited' | 'expired' | 'revoked',
  actor: { id: string; email: string } | null,
): Promise<SupportSession> {
  const session = await db.supportSessions.byId(sessionId);
  if (!session) throw notFound('That support session');
  if (session.endedAt) return session;

  const ended = await db.supportSessions.update(session.id, { endedAt: now(), endReason });
  await recordAudit({
    actor: actor ?? undefined,
    action: 'support_session.ended',
    entity: 'user',
    entityId: session.targetUserId ?? undefined,
    meta: {
      sessionId: session.id,
      endReason,
      requestCount: session.requestCount,
      blockedCount: session.blockedCount,
    },
  });
  return ended;
}

export async function listSupportSessions(filter: { userId?: string; adminId?: string } = {}) {
  return db.supportSessions.find({
    filter: (session) =>
      (!filter.userId || session.targetUserId === filter.userId) &&
      (!filter.adminId || session.adminId === filter.adminId),
    orderBy: { field: 'startedAt', direction: 'desc' },
    limit: 100,
  });
}

/** A session past its time but never closed is shown as expired, not open. */
export function presentSession(session: SupportSession): SupportSession {
  if (!session.endedAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    return { ...session, endedAt: session.expiresAt, endReason: 'expired' };
  }
  return session;
}
