import { ORDER_STATUSES } from '@artinu/shared';
import { db } from '@/database/db';

/**
 * The fulfilment pipeline, without the money (requirements §7).
 *
 * The IT console needs to see what is in flight — an order stuck in `printing`
 * for a fortnight and an installation nobody was assigned to are both
 * operational faults, and today they are invisible next to the error log.
 *
 * What it deliberately does not carry: order totals, payment state, customer
 * contact details. The IT role has no `orders` module and no business seeing
 * revenue; it needs to know that work is moving, not what it is worth. Keeping
 * that out here means the endpoint can stay open to IT without widening the
 * money surface.
 */

/** Statuses that mean "someone still has to do something". */
const OPEN_STATUSES = ORDER_STATUSES.filter(
  (status) => status !== 'completed' && status !== 'cancelled',
);

/** Past this, an order sitting in the same stage is worth a question. */
const STALE_AFTER_DAYS = 7;

export interface PipelineOrder {
  id: string;
  /** The human reference staff quote to each other, not the UUID. */
  reference: string;
  status: string;
  spaceName: string | null;
  itemCount: number;
  placedAt: string;
  updatedAt: string;
  /** Days since the row last changed — the number that makes a stall visible. */
  ageDays: number;
  stale: boolean;
}

export interface PipelineInstallation {
  id: string;
  orderId: string;
  spaceName: string | null;
  scheduledFor: string;
  window: string | null;
  status: string;
  technician: string | null;
  /** Negative once the slot is in the past and the job is still not completed. */
  daysUntil: number;
  overdue: boolean;
}

function wholeDaysBetween(from: string | Date, to: Date): number {
  const start = typeof from === 'string' ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return 0;
  return Math.floor((to.getTime() - start.getTime()) / 86_400_000);
}

export async function fulfilmentPipeline(): Promise<{
  orders: PipelineOrder[];
  installations: PipelineInstallation[];
  counts: {
    open: number;
    stale: number;
    byStatus: Record<string, number>;
    installationsUpcoming: number;
    installationsOverdue: number;
  };
  checkedAt: string;
}> {
  const at = new Date();

  const [orders, installations, spaces] = await Promise.all([
    db.orders.find(),
    db.installations.find(),
    db.spaces.find(),
  ]);

  const spaceName = new Map(spaces.map((space) => [space.id, space.name]));

  const open = orders
    .filter((order) => OPEN_STATUSES.includes(order.status as never))
    .map((order): PipelineOrder => {
      const ageDays = wholeDaysBetween(order.updatedAt ?? order.placedAt, at);
      return {
        id: order.id,
        reference: order.reference,
        status: order.status,
        spaceName: spaceName.get(order.spaceId) ?? null,
        itemCount: Array.isArray(order.items) ? order.items.length : 0,
        placedAt: order.placedAt,
        updatedAt: order.updatedAt ?? order.placedAt,
        ageDays,
        stale: ageDays >= STALE_AFTER_DAYS,
      };
    })
    // Oldest first: the thing that has been waiting longest is the thing to
    // look at, which is the opposite of the newest-first lists elsewhere.
    .sort((a, b) => b.ageDays - a.ageDays);

  const byStatus: Record<string, number> = {};
  for (const order of open) byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;

  const pending = installations
    .filter((row) => row.status === 'scheduled' || row.status === 'in_progress')
    .map((row): PipelineInstallation => {
      const daysUntil = -wholeDaysBetween(row.scheduledFor, at);
      return {
        id: row.id,
        orderId: row.orderId,
        spaceName: spaceName.get(row.spaceId) ?? null,
        scheduledFor: row.scheduledFor,
        window: row.installationWindow ?? null,
        status: row.status,
        technician: row.technician ?? null,
        daysUntil,
        overdue: daysUntil < 0,
      };
    })
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  return {
    orders: open.slice(0, 50),
    installations: pending.slice(0, 50),
    counts: {
      open: open.length,
      stale: open.filter((order) => order.stale).length,
      byStatus,
      installationsUpcoming: pending.filter((row) => !row.overdue).length,
      installationsOverdue: pending.filter((row) => row.overdue).length,
    },
    checkedAt: at.toISOString(),
  };
}
