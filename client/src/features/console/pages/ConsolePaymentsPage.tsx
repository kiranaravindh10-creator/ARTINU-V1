import { formatCurrency, formatDateTime, PAYMENT_STATUSES, type Payment } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import * as React from 'react';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
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
  const [rejecting, setRejecting] = React.useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const queryClient = useQueryClient();

  const refreshPayments = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
  };

  const verify = useMutation({
    mutationFn: (id: string) => adminService.verifyPayment(id),
    onSuccess: () => {
      toast.success('Payment verified. The invoice is on its way to the customer.');
      refreshPayments();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminService.rejectPayment(id, reason),
    onSuccess: () => {
      toast.success('Marked as not received. The customer has been told why.');
      setRejecting(null);
      setRejectReason('');
      refreshPayments();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
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
          { to: '/console/accounts', label: 'Accounts' },
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
                      {payment.orderReference ?? '-'}
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
                      {/*
                        A payment sitting at "verifying" is a customer who says
                        they have paid and an order that cannot go to print
                        until somebody looks. These two buttons are the whole
                        of that decision, so they are on the row rather than
                        behind Open - the person doing this has a bank tab in
                        one hand and is working down the list.
                      */}
                      {payment.status === 'verifying' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            loading={verify.isPending && verify.variables === payment.id}
                            onClick={() => verify.mutate(payment.id)}
                          >
                            Money received
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRejecting(payment)}
                          >
                            Not received
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setSelected(payment)}>
                          Open
                        </Button>
                      )}
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

      {/*
        Saying no needs a reason.

        The customer believes they have paid. Rejecting without telling them
        why leaves them with a dead order and no idea whether to pay again, so
        the reason is required here and is sent to them verbatim.
      */}
      <Sheet open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <SheetContent side="right" className="max-w-md">
          {rejecting && (
            <div>
              <h2 className="font-display text-2xl text-ink">Payment not received?</h2>
              <p className="prose-quiet mt-2 text-sm">
                {formatCurrency(rejecting.amount)} claimed against reference{' '}
                <span className="font-mono text-ink">{rejecting.reference}</span>. Only do this
                after checking the account.
              </p>

              <label
                htmlFor="reject-reason"
                className="mt-6 block font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle"
              >
                What should we tell the customer?
              </label>
              <Input
                id="reject-reason"
                className="mt-2"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="No transfer found against this reference"
              />

              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejecting(null);
                    setRejectReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  loading={reject.isPending}
                  disabled={rejectReason.trim().length < 5}
                  onClick={() => reject.mutate({ id: rejecting.id, reason: rejectReason.trim() })}
                >
                  Mark as not received
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
                <Row label="Order">{selected.orderReference ?? '-'}</Row>
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
