import {
  artistRegistrationSchema,
  forgotPasswordSchema,
  otpVerifySchema,
  passwordSchema,
  phoneSignInSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  spaceOwnerRegistrationSchema,
} from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '@/config/env';
import { db } from '@/database/db';
import { asyncHandler, authLimiter, requireAuth, validate } from '@/middleware/index';
import { badRequest, notFound } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { now } from '@/utils/ids';
import { recordAudit } from '@/services/audit.service';
import { sendPasswordResetEmail } from '@/services/email.service';
import { notify } from '@/services/notification.service';
import { storeBase64 } from '@/services/storage.service';
import { assignPhotographerCodeIfArtist } from '@/services/photo-id.service';
import { ensureSpaceCode, issuedPassword } from '@/services/space-code.service';
import { sendWelcomeEmailOnce } from '@/services/welcome-email.service';
import {
  buildSession,
  consumeOtp,
  consumeStoredToken,
  createProfile,
  createUser,
  findByEmail,
  issueOtp,
  issueToken,
  profileFor,
  reissueOtp,
  setPassword,
  startEmailVerification,
  verifyCredentials,
} from '@/services/auth.service';

export const authRouter = Router();

authRouter.use(authLimiter);

// ── Sign in ──────────────────────────────────────────────────────────────────

authRouter.post(
  '/sign-in',
  validate(signInSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.valid as { email: string; password: string };
    const user = await verifyCredentials(email, password);
    res.json(await buildSession(user));
  }),
);

/**
 * Phone sign-in issues a code rather than a session. There is no SMS provider in
 * the MVP, so the code is emailed to the account that owns the number and the
 * response says where it went.
 */
authRouter.post(
  '/sign-in/phone',
  validate(phoneSignInSchema),
  asyncHandler(async (req, res) => {
    const { phone } = req.valid as { phone: string };
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) throw badRequest('Enter a valid 10-digit mobile number.');

    const [match] = await db.users.find({
      filter: (candidate) => (candidate.phone ?? '').replace(/\D/g, '').endsWith(digits),
      limit: 1,
    });

    if (!match) throw notFound('An account with that phone number');

    const profile = await profileFor(match.id);
    res.json(await issueOtp(match, 'phone', profile?.fullName ?? 'there'));
  }),
);

authRouter.post(
  '/verify-otp',
  validate(otpVerifySchema),
  asyncHandler(async (req, res) => {
    const { challengeId, code } = req.valid as { challengeId: string; code: string };
    const user = await consumeOtp(challengeId, code);
    res.json(await buildSession(user));
  }),
);

authRouter.post(
  '/resend-otp',
  validate(z.object({ challengeId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { challengeId } = req.valid as { challengeId: string };
    res.json(await reissueOtp(challengeId));
  }),
);

// ── Registration ─────────────────────────────────────────────────────────────

authRouter.post(
  '/sign-up',
  validate(signUpSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as {
      fullName: string;
      email: string;
      phone: string;
      dateOfBirth: string;
      password: string;
      role: 'space_owner' | 'artist';
    };

    const user = await createUser({
      email: input.email,
      password: input.password,
      role: input.role,
      phone: input.phone,
    });
    await createProfile(user.id, {
      fullName: input.fullName,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
    });

    // Same reasoning as the dedicated artist and space-owner routes: neither of
    // these may cost someone their account once the user row is committed.
    if (input.role === 'artist') {
      try {
        await assignPhotographerCodeIfArtist(user.id, 'artist');
      } catch (error) {
        logger.error(`Could not assign a photographer code to ${user.email}`, error);
      }
    }

    void startEmailVerification(user, input.fullName).catch((error) =>
      logger.error(`Could not send the verification email to ${user.email}`, error),
    );

    // Welcome mail, on registration only — never on sign-in. Guarded against
    // duplicates and non-throwing by design; see welcome-email.service.ts.
    void sendWelcomeEmailOnce(user, input.fullName, input.role);

    await notify({
      userId: user.id,
      type: 'system',
      title: 'Welcome to ARTINU',
      body:
        input.role === 'artist'
          ? 'Your artist account is ready. Upload your first photographs to start being seen.'
          : 'Your account is ready. Register your space to start browsing collections.',
      link: input.role === 'artist' ? '/studio/upload' : '/space/register-space',
    });

    await recordAudit({
      actor: { id: user.id, email: user.email },
      action: 'user.registered',
      entity: 'user',
      entityId: user.id,
      meta: { role: input.role },
      ip: req.ip,
    });

    res.status(201).json(await buildSession(user));
  }),
);

