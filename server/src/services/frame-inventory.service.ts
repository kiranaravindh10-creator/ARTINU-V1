import { db } from '@/database/db';
import { notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';

/**
 * Physical frame inventory and smart reallocation (requirements §39).
 *
 * The business problem, stated plainly: when a café cancels, its frames come
 * back to us. If nothing records that, the next installation triggers a
 * purchase order for frames we already own and have sitting in a store room.
 *
 * So the whole design answers one question — "before buying, what can we
 * move?" — and `reallocationPlan` below is the function that answers it.
 *
 * A frame is a physical asset with a location, not a line item on an order.
 * That is why it lives in its own table rather than hanging off `orders`.
 */

export type FrameStatus =
  | 'available'
  | 'reserved'
  | 'installed'
  | 'in_transit'
  | 'maintenance'
  | 'retired';

export interface FrameRecord {
  id: string;
  frameCode: string;
  size: string;
  material: string;
  color: string;
  glass: string;
  condition: 'good' | 'fair' | 'damaged' | 'retired';
  status: FrameStatus;
  spaceId?: string | null;
  installationId?: string | null;
  orderId?: string | null;
  artworkId?: string | null;
  installedAt?: string | null;
  removedAt?: string | null;
  timesReused: number;
  purchaseCost?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A frame can only be moved to a new space if it is sound. */
const REUSABLE_CONDITIONS = new Set(['good', 'fair']);

async function nextFrameCode(): Promise<string> {
  const frames = await db.frames.find();
  const highest = frames.reduce((max, row) => {
    const match = /^FRM-(\d+)$/.exec(String(row.frameCode ?? ''));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `FRM-${String(highest + 1).padStart(6, '0')}`;
}

/** Records every status/location change so a frame's history is auditable. */
async function logMovement(
  frame: FrameRecord,
  to: { spaceId?: string | null; status: FrameStatus },
  reason: string,
  movedBy?: string,
): Promise<void> {
  await db.frameMovements
    .insert({
      frameId: frame.id,
      fromSpace: frame.spaceId ?? null,
      toSpace: to.spaceId ?? null,
      fromStatus: frame.status,
      toStatus: to.status,
      reason,
      movedBy: movedBy ?? null,
      createdAt: now(),
    } as never)
    .catch((error) => logger.error(`Could not record movement for frame ${frame.frameCode}`, error));
}

export async function addFrames(
  spec: {
    size: string;
    material: string;
    color: string;
    glass?: string;
    purchaseCost?: number;
    quantity: number;
  },
  createdBy?: string,
): Promise<FrameRecord[]> {
  const created: FrameRecord[] = [];

  // Sequential because the code counter is read-then-write; batches here are
  // tens of frames, not thousands, so this is not worth optimising further.
  for (let index = 0; index < Math.max(1, Math.min(spec.quantity, 500)); index += 1) {
    const frame = (await db.frames.insert({
      frameCode: await nextFrameCode(),
      size: spec.size,
      material: spec.material,
      color: spec.color,
      glass: spec.glass ?? 'normal',
      condition: 'good',
      status: 'available',
      spaceId: null,
      installationId: null,
      orderId: null,
      artworkId: null,
      installedAt: null,
      removedAt: null,
      timesReused: 0,
      purchaseCost: spec.purchaseCost ?? null,
      notes: null,
      createdAt: now(),
      updatedAt: now(),
    } as never)) as FrameRecord;

    await logMovement(frame, { status: 'available' }, 'purchased', createdBy);
    created.push(frame);
  }

  return created;
}

/** Marks frames as physically installed at a space. */
export async function installFrame(
  frameId: string,
  target: { spaceId: string; installationId?: string; orderId?: string; artworkId?: string },
  movedBy?: string,
): Promise<FrameRecord> {
  const frame = (await db.frames.byId(frameId)) as FrameRecord | null;
  if (!frame) throw notFound('That frame');

  // Moving to a different space than last time is a reuse — the counter is the
  // cheapest evidence that a purchase was avoided.
  const isReuse = Boolean(frame.spaceId && frame.spaceId !== target.spaceId);

  await logMovement(frame, { spaceId: target.spaceId, status: 'installed' }, 'installed', movedBy);

  return (await db.frames.update(frameId, {
    status: 'installed',
    spaceId: target.spaceId,
    installationId: target.installationId ?? null,
    orderId: target.orderId ?? null,
    artworkId: target.artworkId ?? null,
    installedAt: now(),
    removedAt: null,
    timesReused: frame.timesReused + (isReuse ? 1 : 0),
    updatedAt: now(),
  } as never)) as FrameRecord;
}

/**
 * A space cancelled or ended its subscription: everything on its walls comes
 * back into stock. This is the hinge the whole requirement turns on — without
 * it, cancelled frames stay invisible and get bought again.
 */
export async function releaseFramesFromSpace(
  spaceId: string,
  reason = 'cancelled',
  movedBy?: string,
): Promise<{ released: number; frames: FrameRecord[] }> {
  const onSite = (await db.frames.find({ where: { spaceId } })) as FrameRecord[];
  const toRelease = onSite.filter((frame) => frame.status === 'installed' || frame.status === 'reserved');

  const frames: FrameRecord[] = [];
  for (const frame of toRelease) {
    // A damaged frame goes to maintenance, not back into available stock.
    const nextStatus: FrameStatus = REUSABLE_CONDITIONS.has(frame.condition)
      ? 'available'
      : 'maintenance';

    await logMovement(frame, { spaceId: null, status: nextStatus }, reason, movedBy);

    frames.push(
      (await db.frames.update(frame.id, {
        status: nextStatus,
        spaceId: null,
        installationId: null,
        artworkId: null,
        removedAt: now(),
        updatedAt: now(),
      } as never)) as FrameRecord,
    );
  }

  if (frames.length) {
    logger.info(`Released ${frames.length} frame(s) from space ${spaceId} — now reusable`);
  }
  return { released: frames.length, frames };
}

/**
 * The procurement question, answered: for a required set of frames, what can
 * be pulled from existing stock and what genuinely has to be bought?
 *
 * Matching is exact on size/material/colour — a frame of the wrong size cannot
 * be reused, so counting it as available would produce a plan that fails on
 * installation day.
 */
export async function reallocationPlan(
  requirements: { size: string; material: string; color: string; quantity: number }[],
): Promise<{
  lines: {
    size: string;
    material: string;
    color: string;
    required: number;
    fromStock: number;
    toPurchase: number;
    candidates: { frameCode: string; condition: string; previousSpaceId: string | null }[];
  }[];
  totalRequired: number;
  totalFromStock: number;
  totalToPurchase: number;
}> {
  const available = ((await db.frames.find({ where: { status: 'available' } })) as FrameRecord[])
    .filter((frame) => REUSABLE_CONDITIONS.has(frame.condition));

  // Claimed as we go, so two lines in the same plan cannot both count the same
  // physical frame.
  const claimed = new Set<string>();

  const lines = requirements.map((requirement) => {
    const matches = available.filter(
      (frame) =>
        !claimed.has(frame.id) &&
        frame.size === requirement.size &&
        frame.material === requirement.material &&
        frame.color === requirement.color,
    );

    // Best condition first, then the most-travelled, so stock rotates evenly.
    matches.sort((a, b) => {
      if (a.condition !== b.condition) return a.condition === 'good' ? -1 : 1;
      return b.timesReused - a.timesReused;
    });

    const usable = matches.slice(0, requirement.quantity);
    for (const frame of usable) claimed.add(frame.id);

    return {
      size: requirement.size,
      material: requirement.material,
      color: requirement.color,
      required: requirement.quantity,
      fromStock: usable.length,
      toPurchase: Math.max(0, requirement.quantity - usable.length),
      candidates: usable.map((frame) => ({
        frameCode: frame.frameCode,
        condition: frame.condition,
        previousSpaceId: frame.spaceId ?? null,
      })),
    };
  });

  return {
    lines,
    totalRequired: lines.reduce((sum, line) => sum + line.required, 0),
    totalFromStock: lines.reduce((sum, line) => sum + line.fromStock, 0),
    totalToPurchase: lines.reduce((sum, line) => sum + line.toPurchase, 0),
  };
}

/** Holds specific frames for an upcoming installation so nothing double-books. */
export async function reserveFrames(
  frameCodes: string[],
  spaceId: string,
  movedBy?: string,
): Promise<FrameRecord[]> {
  const reserved: FrameRecord[] = [];

  for (const code of frameCodes) {
    const [frame] = (await db.frames.find({
      where: { frameCode: code },
      limit: 1,
    })) as FrameRecord[];

    if (!frame || frame.status !== 'available') continue;

    await logMovement(frame, { spaceId, status: 'reserved' }, 'reallocated', movedBy);
    reserved.push(
      (await db.frames.update(frame.id, {
        status: 'reserved',
        spaceId,
        updatedAt: now(),
      } as never)) as FrameRecord,
    );
  }

  return reserved;
}

/** Headline counts for the manager dashboard. */
export async function inventorySummary() {
  const frames = (await db.frames.find()) as FrameRecord[];
  const count = (status: FrameStatus) => frames.filter((frame) => frame.status === status).length;

  return {
    total: frames.length,
    available: count('available'),
    reserved: count('reserved'),
    installed: count('installed'),
    inTransit: count('in_transit'),
    maintenance: count('maintenance'),
    retired: count('retired'),
    // What reuse has saved so far, in frames rather than rupees.
    totalReuses: frames.reduce((sum, frame) => sum + (frame.timesReused ?? 0), 0),
    reusableNow: frames.filter(
      (frame) => frame.status === 'available' && REUSABLE_CONDITIONS.has(frame.condition),
    ).length,
  };
}

export async function frameHistory(frameId: string) {
  return db.frameMovements.find({
    where: { frameId },
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
}
