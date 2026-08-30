import { CONTACT, formatCurrency, formatDateTime, ORDER_STATUS_LABELS, OTP } from '@artinu/shared';
import type { Order } from '@artinu/shared';
import sendgrid from '@sendgrid/mail';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { recordMail } from '@/services/mailbox.service';
import { canSend, recordSend, type MailPriority } from '@/services/mail-quota.service';

/**
 * Transactional email. SendGrid when its API key is configured, SMTP when that
 * is configured instead (any provider via nodemailer), and a readable console
 * block otherwise so every flow stays walkable in development.
 *
 * The transport is the only thing that varies. Rendering, the monthly
 * allowance, the priority reserve and the Console mail log all sit above it and
 * behave identically whichever provider is behind them — the same idea the
 * project already applies to data, storage and payments.
 *
 * Delivery is deliberately best-effort: a confirmation that fails to send must
 * never roll back the paid order it was confirming, and a welcome message that
 * fails must never cost someone the account they just created. Failures are
 * logged and reported through the returned `delivered` flag.
 */

export interface MailMessage {
  to: string;
  subject: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
  footnote?: string;
  /**
   * 'critical' marks mail that authentication depends on — sign-in codes,
   * password resets, address verification. When the monthly SMTP allowance is
   * nearly spent these still go out and everything else is held back, so a
   * quiet month of notifications cannot lock users out of their accounts.
   */
  priority?: MailPriority;
}

export interface MailResult {
  delivered: boolean;
  /** Set when the monthly allowance stopped this message going out. */
  skippedReason?: string;
}

// ── Sending ──────────────────────────────────────────────────────────────────

let transporter: Transporter | null = null;

