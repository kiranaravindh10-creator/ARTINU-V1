import {
  artistApplicationSchema,
  consultationSchema,
  CONSULTATION_SLOTS,
  SPACE_TYPE_LABELS,
  supportTicketSchema,
  type ConsultationInput,
} from '@artinu/shared';
import { Router } from 'express';
import { db } from '@/database/db';
import { asyncHandler, attachUser, authLimiter, requireAuth, validate } from '@/middleware/index';
import { conflict, isUniqueViolation } from '@/utils/errors';
import { now } from '@/utils/ids';
import { recordAudit } from '@/services/audit.service';
import { sendConsultationReceived, sendMail } from '@/services/email.service';
import { onboardApplication } from '@/services/artist-onboarding.service';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { notify, notifyRole } from '@/services/notification.service';
import { isRemoteUrl, storeImage } from '@/services/storage.service';
import { broadcast, handleSSEConnection } from '@/services/sse.service';

export const publicRouter = Router();

// ── Consultations ────────────────────────────────────────────────────────────

/**
 * Slot availability, computed in exactly one place.
 *
 * Only one person from the team takes consultations, so a slot is a single
 * global resource: once it is booked it is gone for every space type, every
 * mode and every visitor. Both the availability endpoint and the booking
 * endpoint read this, so what the calendar shows and what the server accepts
 * can never disagree.
 */
async function availabilityFor(date: string): Promise<{
  date: string;
  slots: { time: string; available: boolean }[];
  reason?: string;
}> {
  const day = new Date(`${date}T00:00:00`);

  // Working hours in CONTACT say Sunday is closed, so no slots are offered.
  if (day.getDay() === 0) {
    return {
      date,
      slots: CONSULTATION_SLOTS.map((time) => ({ time, available: false })),
      reason: 'We are closed on Sundays - please pick another day.',
    };
  }

  const taken = new Set(
    (await db.consultations.find({ where: { preferredDate: date } }))
      .filter((entry) => entry.status !== 'cancelled')
      .map((entry) => entry.preferredSlot),
  );

  const isToday = date === new Date().toISOString().slice(0, 10);

  return {
    date,
    slots: CONSULTATION_SLOTS.map((time) => {
      let available = !taken.has(time);

      // A slot that has already passed today cannot be booked.
      if (available && isToday) {
        const [clock, meridiem] = time.split(' ');
        const [hourPart, minutePart] = clock!.split(':');
        let hour = Number(hourPart);
        if (meridiem === 'PM' && hour !== 12) hour += 12;
        const slotTime = new Date();
        slotTime.setHours(hour, Number(minutePart), 0, 0);
        available = slotTime.getTime() > Date.now();
      }

      return { time, available };
    }),
  };
}

/**
 * Serialises bookings for the same slot inside this process.
 *
 * Three things guard a slot now, and they cover different failures. The
 * availability re-read below catches a stale calendar. The unique index in
 * migration 007 is the only thing that can actually settle a race, because it
 * is the only one inside the database. This queue sits between them: it stops
 * two requests on this instance from racing at all, so the common case gets a
 * clean "already taken" answer rather than an insert that has to fail first.
 *
 * Keyed per date+slot so unrelated bookings never wait on each other, and the
 * key is deleted once the chain settles so the map cannot grow without bound.
 */
const slotQueue = new Map<string, Promise<void>>();

function withSlotLock<T>(date: string, slot: string, work: () => Promise<T>): Promise<T> {
  const key = `${date}|${slot}`;
  const previous = slotQueue.get(key) ?? Promise.resolve();

  // `.then(work, work)` rather than `.finally`: a booking that failed must not
  // stop the next person in the queue from being served.
  const result = previous.then(work, work);

  // The queue holds a marker that never rejects, so one failure cannot poison
  // the chain behind it.
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  slotQueue.set(key, tail);

  void tail.then(() => {
    // Only the last link clears the key — otherwise a request that queued
    // behind this one would lose the predecessor it is waiting on.
    if (slotQueue.get(key) === tail) slotQueue.delete(key);
  });

  return result;
}

