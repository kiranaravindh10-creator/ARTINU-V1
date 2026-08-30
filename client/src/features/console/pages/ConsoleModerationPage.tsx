import {
  formatRelative,
  GALLERY_CATEGORY_LABELS,
  type Artwork,
  type PublicArtist,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { errorMessage } from '@/lib/api';
import { ValidationResults } from '@/features/shared/components/ValidationResults';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';
import { cn } from '@/lib/utils';

type QueueItem = Artwork & { artist: PublicArtist | null };

/**
 * Why this photograph is here.
 *
 * Only work the automated checks could not settle reaches this screen — a clean
 * run publishes itself and a blocking failure rejects itself, neither of which
 * involves a person. So the one thing a reviewer needs first is which check
 * raised its hand, phrased as the question they are being asked to answer.
 */
const FLAG_QUESTION: Record<string, string> = {
  ai_generated: 'Does this look like a real photograph, or is it generated?',
  metadata: 'Is there enough here for a curator to place it in a space?',
  nsfw: 'Is the wording on this appropriate for a public wall?',
  quality: 'Will this hold up as a physical print?',
  duplicate: 'Is this genuinely different from the artist\u2019s other work?',
};

const FLAG_LABEL: Record<string, string> = {
  ai_generated: 'AI-generated detection',
  metadata: 'Missing detail',
  nsfw: 'Language',
  quality: 'Print quality',
  duplicate: 'Possible duplicate',
};

function flagsOn(artwork: Pick<Artwork, 'validation'>) {
  return (artwork.validation ?? []).filter((entry) => entry.severity === 'warning');
}

export default function ConsoleModerationPage() {
  const queryClient = useQueryClient();
  const [index, setIndex] = React.useState(0);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: qk.admin.moderation({ status: 'pending_review' }),
    queryFn: () => adminService.moderationQueue({ status: 'pending_review', pageSize: 50 }),
  });

  const queue = (data?.items ?? []) as QueueItem[];
  const current = queue[Math.min(index, Math.max(0, queue.length - 1))];

  const review = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'approve' | 'reject'; reason?: string }) =>
      adminService.review(id, decision, reason),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      setRejecting(false);
      setNote('');
      // Stay on the same index — the queue shifts under us as items leave it.
      setIndex((value) => Math.max(0, Math.min(value, queue.length - 2)));
      toast.success(variables.decision === 'approve' ? 'Published' : 'Rejected - the artist has been told why');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // J/K to move, A to approve, R to reject — this is a repetitive job.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (rejecting || !current) return;
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (event.key === 'j') setIndex((value) => Math.min(queue.length - 1, value + 1));
      if (event.key === 'k') setIndex((value) => Math.max(0, value - 1));
      if (event.key === 'a') review.mutate({ id: current.id, decision: 'approve' });
      if (event.key === 'r') setRejecting(true);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, queue.length, rejecting, review]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  if (queue.length === 0) {
    return (
      <div>
        <PageHeader icon={Eye} title="Photo review" />
        <EmptyState
          icon={<ShieldCheck />}
          title="Nothing needs your eye."
          description="Photographs that pass every check publish themselves, and ones that fail a blocking check are rejected automatically. Only the in-between cases land here."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={Eye}
        eyebrow={`${data?.total ?? queue.length} need a photographer\u2019s eye`}
        title="Photo review"
        description="Clean uploads publish themselves and blocking failures reject themselves. These are the ones the checks could not settle - each shows the question it raised."
        actions={
          <span className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-subtle">
            J / K move · A publish · R reject
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="max-h-[36rem] overflow-y-auto rounded-lg border border-line bg-surface p-2">
          <ul className="space-y-1">
            {queue.map((artwork, position) => (
              <li key={artwork.id}>
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
                    position === index ? 'bg-sand' : 'hover:bg-sand-soft',
                  )}
                >
                  <Photo
                    src={artwork.thumbnailUrl}
                    alt={artwork.title}
                    className="size-10 shrink-0 rounded-sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{artwork.title}</span>
                    <span className="block truncate text-xs text-bronze">
                      {flagsOn(artwork)
                        .map((flag) => FLAG_LABEL[flag.check] ?? flag.check)
                        .join(' · ') || 'Never validated'}
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      {artwork.artist?.name} · {formatRelative(artwork.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {current && (
          <Card>
            <CardContent className="p-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <Photo
                  src={current.imageUrl}
                  alt={current.title}
                  className="photo-edge rounded-md"
                  ratio={
                    current.orientation === 'portrait'
                      ? 'aspect-[3/4]'
                      : current.orientation === 'square'
                        ? 'aspect-square'
                        : 'aspect-[3/2]'
                  }
                />

                <div>
                  {flagsOn(current).length > 0 && (
                    <div className="mb-5 border-l-2 border-bronze bg-bronze-soft/40 py-3 pl-4 pr-3">
                      <p className="font-label text-[0.5625rem] uppercase tracking-[0.16em] text-bronze-deep">
                        {flagsOn(current)
                          .map((flag) => FLAG_LABEL[flag.check] ?? flag.check)
                          .join(' · ')}
                      </p>
                      <p className="mt-1.5 text-sm text-ink">
                        {FLAG_QUESTION[flagsOn(current)[0]!.check] ??
                          'The automated checks could not settle this one.'}
                      </p>
                    </div>
                  )}

                  <h2 className="font-display text-2xl text-ink">{current.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    by {current.artist?.name ?? 'Unknown artist'} ·{' '}
                    {GALLERY_CATEGORY_LABELS[current.category]}
                  </p>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-subtle">Dimensions</dt>
                      <dd className="text-ink">
                        {current.width} × {current.height}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Location</dt>
                      <dd className="text-ink">{current.location ?? '-'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-subtle">Tags</dt>
                      <dd className="text-ink">{current.tags.join(', ') || '-'}</dd>
                    </div>
                  </dl>

                  {current.description && (
                    <p className="mt-4 text-sm leading-relaxed text-muted">{current.description}</p>
                  )}

                  <h3 className="mt-6 font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                    Automated checks
                  </h3>
                  <ValidationResults results={current.validation} className="mt-3" />

                  <div className="mt-7 flex gap-3">
                    <Button
                      className="flex-1"
                      loading={review.isPending}
                      onClick={() => review.mutate({ id: current.id, decision: 'approve' })}
                    >
                      Publish
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setRejecting(true)}>
                      Don&rsquo;t publish
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Why are we rejecting this?</DialogTitle>
            <DialogDescription>
              The artist sees this note. Be specific and be kind - most rejections are fixable.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. The resolution won't hold up at A2. Could you send the full-size file?"
            aria-label="Rejection note"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={note.trim().length < 4}
              loading={review.isPending}
              onClick={() => review.mutate({ id: current!.id, decision: 'reject', reason: note })}
            >
              Reject photograph
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