function mailer(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      // 465 is implicit TLS; everything else negotiates STARTTLS.
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

let sendgridReady = false;

function sendgridClient(): typeof sendgrid {
  if (!sendgridReady) {
    // Guarded by env.MAIL_PROVIDER resolution, so the key is present here.
    sendgrid.setApiKey(env.SENDGRID_API_KEY!);
    sendgridReady = true;
  }
  return sendgrid;
}

/**
 * "ARTINU <hello@artinu.in>" → { name, email }.
 *
 * SendGrid wants the parts separately and rejects the combined form, whereas
 * nodemailer takes the header verbatim. Parsing here keeps one MAIL_FROM
 * setting working for both transports.
 */
export function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1].replace(/^["']|["']$/g, '').trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/**
 * SendGrid reports the real reason inside `response.body.errors`; the bare
 * Error message is only ever "Forbidden" or "Bad Request", which is useless
 * when the actual cause is an unverified sender or a revoked key.
 */
function describeSendgridError(error: unknown): string {
  const response = (error as { response?: { body?: { errors?: { message?: string; field?: string }[] } } })
    ?.response;
  const errors = response?.body?.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors.map((e) => [e.field, e.message].filter(Boolean).join(': ')).join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

/** Hands the rendered message to whichever provider is configured. */
async function deliver(message: MailMessage, html: string): Promise<void> {
  if (env.MAIL_PROVIDER === 'sendgrid') {
    const from = parseAddress(env.mailFrom);
    await sendgridClient().send({
      to: message.to,
      from,
      ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
      // Same blind archive semantics as the SMTP path.
      ...(env.MAIL_ARCHIVE ? { bcc: env.MAIL_ARCHIVE } : {}),
      subject: message.subject,
      text: renderText(message),
      html,
    });
    return;
  }

  await mailer().sendMail({
    from: env.mailFrom,
    to: message.to,
    // Optional archive copy, blind so recipients never see it, and off unless
    // MAIL_ARCHIVE is set. This used to be a hardcoded personal address on
    // every message, which put OTP codes and password-reset links in a third
    // party's inbox and doubled the send count against the monthly SMTP quota.
    ...(env.MAIL_ARCHIVE ? { bcc: env.MAIL_ARCHIVE } : {}),
    ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
    subject: message.subject,
    text: renderText(message),
    html,
  });
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const html = renderEmail(message);

  // Every message is captured either way, so the Console can show what was sent
  // and what it looked like — with or without a provider behind it.
  const finish = (delivered: boolean) => {
    recordMail(message, html, delivered);
    return { delivered };
  };

  if (!env.mailConfigured) {
    logToConsole(message);
    return finish(false);
  }

  // The allowance is a hard operational limit, so it is checked before the
  // send rather than reconciled afterwards.
  const allowance = await canSend(message.priority ?? 'normal');
  if (!allowance.allowed) {
    logger.warn(`Held back "${message.subject}" to ${message.to} - ${allowance.reason}`);
    recordMail(message, html, false);
    return { delivered: false, skippedReason: allowance.reason };
  }

  try {
    await deliver(message, html);
    logger.channel('mail', `sent "${message.subject}" to ${message.to} via ${env.MAIL_PROVIDER}`);
    // Only accepted messages count against the allowance.
    await recordSend().catch((error) =>
      logger.error('Could not record mail usage against the monthly allowance', error),
    );
    return finish(true);
  } catch (error) {
    // The provider's own words, at error level, and nowhere near the caller:
    // an unverified sender or a revoked key has to be diagnosable from the log,
    // and must never surface to the visitor who merely signed up.
    logger.error(
      `Could not send "${message.subject}" to ${message.to} via ${env.MAIL_PROVIDER} - ` +
        describeSendgridError(error),
    );
    return finish(false);
  }
}

// ── Typed helpers ────────────────────────────────────────────────────────────

/**
 * The welcome message, sent once per successful registration.
 *
 * Registration only — never on sign-in. The single call site is
 * `sendWelcomeEmailOnce` in welcome-email.service.ts, which holds the
 * idempotency guard; nothing else should call this directly.
 *
 * `name` is whatever the person actually typed into the registration form and
 * is carried through from the request, so there is no placeholder to leak. It
 * falls back to "there" via firstName() rather than rendering an empty gap.
 *
 * The "what happens next" line is role-specific because the two journeys
 * genuinely diverge: a photographer uploads work for curation, a space owner
 * completes their space so a collection can be proposed for it.
 */
export function sendWelcomeEmail(
  to: string,
  name: string,
  role?: 'artist' | 'space_owner' | string,
): Promise<MailResult> {
  const next =
    role === 'artist'
      ? 'Next, upload your photographs from your studio. Our curation team reviews new work by hand, and we will let you know either way.'
      : role === 'space_owner'
        ? 'Next, complete your space details - the walls, the light, the room - so we can curate a collection that actually fits it.'
        : "We'll keep you updated on the next steps.";

  return sendMail({
    to,
    subject: 'Welcome to Artinu',
    heading: 'Welcome to Artinu',
    body:
      `Hi ${firstName(name)},\n\n` +
      `Welcome to Artinu!\n\n` +
      `Your registration has been successfully received, and we're excited to have you ` +
      `as part of the Artinu community.\n\n` +
      `${next}\n\n` +
      `Welcome aboard,\n\n` +
      `Team Artinu\n` +
      `${CONTACT.email}`,
    cta:
      role === 'artist'
        ? { label: 'Open your studio', url: appUrl('/studio/upload') }
        : role === 'space_owner'
          ? { label: 'Complete your space', url: appUrl('/space/register-space') }
          : { label: 'See the gallery', url: appUrl('/gallery') },
    // Not 'critical': authentication does not depend on it, so it correctly
    // yields to sign-in codes when the monthly allowance is nearly spent.
    priority: 'normal',
  });
}

export function sendVerificationEmail(to: string, name: string, token: string): Promise<MailResult> {
  return sendMail({
    to,
    subject: 'Confirm your email address',
    heading: 'One step to go',
    body: `Hello ${firstName(name)},\n\nConfirm this address and your ARTINU account is ready. The link is good for 24 hours.`,
    cta: { label: 'Confirm email', url: appUrl(`/verify-email?token=${encodeURIComponent(token)}`) },
    footnote: 'If you did not create an ARTINU account, you can ignore this email.',
    priority: 'critical',
  });
}

/**
 * "You asked to reset a password, but there is no account on this address."
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * /auth/forgot-password answers `{ sent: true }` whether or not the address is
 * registered. That is correct and it is not negotiable: replying differently
 * turns the endpoint into a tool for discovering who has an ARTINU account.
 *
 * But it produced a genuinely broken experience. Type an address you never
 * registered with - a typo, a work address instead of a personal one, the
 * gmail you have three of - and the page says "check your inbox" and NOTHING
 * EVER ARRIVES. No error, no explanation, no way to work out what went wrong.
 * The founder hit exactly this and lost an afternoon to it; a customer would
 * simply leave.
 *
 * So every request now produces an email. A registered address gets a reset
 * link; an unregistered one gets this. The HTTP response is byte-identical in
 * both cases, so nothing is leaked to someone probing the endpoint - the
 * information goes only to whoever actually controls the mailbox, which is the
 * one person entitled to it.
 *
 * This is what mature products do, and it is the difference between "the email
 * system is broken" and "you used the wrong address".
 */
export function sendNoAccountEmail(to: string): Promise<MailResult> {
  return sendMail({
    to,
    subject: 'Reset your ARTINU password',
    heading: 'There is no ARTINU account on this address',
    body:
      `Someone - probably you - asked to reset the password for an ARTINU account on this email address, ` +
      `but there is no account registered to it.\n\n` +
      `If you have an ARTINU account, it is most likely on a different address. People usually find it on ` +
      `the address they were emailed from when they first signed up.\n\n` +
      `If you do not have one yet, you can create one - photographers and space owners both start here.`,
    cta: { label: 'Create an account', url: appUrl('/signin') },
    footnote:
      'If you did not ask for this, you can ignore this email - nobody has access to anything, and no account exists here.',
    // Same priority as the reset itself: this IS the answer to an authentication
    // request, and it is the only thing that stops the silence.
    priority: 'critical',
  });
}

/**
 * The 6-digit code that confirms an email address.
 *
 * Goes through `sendMail` like everything else, so it uses the same SMTP or
 * SendGrid transport, the same monthly allowance accounting and the same
 * console fallback in development. No second mail path.
 *
 * `priority: 'critical'` because an account cannot be used until this arrives —
 * it must still send in a month where the allowance has been spent on
 * notifications.
 *
 * The code is rendered by `renderEmail`'s numeric-paragraph branch, which sets
 * a bare 4–8 digit line as large spaced figures. That branch already existed
 * for the sign-in code; this reuses it rather than inventing a second style.
 */
export function sendVerificationCodeEmail(
  to: string,
  name: string,
  code: string,
  minutes: number,
): Promise<MailResult> {
  return sendMail({
    to,
    subject: `${code} is your ARTINU verification code`,
    heading: 'Confirm your email address',
    body:
      `Hello ${firstName(name)},\n\n${code}\n\n` +
      `Enter this code on ARTINU to confirm your email address. It expires in ${minutes} minutes.`,
    footnote:
      'Never share this code. ARTINU will never ask you for it. ' +
      'If you did not create an ARTINU account, you can ignore this email.',
    priority: 'critical',
  });
}

/**
 * A Community Guidelines warning (§12).
 *
 * States the count plainly — "1 of 3" — because the policy is a count and
 * softening it would leave the photographer unsure how serious this is. The
 * reason is whatever the reviewer wrote; it is not paraphrased here.
 */
export function sendWarningEmail(
  to: string,
  name: string,
  reason: string,
  number: number,
  limit: number,
): Promise<MailResult> {
  return sendMail({
    to,
    subject: `A note about your ARTINU account (warning ${number} of ${limit})`,
    heading: 'About your recent activity on ARTINU',
    body:
      `Hello ${firstName(name)},\n\n` +
      `We have issued a warning on your ARTINU account. This is warning ${number} of ${limit}.\n\n` +
      `Reason given: ${reason}\n\n` +
      'Please read the Community Guidelines so you know what we ask of photographers on the ' +
      'platform. If you think this was a mistake, reply to this email and a person will look at it.',
    cta: { label: 'Read the Community Guidelines', url: appUrl('/legal/community') },
    footnote: `Reaching ${limit} warnings means an ARTINU reviewer looks at the account.`,
    priority: 'critical',
  });
}

/**
 * Suspension, ban, or restoration.
 *
 * One function for all three because the recipient needs the same things in
 * each case: what happened, why, and what they can do next. Splitting it into
 * three near-identical templates is how they drift apart.
 */
export function sendAccountStatusEmail(
  to: string,
  name: string,
  status: 'suspended' | 'banned' | 'verified',
  reason: string,
): Promise<MailResult> {
  const copy = {
    suspended: {
      subject: 'Your ARTINU account has been suspended',
      heading: 'Your account has been suspended',
      body:
        'Your ARTINU account has been suspended, so you will not be able to sign in for now. ' +
        'Your photographs and your profile have not been deleted.',
      footnote: 'If you think this is a mistake, reply to this email and a person will look at it.',
    },
    banned: {
      subject: 'Your ARTINU account has been closed',
      heading: 'Your account has been closed',
      body:
        'Your ARTINU account has been permanently closed and you will not be able to sign in. ' +
        'Any photographs currently installed in a venue will be handled through our usual ' +
        'removal process.',
      footnote: 'If you believe this decision is wrong, reply to this email.',
    },
    verified: {
      subject: 'Your ARTINU account has been restored',
      heading: 'Your account is active again',
      body:
        'Your ARTINU account has been restored and you can sign in as usual. ' +
        'Thank you for your patience.',
      footnote: 'Welcome back.',
    },
  }[status];

  return sendMail({
    to,
    subject: copy.subject,
    heading: copy.heading,
    body: `Hello ${firstName(name)},\n\n${copy.body}\n\nReason given: ${reason}`,
    cta:
      status === 'verified'
        ? { label: 'Sign in', url: appUrl('/signin') }
        : { label: 'Read the Community Guidelines', url: appUrl('/legal/community') },
    footnote: copy.footnote,
    priority: 'critical',
  });
}

export function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<MailResult> {
  return sendMail({
    to,
    subject: 'Reset your ARTINU password',
    heading: 'Choose a new password',
    body: `Hello ${firstName(name)},\n\nWe received a request to reset the password on your ARTINU account. The link below is good for one hour and can be used once.`,
    cta: {
      label: 'Set a new password',
      url: appUrl(`/reset-password?token=${encodeURIComponent(token)}`),
    },
    footnote: 'If you did not ask for this, nothing has changed - you can ignore this email.',
    priority: 'critical',
  });
}

/**
 * The birthday note, sent once a year on the artist's own date of birth.
 *
 * Deliberately short and with nothing to click. Every other message in this
 * file is asking for something — confirm this, pay that, track the other — and
 * a birthday wish that ends in a call to action is a marketing email wearing a
 * card. The one link it carries is to the artist's own portfolio, because the
 * nicest thing ARTINU can point someone at on their birthday is their own work
 * hanging on real walls.
 *
 * `priority: 'normal'` on purpose: a courtesy note must never crowd out a
 * password reset against the monthly send allowance.
 */
export function sendBirthdayEmail(to: string, name: string): Promise<MailResult> {
  return sendMail({
    to,
    subject: `Happy birthday, ${firstName(name)} 🎉`,
    heading: 'Happy birthday from all of us at ARTINU',
    body:
      `Hello ${firstName(name)},\n\n` +
      'Everyone here hopes today is a good one — and that the year ahead brings you ' +
      'light worth chasing, time to go and find it, and walls that want your work on them.\n\n' +
      'Thank you for letting us show what you see.',
    cta: { label: 'See your portfolio', url: appUrl('/studio/portfolio') },
    footnote: 'With warm wishes — Team ARTINU',
    priority: 'normal',
  });
}

export function sendOtpEmail(to: string, name: string, code: string): Promise<MailResult> {
  const minutes = Math.round(OTP.TTL_SECONDS / 60);
  return sendMail({
    to,
    subject: `${code} is your ARTINU sign-in code`,
    heading: 'Your sign-in code',
    body: `Hello ${firstName(name)},\n\n${code}\n\nEnter this code to finish signing in. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    footnote: 'Never share this code. ARTINU will never ask you for it.',
    priority: 'critical',
  });
}

export function sendOrderConfirmation(to: string, name: string, order: Order): Promise<MailResult> {
  return sendMail({
    to,
    subject: `Order ${order.reference} received`,
    heading: 'Your collection is reserved',
    body: `Hello ${firstName(name)},\n\nWe have your order ${order.reference} - ${frameCount(order)} for ${formatCurrency(order.pricing.total)}. It is held for you until payment is confirmed.`,
    cta: { label: 'Complete payment', url: appUrl(`/space/orders/${order.id}`) },
    footnote: `Placed ${formatDateTime(order.placedAt)}.`,
  });
}

export function sendPaymentConfirmation(to: string, name: string, order: Order): Promise<MailResult> {
  return sendMail({
    to,
    subject: `Payment received - ${order.reference}`,
    heading: 'Payment confirmed',
    body: `Hello ${firstName(name)},\n\nWe have received ${formatCurrency(order.pricing.total)} for order ${order.reference}. Printing begins now, and your invoice is available in your account.`,
    cta: { label: 'Track this order', url: appUrl(`/space/orders/${order.id}`) },
    footnote: `Current status: ${ORDER_STATUS_LABELS[order.status] ?? order.status}.`,
  });
}

export function sendInstallationUpdate(
  to: string,
  name: string,
  order: Order,
  scheduledFor: string,
): Promise<MailResult> {
  return sendMail({
    to,
    subject: `Installation scheduled - ${order.reference}`,
    heading: 'Your installation is booked',
    body: `Hello ${firstName(name)},\n\nOur crew will hang the ${frameCount(order)} from order ${order.reference} on ${formatDateTime(scheduledFor)}. Allow about ninety minutes on site, and let us know if the walls need clearing first.`,
    cta: { label: 'View the schedule', url: appUrl(`/space/orders/${order.id}`) },
    footnote: `Need a different time? Call us on ${CONTACT.phone}.`,
  });
}

/**
 * One photograph of an artist's, and where it went.
 *
 * The Photo ID travels with it because that is the only identifier that ties
 * an email in a photographer's inbox to a specific print on a specific wall.
 * A title is not unique and a filename is not shown to anyone.
 */
export interface ArtistPlacement {
  title: string;
  photoId?: string | null;
}

/** "“Kabini Dusk” (KRV021)" — the ID only when the artwork actually has one. */
function describePlacement(placement: ArtistPlacement): string {
  return placement.photoId
    ? `“${placement.title}” (${placement.photoId})`
    : `“${placement.title}”`;
}

/**
 * Where the work went, written for the photographer.
 *
 * A business is named, because going to see your photograph on the wall of a
 * café is the entire point. A HOME is not: the address of somebody's living
 * room is not ours to hand out, so a home placement says the city and nothing
 * that could identify the household.
 */
function describeVenue(spaceName: string, spaceCity: string, isHome: boolean): string {
  if (isHome) return spaceCity ? `a home in ${spaceCity}` : 'a home';
  return spaceCity ? `${spaceName} in ${spaceCity}` : spaceName;
}

/**
 * The photographer is told their work has been chosen.
 *
 * ── What this email must not say ────────────────────────────────────────────
 *
 * It used to end "your licence fee is added to your next payout". ARTINU does
 * not pay photographers - there is no fee, no share and no payout - so that
 * sentence was a promise of money to a real person who was never going to
 * receive any. What they get is the thing they actually signed up for: their
 * photograph on a real wall, the ID to identify the print, and somewhere to go
 * and see it.
 */
export function sendArtistSelectedEmail(
  to: string,
  name: string,
  placements: ArtistPlacement[],
  spaceName: string,
  spaceCity: string,
  isHome = false,
): Promise<MailResult> {
  const listed = placements.map(describePlacement).join(', ');
  const venue = describeVenue(spaceName, spaceCity, isHome);
  const one = placements.length === 1;

  return sendMail({
    to,
    subject: one
      ? `${describePlacement(placements[0])} is going up at ${isHome ? 'a home' : spaceName}`
      : `${placements.length} of your photographs are going up`,
    heading: 'Your work has been chosen.',
    body: `Hello ${firstName(name)},

${listed} ${one ? 'has' : 'have'} been chosen for ${venue}. We print ${one ? 'it' : 'them'}, frame ${one ? 'it' : 'them'} and put ${one ? 'it' : 'them'} on the wall - there is nothing you need to do.

Keep the Photo ID above: it is printed on the plate beside your work, so you can identify your own print if you visit.`,
    cta: { label: 'See where your work is hanging', url: appUrl('/studio/installations') },
  });
}

/**
 * A photograph has been taken down by ARTINU, and why.
 *
 * The reason is REQUIRED by the endpoint that sends this, and it is the whole
 * point of the email. A photographer whose work disappears without explanation
 * has no idea whether they broke a rule, whether it was a mistake, or whether
 * to bother uploading again - and this is the only message they get about it.
 *
 * The Photo ID is included because a photographer with thirty uploads cannot
 * otherwise tell which one went.
 */
export function sendArtworkRemoved(
  to: string,
  name: string,
  title: string,
  reason: string,
  photoId?: string | null,
): Promise<MailResult> {
  return sendMail({
    to,
    subject: photoId ? `“${title}” (${photoId}) has been removed` : `“${title}” has been removed`,
    heading: 'A photograph has been taken down.',
    body: `${firstName(name)}, we have removed ${photoId ? `“${title}” (${photoId})` : `“${title}”`} from the ARTINU gallery.

Reason given: ${reason}

It is no longer shown to spaces and cannot be selected for a wall. Any print already hanging is unaffected. If you think this was a mistake, reply to this email and a person will look at it.`,
    cta: { label: 'Your portfolio', url: appUrl('/studio/portfolio') },
  });
}

export function sendUploadReceived(to: string, name: string, title: string): Promise<MailResult> {
  return sendMail({
    to,
    subject: `We have your photograph - ${title}`,
    heading: 'Your upload is in review.',
    body: `Thanks ${name} - “${title}” passed our automated checks and is now with the curation team. We review new work within a few days and you will hear either way.`,
    cta: { label: 'View your submissions', url: `${env.CLIENT_URL}/studio/submissions` },
  });
}

export function sendModerationDecision(
  to: string,
  name: string,
  title: string,
  approved: boolean,
  note?: string | null,
): Promise<MailResult> {
  return approved
    ? sendMail({
        to,
        subject: `“${title}” is live on ARTINU`,
        heading: 'Your photograph is published.',
        body: `Good news ${name} - “${title}” has been approved and is now in the gallery, where space owners can select it for their walls.${note ? `
${note}` : ''}`,
        cta: { label: 'See it in the gallery', url: `${env.CLIENT_URL}/studio/portfolio` },
      })
    : sendMail({
        to,
        subject: `About “${title}”`,
        heading: 'We could not publish this one.',
        body: `${name}, our curation team reviewed “${title}” and could not publish it.

${note ?? 'It is not a fit for the collection right now.'}

This is not a judgement on your work as a whole - please do upload something else.`,
        cta: { label: 'Upload another photograph', url: `${env.CLIENT_URL}/studio/upload` },
      });
}

/** Requirements §11: the photographer is told when and where their work goes up. */
export function sendArtistInstallationUpdate(
  to: string,
  name: string,
  placements: ArtistPlacement[],
  spaceName: string,
  spaceCity: string,
  scheduledFor: string,
  isHome = false,
): Promise<MailResult> {
  const listed = placements.map(describePlacement).join(', ');
  const venue = describeVenue(spaceName, spaceCity, isHome);

  return sendMail({
    to,
    subject: `Your work is going up at ${isHome ? 'a home' : spaceName}`,
    heading: 'Installation is booked.',
    body: `${firstName(name)}, ${listed} will be installed at ${venue} on ${formatDateTime(scheduledFor)}.

Our team handles the framing and the hanging - there is nothing you need to do. We will let you know once it is on the wall.`,
    cta: { label: 'See your installations', url: `${env.CLIENT_URL}/studio/installations` },
  });
}

/*
  sendPayoutProcessed is gone.

  It told a photographer an amount had been released to them. No amount is ever
  released - ARTINU does not pay photographers - so the only thing this could
  ever have sent was a false statement about money.
*/

/** Sent to internal staff so a new order or a failure is not only in-app. */
export function sendStaffAlert(
  to: string,
  subject: string,
  heading: string,
  body: string,
  path = '/console',
): Promise<MailResult> {
  return sendMail({
    to,
    subject,
    heading,
    body,
    cta: { label: 'Open the Console', url: `${env.CLIENT_URL}${path}` },
  });
}

/**
 * Consultation acknowledgement (requirements §34). A space owner who has just
 * handed over their details should get a branded reply straight away that tells
 * them exactly when to expect a human — not silence until someone gets round to
 * the inbox.
 */
export function sendConsultationReceived(
  to: string,
  name: string,
  details: { spaceType: string; location: string; preferredDate: string; preferredSlot: string; mode: string },
): Promise<MailResult> {
  return sendMail({
    to,
    subject: 'We have your consultation request - ARTINU',
    heading: "We'll get back to you within 24 hours.",
    body:
      `Hello ${firstName(name)},\n\n` +
      `Thank you for telling us about your space. One of our curators will confirm your ` +
      `consultation within 24 hours.\n\n` +
      `Here is what we have:\n` +
      `Space - ${details.spaceType} in ${details.location}\n` +
      `Preferred time - ${details.preferredDate} at ${details.preferredSlot}\n` +
      `Format - ${details.mode === 'video' ? 'Video call' : 'Visit to your space'}\n\n` +
      `The consultation takes about forty minutes. We look at your walls, your light through ` +
      `the day and how people move through the room, then come back with a proposal. ` +
      `There is nothing to sign.`,
    cta: { label: 'See the gallery', url: appUrl('/gallery') },
    footnote: `Need to change something? Reply to this email or call us on ${CONTACT.phone}.`,
  });
}

export function sendApplicationReceived(to: string, name: string): Promise<MailResult> {
  return sendMail({
    to,
    subject: 'We have your application',
    heading: 'Thank you for applying',
    body: `Hello ${firstName(name)},\n\nYour portfolio is with our curation team. We review every application by hand, which takes about five working days - you will hear from us either way.`,
    cta: { label: 'See the galleries', url: appUrl('/gallery') },
  });
}

// ── Rendering ────────────────────────────────────────────────────────────────

const INK = '#14120f';
const CANVAS = '#f7f5f2';
const SURFACE = '#fffefc';
const LINE = '#e4ddd2';
const MUTED = '#6b645c';
const SUBTLE = '#928a80';
const SERIF = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** One renderer for every message above, so all ARTINU email looks the same. */
export function renderEmail(message: MailMessage): string {
  const paragraphs = message.body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      // A paragraph that is nothing but a short numeric string is a one-time
      // code — the one case where the value itself is the message.
      /^\d{4,8}$/.test(part)
        ? `<p style="margin:0 0 20px;font-family:${SERIF};font-size:34px;letter-spacing:0.34em;color:${INK};">${escapeHtml(part)}</p>`
        : `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.65;color:${MUTED};">${escapeHtml(part)}</p>`,
    )
    .join('');

  const cta = message.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 4px;">
        <tr><td style="background-color:${INK};border-radius:6px;">
          <a href="${escapeAttribute(message.cta.url)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${CANVAS};text-decoration:none;">${escapeHtml(message.cta.label)}</a>
        </td></tr>
      </table>`
    : '';

  const footnote = message.footnote
    ? `<p style="margin:20px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${SUBTLE};">${escapeHtml(message.footnote)}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(message.subject)}</title></head>
<body style="margin:0;padding:0;background-color:${CANVAS};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${SURFACE};border:1px solid ${LINE};border-radius:12px;">
        <tr><td style="padding:32px 36px 0;">
          <span style="font-family:${SANS};font-size:12px;letter-spacing:0.34em;text-transform:uppercase;color:${INK};">ARTINU</span>
        </td></tr>
        <tr><td style="padding:22px 36px 0;">
          <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:27px;line-height:1.25;font-weight:400;color:${INK};">${escapeHtml(message.heading)}</h1>
          ${paragraphs}
          ${cta}
          ${footnote}
        </td></tr>
        <tr><td style="padding:28px 36px 32px;">
          <div style="height:1px;background-color:${LINE};margin-bottom:20px;"></div>
          <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.7;color:${SUBTLE};">
            <a href="mailto:${escapeAttribute(CONTACT.email)}" style="color:${MUTED};text-decoration:none;">${escapeHtml(CONTACT.email)}</a>
            &nbsp;·&nbsp; ${escapeHtml(CONTACT.phone)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Plain-text alternative — the same words, no markup. */
function renderText(message: MailMessage): string {
  const lines = [message.heading, '', message.body];
  if (message.cta) lines.push('', `${message.cta.label}: ${message.cta.url}`);
  if (message.footnote) lines.push('', message.footnote);
  lines.push('', `ARTINU · ${CONTACT.email} · ${CONTACT.phone}`);
  return lines.join('\n');
}

function logToConsole(message: MailMessage): void {
  const rule = '─'.repeat(64);
  const parts = [
    rule,
    `to       ${message.to}`,
    `subject  ${message.subject}`,
    rule,
    message.heading,
    '',
    message.body,
  ];
  if (message.cta) parts.push('', `→ ${message.cta.label}: ${message.cta.url}`);
  if (message.footnote) parts.push('', message.footnote);
  parts.push(rule);
  logger.channel('mail', `no SMTP configured - printing instead\n${parts.join('\n')}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/*
  Every link that goes out in an email is built from CLIENT_URL.

  Which means that if CLIENT_URL points at localhost while a real mail provider
  is configured, ARTINU cheerfully emails people links that only work on the
  machine that sent them. That is not hypothetical: the repo-root .env is shared
  by the client and the server and carries CLIENT_URL=http://localhost:5173 for
  local work, so any password reset triggered from a dev machine against the
  live database sends the customer a dead link - and the endpoint still answers
  "sent: true", because from its point of view it was.

  The warning fires once per process rather than per message, and it names the
  consequence rather than the setting.
*/
let warnedAboutLocalLinks = false;

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i;

const appUrl = (path: string) => {
  const base = env.CLIENT_URL.replace(/\/+$/, '');

  if (!warnedAboutLocalLinks && env.mailConfigured && LOCAL_HOST.test(base)) {
    warnedAboutLocalLinks = true;
    logger.error(
      `CLIENT_URL is ${base} but MAIL_PROVIDER is "${env.MAIL_PROVIDER}". ` +
        'Every link in every email being sent right now - password resets, email ' +
        'confirmations, invoices - points at localhost and will be dead for the ' +
        'person who receives it. Set CLIENT_URL to the public site, or set ' +
        'MAIL_PROVIDER=console while working locally.',
    );
  }

  return `${base}${path}`;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

function frameCount(order: Order): string {
  const count = order.pricing.quantity;
  return `${count} ${count === 1 ? 'frame' : 'frames'}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** URLs land inside a double-quoted attribute, so quotes must not escape it. */
function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