publicRouter.post(
  '/consultations',
  authLimiter,
  validate(consultationSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as ConsultationInput;

    const request = await withSlotLock(input.preferredDate, input.preferredSlot, async () => {
      // Re-check at write time. The calendar the visitor is looking at may be
      // minutes old, and two people can reach this endpoint at once — without
      // this, both get a confirmation for the same slot and one of them is
      // turned away on the day.
      const availability = await availabilityFor(input.preferredDate);
      const slot = availability.slots.find((entry) => entry.time === input.preferredSlot);

      if (!slot) {
        throw conflict(`${input.preferredSlot} is not one of our consultation times.`);
      }
      if (!slot.available) {
        throw conflict(
          availability.reason ??
            `${input.preferredSlot} on ${input.preferredDate} has just been taken. Please pick another time.`,
        );
      }

      try {
        return await db.consultations.insert({
          ...input,
          message: input.message ?? null,
          status: 'new',
          createdAt: now(),
        });
      } catch (error) {
        // The unique index caught a booking this instance could not see —
        // another server, or a request that landed between the read above and
        // this insert. Same answer the slow path gives, not a 500.
        if (isUniqueViolation(error)) {
          throw conflict(
            `${input.preferredSlot} on ${input.preferredDate} has just been taken. Please pick another time.`,
          );
        }
        throw error;
      }
    });

    void sendConsultationReceived(request.email, request.name, {
      spaceType: SPACE_TYPE_LABELS[request.spaceType] ?? request.spaceType,
      location: request.location,
      preferredDate: request.preferredDate,
      preferredSlot: request.preferredSlot,
      mode: request.mode,
    });

    await notifyRole('manager', {
      type: 'system',
      title: 'New consultation request',
      body: `${request.name} · ${request.spaceType} in ${request.location} · ${request.preferredDate} ${request.preferredSlot}`,
      link: '/console/spaces/consultations',
    });
    await notifyRole('operations', {
      type: 'system',
      title: 'New consultation request',
      body: `${request.name} would like a ${request.mode === 'video' ? 'video call' : 'visit'}.`,
      link: '/console/spaces/consultations',
    });

    await recordAudit({
      action: 'consultation.requested',
      entity: 'consultation',
      entityId: request.id,
      meta: { email: request.email },
      ip: req.ip,
    });

    // Anyone else with the calendar open sees this slot grey out without
    // reloading — the same event the content carousels already listen on.
    broadcast('content-updates', 'consultation-booked', {
      date: request.preferredDate,
      slot: request.preferredSlot,
      timestamp: now(),
    });

    res.status(201).json(request);
  }),
);

publicRouter.get(
  '/consultations/slots',
  asyncHandler(async (req, res) => {
    const date =
      typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    res.json(await availabilityFor(date));
  }),
);

// ── Artist applications ──────────────────────────────────────────────────────

