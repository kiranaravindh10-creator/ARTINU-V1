import { OTP, type AuthSession, type Profile, type Role, type User } from '@artinu/shared';
import bcrypt from 'bcryptjs';
import { db, type OtpChallengeRecord, type StoredUser, type TokenRecord } from '@/database/db';
import { env } from '@/config/env';
import { badRequest, conflict, tooMany, unauthorized } from '@/utils/errors';
import { generateOtp, generateToken, signToken } from '@/services/token.service';
import { minutesFromNow, now, uuid } from '@/utils/ids';
import { sendOtpEmail, sendVerificationEmail } from '@/services/email.service';
import { assignPhotographerCodeIfArtist } from '@/services/photo-id.service';
import { logger } from '@/utils/logger';

const MAX_OTP_ATTEMPTS = 5;

/**
 * `users.must_change_password` arrives with migration 006, and registration
 * must keep working on a project that has not run it yet — a signup that 400s
 * because of a column we added is a far worse failure than a forced password
 * change that does not fire.
 *
 * So the write is attempted with the flag and retried without it when PostgREST
 * reports the column missing (PGRST204). The retry is logged at error level
 * rather than swallowed: until the migration runs, owners keep the password
 * ARTINU generated for them, and somebody needs to know that.
 */
function isMissingColumn(error: unknown, column: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (message.includes('PGRST204') ||
      /could not find|does not exist|schema cache/i.test(message)) &&
    message.includes(column)
  );
}

async function withoutMustChangePassword<T>(
  attempt: () => Promise<T>,
  retry: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isMissingColumn(error, 'must_change_password')) throw error;
    logger.error(
      'users.must_change_password is missing — run database/migrations/006_space_codes.sql. ' +
        'Issued passwords will not force a change at first sign-in until you do.',
    );
    return retry();
  }
}

/** The API must never return a password hash — every response goes through here. */
export function sanitizeUser(user: StoredUser): User {
  const { passwordHash: _passwordHash, phone: _phone, ...rest } = user;
  return rest;
}

export async function profileFor(userId: string): Promise<Profile | null> {
  return db.profiles.findOne({ userId });
}

export async function buildSession(user: StoredUser): Promise<AuthSession> {
  const { token, expiresAt } = signToken({ sub: user.id, email: user.email, role: user.role });
  return {
    accessToken: token,
    expiresAt,
    user: sanitizeUser(user),
    profile: await profileFor(user.id),
  };
}

export async function findByEmail(email: string): Promise<StoredUser | null> {
  return db.users.findOne({ email: email.trim().toLowerCase() });
}

export async function verifyCredentials(email: string, plain: string): Promise<StoredUser> {
  const user = await findByEmail(email);

  // The same message for an unknown address and a wrong password, so this
  // endpoint cannot be used to discover which emails have accounts.
  const rejection = unauthorized('That email and password do not match.');
  if (!user) throw rejection;
  if (!bcrypt.compareSync(plain, user.passwordHash)) throw rejection;
  if (user.status === 'suspended') {
    throw unauthorized('This account has been suspended. Please contact support.');
  }
  if (user.status === 'pending_ceo_approval') {
    throw unauthorized('This account is awaiting administrative approval.');
  }

  await db.users.update(user.id, { lastLoginAt: now() });
  return user;
}

export async function createUser(input: {
  email: string;
  password: string;
  role: Role;
  emailVerified?: boolean;
  phone?: string | null;
  /** Set when ARTINU generated the password rather than the person choosing it. */
  mustChangePassword?: boolean;
}): Promise<StoredUser> {
  const email = input.email.trim().toLowerCase();
  if (await findByEmail(email)) {
    throw conflict('An account already exists for that email address.');
  }

  const row = {
    email,
    role: input.role,
    status: input.emailVerified ? 'verified' : 'pending_verification',
    emailVerified: input.emailVerified ?? false,
    passwordHash: bcrypt.hashSync(input.password, 10),
    phone: input.phone ?? null,
    createdAt: now(),
    lastLoginAt: now(),
  };

  return withoutMustChangePassword(
    () =>
      db.users.insert({
        ...row,
        mustChangePassword: input.mustChangePassword ?? false,
      } as never),
    () => db.users.insert(row as never),
  );
}

export async function createProfile(
  userId: string,
  fields: Partial<Profile> & { fullName: string },
): Promise<Profile> {
  const base = {
    userId,
    displayName: null,
    phone: null,
    dateOfBirth: null,
    avatarUrl: null,
    city: null,
    country: null,
    bio: null,
    website: null,
    instagram: null,
    genres: [],
    createdAt: now(),
    updatedAt: now(),
    ...fields,
  };

  /*
    `profiles.date_of_birth` arrives with migration 009, and registration has to
    keep working on a project that has not run it yet — exactly the reasoning
    behind `must_change_password` above. Losing a date of birth is a gap in a
    record; a 400 here is a person who cannot create an account at all.

    The retry is logged at error level rather than swallowed: until the
    migration runs, dates of birth are collected in the form and dropped on the
    floor, and somebody needs to know that.
  */
  try {
    return await db.profiles.insert(base);
  } catch (error) {
    if (!isMissingColumn(error, 'date_of_birth')) throw error;
    logger.error(
      'profiles.date_of_birth is missing — run database/migrations/009_registration_and_collaborations.sql. ' +
        'Registration still works, but dates of birth are not being stored.',
    );
    const { dateOfBirth: _dropped, ...withoutDob } = base;
    return db.profiles.insert(withoutDob);
  }
}

