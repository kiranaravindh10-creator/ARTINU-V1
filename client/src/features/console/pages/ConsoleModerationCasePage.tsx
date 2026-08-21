import {
  WARNING_CATEGORIES,
  WARNING_CATEGORY_LABELS,
  formatDate,
  formatDateTime,
  type WarningCategory,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, PauseCircle, RotateCcw, ShieldAlert, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Status } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { moderationService } from '@/services/moderation.service';

/**
 * One photographer's moderation record.
 *
 * Everything a reviewer needs to make a decision, on one screen: how long the
 * account has existed, whether the address was verified, which Guidelines
 * version was accepted, what has been uploaded, and every warning against it.
 *
 * The enforcement buttons all require a written reason, because the reason is
 * what the photographer is told and what the next reviewer reads. None of them
 * is gated on the warning count — §12 allows immediate action for serious
 * misconduct, and the count is shown so the reviewer can weigh it, not so the
 * interface can decide for them.
 */

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  verified: 'success',
  pending_verification: 'warning',
  pending_ceo_approval: 'info',
  suspended: 'warning',
  banned: 'danger',
};

export default function ConsoleModerationCasePage() {
  const { artistId = '' } = useParams();
  const queryClient = useQueryClient();

  const [warnOpen, setWarnOpen] = React.useState(false);
  const [action, setAction] = React.useState<'suspend' | 'ban' | 'restore' | null>(null);

  const [reason, setReason] = React.useState('');
  const [category, setCategory] = React.useState<WarningCategory>('guidelines');
  const [notes, setNotes] = React.useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['moderation', 'artist', artistId],
    queryFn: () => moderationService.artist(artistId),
    enabled: Boolean(artistId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['moderation', 'artist', artistId] });

  const close = () => {
    setWarnOpen(false);
    setAction(null);
    setReason('');
    setNotes('');
  };

  const warn = useMutation({
    mutationFn: () =>
      moderationService.issueWarning(artistId, { reason, category, notes: notes || undefined }),
    onSuccess: (result) => {
      invalidate();
      close();
      toast.success(
        result.eligibleForEnforcement
          ? `Warning ${result.count} issued. This account has now reached the limit and needs a decision.`
          : `Warning ${result.count} issued.`,
      );
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  const enforce = useMutation({
    mutationFn: () => {
      if (action === 'suspend') return moderationService.suspend(artistId, reason);
      if (action === 'ban') return moderationService.ban(artistId, reason);
      return moderationService.restore(artistId, reason);
    },
    onSuccess: () => {
      invalidate();
      const done = action;
      close();
      toast.success(
        done === 'suspend'
          ? 'Account suspended.'
          : done === 'ban'
            ? 'Account permanently closed.'
            : 'Account restored.',
      );
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-96 w-full rounded-lg" />;

  const { user, profile, artworks, warnings, warningLimit, eligibleForEnforcement } = data;
  const suspended = user.status === 'suspended' || user.status === 'banned';

  return (
    <div>
      <PageHeader
        icon={ShieldAlert}
        title={profile?.displayName || profile?.fullName || user.email}
        description="Community Guidelines record for this photographer."
        actions={
          <>
            <Button variant="outline" onClick={() => setWarnOpen(true)}>
              <TriangleAlert /> Issue warning
            </Button>
            {suspended ? (
              <Button variant="outline" onClick={() => setAction('restore')}>
                <RotateCcw /> Restore
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAction('suspend')}>
                  <PauseCircle /> Suspend
                </Button>
                <Button variant="danger" onClick={() => setAction('ban')}>
                  <Ban /> Ban permanently
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Reaching the limit is surfaced, not acted on. §12 says "may result in". */}
      {eligibleForEnforcement && !suspended && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-warning/30 bg-warning-soft p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm text-warning">
            This account has {warnings.length} of {warningLimit} warnings and is eligible for
            suspension or a permanent ban under Community Guidelines §12. The decision is yours —
            nothing happens automatically.
          </p>
        </div>
      )}

      {suspended && (
        <div className="mb-6 rounded-md border border-danger/30 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">
            {user.status === 'banned' ? 'Permanently closed' : 'Suspended'}
            {user.statusChangedAt ? ` on ${formatDate(user.statusChangedAt, 'long')}` : ''}
          </p>
          {user.statusReason && <p className="mt-1 text-sm text-danger">{user.statusReason}</p>}
        </div>
      )}

      <dl className="mb-9 grid gap-x-10 gap-y-5 border-b border-line pb-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Status', node: <Status tone={STATUS_TONE[user.status] ?? 'info'}>{user.status.replace(/_/g, ' ')}</Status> },
          {
            label: 'Email verified',
            node: (
              <Status tone={user.emailVerified ? 'success' : 'warning'}>
                {user.emailVerified ? 'Verified' : 'Not verified'}
              </Status>
            ),
          },
          { label: 'Joined', value: formatDate(user.createdAt, 'long') },
          { label: 'Last signed in', value: user.lastLoginAt ? formatDate(user.lastLoginAt, 'long') : 'Never' },
          { label: 'Photographs', value: String(artworks.total) },
          {
            label: 'Published',
            value: String(artworks.byStatus.approved ?? 0),
          },
          { label: 'Warnings', value: `${warnings.length} of ${warningLimit}` },
          {
            label: 'Guidelines accepted',
            value: profile?.guidelinesAcceptedAt
              ? `v${profile.guidelinesVersion} · ${formatDate(profile.guidelinesAcceptedAt, 'long')}`
              : 'Not recorded',
          },
        ].map((entry) => (
          <div key={entry.label}>
            <dt className="font-label text-[0.5625rem] uppercase tracking-[0.16em] text-subtle">
              {entry.label}
            </dt>
            <dd className="mt-1.5 text-sm text-ink">{entry.node ?? entry.value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="font-display text-xl text-ink">Warning history</h2>
        {warnings.length === 0 ? (
          <p className="prose-quiet mt-3">No warnings have been issued against this account.</p>
        ) : (
          <ul className="mt-4">
            {warnings.map((warning) => (
              <li key={warning.id} className="border-b border-line-soft py-5 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      Warning {warning.number} · {WARNING_CATEGORY_LABELS[warning.category] ?? warning.category}
                    </p>
                    <p className="mt-1 text-sm text-muted">{warning.reason}</p>
                    {warning.notes && (
                      <p className="mt-1 text-xs text-subtle">Note: {warning.notes}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-subtle">
                    {formatDateTime(warning.createdAt)}
                    {warning.issuedByEmail ? ` · ${warning.issuedByEmail}` : ' · automatic'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Issue a warning ──────────────────────────────────────────────── */}
      <Dialog open={warnOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue a warning</DialogTitle>
            <DialogDescription>
              The photographer is emailed and notified in the product. The reason below is what
              they read, so write it for them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Category">
              <SimpleSelect
                value={category}
                onValueChange={(value) => setCategory(value as WarningCategory)}
                options={WARNING_CATEGORIES.map((value) => ({
                  value,
                  label: WARNING_CATEGORY_LABELS[value],
                }))}
              />
            </Field>
            <Field label="Reason" htmlFor="warn-reason" required>
              <Textarea
                id="warn-reason"
                rows={3}
                maxLength={600}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="What happened, in a sentence or two."
              />
            </Field>
            <Field label="Internal note" htmlFor="warn-notes" hint="Not shown to the photographer.">
              <Input
                id="warn-notes"
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={warn.isPending}
              disabled={reason.trim().length < 5}
              onClick={() => warn.mutate()}
            >
              Issue warning {warnings.length + 1}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Suspend / ban / restore ──────────────────────────────────────── */}
      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === 'suspend'
                ? 'Suspend this account?'
                : action === 'ban'
                  ? 'Permanently close this account?'
                  : 'Restore this account?'}
            </DialogTitle>
            <DialogDescription>
              {action === 'ban'
                ? 'They will not be able to sign in again. Their photographs and record are kept, not deleted.'
                : action === 'suspend'
                  ? 'They will not be able to sign in until restored. Nothing is deleted.'
                  : 'They will be able to sign in again straight away.'}
            </DialogDescription>
          </DialogHeader>

          <Field label="Reason" htmlFor="enforce-reason" required>
            <Textarea
              id="enforce-reason"
              rows={3}
              maxLength={600}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="This is included in the email they receive."
            />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={action === 'ban' ? 'danger' : 'primary'}
              loading={enforce.isPending}
              disabled={reason.trim().length < 5}
              onClick={() => enforce.mutate()}
            >
              {action === 'suspend' ? 'Suspend' : action === 'ban' ? 'Close permanently' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