publicRouter.post(
  '/applications',
  authLimiter,
  validate(artistApplicationSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as {
      fullName: string;
      email: string;
      location: string;
      website?: string | null;
      instagram?: string | null;
      journey: string;
      genres: string[];
      goals?: string | null;
      referral?: string | null;
      portfolioUrls: string[];
    };

    const email = input.email.trim().toLowerCase();

    // The dropzone sends data URLs; store each and keep the public URL - and
    // its size and bytes, so setup can make the screen copies without
    // fetching the file back.
    const knownSizes = new Map<string, { width: number; height: number }>();
    const knownFiles = new Map<string, { buffer: Buffer; contentType: string }>();
    const portfolioUrls = await Promise.all(
      input.portfolioUrls.map(async (value) => {
        if (isRemoteUrl(value)) return value;
        const stored = await storeImage(value, 'artworks');
        if (stored.width && stored.height) knownSizes.set(stored.url, { width: stored.width, height: stored.height });
        if (stored.buffer) knownFiles.set(stored.url, { buffer: stored.buffer, contentType: stored.contentType });
        return stored.url;
      }),
    );

    const application = await db.applications.insert({
      fullName: input.fullName,
      email,
      location: input.location,
      website: input.website || null,
      instagram: input.instagram || null,
      journey: input.journey,
      genres: input.genres,
      goals: input.goals ?? null,
      referral: input.referral ?? null,
      portfolioUrls,
      status: 'submitted',
      reviewNote: null,
      createdAt: now(),
      updatedAt: now(),
    });

    await recordAudit({
      action: 'application.submitted',
      entity: 'application',
      entityId: application.id,
      meta: { email: application.email },
      ip: req.ip,
    });

    /*
      No approval step: the account is made now. A new photographer gets the
      setup link (the invitation email); someone who already has a password is
      told their photographs are in their Studio. Nothing here says "we will
      review" - there is no review of the account, only of each photograph
      before it goes public, as with every upload.
    */
    const setup = await onboardApplication(application, { knownSizes, knownFiles }).catch((error) => {
      logger.error(`Account setup for application ${application.id} failed`, error);
      void db.applications
        .update(application.id, { reviewNote: 'Account setup failed - retry it from Console → Artists → Applications.', updatedAt: now() })
        .catch(() => undefined);
      return null;
    });
    if (setup?.invitation === 'not_needed' && !setup.problem) {
      void sendMail({
        to: email,
        subject: 'Your photographs are in your ARTINU Studio',
        heading: `Welcome back, ${input.fullName.trim().split(/\s+/)[0]}.`,
        body:
          'The photographs you just sent are in your Studio. They go through the same automatic checks as every ' +
          'upload and appear in the gallery once they clear them. Sign in with the email and password you already use.',
        cta: { label: 'Open your Studio', url: `${env.CLIENT_URL.replace(/\/+$/, '')}/signin?as=artist` },
        priority: 'normal',
      });
    }

    await notifyRole('manager', {
      type: 'application_update',
      title: setup?.problem ? 'Artist account needs attention' : 'New photographer',
      body: setup?.problem
        ? `${application.fullName}: ${setup.problem}`
        : `${application.fullName} from ${application.location} · ${portfolioUrls.length} photographs added`,
      link: '/console/artists/applications',
    });

    // The same answer whatever the address's history, so the form cannot be
    // used to find out who already has an account.
    res.status(201).json({ id: application.id, received: true });
  }),
);

// ── Support ──────────────────────────────────────────────────────────────────

publicRouter.post(
  '/support',
  requireAuth,
  validate(supportTicketSchema),
  asyncHandler(async (req, res) => {
    const input = req.valid as { subject: string; category: string; message: string };

    const ticket = await db.supportTickets.insert({
      userId: req.user!.id,
      subject: input.subject,
      message: input.message,
      category: input.category as never,
      status: 'open',
      reply: null,
      createdAt: now(),
      updatedAt: now(),
    });

    await notifyRole('manager', {
      type: 'system',
      title: `Support request: ${ticket.subject}`,
      body: ticket.message.slice(0, 160),
      link: '/console/orders',
    });

    await notify({
      userId: req.user!.id,
      type: 'system',
      title: 'We have your request',
      body: 'Someone from the team will get back to you shortly.',
    });

    void sendMail({
      to: req.user!.email,
      subject: `We received your request - ${ticket.subject}`,
      heading: 'We have your request.',
      body: `“${ticket.message}”\n\nSomeone from the team will be in touch shortly.`,
    });

    res.status(201).json(ticket);
  }),
);

publicRouter.get(
  '/support',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await db.supportTickets.find({
        where: { userId: req.user!.id },
        orderBy: { field: 'createdAt', direction: 'desc' },
      }),
    );
  }),
);

// ── Server-Sent Events for real-time content updates ───────────────────────────

publicRouter.get(
  '/events/content',
  attachUser,
  asyncHandler(async (req, res) => {
    const userId = req.user?.id ?? 'anonymous';
    handleSSEConnection(req, res, 'content-updates', userId);
  }),
);
