import { formatCurrency, formatDateTime, PAYMENT_STATUSES, type Payment } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import * as React from 'react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { StatGrid, StatTile } from '@/components/ui/stat';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilterChips } from '@/components/ui/tabs';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

type AdminPayment = Payment & { orderReference?: string };

const BADGE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  created: 'neutral',
  awaiting_payment: 'warning',
  verifying: 'info',
  succeeded: 'success',
  failed: 'danger',
  expired: 'neutral',
  refunded: 'info',
};

const FILTERS = [
  { value: 'all', label: 'All' },
  ...PAYMENT_STATUSES.map((status) => ({
    value: status,
    label: status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
  })),
];

export default function ConsolePaymentsPage() {
  const [status, setStatus] = React.useState('all');
  const [selected, setSelected] = React.useState<AdminPayment | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.payments({ status }),
    queryFn: () => adminService.payments({ status, pageSize: 100 }),
  });

  const payments = (data?.items ?? []) as AdminPayment[];
  const thisMonth = new Date().toISOString().slice(0, 7);

  const collected = payments
    .filter((payment) => payment.status === 'succeeded' && payment.createdAt.startsWith(thisMonth))
    .reduce((sum, payment) => sum + payment.amount, 0);

  const awaiting = payments.filter((payment) => payment.status === 'awaiting_payment');
  const failed = payments.filter((payment) => payment.status === 'failed');

  return (
    <div>
      <PageHeader title="Payments" description="Every charge, and what happened to it." />

      <SubNav
        items={[
          { to: '/console/payments', label: 'Payments in' },
          { to: '/console/accounts', label: 'Payouts out' },
        ]}
      />

      <StatGrid columns={3} className="mb-6">
        <StatTile label="Collected this month" value={collected} format="currency" icon={CreditCard} />
        <StatTile
          label="Awaiting payment"
          value={awaiting.length}
          hint={formatCurrency(awaiting.reduce((sum, payment) => sum + payment.amount, 0))}
        />
        <StatTile
          label="Failed"
          value={failed.length}
          hint="Customers can retry these themselves"
        />
      </StatGrid>

      <FilterChips options={FILTERS} value={status} onChange={setStatus} className="mb-6" />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : payments.length > 0 ? (
        <Card>
          <CardContent className="p-0 sm:p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs text-ink">{payment.reference}</TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {payment.orderReference ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted">
                      {payment.provider.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{payment.attempts}</TableCell>
                    <TableCell>
                      <Badge variant={BADGE[payment.status] ?? 'neutral'}>
                        {payment.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-subtle">
                      {formatDateTime(payment.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(payment)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={<CreditCard />} title="No payments match that filter." />
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="max-w-md">
          {selected && (
            <div>
              <h2 className="font-display text-2xl text-ink">{formatCurrency(selected.amount)}</h2>
              <p className="mt-1 font-mono text-xs text-subtle">{selected.reference}</p>

              <div className="mt-5">
                <Badge variant={BADGE[selected.status] ?? 'neutral'}>
                  {selected.status.replace(/_/g, ' ')}
                </Badge>
              </div>

              <dl className="mt-6 space-y-3 text-sm">
                <Row label="Order">{selected.orderReference ?? '—'}</Row>
                <Row label="Provider">{selected.provider.replace('_', ' ')}</Row>
                <Row label="Attempts">{selected.attempts}</Row>
                <Row label="Created">{formatDateTime(selected.createdAt)}</Row>
                <Row label="Updated">{formatDateTime(selected.updatedAt)}</Row>
                {selected.expiresAt && <Row label="Expires">{formatDateTime(selected.expiresAt)}</Row>}
                {selected.failureReason && (
                  <div>
                    <dt className="text-xs text-subtle">Failure reason</dt>
                    <dd className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                      {selected.failureReason}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="text-right text-ink-soft">{children}</dd>
    </div>
  );
}
