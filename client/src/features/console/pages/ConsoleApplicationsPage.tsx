import { ART_STYLE_LABELS, formatDate, type ArtistApplication } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, Globe, Instagram, Mail, MapPin } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { FilterChips } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'submitted', label: 'New' },
  { value: 'under_review', label: 'Under review' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS = {
  submitted: { label: 'New', variant: 'warning' },
  under_review: { label: 'Under review', variant: 'info' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'neutral' },
} as const;

export default function ConsoleApplicationsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState('submitted');
  const [rejecting, setRejecting] = React.useState<ArtistApplication | null>(null);
  const [note, setNote] = React.useState('');
  const [lightbox, setLightbox] = React.useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.applications({ status }),
    queryFn: () => adminService.applications({ status, pageSize: 50 }),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'accept' | 'reject'; reason?: string }) =>
      adminService.decideApplication(id, decision, reason),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
      setRejecting(null);
      setNote('');
      toast.success(
        variables.decision === 'accept'
          ? 'Accepted - their account is created and a welcome email is on its way'
          : 'Rejected - we’ve emailed them',
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Artist applications"
        description="Accepting an application creates the artist's account and emails them a set-password link."
      />

      <SubNav
        items={[
          { to: '/console/artists', label: 'Artists', end: true },
          { to: '/console/artists/applications', label: 'Applications' },
        ]}
      />

      <FilterChips options={FILTERS} value={status} onChange={setStatus} className="mb-6" />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <Accordion type="multiple" className="rounded-lg border border-line bg-surface px-5">
          {data.items.map((application) => (
            <AccordionItem key={application.id} value={application.id}>
              <AccordionTrigger className="hover:no-underline">
                <span className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm text-ink">{application.fullName}</span>
                    <span className="block truncate text-xs text-subtle">
                      {application.location} · {formatDate(application.createdAt)} ·{' '}
                      {application.portfolioUrls.length} photographs
                    </span>
                  </span>
                  <Badge variant={STATUS[application.status].variant}>
                    {STATUS[application.status].label}
                  </Badge>
                </span>
              </AccordionTrigger>

              <AccordionContent>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <div className="space-y-4">
                    <dl className="space-y-2 text-sm">
                      <div className="flex items-center gap-2.5">
                        <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
                        <a
                          href={`mailto:${application.email}`}
                          className="text-ink hover:text-bronze"
                        >
                          {application.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <MapPin className="size-4 shrink-0 text-bronze" aria-hidden />
                        <span className="text-muted">{application.location}</span>
                      </div>
                      {application.website && (
                        <div className="flex items-center gap-2.5">
                          <Globe className="size-4 shrink-0 text-bronze" aria-hidden />
                          <a
                            href={application.website}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-ink hover:text-bronze"
                          >
                            {application.website}
                          </a>
                        </div>
                      )}
                      {application.instagram && (
                        <div className="flex items-center gap-2.5">
                          <Instagram className="size-4 shrink-0 text-bronze" aria-hidden />
                          <span className="text-muted">{application.instagram}</span>
                        </div>
                      )}
                    </dl>

                    <div className="flex flex-wrap gap-2">
                      {application.genres.map((genre) => (
                        <Badge key={genre} variant="bronze">
                          {ART_STYLE_LABELS[genre as keyof typeof ART_STYLE_LABELS] ?? genre}
                        </Badge>
                      ))}
                    </div>

                    <div>
                      <h4 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                        Their journey
                      </h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {application.journey}
                      </p>
                    </div>

                    {application.goals && (
                      <div>
                        <h4 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                          What they want from ARTINU
                        </h4>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted">
                          {application.goals}
                        </p>
                      </div>
                    )}

                    {application.reviewNote && (
                      <p className="rounded-md bg-sand-soft p-3 text-sm text-ink-soft">
                        {application.reviewNote}
                      </p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                      Portfolio
                    </h4>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {application.portfolioUrls.map((url, index) => (
                        <button key={index} type="button" onClick={() => setLightbox(url)}>
                          <Photo
                            src={url}
                            alt={`Portfolio image ${index + 1}`}
                            ratio="aspect-square"
                            className="rounded-sm transition-opacity hover:opacity-85"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {(application.status === 'submitted' || application.status === 'under_review') && (
                  <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
                    <Button
                      loading={decide.isPending}
                      onClick={() => decide.mutate({ id: application.id, decision: 'accept' })}
                    >
                      Accept &amp; create account
                    </Button>
                    <Button variant="outline" onClick={() => setRejecting(application)}>
                      Reject
                    </Button>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <EmptyState icon={<FileSearch />} title="No applications here." />
      )}

      <Dialog open={Boolean(lightbox)} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && <Photo src={lightbox} alt="Portfolio image" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this application</DialogTitle>
            <DialogDescription>
              We email this to the applicant. Say what would make a future application stronger.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Strong instincts, but the portfolio isn't consistent enough yet…"
            aria-label="Rejection note"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={note.trim().length < 4}
              loading={decide.isPending}
              onClick={() => decide.mutate({ id: rejecting!.id, decision: 'reject', reason: note })}
            >
              Send rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
