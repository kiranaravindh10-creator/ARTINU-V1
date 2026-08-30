import { formatCurrency, formatDate, ORDER_STATUS_LABELS, ORDER_STATUSES } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Truck } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilterChips } from '@/components/ui/tabs';
import { CreateOrderDialog } from '@/features/console/components/CreateOrderDialog';
import { ORDER_BADGE } from '@/features/space/pages/SpaceDashboardPage';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

const FILTERS = [
  { value: 'all', label: 'All' },
  ...ORDER_STATUSES.map((status) => ({ value: status, label: ORDER_STATUS_LABELS[status] })),
];

export default function ConsoleOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [draft, setDraft] = React.useState(q);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => setDraft(q), [q]);

  const update = (changes: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.orders({ status, q, page }),
    queryFn: () => adminService.orders({ status, q: q || undefined, page }),
  });

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order across every space."
        actions={
          /* For the café owners who will never log in and just tell us what
             they want - see CreateOrderDialog. */
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Add order
          </Button>
        }
      />

      <CreateOrderDialog open={creating} onOpenChange={setCreating} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: draft });
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search by reference, space or city…"
            icon={<Search />}
            aria-label="Search orders"
          />
        </form>
      </div>

      <FilterChips
        options={FILTERS}
        value={status}
        onChange={(value) => update({ status: value })}
        className="mb-6"
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <>
          <Card>
            <CardContent className="p-0 sm:p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Space</TableHead>
                    <TableHead className="text-right">Frames</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Placed</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs text-ink">{order.reference}</TableCell>
                      <TableCell className="max-w-[14rem] truncate">
                        {(order as { spaceName?: string }).spaceName ?? '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.pricing.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-ink">
                        {formatCurrency(order.pricing.total)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ORDER_BADGE[order.status] ?? 'neutral'}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-subtle">
                        {formatDate(order.placedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/console/orders/${order.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page === 1}
                onClick={() => update({ page: data.page - 1 })}
              >
                Previous
              </Button>
              <span className="text-sm text-muted">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page === data.totalPages}
                onClick={() => update({ page: data.page + 1 })}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={<Truck />} title="No orders match that." />
      )}
    </div>
  );
}
