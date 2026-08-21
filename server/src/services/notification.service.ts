import type {
  AnnouncementAudience,
  Notification,
  NotificationType,
  Paginated,
  Role,
} from '@artinu/shared';
import { db } from '@/database/db';
import { paginate } from '@/database/table';
import { notFound } from '@/utils/errors';
import { now } from '@/utils/ids';

/**
 * In-product notifications (SDD §12). Email can bounce, be filtered or simply
 * go unread — the bell is the channel we control, so every event that matters
 * lands here first and is emailed second.
 */

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export async function notify(input: NotifyInput): Promise<Notification> {
  return db.notifications.insert(toRecord(input));
}

export async function notifyMany(inputs: NotifyInput[]): Promise<Notification[]> {
  if (inputs.length === 0) return [];
  return db.notifications.insertMany(inputs.map(toRecord));
}

/** Fan out to a whole role — "tell every manager there is something to review". */
export async function notifyRole(
  role: Role,
  input: Omit<NotifyInput, 'userId'>,
): Promise<Notification[]> {
  const recipients = await db.users.find({
    where: { role },
    filter: (user) => user.status !== 'suspended',
  });
  return notifyMany(recipients.map((user) => ({ ...input, userId: user.id })));
}

/**
 * One message to every account in an audience.
 *
 * Built on `notifyMany`, so an announcement is an ordinary notification row and
 * behaves like one everywhere else in the product — same bell, same unread
 * count, same archive.
 *
 * Suspended accounts are excluded, matching `notifyRole` above: an account we
 * have locked should not keep receiving platform announcements.
 *
 * The rows are written in batches rather than one `insertMany` of everything.
 * With a few hundred artists a single call is fine; at a few thousand it is one
 * enormous insert whose failure loses the whole announcement, and on the
 * Supabase driver it is one request whose payload grows without bound. Batching
 * keeps each write a predictable size and lets a partial failure still deliver
 * to the accounts already written.
 *
 * Returns how many accounts were written to, which is what the console reports
 * back and what the audit entry records.
 */
export async function broadcast(input: {
  audience: AnnouncementAudience;
  title: string;
  body: string;
  link?: string;
}): Promise<number> {
  const roles: Role[] =
    input.audience === 'artists'
      ? ['artist']
      : input.audience === 'space_owners'
        ? ['space_owner']
        : ['artist', 'space_owner'];

  const recipients = await db.users.find({
    where: { role: roles },
    filter: (user) => user.status !== 'suspended',
  });

  const BATCH = 200;
  let written = 0;

  for (let start = 0; start < recipients.length; start += BATCH) {
    const slice = recipients.slice(start, start + BATCH);
    const created = await notifyMany(
      slice.map((user) => ({
        userId: user.id,
        // Announcements are not tied to an order, an upload or a payout, which
        // is exactly what `system` is for in NOTIFICATION_TYPES.
        type: 'system' as NotificationType,
        title: input.title,
        body: input.body,
        link: input.link,
      })),
    );
    written += created.length;
  }

  return written;
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notifications.count({ userId, read: false, archived: false });
}

// ── Reading and clearing ─────────────────────────────────────────────────────

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; page?: number; pageSize?: number } = {},
): Promise<Paginated<Notification>> {
  const items = await db.notifications.find({
    where: { userId, archived: false },
    filter: options.unreadOnly ? (record) => !record.read : undefined,
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
  return paginate(items, options.page ?? 1, options.pageSize ?? 20);
}

export async function markRead(userId: string, id: string): Promise<Notification> {
  const record = await db.notifications.byId(id);
  if (!record || record.userId !== userId) throw notFound('That notification');
  return db.notifications.update(id, { read: true });
}

export async function markAllRead(userId: string): Promise<number> {
  const unread = await db.notifications.find({ where: { userId, read: false } });
  for (const record of unread) await db.notifications.update(record.id, { read: true });
  return unread.length;
}

export async function archiveNotification(userId: string, id: string): Promise<Notification> {
  const record = await db.notifications.byId(id);
  if (!record || record.userId !== userId) throw notFound('That notification');
  return db.notifications.update(id, { archived: true, read: true });
}

function toRecord(input: NotifyInput): Omit<Notification, 'id'> {
  return {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    read: false,
    archived: false,
    createdAt: now(),
  };
}
