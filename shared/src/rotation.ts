import { ROTATION_RESCHEDULE_WINDOW_DAYS } from './constants.js';

/**
 * WHERE A ROTATION MAY BE MOVED TO.
 *
 * This lives in shared/ for the same reason pricing does: the server decides
 * whether a move is allowed and the client decides which days to offer, and if
 * those two ever disagree the owner gets a calendar that lights up a date the
 * API then refuses. One implementation, both sides.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * A rotation may sit at most ROTATION_RESCHEDULE_WINDOW_DAYS either side of the
 * date it was ORIGINALLY due — not either side of wherever it currently is.
 *
 * That distinction is the whole point. Measuring from the current date lets
 * five taps of "+2 days" walk a rotation a fortnight down the calendar, two
 * days at a time, with every individual request inside the limit. Measuring
 * from the anchor means the second move can only ever bring it back toward
 * where it started, or nudge it to the far edge of the same small window.
 *
 * `rescheduledFrom` is that anchor, stamped on the first move and never
 * overwritten. Null means the rotation has never moved, in which case the
 * anchor is simply where it is now.
 */

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`, rounded — both are ISO timestamps. */
export function dayDelta(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

/**
 * The deltas, in days relative to the CURRENT due date, that this rotation may
 * still be moved by. Ascending, never containing 0.
 *
 * An empty array means it cannot be moved any further in either direction.
 */
export function rescheduleOptions(dueAt: string, rescheduledFrom?: string | null): number[] {
  const anchor = rescheduledFrom ?? dueAt;
  const drift = dayDelta(anchor, dueAt);

  const options: number[] = [];
  for (let target = -ROTATION_RESCHEDULE_WINDOW_DAYS; target <= ROTATION_RESCHEDULE_WINDOW_DAYS; target += 1) {
    // `target` is where it would sit relative to the anchor; the delta the
    // caller has to apply is measured from where it sits now.
    const delta = target - drift;
    if (delta === 0) continue;
    options.push(delta);
  }
  return options.sort((a, b) => a - b);
}

/**
 * Would moving by `days` leave the rotation inside its window?
 *
 * The server's authoritative check. Written in terms of the same arithmetic as
 * `rescheduleOptions` so the two cannot drift apart.
 */
export function canReschedule(
  dueAt: string,
  rescheduledFrom: string | null | undefined,
  days: number,
): boolean {
  if (!Number.isInteger(days) || days === 0) return false;
  const anchor = rescheduledFrom ?? dueAt;
  const nextDrift = dayDelta(anchor, dueAt) + days;
  return Math.abs(nextDrift) <= ROTATION_RESCHEDULE_WINDOW_DAYS;
}

/** The ISO timestamp `days` whole days after `dueAt`, preserving time of day. */
export function shiftedDueAt(dueAt: string, days: number): string {
  const next = new Date(dueAt);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}