// ── One-time codes ───────────────────────────────────────────────────────────

export interface IssuedChallenge {
  challengeId: string;
  method: 'otp';
  sentTo: string;
  expiresAt: string;
  devCode?: string;
}

/** Masks an address for display: a****n@artinu.in. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (local.length <= 2) return `${local[0] ?? ''}***@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(3, local.length - 2))}${local.at(-1)}@${domain}`;
}

export async function issueOtp(
  user: StoredUser,
  channel: 'email' | 'phone' = 'email',
  name = 'there',
): Promise<IssuedChallenge> {
  const code = generateOtp(OTP.LENGTH);
  const sentTo = channel === 'phone' ? (user.phone ?? user.email) : user.email;

  const challenge = await db.otpChallenges.insert({
    userId: user.id,
    code,
    sentTo,
    channel,
    expiresAt: minutesFromNow(OTP.TTL_SECONDS / 60),
    attempts: 0,
    consumed: false,
    createdAt: now(),
  });

  await sendOtpEmail(user.email, name, code);

  return {
    challengeId: challenge.id,
    method: 'otp',
    sentTo: channel === 'phone' ? sentTo : maskEmail(sentTo),
    expiresAt: challenge.expiresAt,
    // Without SMTP configured the code would be unreachable, so hand it back in
    // development. Never in production.
    devCode: env.isProduction ? undefined : code,
  };
}

export async function consumeOtp(challengeId: string, code: string): Promise<StoredUser> {
  const challenge = await db.otpChallenges.byId(challengeId);
  if (!challenge || challenge.consumed) {
    throw badRequest('That code is no longer valid. Please request a new one.');
  }
  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw badRequest('That code has expired. Please request a new one.');
  }
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    throw tooMany('Too many incorrect codes. Please request a new one.');
  }

  if (challenge.code !== code.trim()) {
    await db.otpChallenges.update(challenge.id, { attempts: challenge.attempts + 1 });
    throw badRequest('That code is not correct.');
  }

  await db.otpChallenges.update(challenge.id, { consumed: true });

  const user = await db.users.byId(challenge.userId);
  if (!user) throw unauthorized();
  
  if (user.status === 'pending_ceo_approval') {
    throw unauthorized('This account is awaiting administrative approval.');
  }

  await db.users.update(user.id, { lastLoginAt: now() });
  return user;
}

export async function reissueOtp(challengeId: string): Promise<IssuedChallenge> {
  const existing = await db.otpChallenges.byId(challengeId);
  if (!existing) throw badRequest('That sign-in attempt has expired. Please start again.');

  const user = await db.users.byId(existing.userId);
  if (!user) throw unauthorized();

  // Retire the old challenge so only the newest code can be used.
  await db.otpChallenges.update(existing.id, { consumed: true });

  const profile = await profileFor(user.id);
  return issueOtp(user, existing.channel, profile?.fullName ?? 'there');
}

// ── Single-use tokens (verification, password reset) ─────────────────────────

export async function issueToken(
  userId: string,
  purpose: TokenRecord['purpose'],
  ttlMinutes = 60,
): Promise<TokenRecord> {
  return db.tokens.insert({
    userId,
    token: generateToken(),
    purpose,
    expiresAt: minutesFromNow(ttlMinutes),
    consumed: false,
    createdAt: now(),
  });
}

export async function consumeStoredToken(
  token: string,
  purpose: TokenRecord['purpose'],
): Promise<StoredUser> {
  const record = await db.tokens.findOne({ token, purpose });
  if (!record || record.consumed) {
    throw badRequest('That link is no longer valid. Please request a new one.');
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    throw badRequest('That link has expired. Please request a new one.');
  }

  await db.tokens.update(record.id, { consumed: true });

  const user = await db.users.byId(record.userId);
  if (!user) throw unauthorized();
  return user;
}

export async function startEmailVerification(user: StoredUser, name: string): Promise<string> {
  const record = await issueToken(user.id, 'email_verification', 60 * 48);
  await sendVerificationEmail(user.email, name, record.token);
  return record.token;
}

/**
 * Choosing a password always clears `mustChangePassword` — that flag exists to
 * say "this credential was issued, not chosen", and the moment the person picks
 * their own it stops being true. Clearing it here rather than at each call site
 * means a new reset path cannot forget to.
 */
export async function setPassword(userId: string, plain: string): Promise<void> {
  const passwordHash = bcrypt.hashSync(plain, 10);
  await withoutMustChangePassword(
    () => db.users.update(userId, { passwordHash, mustChangePassword: false } as never),
    () => db.users.update(userId, { passwordHash } as never),
  );
}

/** A random password for accounts ARTINU creates on someone's behalf. */
export function temporaryPassword(): string {
  return `ARTINU-${uuid().slice(0, 8)}A1`;
}

/*
 * OAuth was removed.
 *
 * `OAuthIdentity`, `findOrCreateOAuthUser` and `startOAuthWithOtp` lived here
 * and brokered Google/Apple sign-in through Supabase. ARTINU now authenticates
 * with an email address and an ARTINU password only — a visitor may use a Gmail
 * address, but they never give ARTINU a Google credential.
 *
 * Roles, sessions and the users table are unchanged; only the way an account is
 * first proven has gone.
 */
