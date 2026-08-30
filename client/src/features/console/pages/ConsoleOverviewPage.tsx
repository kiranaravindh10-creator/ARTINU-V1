import { formatCurrency, formatRelative, ROLE_MODULES } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  CalendarCheck,
  FileSearch,
  Images,
  RefreshCw,
  ShieldCheck,
  Frame,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/DashboardShell';
import { RankBars, TrendChart } from '@/components/charts/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/display';
import { StatGrid, StatTile } from '@/components/ui/stat';
import { useAuth } from '@/contexts/AuthContext';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';
import { operationsService } from '@/services/operations.service';

export default function ConsoleOverviewPage() {
  const { user, profile } = useAuth();
  const modules = new Set(ROLE_MODULES[user?.role ?? ''] ?? []);
  const seesMoney = modules.has('reports') || modules.has('accounts');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.analytics('console'),
    queryFn: () => adminService.analytics(),
  });

  const { data: moderation } = useQuery({
    queryKey: qk.admin.moderation({ status: 'pending_review' }),
    queryFn: () => adminService.moderationQueue({ status: 'pending_review', pageSize: 1 }),
    enabled: modules.has('moderation'),
  });

  const { data: applications } = useQuery({
    queryKey: qk.admin.applications({ status: 'submitted' }),
    queryFn: () => adminService.applications({ status: 'submitted', pageSize: 1 }),
    enabled: modules.has('artists'),
  });

  const { data: consultations } = useQuery({
    queryKey: qk.admin.consultations({ status: 'new' }),
    queryFn: () => adminService.consultations({ status: 'new', pageSize: 1 }),
    enabled: modules.has('spaces'),
  });

  const { data: unpaid } = useQuery({
    queryKey: qk.admin.orders({ status: 'pending_payment' }),
    queryFn: () => adminService.orders({ status: 'pending_payment', pageSize: 1 }),
    enabled: modules.has('orders'),
  });

  const attention = [
    modules.has('orders') && {
      label: 'Orders awaiting payment',
      count: unpaid?.total ?? 0,
      to: '/console/orders?status=pending_payment',
      icon: Frame,
    },
    modules.has('moderation') && {
      label: 'Photographs to review',
      count: moderation?.total ?? 0,
      to: '/console/moderation',
      icon: ShieldCheck,
    },
    modules.has('artists') && {
      label: 'Artist applications waiting',
      count: applications?.total ?? 0,
      to: '/console/artists/applications',
      icon: FileSearch,
    },
    modules.has('spaces') && {
      label: 'Consultations to schedule',
      count: consultations?.total ?? 0,
      to: '/console/spaces/consultations',
      icon: CalendarCheck,
    },
  ].filter(Boolean) as { label: string; count: number; to: string; icon: typeof Frame }[];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ARTINU Console"
        title={`Good day, ${profile?.fullName?.split(' ')[0] ?? 'there'}.`}
        description="What the business looks like right now."
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <StatGrid columns={5}>
          {seesMoney && (
            <StatTile
              label="Revenue"
              value={data?.revenue ?? 0}
              format="currency-compact"
              icon={TrendingUp}
              hint={`${formatCurrency(data?.revenueThisMonth ?? 0, { compact: true })} this month`}
            />
          )}
          <StatTile label="Orders" value={data?.orders ?? 0} icon={Frame} />
          <StatTile
            label="Pending orders"
            value={data?.pendingOrders ?? 0}
            icon={Truck}
            hint="Awaiting payment"
          />
          <StatTile label="Installations" value={data?.installations ?? 0} icon={CalendarCheck} />
          {seesMoney && (
            <StatTile
              label="Average order"
              value={data?.averageOrderValue ?? 0}
              format="currency"
              icon={Banknote}
            />
          )}
        </StatGrid>
      )}

      {/* The most useful block on the page: what needs a decision today. */}
      {attention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="flex items-center gap-3 rounded-md border border-line p-4 transition-colors hover:border-line-strong hover:bg-sand-soft"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand text-bronze">
                      <item.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-ink-soft">{item.label}</span>
                    <span
                      className={`font-display text-2xl ${item.count > 0 ? 'text-ink' : 'text-subtle'}`}
                    >
                      {item.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {modules.has('printing') && <FrameStock />}

      {seesMoney && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart
                data={data?.revenueTrend ?? []}
                format="currency"
                label="Last 12 months"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart data={data?.ordersTrend ?? []} label="Last 12 months" height={160} />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {seesMoney && (
          <Card>
            <CardHeader>
              <CardTitle>Top spaces</CardTitle>
            </CardHeader>
            <CardContent>
              <RankBars
                format="currency"
                data={(data?.topSpaces ?? []).map((space) => ({
                  label: space.name,
                  value: space.revenue ?? 0,
                  sublabel: `${space.orders} orders`,
                }))}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Best artists</CardTitle>
          </CardHeader>
          <CardContent>
            <RankBars
              format={seesMoney ? 'currency' : 'number'}
              data={(data?.topArtists ?? []).map((artist) => ({
                label: artist.name,
                value: seesMoney ? (artist.earnings ?? 0) : artist.selections,
                sublabel: `${artist.selections} frames selected`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most selected photographs</CardTitle>
          </CardHeader>
          <CardContent>
            <RankBars
              data={(data?.popularArtworks ?? []).map((artwork) => ({
                label: artwork.title,
                value: artwork.selections,
                sublabel: `${artwork.views} views`,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Growth &amp; conversion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Metric
              icon={Users}
              label="Artist growth"
              value={`${data?.artistGrowth ?? 0}`}
              explain="Artists who joined in the last 90 days."
            />
            <Metric
              icon={Images}
              label="Space growth"
              value={`${data?.spaceGrowth ?? 0}`}
              explain="Space owners who joined in the last 90 days."
            />
            <Metric
              icon={TrendingUp}
              label="Conversion rate"
              value={`${data?.conversionRate ?? 0}%`}
              explain="Owners who have ordered, against consultations and registrations."
            />
            <Metric
              icon={RefreshCw}
              label="Repeat customers"
              value={`${data?.repeatCustomerRate ?? 0}%`}
              explain="Owners with more than one paid order."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentActivity?.length ? (
              <ul className="divide-y divide-line-soft">
                {data.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-soft">
                        {entry.action.replace(/[._]/g, ' ')}
                      </p>
                      <p className="truncate text-xs text-subtle">{entry.actorEmail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-subtle">
                      {formatRelative(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-sm text-subtle">Nothing recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Printed frames, on the page the manager actually opens (requirements §6).
 *
 * The number that matters is `reusableNow` — frames that came back off a wall
 * and can go straight onto another one. Ordering stock that is already sitting
 * in the store is the specific waste this is here to prevent, so it is the
 * figure given the most weight, and `totalReuses` is shown beside it as the
 * running proof that the reuse loop is working.
 *
 * Rendered as its own component so a project that has not run migration 004
 * gets a missing card rather than a blank overview.
 */
function FrameStock() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ops', 'frames', 'summary'],
    queryFn: () => operationsService.frameSummary(),
  });

  if (isError) return null;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;

  const printed = data?.total ?? 0;
  const onWalls = data?.installed ?? 0;
  const reusable = data?.reusableNow ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Printed frames</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <FrameFigure label="Printed to date" value={printed} />
          <FrameFigure label="On walls" value={onWalls} />
          <FrameFigure label="Reserved" value={data?.reserved ?? 0} />
          <FrameFigure
            label="Reusable now"
            value={reusable}
            tone={reusable > 0 ? 'good' : 'plain'}
            hint="Back in store, ready to re-hang"
          />
          <FrameFigure
            label="Total reuses"
            value={data?.totalReuses ?? 0}
            hint="Frames re-hung instead of reprinted"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-subtle">
          <span>
            {(data?.inTransit ?? 0).toLocaleString()} in transit ·{' '}
            {(data?.maintenance ?? 0).toLocaleString()} in maintenance ·{' '}
            {(data?.retired ?? 0).toLocaleString()} retired
          </span>
          <Link
            to="/console/frames"
            className="text-bronze underline underline-offset-4 hover:text-bronze-dark"
          >
            Manage inventory
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function FrameFigure({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'plain' | 'good';
}) {
  return (
    <div className="min-w-0">
      <p
        className={`font-display text-3xl tabular-nums ${
          tone === 'good' && value > 0 ? 'text-success' : 'text-ink'
        }`}
      >
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-[0.6875rem] leading-snug text-subtle">{hint}</p>}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  explain,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  explain: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand text-bronze">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-ink">{label}</p>
          <p className="font-display text-xl text-ink">{value}</p>
        </div>
        <p className="text-xs leading-relaxed text-subtle">{explain}</p>
      </div>
    </div>
  );
}
