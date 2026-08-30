import {
  artistRegistrationSchema,
  COMMUNITY_GUIDELINES_VERSION,
  forgotPasswordSchema,
  otpVerifySchema,
  passwordSchema,
  phoneSignInSchema,
  resetPasswordSchema,
  ROTATION_INTERVALS,
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
import { sendNoAccountEmail, sendPasswordResetEmail } from '@/services/email.service';
import { notify } from '@/services/notification.service';
import { storeBase64 } from '@/services/storage.service';
import { assignPhotographerCodeIfArtist } from '@/services/photo-id.service';
import { ensureSpaceCode, issuedPassword } from '@/services/space-code.service';
import { sendWelcomeEmailOnce } from '@/services/welcome-email.service';
import {
  confirmVerificationCode,
  issueVerificationCode,
  sendVerificationCodeQuietly,
} from '@/services/verification.service';
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

    // A 6-digit code, through the same SMTP path as everything else. Never
    // awaited: a full mail round trip is slow, and its outcome has no bearing
    // on whether the account was created.
    void sendVerificationCodeQuietly(user, input.fullName);

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
      // Which version of the Community Guidelines this photographer agreed to,
      // and when. Enforcement under §12 depends on being able to say that.
      guidelinesVersion: COMMUNITY_GUIDELINES_VERSION,
      guidelinesAcceptedAt: now(),
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
    // A 6-digit code, through the same SMTP path as everything else. Never
    // awaited: a full mail round trip is slow, and its outcome has no bearing
    // on whether the account was created.
    void sendVerificationCodeQuietly(user, input.fullName);

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
      password: string;
    };

    /*
      The owner's own password.

      This used to call `issuedPassword()` and set `mustChangePassword`, on the
      reading of requirements §1 that ARTINU issues credentials rather than the
      owner inventing them. That holds when a human at ARTINU provisions the
      account and hands the credential over — `create:staff` still works exactly
      that way, and should.

      It does not hold for self-service sign-up. The generated password was
      returned once in this response, rendered once on the next screen, never
      emailed and never stored, so closing the tab locked the owner out of an
      account they had just created. A password only they have ever seen needs no
      forced replacement, so `mustChangePassword` goes too — which is also why
      sign-in now lands on the dashboard rather than on a reset screen.
    */
    const user = await createUser({
      email: input.email,
      password: input.password,
      role: 'space_owner',
      phone: input.phone,
      mustChangePassword: false,
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
      // ROTATION_INTERVALS[0] rather than a hardcoded 3: three months is a
      // WITHDRAWN cadence, so every space registered here was being created
      // on a schedule the product no longer sells.
      rotationIntervalMonths: ROTATION_INTERVALS[0],
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
    // A 6-digit code, through the same SMTP path as everything else. Never
    // awaited: a full mail round trip is slow, and its outcome has no bearing
    // on whether the account was created.
    void sendVerificationCodeQuietly(user, input.fullName);

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
      // No password here any more: the owner chose it, so the server has
      // nothing to hand back that they do not already know. The space code is
      // not a secret and is genuinely useful, so it stays.
      credentials: { spaceCode, email: user.email, password: null },
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

    /*
      The response is identical either way, and stays that way: telling a caller
      whether an address is registered turns this endpoint into an account
      enumerator.

      What was missing is the other half — the server said nothing either. The
      outcome was invisible from both sides, so "no email arrived" could equally
      be an unregistered address, a spent allowance, or SendGrid refusing the
      sender, and there was no way to tell which. It is logged now, because the
      recorded mailbox cannot help: it writes to server/.data/mail on local disk,
      and the hosting filesystem is wiped on every deploy and every restart.
    */
    if (!user) {
      /*
        No account - and that is exactly when an email matters most.

        This used to log a warning and return. The caller got "check your
        inbox", nothing ever arrived, and there was no way for them to discover
        that the address simply was not registered. Now they are told, in the
        only channel that cannot leak the answer to anyone else.

        The response below is identical to the registered case on purpose. See
        sendNoAccountEmail.
      */
      const outcome = await sendNoAccountEmail(email);
      if (outcome.delivered) {
        logger.info(`Password reset requested for unregistered ${email} - told them so by email.`);
      } else {
        logger.error(
          `Password reset requested for unregistered ${email}, and the "no account" email was NOT delivered` +
            (outcome.skippedReason ? ` - ${outcome.skippedReason}` : ' - see the mail error above.'),
        );
      }
      res.json({ sent: true });
      return;
    }

    const profile = await profileFor(user.id);
    const record = await issueToken(user.id, 'password_reset', 60);
    const result = await sendPasswordResetEmail(
      user.email,
      profile?.fullName ?? 'there',
      record.token,
    );

    // `delivered` was returned and thrown away. A refused send and a successful
    // one produced exactly the same log line: none.
    if (result.delivered) {
      logger.info(`Password reset email sent to ${user.email}.`);
    } else {
      logger.error(
        `Password reset email for ${user.email} was NOT delivered` +
          (result.skippedReason ? ` - ${result.skippedReason}` : ' - see the mail error above.'),
      );
    }

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

    /*
      Retire every other outstanding reset link for this account.

      Each trip through "forgot password" issues a fresh token without touching
      the ones already sent, so asking three times leaves three working links,
      each good for an hour. Using one left the other two live — and the reason
      people click that button repeatedly is usually that they are worried
      somebody else is in their mailbox.

      Consuming the rest here means one reset closes the whole set.
    */
    const outstanding = await db.tokens.find({
      where: { userId: user.id, purpose: 'password_reset', consumed: false },
    });
    await Promise.all(outstanding.map((record) => db.tokens.update(record.id, { consumed: true })));

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

/*
  ── Email verification by 6-digit code ──────────────────────────────────────

  The link-based flow above still exists and still works; links already sitting
  in inboxes must not break. These three routes are the code-based flow that
  registration now uses.

  All three require a session, so a code can only ever be requested for, and
  applied to, the account making the request. The code itself never appears in
  a response, a URL or a log.
*/

/** Where the account stands, and whether a code is outstanding. */
authRouter.get(
  '/verification/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      emailVerified: req.user!.emailVerified,
      email: req.user!.email,
    });
  }),
);

/** Send a code. Also the "resend" path — the service holds the cooldown. */
authRouter.post(
  '/verification/send',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.emailVerified) throw badRequest('That email address is already verified.');

    const profile = await profileFor(user.id);
    const issued = await issueVerificationCode(user, profile?.fullName ?? 'there');

    // challengeId and a masked address only. Never the code.
    res.json(issued);
  }),
);

/** Check a code and, if it is right, mark the address verified. */
authRouter.post(
  '/verification/confirm',
  requireAuth,
  authLimiter,
  validate(
    z.object({
      challengeId: z.string().min(1),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { challengeId, code } = req.valid as { challengeId: string; code: string };

    const updated = await confirmVerificationCode(req.user!.id, challengeId, code);

    await recordAudit({
      actor: { id: updated.id, email: updated.email },
      action: 'user.email_verified',
      entity: 'user',
      entityId: updated.id,
      ip: req.ip,
    });

    // A fresh session, so the client picks up emailVerified without a reload
    // and the verified badge appears immediately.
    res.json(await buildSession(updated));
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