authRouter.post(
  '/register/artist',
  validate(artistRegistrationSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as {
      fullName: string;
      email: string;
      phone: string;
      dateOfBirth: string;
      password: string;
      artistName: string;
      location: string;
      website?: string | null;
      artStyle: string;
      bio?: string | null;
      avatarBase64?: string | null;
    };

    const user = await createUser({
      email: input.email,
      password: input.password,
      role: 'artist',
      phone: input.phone,
    });

    let avatarUrl: string | null = null;
    if (input.avatarBase64) {
      avatarUrl = (await storeBase64(input.avatarBase64, 'profiles', undefined, user.id)).url;
    }

    const [city, country] = input.location.split(',').map((part) => part.trim());

    await createProfile(user.id, {
      fullName: input.fullName,
      displayName: input.artistName,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      city: city ?? input.location,
      country: country ?? null,
      bio: input.bio ?? null,
      website: input.website || null,
      genres: [input.artStyle],
      avatarUrl,
    });

    // Neither of these should be able to cost someone their account. The user
    // and profile rows are already committed, so a failure here would otherwise
    // leave a half-created account that can never be registered again — the
    // email address is taken, but no session was ever returned.
    try {
      await assignPhotographerCodeIfArtist(user.id, 'artist');
    } catch (error) {
      // Not fatal: the code is allocated again on the first upload.
      logger.error(`Could not assign a photographer code to ${user.email}`, error);
    }

    // Best-effort, and slow enough (a full SMTP round trip) to be worth not
    // making the visitor wait for it.
    void startEmailVerification(user, input.fullName).catch((error) =>
      logger.error(`Could not send the verification email to ${user.email}`, error),
    );

    void sendWelcomeEmailOnce(user, input.fullName, 'artist');

    await notify({
      userId: user.id,
      type: 'system',
      title: 'Welcome to ARTINU',
      body: 'Your artist workspace is ready. Upload six to fifteen photographs to give curators a real sense of your work.',
      link: '/studio/upload',
    });
    await recordAudit({
      actor: { id: user.id, email: user.email },
      action: 'artist.registered',
      entity: 'user',
      entityId: user.id,
      ip: req.ip,
    });

    res.status(201).json(await buildSession(user));
  }),
);

authRouter.post(
  '/register/space-owner',
  validate(spaceOwnerRegistrationSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as {
      fullName: string;
      email: string;
      spaceName: string;
      spaceType: string;
      city: string;
      phone: string;
      dateOfBirth: string;
    };

    // Requirements §1: the owner does not invent credentials, ARTINU issues
    // them. Generated here so the plaintext exists only for this request — it
    // goes back in the response, is never emailed, and is never stored.
    const password = issuedPassword();

    const user = await createUser({
      email: input.email,
      password,
      role: 'space_owner',
      phone: input.phone,
      mustChangePassword: true,
    });

    await createProfile(user.id, {
      fullName: input.fullName,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      city: input.city,
      country: 'India',
    });

    // Give them their first space straight away — the details can be completed
    // later, and an owner with no space has nothing to look at.
    const space = await db.spaces.insert({
      ownerId: user.id,
      name: input.spaceName,
      type: input.spaceType as never,
      theme: null,
      cuisine: null,
      wallColor: null,
      lighting: null,
      addressLine1: '',
      addressLine2: null,
      city: input.city,
      state: null,
      pin: null,
      contactName: input.fullName,
      contactPhone: input.phone,
      contactEmail: input.email,
      wallCount: null,
      imageUrls: [],
      rotationIntervalMonths: 3,
      verified: false,
      createdAt: now(),
      updatedAt: now(),
    });

    // The space ID. Never blocking either: a project that has not run migration
    // 006 gets a null code and a working account rather than a failed signup.
    const spaceCode = await ensureSpaceCode(space).catch((error) => {
      logger.error(`Could not allocate a space ID for ${input.spaceName}`, error);
      return null;
    });

    // Best-effort, and never blocking: the user, profile and space rows are
    // already committed, so a slow or failing SMTP hop here would otherwise
    // leave an account that exists but was never handed back a session — and
    // whose email address is now taken, so it can never be registered again.
    void startEmailVerification(user, input.fullName).catch((error) =>
      logger.error(`Could not send the verification email to ${user.email}`, error),
    );

    void sendWelcomeEmailOnce(user, input.fullName, 'space_owner');

    await notify({
      userId: user.id,
      type: 'system',
      title: 'Welcome to ARTINU',
      body: 'Complete your space details so we can curate a collection that actually fits the room.',
      link: '/space/register-space',
    });
    await recordAudit({
      actor: { id: user.id, email: user.email },
      action: 'space_owner.registered',
      entity: 'user',
      entityId: user.id,
      // The password is deliberately absent — an audit row is read by more
      // people than the account holder.
      meta: { spaceCode, spaceId: space.id },
      ip: req.ip,
    });

    // `credentials` is the only time the plaintext password leaves the server.
    // The client shows it once and the account cannot be used until it is
    // replaced, which is what `mustChangePassword` on the user enforces.
    res.status(201).json({
      ...(await buildSession(user)),
      credentials: { spaceCode, email: user.email, password },
    });
  }),
);

