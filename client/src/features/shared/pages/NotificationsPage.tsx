import { formatDate, formatRelative, type NotificationType } from '@artinu/shared';
import {
  Banknote,
  Bell,
  CalendarCheck,
  CircleCheck,
  CircleX,
  CreditCard,
  FileSearch,
  Info,
  PackageCheck,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { FilterChips } from '@/components/ui/tabs';
import { useNotificationActions, useNotifications, useUnreadNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

const ICONS: Record<NotificationType, LucideIcon> = {
  artwork_selected: Sparkles,
  upload_approved: CircleCheck,
  upload_rejected: CircleX,
  payment_received: CreditCard,
  payment_failed: TriangleAlert,
  installation_scheduled: CalendarCheck,
  rotation_reminder: RefreshCw,
  order_completed: PackageCheck,
  order_update: Truck,
  payout_processed: Banknote,
  application_update: FileSearch,
  system: Info,
};

/** "Today", "Yesterday", then the date — grouping headers for the list. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return 'Today';
  if (same(date, yesterday)) return 'Yesterday';
  return formatDate(iso, 'long');
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');

  const { data, isLoading } = useNotifications({ unread: filter === 'unread' });
  const { count } = useUnreadNotifications();
  const { markRead, markAllRead, archive } = useNotificationActions();

  const groups = React.useMemo(() => {
    const map = new Map<string, typeof items>();
    const items = data?.items ?? [];
    for (const notification of items) {
      const key = dayLabel(notification.createdAt);
      map.set(key, [...(map.get(key) ?? []), notification]);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={count > 0 ? `${count} unread` : 'All caught up'}
        title="Notifications"
        description="Every important event also appears here — email is never the only place it exists."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={count === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Mark all as read
          </Button>
        }
      />

      <FilterChips
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: `Unread${count ? ` (${count})` : ''}` },
        ]}
        value={filter}
        onChange={(value) => setFilter(value as 'all' | 'unread')}
        className="mb-6"
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="You're all caught up."
          description={
            filter === 'unread'
              ? 'Nothing unread right now.'
              : 'Notifications about your orders, uploads and rotations will land here.'
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([day, notifications]) => (
            <section key={day}>
              <h2 className="sticky top-16 z-10 bg-canvas-soft/90 py-2 font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle backdrop-blur">
                {day}
              </h2>

              <ul className="mt-2 space-y-2">
                {notifications.map((notification) => {
                  const Icon = ICONS[notification.type] ?? Info;
                  return (
                    <li key={notification.id}>
                      <div
                        className={cn(
                          'group flex items-start gap-3.5 rounded-lg border p-4 transition-colors',
                          notification.read
                            ? 'border-line bg-surface'
                            : 'border-bronze/25 bg-bronze-soft/30',
                        )}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand text-bronze">
                          <Icon className="size-4" aria-hidden />
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            if (!notification.read) markRead.mutate(notification.id);
                            if (notification.link) navigate(notification.link);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="flex items-center gap-2 text-sm font-medium text-ink">
                            {notification.title}
                            {!notification.read && (
                              <span className="size-1.5 shrink-0 rounded-full bg-bronze" aria-label="Unread" />
                            )}
                          </p>
                          <p className="mt-0.5 text-sm leading-relaxed text-muted">{notification.body}</p>
                        </button>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="whitespace-nowrap text-xs text-subtle">
                            {formatRelative(notification.createdAt)}
                          </span>
                          <button
                            type="button"
                            onClick={() => archive.mutate(notification.id)}
                            aria-label="Archive notification"
                            className="text-subtle opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
