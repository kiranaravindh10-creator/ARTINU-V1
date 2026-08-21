import { formatDateTime, ORDER_STATUS_LABELS } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, RefreshCw, ServerCog } from 'lucide-react';
import * as React from 'react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Progress, Skeleton } from '@/components/ui/display';
import { StatGrid, StatTile } from '@/components/ui/stat';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';
import { operationsService } from '@/services/operations.service';

const DRIVER_NOTES: Record<string, string> = {
  memory: 'Seeded in-process store. No external database is configured.',
  supabase: 'Supabase PostgreSQL.',
  local: 'Files are written to disk and served from /uploads.',
  console: 'No mail provider configured — emails are printed to the server log.',
  smtp: 'Delivering through the configured SMTP relay.',
  sendgrid: 'Delivering through SendGrid.',
  mock_qr: 'Dynamic UPI QR codes. No gateway is connected.',
  razorpay: 'Razorpay gateway.',
  stripe: 'Stripe gateway.',
};

function formatBytes(bytes: number) {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days && `${days}d`, hours && `${hours}h`, `${minutes}m`].filter(Boolean).join(' ');
}

export default function ConsoleSystemPage() {
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: qk.admin.system,
    queryFn: () => adminService.system(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  const heapPercent = data ? (data.memory.heapUsed / data.memory.heapTotal) * 100 : 0;
  const errorRate = data && data.requestCount > 0 ? (data.errorCount / data.requestCount) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="System health"
        description="What the API is actually doing right now."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle">
              Updated {dataUpdatedAt ? formatDateTime(new Date(dataUpdatedAt)) : '—'}
            </span>
            <Button variant="outline" size="sm" loading={isFetching} onClick={() => void refetch()}>
              <RefreshCw /> Refresh
            </Button>
          </div>
        }
      />

      <SubNav
        items={[
          { to: '/console/system', label: 'Health', end: true },
          { to: '/console/system/mail', label: 'Email log' },
        ]}
      />

      <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft px-5 py-4">
        <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-sm font-medium text-success">API is up</p>
          <p className="text-xs text-success/80">
            Uptime {formatUptime(data?.uptime ?? 0)} · Node {data?.node ?? '—'}
          </p>
        </div>
      </div>

      <StatGrid className="mb-6">
        <StatTile label="Requests served" value={data?.requestCount ?? 0} />
        <StatTile
          label="Errors"
          value={data?.errorCount ?? 0}
          hint={`${errorRate.toFixed(2)}% of requests`}
        />
        <StatTile label="Heap used" value={formatBytes(data?.memory.heapUsed ?? 0)} format="raw" />
        <StatTile label="RSS" value={formatBytes(data?.memory.rss ?? 0)} format="raw" />
      </StatGrid>

      <OperationalHealth />

      <FulfilmentPipeline />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Drivers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-muted">
              A driver whose credentials are missing falls back automatically — memory store, local
              disk, console email — so the environment is never a mystery.
            </p>
            <dl className="space-y-3">
              {Object.entries(data?.drivers ?? {}).map(([name, value]) => (
                <div key={name} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <dt className="text-sm capitalize text-ink">{name}</dt>
                    <dd className="text-xs text-subtle">{DRIVER_NOTES[value] ?? ''}</dd>
                  </div>
                  <Badge variant="bronze">{value}</Badge>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Heap</span>
              <span className="tabular-nums text-ink">
                {formatBytes(data?.memory.heapUsed ?? 0)} / {formatBytes(data?.memory.heapTotal ?? 0)}
              </span>
            </div>
            <Progress value={heapPercent} className="mt-2" />

            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Resident set size</dt>
                <dd className="tabular-nums text-ink">{formatBytes(data?.memory.rss ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Process started</dt>
                <dd className="text-ink">
                  {data?.startedAt ? formatDateTime(data.startedAt) : '—'}
                </dd>
              </div>
            </dl>

            <h3 className="mt-6 font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Mounted API modules
            </h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(data?.routes ?? []).map((route) => (
                <Badge key={route} variant="outline">
                  /{route}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent errors</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentErrors?.length ? (
            <ul className="divide-y divide-line-soft font-mono text-xs">
              {data.recentErrors.map((entry, index) => (
                <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <span className="text-subtle">{formatDateTime(entry.at)}</span>
                  <Badge variant={entry.status >= 500 ? 'danger' : 'warning'}>{entry.status}</Badge>
                  <span className="text-ink">{entry.path}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{entry.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<ServerCog />}
              title="No errors recorded since the service started."
              description="Failures are captured here as they happen, newest first."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}


/**
 * Orders still in flight and installations still to happen (requirements §7).
 *
 * The IT console previously showed only what had already broken. A print job
 * that has not moved in nine days, or an installation whose slot passed
 * yesterday with nobody assigned, is the same class of problem one step
 * earlier — so both are here, oldest first, because the thing that has waited
 * longest is the thing to ask about.
 *
 * No money: this view carries no order totals or payment state, which is what
 * lets the IT role see it at all.
 */
function FulfilmentPipeline() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ops', 'pipeline'],
    queryFn: () => operationsService.pipeline(),
    refetchInterval: 60_000,
  });

  if (isError) return null;
  if (isLoading) return <Skeleton className="mb-6 h-64 w-full rounded-lg" />;

  const orders = data?.orders ?? [];
  const installations = data?.installations ?? [];
  const counts = data?.counts;

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      {/* min-w-0 on both columns — a grid item's default min-width:auto lets a
          long space name push the whole page sideways at 390px. */}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Orders in flight</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-6">
            <div>
              <p className="font-display text-3xl text-ink">{counts?.open ?? 0}</p>
              <p className="text-xs text-subtle">Open</p>
            </div>
            <div>
              <p
                className={`font-display text-3xl ${counts?.stale ? 'text-warning' : 'text-subtle'}`}
              >
                {counts?.stale ?? 0}
              </p>
              <p className="text-xs text-subtle">Untouched 7+ days</p>
            </div>
          </div>

          {orders.length > 0 ? (
            <ul className="divide-y divide-line-soft border-t border-line">
              {orders.slice(0, 6).map((order) => (
                <li key={order.id} className="flex items-center gap-3 py-2.5 text-xs">
                  <Badge variant={order.stale ? 'warning' : 'outline'}>
                    {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                      order.status}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-ink-soft">
                    {order.spaceName ?? 'Unnamed space'}
                    <span className="ml-2 font-mono text-subtle">{order.reference}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-subtle">
                    {order.ageDays === 0 ? 'today' : `${order.ageDays}d`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line pt-4 text-sm text-subtle">
              Nothing open. Every order has been completed or cancelled.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Installations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-6">
            <div>
              <p className="font-display text-3xl text-ink">
                {counts?.installationsUpcoming ?? 0}
              </p>
              <p className="text-xs text-subtle">Upcoming</p>
            </div>
            <div>
              <p
                className={`font-display text-3xl ${
                  counts?.installationsOverdue ? 'text-danger' : 'text-subtle'
                }`}
              >
                {counts?.installationsOverdue ?? 0}
              </p>
              <p className="text-xs text-subtle">Slot passed</p>
            </div>
          </div>

          {installations.length > 0 ? (
            <ul className="divide-y divide-line-soft border-t border-line">
              {installations.slice(0, 6).map((job) => (
                <li key={job.id} className="flex items-center gap-3 py-2.5 text-xs">
                  <Badge variant={job.overdue ? 'danger' : 'outline'}>
                    {job.overdue
                      ? `${Math.abs(job.daysUntil)}d late`
                      : job.daysUntil === 0
                        ? 'today'
                        : `in ${job.daysUntil}d`}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-ink-soft">
                    {job.spaceName ?? 'Unnamed space'}
                  </span>
                  <span className="shrink-0 truncate text-subtle">
                    {job.technician ?? 'Unassigned'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line pt-4 text-sm text-subtle">
              Nothing scheduled. Installations appear here as soon as they are booked.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * SMTP allowance and open error incidents.
 *
 * Both are things the IT team has to see *before* they become an outage: the
 * mail quota because sign-in codes stop when it runs out, and the incident
 * count because a fault nobody looked at is the one that spreads. Rendered
 * separately so a failure here cannot blank the rest of the health page.
 */
function OperationalHealth() {
  const { data, isError } = useQuery({
    queryKey: ['ops', 'system', 'health'],
    queryFn: () => operationsService.health(),
    // Reflects a live counter, so a stale figure is worse than a slow one.
    refetchInterval: 60_000,
  });

  const { data: errors } = useQuery({
    queryKey: ['ops', 'system', 'errors', 'open'],
    queryFn: () => operationsService.errors({ resolution: 'open', limit: 8 }),
  });

  if (isError) {
    return (
      <div className="mb-6 rounded-lg border border-warning/40 bg-warning-soft px-5 py-4 text-sm text-warning">
        Operational metrics are unavailable — the operations tables may not be migrated yet
        (database/migrations/004_operations.sql).
      </div>
    );
  }

  const mail = data?.mail;
  const tone =
    mail?.state === 'exhausted' || mail?.state === 'critical'
      ? 'danger'
      : mail?.state === 'warning'
        ? 'warning'
        : 'success';

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Email allowance</CardTitle>
        </CardHeader>
        <CardContent>
          {mail ? (
            <>
              <div className="flex items-baseline justify-between">
                <p className="font-display text-3xl text-ink">
                  {mail.used.toLocaleString()}
                  <span className="text-base text-subtle"> / {mail.limit.toLocaleString()}</span>
                </p>
                <Badge variant={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'success'}>
                  {mail.percentage}%
                </Badge>
              </div>
              <Progress value={mail.percentage} className="mt-3" />
              <p className="mt-3 text-xs text-muted">
                {mail.remaining.toLocaleString()} remaining this month · projected month end{' '}
                {mail.projectedMonthEnd.toLocaleString()}
              </p>
              {mail.reservedForCriticalOnly && (
                <p className="mt-2 text-xs text-warning">
                  Only sign-in codes and password resets are being sent — the rest is held back.
                </p>
              )}
            </>
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div>
              <p className="font-display text-3xl text-ink">{data?.errors.open ?? 0}</p>
              <p className="text-xs text-subtle">Open</p>
            </div>
            <div>
              <p className="font-display text-3xl text-danger">{data?.errors.critical ?? 0}</p>
              <p className="text-xs text-subtle">Critical</p>
            </div>
            <div>
              <p className="font-display text-3xl text-success">{data?.errors.autoRecovered ?? 0}</p>
              <p className="text-xs text-subtle">Auto-recovered</p>
            </div>
          </div>

          {errors && errors.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {errors.slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 text-xs">
                  <Badge variant={entry.severity === 'critical' ? 'danger' : 'warning'}>
                    {entry.source}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-muted" title={entry.message}>
                    {entry.message}
                  </span>
                  <span className="shrink-0 text-subtle">×{entry.occurrences}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border-t border-line pt-4 text-sm text-subtle">
              Nothing open. Errors appear here automatically when they occur.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
