import { formatDate, type RotationCycle } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Status, type StatusTone } from '@/components/layout/panel';
import { RotationCalendar } from '@/features/space/components/RotationCalendar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { rotationService, spaceService } from '@/services/space.service';

const STATUS_COPY: Record<
  RotationCycle['status'],
  { tone: StatusTone; label: string; explain: string }
> = {
  active: {
    tone: 'success',
    label: 'On your walls',
    explain: 'Your current collection is up. We’ll be in touch when the next rotation is due.',
  },
  due: {
    tone: 'warning',
    label: 'Rotation due',
    explain: 'Our curators are choosing your next collection. You’ll get it to approve shortly.',
  },
  curating: {
    tone: 'info',
    label: 'Curating',
    explain: 'We’re putting together a new selection based on your notes.',
  },
  awaiting_approval: {
    tone: 'bronze',
    label: 'Needs your approval',
    explain: 'Here’s what we’d like to hang next. Nothing changes until you say yes.',
  },
  approved: {
    tone: 'success',
    label: 'Approved',
    explain: 'Approved - our operations team is scheduling the swap.',
  },
  installed: {
    tone: 'neutral',
    label: 'Installed',
    explain: 'This rotation is complete and archived.',
  },
};

export default function RotationPage() {
  const queryClient = useQueryClient();
  const [changesFor, setChangesFor] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');

  const {
    data: cycles,
    isLoading,
    isError,
    error: cyclesError,
    refetch: refetchCycles,
  } = useQuery({
    queryKey: qk.rotation,
    queryFn: () => rotationService.list(),
  });

  const { data: spaces } = useQuery({ queryKey: qk.spaces, queryFn: () => spaceService.list() });
  const spaceById = new Map((spaces ?? []).map((space) => [space.id, space]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.rotation });

  const approve = useMutation({
    mutationFn: (id: string) => rotationService.approve(id),
    onSuccess: () => {
      invalidate();
      toast.success('Approved - we’ll schedule the installation');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  /*
    Moving the date.

    A delta in days, not a date - see rescheduleRotationSchema. The optimistic
    path is deliberately NOT taken here: the server enforces a window measured
    from the original due date, so it can legitimately refuse, and a calendar
    that jumps and then jumps back is worse than one that waits.
  */
  const reschedule = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      rotationService.reschedule(id, days),
    onSuccess: (cycle) => {
      void queryClient.invalidateQueries({ queryKey: qk.rotation });
      toast.success(`Rotation moved to ${formatDate(cycle.dueAt, 'long')}.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const requestChanges = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      rotationService.requestChanges(id, message),
    onSuccess: () => {
      invalidate();
      setChangesFor(null);
      setNote('');
      toast.success('Thanks - our curators will take another pass');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;

  return (
    <div>
      <PanelHeader
        icon={RefreshCw}
        title="Rotation"
        description="Your walls change every month. Nothing moves without your approval."
      />

      {/*
        A failed request is not an empty schedule.

        `isError` was not read, so when /rotation failed - which on a sleeping
        free dyno is every request after an idle period - `cycles` was undefined
        and the empty state below fired. A space owner with a rotation due next
        week was told "No rotations scheduled yet", which is both wrong and
        alarming. Same bug, same fix, as the dashboard's spaces query.
      */}
      {isError && <ErrorState error={cyclesError} onRetry={() => void refetchCycles()} />}

      {cycles && cycles.length > 0 && (
        <RotationCalendar
          cycles={cycles}
          spaceName={(id) => spaceById.get(id)?.name ?? 'Your space'}
          className="mb-12"
          onReschedule={(id, days) => reschedule.mutate({ id, days })}
          rescheduling={reschedule.isPending}
        />
      )}

      {isError ? null : !cycles || cycles.length === 0 ? (
        <EmptyState
          icon={<RefreshCw />}
          title="No rotations scheduled yet."
          description="Once your first collection is installed, we start the rotation clock. You'll see the proposed next collection here before anything changes."
        />
      ) : (
        <div id="cycles" className="scroll-mt-8 space-y-12">
          {cycles.map((cycle) => (
            <RotationCycleSection
              key={cycle.id}
              cycle={cycle}
              spaceName={spaceById.get(cycle.spaceId)?.name ?? 'Your space'}
              onApprove={() => approve.mutate(cycle.id)}
              onRequestChanges={() => setChangesFor(cycle.id)}
              approving={approve.isPending}
            />
          ))}
        </div>
      )}

      <Dialog open={Boolean(changesFor)} onOpenChange={(open) => !open && setChangesFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ask for a different selection</DialogTitle>
            <DialogDescription>
              Tell us what isn&rsquo;t working - too dark, wrong mood, we&rsquo;ve had similar
              before. Our curators will take another pass.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What would you like to see instead?"
            aria-label="Feedback for the curation team"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangesFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={note.trim().length < 4}
              loading={requestChanges.isPending}
              onClick={() => requestChanges.mutate({ id: changesFor!, message: note })}
            >
              Send feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RotationCycleSection({
  cycle,
  spaceName,
  onApprove,
  onRequestChanges,
  approving,
}: {
  cycle: RotationCycle;
  spaceName: string;
  onApprove: () => void;
  onRequestChanges: () => void;
  approving: boolean;
}) {
  const { data: detail } = useQuery({
    queryKey: [...qk.rotation, cycle.id],
    queryFn: () => rotationService.get(cycle.id),
  });

  const copy = STATUS_COPY[cycle.status];
  const dueDays = Math.ceil((new Date(cycle.dueAt).getTime() - Date.now()) / 86400000);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line pb-3">
        <h2 className="font-display text-xl leading-none text-ink">
          {spaceName} <span className="text-subtle">· Cycle {cycle.cycleNumber}</span>
        </h2>
        <Status tone={copy.tone}>{copy.label}</Status>
      </div>

      <p className="mt-4 text-sm text-muted">
        Due {formatDate(cycle.dueAt, 'long')}
        {dueDays >= 0 ? ` · in ${dueDays} days` : ` · ${Math.abs(dueDays)} days overdue`}
      </p>
      <p className="mt-1 max-w-2xl text-sm text-muted">{copy.explain}</p>

      <div className="mt-7 grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Currently on your walls
            </h3>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {detail?.current?.length ? (
                detail.current.map((artwork) => (
                  <Photo
                    key={artwork.id}
                    src={artwork.thumbnailUrl}
                    alt={artwork.title}
                    ratio="aspect-square"
                    className="rounded-sm"
                  />
                ))
              ) : (
                <p className="col-span-4 text-sm text-subtle">Nothing recorded yet.</p>
              )}
            </div>
          </div>

          <div className="sm:border-l sm:border-line sm:pl-8">
            <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
              Proposed next collection
            </h3>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {detail?.proposed?.length ? (
                detail.proposed.map((artwork) => (
                  <Photo
                    key={artwork.id}
                    src={artwork.thumbnailUrl}
                    alt={artwork.title}
                    ratio="aspect-square"
                    className="rounded-sm"
                  />
                ))
              ) : (
                <p className="col-span-4 text-sm text-subtle">
                  We haven&rsquo;t proposed a selection yet.
                </p>
              )}
            </div>
          </div>
        </div>

      {cycle.status === 'awaiting_approval' && (
        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <Button loading={approving} onClick={onApprove}>
            Approve this collection
          </Button>
          <Button variant="outline" onClick={onRequestChanges}>
            Request changes
          </Button>
        </div>
      )}
    </section>
  );
}
