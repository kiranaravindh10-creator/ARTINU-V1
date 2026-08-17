import type { RotationCycle } from '@artinu/shared';
import { db } from '@/database/db';
import { notify } from '@/services/notification.service';
import { isPast, monthsFromNow, now } from '@/utils/ids';

/**
 * Rotation lifecycle (SDD §14): active → due → curating → awaiting_approval →
 * approved → installed.
 *
 * There is no scheduler in the MVP, so `ensureRotationsDue` is called whenever
 * cycles are read. That keeps the state honest without pretending a cron job
 * exists — a due date that has passed becomes "due" the next time anyone looks.
 */
export async function ensureRotationsDue(spaceIds?: string[]): Promise<number> {
  const cycles = await db.rotations.find({
    where: spaceIds ? { spaceId: spaceIds } : undefined,
  });

  let flipped = 0;
  for (const cycle of cycles) {
    if (cycle.status !== 'active' || !isPast(cycle.dueAt)) continue;

    await db.rotations.update(cycle.id, { status: 'due' });
    flipped += 1;

    const space = await db.spaces.byId(cycle.spaceId);
    if (space) {
      await notify({
        userId: space.ownerId,
        type: 'rotation_reminder',
        title: 'Your rotation is due',
        body: `We are curating a fresh collection for ${space.name}. You will get the proposal to approve shortly.`,
        link: '/space/rotation',
      });
    }
  }

  return flipped;
}

/**
 * Starts the rotation clock the first time a collection actually goes up.
 *
 * Rotation is the product. Without this the chain had no origin: `openNextCycle`
 * only ever continued an existing cycle, so a real customer who paid and had
 * their walls filled would never be offered a refresh — the thing they are
 * paying for. Idempotent, so re-completing an order cannot open a second cycle.
 */
export async function ensureRotationStarted(
  spaceId: string,
  installedArtworkIds: string[],
): Promise<RotationCycle | null> {
  const existing = await db.rotations.find({ where: { spaceId } });

  const open = existing.find((cycle) => cycle.status !== 'installed');
  if (open) {
    // Already running — just make sure it reflects what is on the wall now.
    const merged = [...new Set([...open.currentArtworkIds, ...installedArtworkIds])];
    return db.rotations.update(open.id, { currentArtworkIds: merged });
  }

  const space = await db.spaces.byId(spaceId);
  const months = space?.rotationIntervalMonths ?? 3;

  const cycle = await db.rotations.insert({
    spaceId,
    cycleNumber: existing.length + 1,
    currentArtworkIds: installedArtworkIds,
    proposedArtworkIds: [],
    status: 'active',
    dueAt: monthsFromNow(months),
    approvedAt: null,
    installedAt: now(),
    createdAt: now(),
  });

  if (space) {
    await notify({
      userId: space.ownerId,
      type: 'system',
      title: 'Your rotation has started',
      body: `Your collection is up at ${space.name}. We will curate a fresh selection every ${months} ${months === 1 ? 'month' : 'months'} — you approve it before anything changes.`,
      link: '/space/rotation',
    });
  }

  return cycle;
}

/** Opens the next cycle once one has been installed, so rotation keeps going. */
export async function openNextCycle(cycle: RotationCycle): Promise<RotationCycle> {
  const space = await db.spaces.byId(cycle.spaceId);
  const months = space?.rotationIntervalMonths ?? 3;

  return db.rotations.insert({
    spaceId: cycle.spaceId,
    cycleNumber: cycle.cycleNumber + 1,
    currentArtworkIds: cycle.proposedArtworkIds.length
      ? cycle.proposedArtworkIds
      : cycle.currentArtworkIds,
    proposedArtworkIds: [],
    status: 'active',
    dueAt: monthsFromNow(months),
    approvedAt: null,
    installedAt: null,
    createdAt: now(),
  });
}
