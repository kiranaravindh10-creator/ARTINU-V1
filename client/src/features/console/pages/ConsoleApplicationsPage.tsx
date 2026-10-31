import { ART_STYLE_LABELS, formatDate, type AccountAccess, type ApplicationSetup, type ArtistApplication } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, Globe, Instagram, Mail, MapPin, RotateCw } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Photo } from '@/components/ui/photo';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

type Row = ArtistApplication & { setup: ApplicationSetup };

/** Sign-in state of the account an application made - operational, not a decision. */
const SIGN_IN: Record<AccountAccess['state'], { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
  active: { label: 'Can sign in', variant: 'success' },
  invited: { label: 'Password setup pending', variant: 'info' },
  invitation_expired: { label: 'Invitation expired', variant: 'warning' },
  awaiting_approval: { label: 'Awaiting approval', variant: 'warning' },
  blocked: { label: 'Sign-in blocked', variant: 'danger' },
};

/**
 * Console → Artists → Applications.
 *
 * There is nothing to decide here. Submitting an application creates the
 * artist's account, profile, photographer code and photograph records, and
 * emails them a link to choose a password. This list is the record of who
 * applied and what they sent, with the state of the account each one made -
 * and "Retry setup" for the rare one that did not finish.
 */
export default function ConsoleApplicationsPage() {
  const queryClient = useQueryClient();
  const { hasModule } = usePermissions();
  const [lightbox, setLightbox] = React.useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.applications({}),
    queryFn: () => adminService.applications({ pageSize: 100 }),
  });

  const retry = useMutation({
    mutationFn: (id: string) => adminService.retryApplicationSetup(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'people'] });
      if (result.problem) toast.warning(result.problem);
      else toast.success('Setup finished - the account, code and photographs are in place.');
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  // People & access for those who may open it; the artist's record for everyone else.
  const accountLink = (userId: string) =>
    hasModule('users') ? `/console/users/${userId}` : `/console/artists/${userId}/moderation`;

  return (
    <div>
      <PageHeader
        title="Artist applications"
        description="Applying creates the artist's account, photographer code and photographs, and emails them a link to choose a password. There is no approval step."
      />

      <SubNav
        items={[
          { to: '/console/artists', label: 'Artists', end: true },
          { to: '/console/artists/applications', label: 'Applications' },
        ]}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <Accordion type="multiple" className="rounded-lg border border-line bg-surface px-5">
          {(data.items as Row[]).map((application) => {
            const { setup } = application;
            const signIn = setup.account ? SIGN_IN[setup.account.access.state] : null;
            return (
              <AccordionItem key={application.id} value={application.id}>
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm text-ink">{application.fullName}</span>
                      <span className="block truncate text-xs text-subtle">
                        {application.location} · applied {formatDate(application.createdAt)} ·{' '}
                        {setup.photographsLinked} of {setup.photographsSubmitted} photographs in the account
                        {setup.photographsNeedingDetails > 0 &&
                          ` · ${setup.photographsNeedingDetails} still need a title or story from the photographer`}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-ink">{setup.account?.photographerCode ?? 'No code'}</span>
                    {setup.state === 'not_created' ? (
                      <Badge variant="danger">Account not created</Badge>
                    ) : (
                      signIn && <Badge variant={signIn.variant}>{signIn.label}</Badge>
                    )}
                    {setup.state === 'needs_attention' && <Badge variant="warning">Setup incomplete</Badge>}
                  </span>
                </AccordionTrigger>

                <AccordionContent>
                  {setup.problem && (
                    <p className="mb-5 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
                      {setup.problem}
                    </p>
                  )}
                  <div className="mb-6 flex flex-wrap gap-3">
                    {setup.account && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={accountLink(setup.account.userId)}>View the account</Link>
                      </Button>
                    )}
                    {setup.state !== 'ready' && (
                      <Button
                        size="sm"
                        loading={retry.isPending && retry.variables === application.id}
                        onClick={() => retry.mutate(application.id)}
                      >
                        <RotateCw /> Retry setup
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <div className="space-y-4">
                      <dl className="space-y-2 text-sm">
                        <div className="flex items-center gap-2.5">
                          <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
                          <a href={`mailto:${application.email}`} className="text-ink hover:text-bronze">
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
                        <p className="mt-1.5 text-sm leading-relaxed text-muted">{application.journey}</p>
                      </div>

                      {application.goals && (
                        <div>
                          <h4 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                            What they want from ARTINU
                          </h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-muted">{application.goals}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                        Submitted photographs
                      </h4>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {application.portfolioUrls.map((url, index) => (
                          <button key={index} type="button" onClick={() => setLightbox(url)}>
                            <Photo
                              src={url}
                              alt={`Submitted photograph ${index + 1}`}
                              ratio="aspect-square"
                              className="rounded-sm transition-opacity hover:opacity-85"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : (
        <EmptyState icon={<FileSearch />} title="No applications yet." />
      )}

      <Dialog open={Boolean(lightbox)} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && <Photo src={lightbox} alt="Submitted photograph" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
