import { formatDate, SPACE_TYPE_LABELS, type ConsultationRequest } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Mail, MapPin, Phone, User, Video } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

const COLUMNS = [
  { status: 'new' as const, title: 'New', hint: 'Waiting to be scheduled' },
  { status: 'scheduled' as const, title: 'Scheduled', hint: 'Booked in' },
  { status: 'completed' as const, title: 'Completed', hint: 'Consultation done' },
];

export default function ConsoleConsultationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: qk.admin.consultations({}),
    queryFn: () => adminService.consultations({ pageSize: 100 }),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ConsultationRequest['status'] }) =>
      adminService.updateConsultation(id, status),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'consultations'] });
      toast.success(
        variables.status === 'scheduled'
          ? 'Confirmed — we’ve emailed them the details'
          : 'Updated',
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const all = data?.items ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const agenda = all.filter(
    (entry) =>
      entry.status === 'scheduled' &&
      entry.preferredDate >= today &&
      entry.preferredDate <= weekAhead,
  );

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  return (
    <div>
      <PageHeader
        title="Consultations"
        description="Every enquiry from Let's Talk, and where it stands."
      />

      <SubNav
        items={[
          { to: '/console/spaces', label: 'Spaces', end: true },
          { to: '/console/spaces/consultations', label: 'Consultations' },
        ]}
      />

      {agenda.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
              This week
            </h2>
            <ul className="mt-3 divide-y divide-line-soft">
              {agenda.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand text-bronze">
                    {entry.mode === 'video' ? (
                      <Video className="size-4" aria-hidden />
                    ) : (
                      <User className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{entry.name}</p>
                    <p className="text-xs text-subtle">
                      {SPACE_TYPE_LABELS[entry.spaceType]} · {entry.location}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-muted">
                    {formatDate(entry.preferredDate)} · {entry.preferredSlot}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {all.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} title="No consultation requests yet." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const items = all.filter((entry) => entry.status === column.status);
            return (
              <section key={column.status}>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg text-ink">{column.title}</h2>
                  <span className="font-label tabular-nums text-xs text-subtle">{items.length}</span>
                </div>
                <p className="mb-3 text-xs text-subtle">{column.hint}</p>

                <ul className="space-y-3">
                  {items.map((entry) => (
                    <li key={entry.id}>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink">{entry.name}</p>
                              <p className="text-xs text-subtle">
                                {SPACE_TYPE_LABELS[entry.spaceType]}
                              </p>
                            </div>
                            <Badge variant={entry.mode === 'video' ? 'info' : 'bronze'}>
                              {entry.mode === 'video' ? 'Video' : 'In person'}
                            </Badge>
                          </div>

                          <dl className="mt-3 space-y-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <MapPin className="size-3.5 shrink-0 text-bronze" aria-hidden />
                              <span className="text-muted">{entry.location}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CalendarCheck className="size-3.5 shrink-0 text-bronze" aria-hidden />
                              <span className="text-muted">
                                {formatDate(entry.preferredDate)} · {entry.preferredSlot}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="size-3.5 shrink-0 text-bronze" aria-hidden />
                              <a href={`mailto:${entry.email}`} className="truncate text-ink hover:text-bronze">
                                {entry.email}
                              </a>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="size-3.5 shrink-0 text-bronze" aria-hidden />
                              <a href={`tel:${entry.phone}`} className="text-ink hover:text-bronze">
                                {entry.phone}
                              </a>
                            </div>
                          </dl>

                          {entry.message && (
                            <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted">
                              {entry.message}
                            </p>
                          )}

                          <div className="mt-4 flex flex-wrap gap-2">
                            {entry.status === 'new' && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => update.mutate({ id: entry.id, status: 'scheduled' })}
                                >
                                  Confirm booking
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => update.mutate({ id: entry.id, status: 'cancelled' })}
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                            {entry.status === 'scheduled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => update.mutate({ id: entry.id, status: 'completed' })}
                              >
                                Mark completed
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}

                  {items.length === 0 && (
                    <li className="rounded-lg border border-dashed border-line py-8 text-center text-xs text-subtle">
                      Nothing here
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
