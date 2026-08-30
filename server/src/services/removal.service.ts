import {
  REMOVAL_PROCESSING_DAYS,
  type RemovalRequest,
  type RemovalRequestStatus,
} from '@artinu/shared';
import { db } from '@/database/db';
import { badRequest, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { recordAudit } from '@/services/audit.service';
import { notify } from '@/services/notification.service';

/**
 * Photograph removal and account deletion requests (§11, §19–21).
 *
 * ── The deadline is tied to a physical event, not to the request ────────────
 *
 * §11 is specific: a photograph that is hanging in a café stays up until it has
 * physically been removed, and only then does ARTINU have five days to process
 * the removal. So the five days are counted from `physicallyRemovedAt`, which a
 * person sets when the piece actually comes down — never from `createdAt`.
 *
 * The consequence is deliberate: a request can sit at
 * `awaiting_installation_removal` indefinitely without breaching anything,
 * because the clock has not started. Nothing here deletes a photograph because
 * five days have passed; it deletes it because a person completed the request.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Is this photograph currently part of a live installation? */
async function isInstalled(artworkId: string): Promise<boolean> {
  const installations = await db.installations.find();
  return installations.some((installation) => {
    const record = installation as unknown as {
      artworkIds?: string[];
      status?: string;
    };
    const live = record.status !== 'completed' && record.status !== 'cancelled';
    return live && (record.artworkIds ?? []).includes(artworkId);
  });
}

export interface CreateRemovalInput {
  userId: string;
  kind: 'artwork' | 'account';
  artworkId?: string;
  reason?: string;
}

/**
 * Opens a request.
 *
 * The initial status is decided by whether the work is currently hanging
 * somewhere, so the photographer is told the truth immediately rather than
 * being promised a removal that cannot happen yet.
 */
export async function createRemovalRequest(input: CreateRemovalInput): Promise<RemovalRequest> {
  const user = await db.users.byId(input.userId);
  if (!user) throw notFound('That account');

  if (input.kind === 'artwork') {
    if (!input.artworkId) throw badRequest('Which photograph would you like removed?');
    const artwork = await db.artworks.byId(input.artworkId);
    if (!artwork) throw notFound('That photograph');
    if (artwork.artistId !== input.userId) {
      throw badRequest('That is not your photograph.');
    }
  }

  const open = await db.removalRequests.find({
    where: { userId: input.userId, kind: input.kind },
    filter: (row) => row.status !== 'completed' && row.status !== 'rejected',
  });

  const duplicate = open.find((row) =>
    input.kind === 'artwork' ? row.artworkId === input.artworkId : true,
  );
  if (duplicate) {
    throw badRequest('There is already an open request for this. We will be in touch.');
  }

  // Account deletion covers every photograph, so it is treated as installed if
  // any single one of them is.
  let installationActive = false;
  if (input.kind === 'artwork' && input.artworkId) {
    installationActive = await isInstalled(input.artworkId);
  } else {
    const mine = await db.artworks.find({ where: { artistId: input.userId } });
    for (const artwork of mine) {
      if (await isInstalled(artwork.id)) {
        installationActive = true;
        break;
      }
    }
  }

  const request = await db.removalRequests.insert({
    userId: input.userId,
    artworkId: input.artworkId ?? null,
    kind: input.kind,
    status: installationActive ? 'awaiting_installation_removal' : 'requested',
    reason: input.reason?.trim() || null,
    installationActive,
    physicallyRemovedAt: null,
    processBy: null,
    decidedBy: null,
    decidedAt: null,
    notes: null,
    createdAt: now(),
    updatedAt: now(),
  });

  await recordAudit({
    actor: { id: user.id, email: user.email },
    action: 'removal.requested',
    entity: 'removal_request',
    entityId: request.id,
    meta: { kind: input.kind, artworkId: input.artworkId ?? null, installationActive },
  });

  await notify({
    userId: user.id,
    type: 'system',
    title: input.kind === 'account' ? 'Account deletion requested' : 'Removal requested',
    body: installationActive
      ? 'Your work is currently installed in a venue. It stays up until it has been taken down, ' +
        `and we will complete the removal within ${REMOVAL_PROCESSING_DAYS} days of that.`
      : `We have your request and will process it within ${REMOVAL_PROCESSING_DAYS} days.`,
    link: '/studio/account',
  }).catch((error) => logger.error('Could not notify about a removal request', error));

  return request;
}

/**
 * Records that the piece has physically come off the wall.
 *
 * This is the moment the five-day clock starts, so it is also the moment
 * `processBy` is computed. Nothing else in this file sets that field.
 */
export async function markPhysicallyRemoved(
  requestId: string,
  actor: { id: string; email: string },
  when = new Date(),
): Promise<RemovalRequest> {
  const request = await db.removalRequests.byId(requestId);
  if (!request) throw notFound('That request');
  if (request.physicallyRemovedAt) {
    throw badRequest('That request is already marked as physically removed.');
  }

  const removedAt = when.toISOString();
  const processBy = new Date(when.getTime() + REMOVAL_PROCESSING_DAYS * DAY).toISOString();

  const updated = await db.removalRequests.update(request.id, {
    installationActive: false,
    physicallyRemovedAt: removedAt,
    processBy,
    status: 'approved',
    updatedAt: now(),
  });

  await recordAudit({
    actor,
    action: 'removal.physically_removed',
    entity: 'removal_request',
    entityId: request.id,
    meta: { removedAt, processBy },
  });

  await notify({
    userId: request.userId,
    type: 'system',
    title: 'Your work has been taken down',
    body: `We will complete the removal within ${REMOVAL_PROCESSING_DAYS} days.`,
    link: '/studio/account',
  }).catch(() => undefined);

  return updated;
}

/** Moves a request along. `completed` is the one that actually removes work. */
export async function updateRemovalStatus(
  requestId: string,
  status: RemovalRequestStatus,
  actor: { id: string; email: string },
  notes?: string,
): Promise<RemovalRequest> {
  const request = await db.removalRequests.byId(requestId);
  if (!request) throw notFound('That request');

  if (status === 'completed') {
    if (request.installationActive) {
      throw badRequest(
        'This work is still installed. Record the physical removal before completing the request.',
      );
    }

    /*
      Completion archives; it does not destroy.

      §18 and §21 both ask for the record to survive — a photograph may appear
      on an invoice, in an installation history, or in a rotation that already
      happened. `archived` takes it out of the gallery and leaves those intact.
    */
    if (request.kind === 'artwork' && request.artworkId) {
      await db.artworks.update(request.artworkId, {
        status: 'archived',
        updatedAt: now(),
      });
    } else {
      const mine = await db.artworks.find({ where: { artistId: request.userId } });
      for (const artwork of mine) {
        await db.artworks.update(artwork.id, { status: 'archived', updatedAt: now() });
      }
      // The account is closed rather than deleted, for the same reason.
      await db.users.update(request.userId, {
        status: 'banned',
        statusReason: 'Account closed at the photographer’s request.',
        statusChangedAt: now(),
        statusChangedBy: actor.id,
      } as never);
    }
  }

  const updated = await db.removalRequests.update(request.id, {
    status,
    notes: notes?.trim() || request.notes,
    decidedBy: actor.id,
    decidedAt: now(),
    updatedAt: now(),
  });

  await recordAudit({
    actor,
    action: `removal.${status}`,
    entity: 'removal_request',
    entityId: request.id,
    meta: { kind: request.kind, artworkId: request.artworkId ?? null },
  });

  return updated;
}

/** Everything open, oldest first — the console's work queue. */
export async function listRemovalRequests(status?: RemovalRequestStatus): Promise<RemovalRequest[]> {
  return db.removalRequests.find({
    where: status ? { status } : undefined,
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
}

export async function listMyRemovalRequests(userId: string): Promise<RemovalRequest[]> {
  return db.removalRequests.find({
    where: { userId },
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
}

/**
 * Requests whose five days are running out.
 *
 * Reported, never acted on: passing the deadline is an operational failure for
 * ARTINU to notice, not a trigger to delete somebody's photograph
 * automatically.
 */
export async function overdueRemovals(today = new Date()): Promise<RemovalRequest[]> {
  const open = await db.removalRequests.find({
    filter: (row) => row.status !== 'completed' && row.status !== 'rejected',
  });
  return open.filter((row) => row.processBy && new Date(row.processBy) < today);
}
