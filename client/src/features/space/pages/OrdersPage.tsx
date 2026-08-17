import { formatCurrency, formatDate, ORDER_STATUS_LABELS } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Rows, Status } from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { FilterChips } from '@/components/ui/tabs';
import { ORDER_TONE } from '@/features/space/pages/SpaceDashboardPage';
import { qk } from '@/lib/query';
import { orderService } from '@/services/space.service';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending_payment', label: 'Awaiting payment' },
  { value: 'printing', label: 'In production' },
  { value: 'installation_scheduled', label: 'Installation' },
  { value: 'completed', label: 'Completed' },
];

export default function OrdersPage() {
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.orders({ status, page }),
    queryFn: () => orderService.list({ status: status === 'all' ? undefined : status, page }),
  });

  return (
    <div>
      <PanelHeader
        icon={ShoppingBag}
        title="Orders"
        description="Track and manage your orders."
      />

      <FilterChips
        options={FILTERS}
        value={status}
        onChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        className="mb-2"
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-px">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[4.5rem] w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <Rows>
            {data.items.map((order) => (
              <li key={order.id}>
                <Link
                  to={
                    order.status === 'pending_payment' && order.paymentId
                      ? `/space/payment/${order.paymentId}`
                      : `/space/orders/${order.id}`
                  }
                  className="group flex flex-wrap items-center gap-x-6 gap-y-3 py-4 transition-colors"
                >
                  <Photo
                    src={order.items[0]?.artworkImageUrl ?? ''}
                    alt=""
                    className="size-12 shrink-0 rounded-sm"
                    tone="bg-sand"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-ink">{order.reference}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {formatDate(order.placedAt)} · {order.pricing.quantity}{' '}
                      {order.pricing.quantity === 1 ? 'frame' : 'frames'}
                    </p>
                  </div>

                  <Status tone={ORDER_TONE[order.status] ?? 'neutral'} className="w-44 shrink-0">
                    {order.status === 'pending_payment'
                      ? 'Awaiting payment — finish it'
                      : ORDER_STATUS_LABELS[order.status]}
                  </Status>

                  <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink">
                    {formatCurrency(order.pricing.total)}
                  </span>

                  <ArrowRight className="size-4 shrink-0 text-subtle transition-all duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-1 group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </Rows>

          {data.totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                disabled={data.page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="font-mono text-xs text-subtle">
                {data.page} / {data.totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={data.page === data.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<ShoppingBag />}
          title="No orders here yet."
          description="Once you commission a collection it will appear here, with live tracking."
          action={
            <Button asChild>
              <Link to="/space/collections">Browse art</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
