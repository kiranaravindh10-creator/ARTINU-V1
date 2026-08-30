import {
  formatCurrency,
  formatDate,
  formatDateTime,
  ORDER_STATUS_LABELS,
  PRICING,
  ROLE_MODULES,
  type CostBreakdown,
  type OrderStatus,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, PackageX, TrendingUp } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { DataRow } from '@/components/ui/stat';
import { describeFrame } from '@/features/public/components/FrameConfigurator';
import { ORDER_BADGE } from '@/features/space/pages/SpaceDashboardPage';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';
import { spaceService } from '@/services/space.service';

/** Mirrors the server's transition rules so the UI never offers an illegal move. */
const SEQUENCE: OrderStatus[] = [
  'pending_payment',
  'confirmed',
  'printing',
  'framing',
  'dispatched',
  'out_for_delivery',
  'installation_scheduled',
  'completed',
];

function nextStatuses(from: OrderStatus): OrderStatus[] {
  const index = SEQUENCE.indexOf(from);
  const forward = index === -1 ? [] : SEQUENCE.slice(index + 1);
  return from === 'completed' ? [] : [...forward, 'cancelled' as OrderStatus];
}

export default function ConsoleOrderDetailPage() {
  const { orderId = '' } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = (ROLE_MODULES[user?.role ?? ''] ?? []).includes('orders');

  const [status, setStatus] = React.useState<string>('');
  const [note, setNote] = React.useState('');
  const [scheduledFor, setScheduledFor] = React.useState('');
  const [installWindow, setInstallWindow] = React.useState('');
  const [technician, setTechnician] = React.useState('');

  // Cost tracking — initialized to 0, synced when order loads
  const [frameCost, setFrameCost] = React.useState(0);
  const [printingCost, setPrintingCost] = React.useState(0);
  const [logisticsCost, setLogisticsCost] = React.useState(0);
  const [miscCost, setMiscCost] = React.useState(0);

  const { data: order, isLoading } = useQuery({
    queryKey: qk.order(orderId),
    queryFn: () => adminService.order(orderId),
    enabled: Boolean(orderId),
  });

  // Sync cost state when order loads
  React.useEffect(() => {
    if (order?.cost) {
      setFrameCost(order.cost.frame);
      setPrintingCost(order.cost.printing);
      setLogisticsCost(order.cost.logistics);
      setMiscCost(order.cost.misc);
    }
  }, [order?.cost]);

  const { data: space } = useQuery({
    queryKey: qk.space(order?.spaceId ?? ''),
    queryFn: () => spaceService.get(order!.spaceId),
    enabled: Boolean(order?.spaceId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
  };

  const advance = useMutation({
    mutationFn: () => adminService.updateOrderStatus(orderId, status, note || undefined),
    onSuccess: () => {
      invalidate();
      setStatus('');
      setNote('');
      toast.success('Status updated - the space owner has been notified');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const schedule = useMutation({
    mutationFn: () =>
      adminService.scheduleInstallation(orderId, {
        scheduledFor,
        installationWindow: installWindow || undefined,
        technician: technician || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setScheduledFor('');
      setInstallWindow('');
      setTechnician('');
      toast.success('Installation scheduled - owner and artists notified');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updateCost = useMutation({
    mutationFn: () =>
      adminService.updateOrderCost(orderId, { frame: frameCost, printing: printingCost, logistics: logisticsCost, misc: miscCost }),
    onSuccess: () => {
      invalidate();
      toast.success('Costs updated - margin recalculated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  if (!order) {
    return (
      <EmptyState
        icon={<PackageX />}
        title="We couldn't find that order."
        action={
          <Button asChild>
            <Link to="/console/orders">All orders</Link>
          </Button>
        }
      />
    );
  }

  const options = nextStatuses(order.status).map((entry) => ({
    value: entry,
    label: ORDER_STATUS_LABELS[entry],
  }));

  return (
    <div>
      <Link
        to="/console/orders"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> All orders
      </Link>

      <PageHeader
        eyebrow={`Placed ${formatDate(order.placedAt, 'long')}`}
        title={order.reference}
        description={space ? `${space.name} · ${space.city}` : undefined}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={ORDER_BADGE[order.status] ?? 'neutral'}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            <span className="font-display text-xl text-ink">
              {formatCurrency(order.pricing.total)}
            </span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>For production</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line-soft">
                {order.items.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3 first:pt-0">
                    <Photo
                      src={item.artworkImageUrl}
                      alt={item.artworkTitle}
                      className="size-16 shrink-0 rounded-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{item.artworkTitle}</p>
                      <p className="truncate text-xs text-muted">by {item.artistName}</p>
                      <p className="mt-1 text-xs text-subtle">{describeFrame(item.frame)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm text-ink">× {item.quantity}</p>
                      <p className="text-xs text-subtle">{formatCurrency(item.lineTotal)}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-line pt-3">
                <DataRow label="Subtotal" value={formatCurrency(order.pricing.subtotal)} />
                {order.pricing.discount > 0 && (
                  <DataRow label="Discount" value={`− ${formatCurrency(order.pricing.discount)}`} />
                )}
                <DataRow label="Delivery" value={formatCurrency(order.pricing.delivery)} />
                <DataRow label="Installation" value={formatCurrency(order.pricing.installation)} />
                <DataRow
                  label={`GST @ ${PRICING.GST_RATE * 100}%`}
                  value={formatCurrency(order.pricing.gst)}
                />
                <DataRow label="Total" value={formatCurrency(order.pricing.total)} emphasis />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Cost & margin</CardTitle>
              <Badge variant={order.cost ? 'success' : 'neutral'}>
                {order.cost ? 'Recorded' : 'Not set'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Frame (₹)" htmlFor="frameCost">
                  <Input
                    id="frameCost"
                    type="number"
                    min="0"
                    step="1"
                    value={frameCost}
                    onChange={(e) => setFrameCost(Number(e.target.value) || 0)}
                    className="w-full"
                  />
                </Field>
                <Field label="Printing (₹)" htmlFor="printingCost">
                  <Input
                    id="printingCost"
                    type="number"
                    min="0"
                    step="1"
                    value={printingCost}
                    onChange={(e) => setPrintingCost(Number(e.target.value) || 0)}
                    className="w-full"
                  />
                </Field>
                <Field label="Logistics (₹)" htmlFor="logisticsCost">
                  <Input
                    id="logisticsCost"
                    type="number"
                    min="0"
                    step="1"
                    value={logisticsCost}
                    onChange={(e) => setLogisticsCost(Number(e.target.value) || 0)}
                    className="w-full"
                  />
                </Field>
                <Field label="Misc (₹)" htmlFor="miscCost">
                  <Input
                    id="miscCost"
                    type="number"
                    min="0"
                    step="1"
                    value={miscCost}
                    onChange={(e) => setMiscCost(Number(e.target.value) || 0)}
                    className="w-full"
                  />
                </Field>
              </div>

              <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <DataRow label="Total cost" value={formatCurrency(frameCost + printingCost + logisticsCost + miscCost)} />
                  <DataRow label="Revenue" value={formatCurrency(order.pricing.total)} />
                  <DataRow
                    label="Margin"
                    value={
                      formatCurrency(
                        order.pricing.total - (frameCost + printingCost + logisticsCost + miscCost),
                      )
                    }
                    emphasis
                  />
                </div>
                <div className="pt-2 border-t border-line-soft">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">Margin %</span>
                    <span className="font-display text-xl text-ink">
                      {((order.pricing.total - (frameCost + printingCost + logisticsCost + miscCost)) /
                        (order.pricing.total || 1)) *
                        100}
                      {' '}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                    <div
                      className="h-full rounded-full bg-bronze transition-all duration-300"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            ((order.pricing.total - (frameCost + printingCost + logisticsCost + miscCost)) /
                              (order.pricing.total || 1)) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="w-full sm:w-auto"
                  loading={updateCost.isPending}
                  onClick={() => updateCost.mutate()}
                  disabled={!canManage}
                >
                  Save costs
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFrameCost(0);
                    setPrintingCost(0);
                    setLogisticsCost(0);
                    setMiscCost(0);
                  }}
                  disabled={!canManage}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {[...order.timeline].reverse().map((entry, index) => (
                  <li key={`${entry.status}-${index}`} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-bronze" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {ORDER_STATUS_LABELS[entry.status] ?? entry.status}
                      </p>
                      <p className="text-xs text-subtle">
                        {formatDateTime(entry.at)}
                        {entry.by ? ` · ${entry.by}` : ''}
                      </p>
                      {entry.note && <p className="mt-0.5 text-xs text-muted">{entry.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {space && (
            <Card>
              <CardHeader>
                <CardTitle>Space &amp; contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium text-ink">{space.name}</p>
                <p className="text-muted">
                  {space.addressLine1}
                  {space.addressLine2 ? `, ${space.addressLine2}` : ''}
                  <br />
                  {space.city} {space.pin}
                </p>
                <p className="pt-2 text-muted">
                  {space.contactName}
                  <br />
                  <a href={`tel:${space.contactPhone}`} className="hover:text-bronze">
                    {space.contactPhone}
                  </a>
                  <br />
                  <a href={`mailto:${space.contactEmail}`} className="hover:text-bronze">
                    {space.contactEmail}
                  </a>
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Advance status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {options.length === 0 ? (
                <p className="text-sm text-subtle">This order is complete - nothing left to move.</p>
              ) : (
                <>
                  <SimpleSelect
                    value={status}
                    onValueChange={setStatus}
                    options={options}
                    placeholder="Move to…"
                    disabled={!canManage}
                  />
                  <Textarea
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional note for the space owner"
                    disabled={!canManage}
                  />
                  <Button
                    className="w-full"
                    disabled={!status || !canManage}
                    loading={advance.isPending}
                    onClick={() => advance.mutate()}
                  >
                    Update status
                  </Button>
                  <p className="text-xs text-subtle">
                    The space owner is notified in-product, and by email at installation and
                    completion.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule installation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Date" htmlFor="scheduledFor">
                <Input
                  id="scheduledFor"
                  type="date"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Time window" htmlFor="window">
                <Input
                  id="window"
                  value={installWindow}
                  onChange={(event) => setInstallWindow(event.target.value)}
                  placeholder="10:00 AM - 12:00 PM"
                  disabled={!canManage}
                />
              </Field>
              <Field label="Technician" htmlFor="technician">
                <Input
                  id="technician"
                  value={technician}
                  onChange={(event) => setTechnician(event.target.value)}
                  placeholder="Who's fitting it"
                  disabled={!canManage}
                />
              </Field>
              <Button
                className="w-full"
                variant="outline"
                disabled={!scheduledFor || !canManage}
                loading={schedule.isPending}
                onClick={() => schedule.mutate()}
              >
                <CalendarPlus /> Schedule
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
