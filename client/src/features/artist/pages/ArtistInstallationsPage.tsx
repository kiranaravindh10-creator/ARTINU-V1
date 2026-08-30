import { formatDate, type InstallationStatus } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Coffee, MapPin } from 'lucide-react';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Figure, FigureRow, Rows, Status, type StatusTone } from '@/components/layout/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { qk } from '@/lib/query';
import { contentService } from '@/services/content.service';
import { installationService } from '@/services/space.service';

const STATUS: Record<InstallationStatus, { label: string; tone: StatusTone }> = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  completed: { label: 'Installed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export default function ArtistInstallationsPage() {
  const { data: installations = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.installations,
    queryFn: () => installationService.mine(),
  });

  const { data: cafes = [] } = useQuery({
    queryKey: ['content-manager', 'cafes', 'active'],
    queryFn: () => contentService.getActiveCafes(),
  });

  const spaceCount = new Set(installations.map((entry) => entry.spaceId)).size;
  const live = installations.filter((entry) => entry.status === 'completed').length;
  const upcoming = installations.filter((entry) => entry.status === 'scheduled').length;

  return (
    <div>
      <PanelHeader
        icon={MapPin}
        title="Installations"
        description="Where your photographs currently hang."
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-px">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : installations.length > 0 ? (
        <>
          <div className="border-b border-line pb-10">
            <FigureRow className="lg:gap-x-16">
              <Figure value={live} label="On walls now" hint="Installed and live" />
              <Figure value={upcoming} label="Scheduled" hint="Fitting date booked" />
              <Figure
                value={spaceCount}
                label={spaceCount === 1 ? 'Space' : 'Spaces'}
                hint="Hosting your work"
              />
            </FigureRow>
          </div>

          <Rows className="mt-10">
            {installations.map((installation) => (
              <li
                key={installation.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {installation.status === 'completed' ? 'Installed' : 'Installation scheduled'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(installation.scheduledFor, 'long')}
                    {installation.installationWindow ? ` · ${installation.installationWindow}` : ''}
                    {installation.technician ? ` · fitted by ${installation.technician}` : ''}
                  </p>
                </div>

                <Status tone={STATUS[installation.status].tone}>
                  {STATUS[installation.status].label}
                </Status>
              </li>
            ))}
          </Rows>
        </>
      ) : (
        <EmptyState
          icon={<CalendarCheck />}
          title="No installations yet."
          description="When a space selects your photographs, the installation is scheduled and appears here - with the date and who is fitting it."
        />
      )}

      {cafes.length > 0 && (
        <section className="mt-14 border-t border-line pt-10">
          <div className="flex items-center gap-2.5">
            <Coffee className="size-4 text-bronze" strokeWidth={1.5} aria-hidden />
            <h2 className="font-display text-lg text-ink">Our collaborated cafés</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            The cafés ARTINU currently curates - your work may hang in these spaces next.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cafes.map((cafe) => (
              <div
                key={cafe.id}
                className="overflow-hidden rounded-lg border border-line bg-surface"
              >
                <div className="relative aspect-[4/3]">
                  <Photo
                    src={cafe.photoUrl}
                    alt={cafe.name}
                    thumbnail
                    className="absolute inset-0 h-full w-full"
                    imgClassName="h-full w-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium text-ink">{cafe.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{cafe.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}