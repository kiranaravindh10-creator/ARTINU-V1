import { ARTWORK_RECOVERY_DAYS, formatDateTime } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Status } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WINDOW = ARTWORK_RECOVERY_DAYS * DAY;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/*
  Both lines are worked out from `remainingMs`, which the server computed at
  the moment of the request - never from this browser's clock, which can be
  wrong. Whole days round DOWN, so the page never promises more time than is
  left, and nothing here is ever negative: an expired photograph is simply not
  in the list.
*/
function deletedAgo(remainingMs: number): string {
  const elapsed = Math.max(0, WINDOW - remainingMs);
  if (elapsed < MINUTE) return 'Deleted just now';
  if (elapsed < HOUR) return `Deleted ${plural(Math.floor(elapsed / MINUTE), 'minute')} ago`;
  if (elapsed < DAY) return `Deleted ${plural(Math.floor(elapsed / HOUR), 'hour')} ago`;
  return `Deleted ${plural(Math.floor(elapsed / DAY), 'day')} ago`;
}

function timeRemaining(remainingMs: number): string {
  if (remainingMs < DAY) return 'Less than 1 day remaining';
  return `${plural(Math.floor(remainingMs / DAY), 'day')} remaining`;
}

/**
 * The photographer's deleted photographs, each recoverable for 17 days.
 *
 * Deliberately one plain list: what it is, when it went, how long is left, and
 * the one thing that can be done about it. The server only ever returns the
 * signed-in photographer's own work, still inside its window.
 */
export default function ArtistRecentlyDeletedPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.recentlyDeleted,
    queryFn: () => catalogService.recentlyDeleted(),
    // Keeps the countdown honest if the page is left open.
    refetchInterval: MINUTE,
  });

  const recover = useMutation({
    mutationFn: (id: string) => catalogService.recoverArtwork(id),
    onSuccess: () => {
      // The artist's own lists (this one included) and the public views it returns to.
      void queryClient.invalidateQueries({ queryKey: ['my-artworks'] });
      void queryClient.invalidateQueries({ queryKey: ['gallery'] });
      void queryClient.invalidateQueries({ queryKey: ['artists'] });
      toast.success('Your photograph has been restored.');
    },
    onError: (mutationError) => {
      toast.error(errorMessage(mutationError));
      // An expired one must drop off the list rather than keep offering a button.
      void refetch();
    },
  });

  return (
    <div>
      <PanelHeader
        icon={Trash2}
        /*
          The account pill floats over the top-right corner. PanelHeader keeps
          clear of it only when a screen has actions, and this one has none, so
          on a phone the title wraps short of it instead of running underneath.
        */
        title={<span className="min-w-0 pr-[9.5rem] sm:pr-0">Recently Deleted</span>}
        description={`Deleted photographs are kept for ${ARTWORK_RECOVERY_DAYS} days. You can restore them during this period. After that they are permanently deleted.`}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap sm:px-5">
              <Photo src={item.thumbnailUrl} alt={item.title} className="size-16 shrink-0 rounded-sm" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{item.title}</p>
                <p className="truncate text-xs text-subtle">
                  {item.artistName}
                  {item.photoId && <span className="ml-2 font-mono tracking-widest">{item.photoId}</span>}
                </p>
                <p className="mt-1.5 text-xs text-muted">{deletedAgo(item.remainingMs)}</p>
              </div>

              <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
                <div className="text-left sm:text-right">
                  <Status tone={item.remainingMs < DAY ? 'warning' : 'neutral'}>
                    {timeRemaining(item.remainingMs)}
                  </Status>
                  <p className="mt-1 text-[0.6875rem] text-subtle">
                    Until {formatDateTime(item.recoverableUntil)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  loading={recover.isPending && recover.variables === item.id}
                  disabled={recover.isPending}
                  onClick={() => recover.mutate(item.id)}
                >
                  <RotateCcw /> Recover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Trash2 />}
          title="Nothing in Recently Deleted."
          description={`Photographs you delete stay here for ${ARTWORK_RECOVERY_DAYS} days, so you can change your mind.`}
          action={
            <Button variant="outline" asChild>
              <Link to="/studio/portfolio">Back to your portfolio</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
