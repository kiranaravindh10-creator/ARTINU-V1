import {
  accountTypeOf,
  hasPermission,
  inBranchScope,
  INTERNAL_ROLES,
  ROLE_LABELS,
  sameBranch,
  type AccountAccess,
  type AccountType,
  type BranchScope,
  type InviteUserInput,
  type Order,
  type PhotographerLink,
  type Profile,
  type Role,
  type User,
} from '@artinu/shared';
import { env } from '@/config/env';
import { db, type StoredUser, type TokenRecord } from '@/database/db';
import { paginate } from '@/database/table';
import { recordAudit } from '@/services/audit.service';
import { configuredBranches } from '@/services/branch.service';
import {
  createProfile,
  createUser,
  findByEmail,
  issueToken,
  profileFor,
  sanitizeUser,
  temporaryPassword,
} from '@/services/auth.service';
import {
  sendEmailChangeConfirmation,
  sendEmailChangedNotice,
  sendMail,
  sendPasswordResetEmail,
} from '@/services/email.service';
import { assignPhotographerCodeIfArtist } from '@/services/photo-id.service';
import { restoreAccount, suspendAccount } from '@/services/enforcement.service';
import { notify } from '@/services/notification.service';
import { orderMoneyFor } from '@/services/order-money.service';
import { listSupportSessions, presentSession } from '@/services/support-session.service';
import { badRequest, conflict, forbidden, HttpError, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';

/**
 * People & access - the account side of the Console.
 *
 * Every function here takes the acting administrator and enforces the rules
 * itself, rather than trusting that the route checked: role changes in
 * particular are the one place a mistake becomes a privilege escalation.
 *
 * Passwords never pass through here in either direction. An administrator can
 * send a reset email, hand over a single-use link, force a change at next
 * sign-in or sign the account out everywhere - and that is all.
 */

type Actor = Pick<StoredUser, 'id' | 'email' | 'role'>;

export interface AdminUserRow extends User {
  profile: Profile | null;
  accountType: AccountType;
  /** Spaces owned, and client businesses linked to this login. */
  businesses: string[];
  access: AccountAccess;
  /** Photographers only. */
  photographer: PhotographerLink | null;
}

// ── Sign-in access ───────────────────────────────────────────────────────────

/**
 * Accounts made for someone used to be stamped with a sign-in at the moment
 * they were created (createUser now leaves it empty for them). That stamp is
 * written in the same statement as `createdAt`, so it lands within a few
 * milliseconds of it; a person cannot get from an invitation email to a
 * signed-in session in under a second.
 */
const CREATION_STAMP_MS = 1_000;

function signedInSince(user: StoredUser): string | null {
  if (!user.lastLoginAt) return null;
  return Date.parse(user.lastLoginAt) - Date.parse(user.createdAt) > CREATION_STAMP_MS ? user.lastLoginAt : null;
}

/**
 * Where an account stands on signing in. `setupLinks` are its unused
 * password-reset tokens - read here to tell "invited" from "active", and never
 * returned: only their dates leave the server.
 */
export function accessOf(user: StoredUser, setupLinks: TokenRecord[]): AccountAccess {
  const lastSignInAt = signedInSince(user);
  const none = { lastSignInAt, inviteSentAt: null, inviteExpiresAt: null };
  if (user.status === 'suspended' || user.status === 'banned') return { ...none, state: 'blocked' };
  if (user.status === 'pending_ceo_approval') return { ...none, state: 'awaiting_approval' };
  if (lastSignInAt) return { ...none, state: 'active' };

  const latest = setupLinks
    .filter((link) => link.userId === user.id && link.purpose === 'password_reset' && !link.consumed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return { ...none, state: 'active' };
  return {
    lastSignInAt: null,
    state: Date.parse(latest.expiresAt) < Date.now() ? 'invitation_expired' : 'invited',
    inviteSentAt: latest.createdAt,
    inviteExpiresAt: latest.expiresAt,
  };
}

/** Unused setup links for these accounts - one query for a page of them. */
async function setupLinksFor(userIds: string[]): Promise<TokenRecord[]> {
  if (userIds.length === 0) return [];
  const wanted = new Set(userIds);
  return db.tokens.find({
    where: { purpose: 'password_reset', consumed: false },
    filter: (token) => wanted.has(token.userId),
  });
}

async function photographerLinkFor(user: StoredUser, profile: Profile | null): Promise<PhotographerLink | null> {
  if (user.role !== 'artist') return null;
  return {
    slug: profile?.slug ?? null,
    photographerCode: profile?.photographerCode ?? null,
    photographs: await db.artworks.count({ artistId: user.id } as never).catch(() => 0),
  };
}

export interface UserListFilter {
  q?: string;
  type?: string;
  role?: string;
  status?: string;
  verified?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listUsers(filter: UserListFilter, scope?: BranchScope) {
  const [allUsers, profiles, spaces, clients] = await Promise.all([
    db.users.find({ orderBy: { field: 'createdAt', direction: 'desc' } }),
    db.profiles.find(),
    db.spaces.find(),
    db.clients.find().catch(() => []),
  ]);

  const users = scope ? allUsers.filter((user) => staffInScope(scope, user)) : allUsers;
  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const businessesByUser = new Map<string, string[]>();
  const add = (userId: string | null | undefined, name: string) => {
    if (!userId) return;
    const list = businessesByUser.get(userId) ?? [];
    if (!list.includes(name)) list.push(name);
    businessesByUser.set(userId, list);
  };
  for (const space of spaces) add(space.ownerId, space.name);
  for (const client of clients) add(client.linkedUserId, client.name);

  const q = filter.q?.trim().toLowerCase() || null;
  const fromTime = filter.from ? Date.parse(`${filter.from}T00:00:00Z`) : null;
  const toTime = filter.to ? Date.parse(`${filter.to}T23:59:59Z`) : null;

  const matching = users
    .filter((user) => {
      if (filter.type === 'staff') {
        if (!isInternal(user.role)) return false;
      } else if (filter.type && filter.type !== 'all' && accountTypeOf(user.role) !== filter.type) return false;
      if (filter.role && filter.role !== 'all' && user.role !== filter.role) return false;
      if (filter.status && filter.status !== 'all' && user.status !== filter.status) return false;
      if (filter.verified === 'yes' && !user.emailVerified) return false;
      if (filter.verified === 'no' && user.emailVerified) return false;
      const created = Date.parse(user.createdAt);
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      if (!q) return true;
      const profile = profileByUser.get(user.id);
      const haystack = [
        user.id,
        user.email,
        profile?.fullName,
        profile?.displayName,
        ...(businessesByUser.get(user.id) ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

  // Sign-in state and the photographer's public side cost a lookup each, so
  // they are worked out for the page being shown, not every account.
  const page = paginate(matching, filter.page, filter.pageSize);
  const links = await setupLinksFor(page.items.map((user) => user.id));
  const items: AdminUserRow[] = await Promise.all(
    page.items.map(async (user) => {
      const profile = profileByUser.get(user.id) ?? null;
      return {
        ...sanitizeUser(user),
        profile,
        accountType: accountTypeOf(user.role),
        businesses: businessesByUser.get(user.id) ?? [],
        access: accessOf(user, links),
        photographer: await photographerLinkFor(user, profile),
      };
    }),
  );
  return { ...page, items };
}

export async function userDetail(userId: string) {
  const user = await db.users.byId(userId);
  if (!user) throw notFound('That user');

  const [profile, spaces, clients, orders, auditEntries, supportSessions, employee] = await Promise.all([
    profileFor(user.id),
    db.spaces.find({ where: { ownerId: user.id } }),
    db.clients.find({ where: { linkedUserId: user.id } }).catch(() => []),
    db.orders.find({ where: { ownerId: user.id }, orderBy: { field: 'placedAt', direction: 'desc' } }),
    db.auditLogs.find({
      filter: (entry) => entry.entityId === user.id || entry.actorId === user.id,
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 60,
    }),
    // Missing until migration 017 runs; the rest of the record still shows.
    listSupportSessions({ userId: user.id }).catch(() => []),
    db.employees.findOne({ userId: user.id }).catch(() => null),
  ]);
  const links = await setupLinksFor([user.id]);

  const orderIds = new Set(orders.map((order) => order.id));
  const payments = (await db.payments.find({ orderBy: { field: 'createdAt', direction: 'desc' } }))
    .filter((payment) => orderIds.has(payment.orderId))
    .slice(0, 30)
    .map(({ qrImageDataUrl: _qr, qrPayload: _payload, ...payment }) => payment);

  const referenceById = new Map(orders.map((order) => [order.id, order.reference]));
  const orderRows = await Promise.all(
    orders.slice(0, 30).map(async (order: Order) => ({
      id: order.id,
      reference: order.reference,
      status: order.status,
      placedAt: order.placedAt,
      spaceId: order.spaceId,
      total: order.pricing.total,
      money: await orderMoneyFor(order),
    })),
  );

  return {
    user: sanitizeUser(user),
    profile,
    accountType: accountTypeOf(user.role),
    access: accessOf(user, links),
    photographer: await photographerLinkFor(user, profile),
    spaces: spaces.map((space) => ({ id: space.id, name: space.name, city: space.city, code: space.code ?? null })),
    clients: clients.map((client) => ({ id: client.id, name: client.name, city: client.city })),
    employee: employee
      ? {
          employeeCode: employee.employeeCode ?? null,
          jobTitle: employee.jobTitle ?? null,
          department: employee.department ?? null,
          status: employee.status ?? null,
        }
      : null,
    orders: orderRows,
    payments: payments.map((payment) => ({ ...payment, orderReference: referenceById.get(payment.orderId) ?? '-' })),
    supportSessions: supportSessions.map(presentSession),
    activity: auditEntries,
  };
}

// ── Guards ───────────────────────────────────────────────────────────────────

const isInternal = (role: string) => (INTERNAL_ROLES as readonly string[]).includes(role);

/**
 * The rules every account action shares. Nobody acts on themselves from here,
 * and a CEO account can only be touched by a CEO - otherwise the IT team could
 * lock the owner of the business out of it.
 */
export function assertMayManage(actor: Actor, target: StoredUser, what: string) {
  if (target.id === actor.id) throw forbidden(`You cannot ${what} on your own account here.`);
  if (target.role === 'ceo' && actor.role !== 'ceo') {
    throw forbidden('Only a CEO can make changes to a CEO account.');
  }
}

/**
 * Staff belong to a branch; customers and photographers to all of them. Someone
 * held to a branch reaches only their own branch's staff - by list or by id.
 */
export function staffInScope(scope: BranchScope, user: Pick<StoredUser, 'role'> & { branch?: string | null }): boolean {
  return !(INTERNAL_ROLES as readonly string[]).includes(user.role) || inBranchScope(scope, user.branch);
}

/**
 * Moving a member of staff to another branch. It takes effect at their next
 * request: the branch decides which orders, expenses and figures they see.
 */
export async function changeUserBranch(actor: Actor, userId: string, branch: string, reason?: string | null) {
  const target = await loadTarget(userId);
  if (!(INTERNAL_ROLES as readonly string[]).includes(target.role)) {
    throw badRequest('Only members of staff work in a branch. Customers and photographers are shared by every branch.');
  }
  const branches = await configuredBranches();
  const match = branches.find((name) => sameBranch(name, branch));
  if (!match) throw badRequest(`Choose one of the configured branches: ${branches.join(', ')}.`);
  if (target.branch && sameBranch(target.branch, match)) throw badRequest(`That account is already in ${match}.`);

  const updated = await db.users.update(target.id, { branch: match } as never);
  await recordAudit({
    actor,
    action: 'user.branch_changed',
    entity: 'user',
    entityId: target.id,
    meta: { from: target.branch ?? null, to: match, reason: reason?.trim() || null },
  });
  await notify({
    userId: target.id,
    type: 'system',
    title: 'Your branch has changed',
    body: `You now work in ${match}.`,
  });
  return sanitizeUser(updated);
}

async function loadTarget(userId: string) {
  const target = await db.users.byId(userId);
  if (!target) throw notFound('That user');
  return target;
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function updateUserProfile(
  actor: Actor,
  userId: string,
  input: { fullName: string; displayName?: string | null; phone?: string | null; city?: string | null },
) {
  const target = await loadTarget(userId);
  if (target.role === 'ceo' && actor.role !== 'ceo' && target.id !== actor.id) {
    throw forbidden('Only a CEO can make changes to a CEO account.');
  }

  const before = await profileFor(target.id);
  const patch = {
    fullName: input.fullName.trim(),
    displayName: input.displayName?.trim() || null,
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
    updatedAt: now(),
  };

  const profile = before
    ? await db.profiles.update(before.id, patch)
    : await db.profiles.insert({
        userId: target.id,
        avatarUrl: null,
        country: null,
        bio: null,
        website: null,
        instagram: null,
        genres: [],
        createdAt: now(),
        ...patch,
      } as never);

  await recordAudit({
    actor,
    action: 'user.profile_updated',
    entity: 'user',
    entityId: target.id,
    meta: {
      from: before
        ? { fullName: before.fullName, displayName: before.displayName, phone: before.phone, city: before.city }
        : null,
      to: { fullName: patch.fullName, displayName: patch.displayName, phone: patch.phone, city: patch.city },
    },
  });

  return profile;
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function changeUserRole(actor: Actor, userId: string, role: Role, reason?: string | null) {
  const target = await loadTarget(userId);
  if (target.id === actor.id) throw forbidden('You cannot change your own role.');
  if (target.role === role) throw badRequest(`That account is already ${ROLE_LABELS[role]}.`);

  // Only a CEO grants or removes the CEO role, or changes a CEO's account.
  if ((role === 'ceo' || target.role === 'ceo') && actor.role !== 'ceo') {
    throw forbidden('Only a CEO can grant or remove the CEO role.');
  }
  if (target.role === 'ceo') {
    const ceos = await db.users.count({ role: 'ceo' } as never);
    if (ceos <= 1) throw forbidden('This is the last CEO account. Make someone else CEO first.');
  }

  const patch: Partial<StoredUser> = { role };
  /*
    Granting IT access needs the CEO's say, exactly as creating an IT account
    does: the IT team holds users.assist and users.change_role, so one IT
    member promoting a colleague is privilege the business owner should see.
  */
  if (role === 'it_team' && actor.role !== 'ceo') patch.status = 'pending_ceo_approval';

  const updated = await db.users.update(target.id, patch as never);

  await recordAudit({
    actor,
    action: 'user.role_changed',
    entity: 'user',
    entityId: target.id,
    meta: {
      from: target.role,
      to: role,
      reason: reason?.trim() || null,
      ...(patch.status ? { status: patch.status } : {}),
    },
  });

  await notify({
    userId: target.id,
    type: 'system',
    title: 'Your access has changed',
    body: `Your role is now ${ROLE_LABELS[role]}.`,
  });

  return sanitizeUser(updated);
}

// ── Suspension ───────────────────────────────────────────────────────────────

export async function suspendUser(actor: Actor, userId: string, reason: string) {
  const target = await loadTarget(userId);
  assertMayManage(actor, target, 'suspend access');

  if (!isInternal(target.role)) {
    // Customers and artists: the existing enforcement path, which tells them why.
    return sanitizeUser(await suspendAccount({ userId: target.id, reason, actor }));
  }

  // Staff: the CEO only, and sessions end at once.
  if (actor.role !== 'ceo') throw forbidden('Only a CEO can suspend a staff account.');
  if (target.status === 'suspended') throw badRequest('That account is already suspended.');
  const updated = await db.users.update(target.id, {
    status: 'suspended',
    statusReason: reason.trim(),
    statusChangedAt: now(),
    statusChangedBy: actor.id,
    sessionsRevokedAt: now(),
  } as never);
  await recordAudit({
    actor,
    action: 'user.suspended',
    entity: 'user',
    entityId: target.id,
    meta: { from: target.status, to: 'suspended', reason, staff: true },
  });
  return sanitizeUser(updated);
}

export async function reactivateUser(actor: Actor, userId: string, reason: string) {
  const target = await loadTarget(userId);
  assertMayManage(actor, target, 'restore access');

  if (!isInternal(target.role)) {
    return sanitizeUser(await restoreAccount({ userId: target.id, reason, actor }));
  }

  if (actor.role !== 'ceo') throw forbidden('Only a CEO can restore a staff account.');
  if (target.status !== 'suspended') throw badRequest('That account is not suspended.');
  const updated = await db.users.update(target.id, {
    status: 'verified',
    statusReason: reason.trim(),
    statusChangedAt: now(),
    statusChangedBy: actor.id,
  } as never);
  await recordAudit({
    actor,
    action: 'user.restored',
    entity: 'user',
    entityId: target.id,
    meta: { from: target.status, to: 'verified', reason, staff: true },
  });
  return sanitizeUser(updated);
}

// ── Invitations ──────────────────────────────────────────────────────────────

/** A setup link lasts a week, as the other account-creating flows' do. */
const INVITATION_MINUTES = 60 * 24 * 7;

/**
 * Who may give which role. The CEO role only by a CEO; IT access given by
 * anyone else waits for the CEO, exactly as a role change to IT does.
 */
function assertMayGrant(actor: Actor, role: Role) {
  if (role === 'ceo' && actor.role !== 'ceo') throw forbidden('Only a CEO can give someone the CEO role.');
}

export async function sendInvitation(email: string, name: string, role: Role, token: string) {
  const photographer = role === 'artist';
  const base = env.CLIENT_URL.replace(/\/+$/, '');
  return sendMail({
    to: email,
    subject: photographer ? 'Your ARTINU photographer account' : 'Your ARTINU Console account',
    heading: `Welcome to ARTINU, ${name.trim().split(/\s+/)[0]}.`,
    body: photographer
      ? `An ARTINU administrator has set up a photographer account for ${email}.\n\n` +
        'Choose your password with the button below, then sign in to your Studio to upload and manage your ' +
        'photographs. The link works once and is good for seven days.\n\n' +
        'We will never email you a password, and nobody at ARTINU can see the one you choose.'
      : `An ARTINU administrator has given ${email} access to the ARTINU Console as ${ROLE_LABELS[role]}.\n\n` +
        `Choose your password with the button below, then sign in at ${base}/signin - you go straight to the ` +
        'Console. The link works once and is good for seven days.\n\n' +
        'We will never email you a password, and nobody at ARTINU can see the one you choose.',
    cta: { label: 'Choose your password', url: `${base}/reset-password?token=${encodeURIComponent(token)}` },
    footnote: 'If you were not expecting this, you can ignore it - nothing happens unless the link is used.',
    // Nobody can start without it, so it is not held back by the mail allowance.
    priority: 'critical',
    secrets: [token],
  });
}

/**
 * Invite a photographer or a member of staff: an account in that role, and a
 * single-use link to choose their own password.
 *
 * Never a second account for the same person. An address that already has an
 * account - in any role - is refused, and the refusal names the account so the
 * Console can open it instead: an existing photographer whose profile has no
 * obvious login is managed through the account they already have.
 */
export async function inviteUser(actor: Actor, input: InviteUserInput) {
  const email = input.email.trim().toLowerCase();
  const role = input.role as Role;
  assertMayGrant(actor, role);

  const existing = await findByEmail(email);
  if (existing) {
    throw new HttpError(
      409,
      `${email} already has an ARTINU account (${ROLE_LABELS[existing.role]}). Open it to manage its access - a second account is never created.`,
      'account_exists',
      { existingUserId: [existing.id], existingRole: [existing.role] },
    );
  }

  const user = await createUser({
    email,
    // Never shown to anyone: the person replaces it from their setup link.
    password: temporaryPassword(),
    role,
    emailVerified: true,
    signedIn: false,
  });
  const status = role === 'it_team' && actor.role !== 'ceo' ? 'pending_ceo_approval' : user.status;
  if (status !== user.status) await db.users.update(user.id, { status } as never);

  await createProfile(user.id, { fullName: input.fullName.trim(), displayName: input.fullName.trim() });
  if (role === 'artist') {
    // Same as registration: a failure here must not lose the invitation.
    await assignPhotographerCodeIfArtist(user.id, role).catch((error) =>
      logger.error(`Could not assign a photographer code to ${email}`, error),
    );
  }

  const link = await issueToken(user.id, 'password_reset', INVITATION_MINUTES);
  const sent = await sendInvitation(email, input.fullName, role, link.token);

  await recordAudit({
    actor,
    action: 'user.invited',
    entity: 'user',
    entityId: user.id,
    meta: { email, role, status, delivered: sent.delivered, expiresAt: link.expiresAt },
  });

  return {
    user: sanitizeUser({ ...user, status } as StoredUser),
    delivered: sent.delivered,
    expiresAt: link.expiresAt,
  };
}

/**
 * Send a fresh setup link to someone who has not signed in since their account
 * was made. Every earlier unused link stops working, so only the newest email
 * can be used. Anyone who has signed in gets a password reset instead.
 */
export async function resendInvitation(actor: Actor, userId: string) {
  const target = await loadTarget(userId);
  assertMayManage(actor, target, 'resend an invitation');
  if (target.status === 'suspended' || target.status === 'banned') {
    throw badRequest('This account is suspended. Reactivate it before inviting them again.');
  }
  if (signedInSince(target)) {
    throw conflict('They have signed in before, so there is no invitation to resend. Send a password reset instead.');
  }

  const previous = await setupLinksFor([target.id]);
  for (const old of previous) await db.tokens.update(old.id, { consumed: true });

  const link = await issueToken(target.id, 'password_reset', INVITATION_MINUTES);
  const profile = await profileFor(target.id);
  const sent = await sendInvitation(target.email, profile?.fullName ?? 'there', target.role, link.token);

  await recordAudit({
    actor,
    action: 'user.invitation_resent',
    entity: 'user',
    entityId: target.id,
    meta: { delivered: sent.delivered, expiresAt: link.expiresAt, previousLinksCancelled: previous.length },
  });

  return { delivered: sent.delivered, expiresAt: link.expiresAt };
}

/**
 * The CEO approves IT access that someone else granted. Until then the
 * account cannot sign in at all (`pending_ceo_approval` is refused at sign-in
 * and on every request).
 */
export async function approveAccess(actor: Actor, userId: string) {
  const target = await loadTarget(userId);
  if (actor.role !== 'ceo') throw forbidden('Only a CEO can approve IT access.');
  assertMayManage(actor, target, 'approve access');
  if (target.status !== 'pending_ceo_approval') throw badRequest('That account is not waiting for approval.');

  const updated = await db.users.update(target.id, {
    status: 'verified',
    statusReason: null,
    statusChangedAt: now(),
    statusChangedBy: actor.id,
  } as never);

  await recordAudit({
    actor,
    action: 'user.access_approved',
    entity: 'user',
    entityId: target.id,
    meta: { role: target.role, from: target.status, to: 'verified' },
  });
  await notify({
    userId: target.id,
    type: 'system',
    title: 'Your access has been approved',
    body: `You can now sign in to the ARTINU Console as ${ROLE_LABELS[target.role]}.`,
    link: '/console',
  });

  return sanitizeUser(updated);
}

// ── Passwords and sessions ───────────────────────────────────────────────────

/**
 * Start a password reset. The administrator never sees or sets a password.
 *
 * 'email' sends the ordinary reset email. 'link' returns a single-use link,
 * valid for an hour, for the administrator to pass on through a channel they
 * have verified - for the customer whose inbox is the problem. It is shown
 * once and never stored in the audit trail.
 */
export async function startPasswordReset(actor: Actor, userId: string, mode: 'email' | 'link') {
  const target = await loadTarget(userId);
  assertMayManage(actor, target, 'reset the password');
  if (mode === 'link' && !hasPermission(actor.role, 'users.reset_link')) {
    throw forbidden('Your role cannot generate reset links. Send the reset email instead.');
  }

  const record = await issueToken(target.id, 'password_reset', 60);
  const profile = await profileFor(target.id);

  if (mode === 'email') {
    const result = await sendPasswordResetEmail(target.email, profile?.fullName ?? 'there', record.token);
    await recordAudit({
      actor,
      action: 'user.password_reset_sent',
      entity: 'user',
      entityId: target.id,
      meta: { delivered: result.delivered, expiresAt: record.expiresAt },
    });
    return { mode, delivered: result.delivered, expiresAt: record.expiresAt };
  }

  await recordAudit({
    actor,
    action: 'user.password_reset_link_issued',
    entity: 'user',
    entityId: target.id,
    meta: { expiresAt: record.expiresAt },
  });
  return {
    mode,
    link: `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(record.token)}`,
    expiresAt: record.expiresAt,
  };
}

export async function forcePasswordChange(actor: Actor, userId: string) {
  const target = await loadTarget(userId);
  assertMayManage(actor, target, 'force a password change');
  const updated = await db.users.update(target.id, {
    mustChangePassword: true,
    sessionsRevokedAt: now(),
  } as never);
  await recordAudit({
    actor,
    action: 'user.password_change_forced',
    entity: 'user',
    entityId: target.id,
  });
  return sanitizeUser(updated);
}

export async function revokeSessions(actor: Actor, userId: string) {
  const target = await loadTarget(userId);
  assertMayManage(actor, target, 'revoke sessions');
  const updated = await db.users.update(target.id, { sessionsRevokedAt: now() } as never);

  // Any support session open on this account ends too.
  const open = await db.supportSessions.find({
    filter: (session) => session.targetUserId === target.id && !session.endedAt,
  });
  for (const session of open) {
    await db.supportSessions.update(session.id, { endedAt: now(), endReason: 'revoked' });
  }

  await recordAudit({
    actor,
    action: 'user.sessions_revoked',
    entity: 'user',
    entityId: target.id,
    meta: { supportSessionsEnded: open.length },
  });
  return sanitizeUser(updated);
}

// ── Email address correction ─────────────────────────────────────────────────

/**
 * Correct an account's email address - through verification, never directly.
 *
 * The new address is held on a single-use token and confirmed from that inbox.
 * Until the link is followed nothing about the account changes, so a typo by
 * the administrator cannot hand the account to a stranger's inbox.
 */
export async function requestEmailChange(actor: Actor, userId: string, newEmail: string, reason: string) {
  const target = await loadTarget(userId);
  assertMayManage(actor, target, 'change the email address');

  const email = newEmail.trim().toLowerCase();
  if (email === target.email) throw badRequest('That is already the address on the account.');
  if (await db.users.findOne({ email })) {
    throw conflict('Another account already uses that address.');
  }

  const record = await issueToken(target.id, 'email_change', 60 * 48);
  await db.tokens.update(record.id, { meta: { newEmail: email, requestedBy: actor.id } } as never);

  const profile = await profileFor(target.id);
  const result = await sendEmailChangeConfirmation(email, profile?.fullName ?? 'there', record.token);

  await recordAudit({
    actor,
    action: 'user.email_change_requested',
    entity: 'user',
    entityId: target.id,
    meta: { from: target.email, to: email, reason, delivered: result.delivered },
  });

  return { pendingEmail: email, delivered: result.delivered, expiresAt: record.expiresAt };
}

export async function confirmEmailChange(token: string) {
  const record = await db.tokens.findOne({ token, purpose: 'email_change' } as never);
  if (!record || record.consumed) throw badRequest('That link is no longer valid.');
  if (new Date(record.expiresAt).getTime() < Date.now()) throw badRequest('That link has expired.');

  const newEmail = typeof record.meta?.newEmail === 'string' ? record.meta.newEmail : null;
  if (!newEmail) throw badRequest('That link is no longer valid.');

  const user = await db.users.byId(record.userId);
  if (!user) throw badRequest('That link is no longer valid.');

  const taken = await db.users.findOne({ email: newEmail });
  if (taken && taken.id !== user.id) throw conflict('Another account already uses that address.');

  await db.tokens.update(record.id, { consumed: true });
  const oldEmail = user.email;
  await db.users.update(user.id, {
    email: newEmail,
    emailVerified: true,
    // Signed out everywhere: the next sign-in uses the confirmed address.
    sessionsRevokedAt: now(),
  } as never);

  const profile = await profileFor(user.id);
  void sendEmailChangedNotice(oldEmail, profile?.fullName ?? 'there', newEmail);

  await recordAudit({
    actor: null,
    action: 'user.email_changed',
    entity: 'user',
    entityId: user.id,
    meta: { from: oldEmail, to: newEmail, requestedBy: record.meta?.requestedBy ?? null },
  });

  return { email: newEmail };
}
