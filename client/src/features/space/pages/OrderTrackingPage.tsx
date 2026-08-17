import {
  formatCurrency,
  formatDate,
  formatDateTime,
  ORDER_STATUS_LABELS,
  ORDER_TRACKING_STAGES,
  PRICING,
} from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, FileText, LifeBuoy, MapPin, PackageX } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Block, PanelHeader } from '@/components/layout/DashboardShell';
import { Status } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { DataRow } from '@/components/ui/stat';
import { describeFrame } from '@/features/space/pages/CartPage';
import { ORDER_TONE } from '@/features/space/pages/SpaceDashboardPage';
import { qk } from '@/lib/query';
import { invoiceService, orderService, spaceService } from '@/services/space.service';
import { cn } from '@/lib/utils';

export default function OrderTrackingPage() {
  const { orderId = '' } = useParams();

  const { data: order, isLoading } = useQuery({
    queryKey: qk.order(orderId),
    queryFn: () => orderService.get(orderId),
    enabled: Boolean(orderId),
  });

  const { data: space } = useQuery({
    queryKey: qk.space(order?.spaceId ?? ''),
    queryFn: () => spaceService.get(order!.spaceId),
    enabled: Boolean(order?.spaceId),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: qk.invoices,
    queryFn: () => invoiceService.list(),
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;

  if (!order) {
    return (
      <EmptyState
        icon={<PackageX />}
        title="We couldn't find that order."
        action={
          <Button asChild>
            <Link to="/space/orders">Your orders</Link>
          </Button>
        }
      />
    );
  }

  const invoice = invoices.find((entry) => entry.orderId === order.id);
  const reachedAt = new Map(order.timeline.map((entry) => [entry.status, entry.at]));
  const currentIndex = ORDER_TRACKING_STAGES.indexOf(order.status as never);
  const derailed = order.status === 'cancelled' || order.status === 'payment_failed';

  return (
    <div>
      <Link
        to="/space/orders"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> All orders
      </Link>

      <PanelHeader
        eyebrow={`Placed ${formatDate(order.placedAt, 'long')}`}
        title={order.reference}
        description={space ? `For ${space.name}, ${space.city}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Status tone={ORDER_TONE[order.status] ?? 'neutral'}>
              {ORDER_STATUS_LABELS[order.status]}
            </Status>
            <span className="font-display text-xl text-ink">
              {formatCurrency(order.pricing.total)}
            </span>
          </div>
        }
      />

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Block label="Progress">
          {derailed ? (
            <div className="flex items-start gap-3 border-l-2 border-danger bg-danger-soft py-4 pl-4 pr-4">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div>
                <p className="text-sm font-medium text-danger">
                  {order.status === 'cancelled' ? 'This order was cancelled.' : 'Payment failed.'}
                </p>
                <p className="mt-1 text-sm text-danger/80">
                  {order.timeline.at(-1)?.note ?? 'Nothing has been charged.'}
                </p>
                {order.status === 'payment_failed' && order.paymentId && (
                  <Button size="sm" asChild className="mt-3">
                    <Link to={`/space/payment/${order.paymentId}`}>Retry payment</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ol className="relative">
              {ORDER_TRACKING_STAGES.map((stage, index) => {
                const at = reachedAt.get(stage);
                const done = index < currentIndex || Boolean(at);
                const current = stage === order.status;

                return (
                  <li key={stage} className="relative flex gap-4 pb-6 last:pb-0">
                    {index < ORDER_TRACKING_STAGES.length - 1 && (
                      <span
                        className={cn(
                          'absolute left-[0.4375rem] top-4 h-full w-px',
                          done ? 'bg-ink' : 'bg-line',
                        )}
                        aria-hidden
                      />
                    )}

                    <span
                      className={cn(
                        'relative mt-1 size-3.5 shrink-0 rounded-full border-2',
                        current
                          ? 'border-bronze bg-bronze ring-4 ring-bronze/20'
                          : done
                            ? 'border-ink bg-ink'
                            : 'border-line bg-canvas',
                      )}
                      aria-hidden
                    />

                    <div className="-mt-0.5 min-w-0">
                      <p
                        className={cn(
                          'text-sm',
                          current ? 'font-medium text-ink' : done ? 'text-ink' : 'text-subtle',
                        )}
                      >
                        {ORDER_STATUS_LABELS[stage]}
                      </p>
                      {at && <p className="text-xs text-subtle">{formatDateTime(at)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Block>

        <div className="space-y-10">
          <Block
            label="What you ordered"
            aside={
              invoice ? (
                <button
                  type="button"
                  onClick={() => void invoiceService.download(invoice)}
                  className="inline-flex items-center gap-1.5 text-xs text-bronze underline-offset-4 hover:underline"
                >
                  <FileText className="size-3.5" /> Invoice {invoice.number}
                </button>
              ) : undefined
            }
          >
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
                    <p className="mt-1 truncate text-xs text-subtle">{describeFrame(item.frame)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-ink">{formatCurrency(item.lineTotal)}</p>
                    <p className="text-xs text-subtle">× {item.quantity}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-line pt-3">
              <DataRow label="Subtotal" value={formatCurrency(order.pricing.subtotal)} />
              {order.pricing.discount > 0 && (
                <DataRow label="Discount" value={`− ${formatCurrency(order.pricing.discount)}`} />
              )}
              <DataRow
                label="Delivery"
                value={order.pricing.delivery === 0 ? 'Free' : formatCurrency(order.pricing.delivery)}
              />
              <DataRow label="Installation" value={formatCurrency(order.pricing.installation)} />
              <DataRow
                label={`GST @ ${PRICING.GST_RATE * 100}%`}
                value={formatCurrency(order.pricing.gst)}
              />
              {order.pricing.securityDeposit > 0 && (
                <DataRow
                  label="Security deposit"
                  value={formatCurrency(order.pricing.securityDeposit)}
                />
              )}
              <DataRow label="Total" value={formatCurrency(order.pricing.total)} emphasis />
            </div>
          </Block>

          {space && (
            <Block label="Delivering to">
              <p className="flex items-start gap-2.5 text-sm text-muted">
                <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                <span>
                  <span className="block font-medium text-ink">{space.name}</span>
                  {space.addressLine1}
                  {space.addressLine2 ? `, ${space.addressLine2}` : ''}
                  <br />
                  {space.city} {space.pin}
                  <br />
                  {space.contactName} · {space.contactPhone}
                </span>
              </p>
            </Block>
          )}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            Something wrong with this order?
            <Link
              to="/space/support"
              state={{ subject: `Order ${order.reference}` }}
              className="inline-flex items-center gap-1.5 text-bronze underline-offset-4 hover:underline"
            >
              <LifeBuoy className="size-4" /> Talk to us
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
