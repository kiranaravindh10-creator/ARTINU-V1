import { z } from 'zod';
import { ROLES, USER_STATUSES } from './constants.js';
import { ACCOUNT_TYPES } from './permissions.js';

/**
 * People & access: support sessions and the account actions around them.
 *
 * ── Support sessions ────────────────────────────────────────────────────────
 *
 * "Assist User" never hands an administrator somebody's password, and never
 * rewrites who the browser thinks it is. The server issues a separate,
 * short-lived credential tied to a recorded session - who opened it, for whom,
 * why, until when - and every request made with it is checked against that
 * record. It is read-only unless an action is explicitly allowed, it cannot be
 * opened for a member of staff, and it cannot be turned into an ordinary
 * session. The administrator's own session is kept aside and restored on exit.
 */
export interface SupportSession {
  id: string;
  adminId: string | null;
  adminEmail: string;
  targetUserId: string | null;
  targetEmail: string;
  targetRole: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt?: string | null;
  /** 'exited', 'expired', 'revoked' */
  endReason?: string | null;
  requestCount: number;
  blockedCount: number;
  ip?: string | null;
}

/** What starting a support session returns to the Console. */
export interface SupportSessionGrant {
  token: string;
  expiresAt: string;
  session: SupportSession;
  target: { id: string; email: string; role: string; name: string };
}

export const startSupportSessionSchema = z.object({
  userId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(10, 'Say why you need to open this account - it is recorded and shown on the audit trail')
    .max(400),
});

export const userProfileEditSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a name').max(120),
  displayName: z.string().trim().max(120).optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number')
    .optional()
    .nullable()
    .or(z.literal('')),
  city: z.string().trim().max(120).optional().nullable(),
});

export const emailChangeSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
  reason: z.string().trim().min(5, 'Say why the address is being corrected').max(400),
});

export const passwordActionSchema = z.object({
  mode: z.enum(['email', 'link']),
});

export const accountStatusActionSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason - the account holder is told').max(400),
});

export const roleChangeSchema = z.object({
  role: z.enum(ROLES),
  reason: z.string().trim().max(400).optional().nullable(),
});

/** Moving a member of staff to another branch (branches.ts). */
export const branchChangeSchema = z.object({
  branch: z.string().trim().min(1, 'Choose a branch').max(80),
  reason: z.string().trim().max(400).optional().nullable(),
});

export const userFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  /** An account type, or 'staff' for every Console role at once. */
  type: z.enum([...ACCOUNT_TYPES, 'staff', 'all'] as [string, ...string[]]).optional(),
  role: z.enum([...ROLES, 'all'] as [string, ...string[]]).optional(),
  status: z.enum([...USER_STATUSES, 'all'] as [string, ...string[]]).optional(),
  verified: z.enum(['yes', 'no', 'all']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(10),
});

// ── Sign-in access ──────────────────────────────────────────────────────────
//
// Photographers and staff are both ordinary ARTINU accounts: one sign-in page,
// one users table, and the role decides where they land (Studio or Console).
// "Giving someone access" is therefore an invitation: an account in the right
// role and a single-use link to choose their own password. Nobody at ARTINU
// sets, sees or sends a password.

/** The roles People & access can invite someone into. */
export const INVITABLE_ROLES = ['artist', 'operations', 'manager', 'accounts', 'it_team', 'ceo'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  fullName: z.string().trim().min(2, 'Enter their name').max(120),
  role: z.enum(INVITABLE_ROLES),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/**
 * Where an account stands on signing in.
 *
 *   active              has a password of their own and may sign in
 *   invited             a setup link is waiting, not used yet
 *   invitation_expired  the setup link ran out unused - send a new one
 *   awaiting_approval   IT access the CEO has not approved yet
 *   blocked             suspended or closed
 */
export type AccessState = 'active' | 'invited' | 'invitation_expired' | 'awaiting_approval' | 'blocked';

export const ACCESS_STATE_LABELS: Record<AccessState, string> = {
  active: 'Can sign in',
  invited: 'Invitation sent',
  invitation_expired: 'Invitation expired',
  awaiting_approval: 'Awaiting CEO approval',
  blocked: 'Sign-in blocked',
};

export interface AccountAccess {
  state: AccessState;
  /** The last sign-in after the account was created - null if there has not been one. */
  lastSignInAt: string | null;
  /** The newest unused setup link, while the account has never been signed in to. */
  inviteSentAt: string | null;
  inviteExpiresAt: string | null;
}

/**
 * An artist application as the Console lists it - operational state, not a
 * decision. There is no approval: an application makes the account.
 *
 *   ready            the account exists, its code and every photograph are in place
 *   needs_attention  the account exists but something did not finish (a code,
 *                    a photograph) - retry setup
 *   not_created      no artist account could be made - `problem` says why
 */
export type ApplicationSetupState = 'ready' | 'needs_attention' | 'not_created';

export interface ApplicationAccount {
  userId: string;
  role: string;
  access: AccountAccess;
  photographerCode: string | null;
}

export interface ApplicationSetup {
  state: ApplicationSetupState;
  account: ApplicationAccount | null;
  photographsSubmitted: number;
  /** Submitted files with a photograph record owned by the account. */
  photographsLinked: number;
  /**
   * Linked photographs still without a real title or a story - the application
   * never asked for either. The photographer completes them in the Studio.
   */
  photographsNeedingDetails: number;
  problem: string | null;
}

/** A photographer account's public side, as People & access shows it. */
export interface PhotographerLink {
  /** Public profile at /artists/:slug - null until the profile has one. */
  slug: string | null;
  photographerCode: string | null;
  photographs: number;
}

/**
 * Write requests a support session may make. Empty on purpose: a support
 * session is read-only until a specific, harmless action is added here by
 * name, with a reason in the commit that adds it.
 */
export const SUPPORT_SESSION_WRITE_ALLOWLIST: readonly string[] = [];
