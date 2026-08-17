import type { Notification, NotificationType, Paginated, Role } from '@artinu/shared';
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