// ── Password and email ───────────────────────────────────────────────────────

authRouter.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.valid as { email: string };
    const user = await findByEmail(email);

    // Always the same response, whether or not the account exists.
    if (!user) {
      res.json({ sent: true });
      return;
    }

    const profile = await profileFor(user.id);
    const record = await issueToken(user.id, 'password_reset', 60);
    await sendPasswordResetEmail(user.email, profile?.fullName ?? 'there', record.token);

    res.json({ sent: true, devToken: env.isProduction ? undefined : record.token });
  }),
);

authRouter.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.valid as { token: string; password: string };
    const user = await consumeStoredToken(token, 'password_reset');

    await setPassword(user.id, password);
    await recordAudit({
      actor: { id: user.id, email: user.email },
      action: 'user.password_reset',
      entity: 'user',
      entityId: user.id,
      ip: req.ip,
    });

    res.json({ ok: true });
  }),
);

/**
 * Change your own password while signed in.
 *
 * This is what an owner holding an ARTINU-issued password uses to replace it
 * (requirements §1), and it is the only path that clears `mustChangePassword`
 * for a signed-in session. The current password is still required: a session
 * token left open on a shared café laptop should not be enough to lock the
 * owner out of their own account.
 */
authRouter.post(
  '/change-password',
  requireAuth,
  validate(
    z.object({
      currentPassword: z.string().min(1, 'Enter your current password'),
      password: passwordSchema,
    }),
  ),
  asyncHandler(async (req, res) => {
    const { currentPassword, password } = req.valid as {
      currentPassword: string;
      password: string;
    };

    // Throws the same "do not match" rejection as sign-in, and re-checks the
    // account is not suspended in the meantime.
    const user = await verifyCredentials(req.user!.email, currentPassword);

    if (currentPassword === password) {
      throw badRequest('Choose a password different from the one you have now.');
    }

    await setPassword(user.id, password);
    await recordAudit({
      actor: { id: user.id, email: user.email },
      action: 'user.password_changed',
      entity: 'user',
      entityId: user.id,
      ip: req.ip,
    });

    const updated = (await db.users.byId(user.id)) ?? user;
    res.json(await buildSession(updated));
  }),
);

authRouter.post(
  '/verify-email',
  validate(z.object({ token: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { token } = req.valid as { token: string };
    const user = await consumeStoredToken(token, 'email_verification');

    const updated = await db.users.update(user.id, { emailVerified: true, status: 'verified' });
    res.json(await buildSession(updated));
  }),
);

authRouter.post(
  '/resend-verification',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.emailVerified) throw badRequest('That email address is already verified.');

    const profile = await profileFor(user.id);
    await startEmailVerification(user, profile?.fullName ?? 'there');
    res.json({ sent: true });
  }),
);

// ── Session ──────────────────────────────────────────────────────────────────

authRouter.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await buildSession(req.user!));
  }),
);

authRouter.post(
  '/sign-out',
  asyncHandler(async (_req, res) => {
    // Tokens are stateless, so signing out is a client-side act. The endpoint
    // exists so the client has one place to call and we can audit it later.
    res.json({ ok: true });
  }),
);
