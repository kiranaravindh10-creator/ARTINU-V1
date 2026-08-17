import { formatCurrency, formatDate, PRICING, type Payout } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Download, Info, Receipt, TrendingUp } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { adminService } from '@/services/admin.service';

type AdminPayout = Payout & { artistName?: string; orderReference?: string };

/** Builds a CSV in the browser — no server round trip for a table we already have. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ConsoleAccountsPage() {
  const queryClient = useQueryClient();
  const [paying, setPaying] = React.useState<AdminPayout | null>(null);

  const { data: analytics } = useQuery({
    queryKey: qk.analytics('console'),
    queryFn: () => adminService.analytics(),
  });

  const { data: reports } = useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: () => adminService.reports(),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.payments({ scope: 'payouts' }),
    queryFn: () => adminService.payouts({ pageSize: 100 }),
  });

  const pay = useMutation({
    mutationFn: (id: string) => adminService.payPayout(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      setPaying(null);
      toast.success('Marked as paid — the artist has been notified');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const payouts = (data?.items ?? []) as AdminPayout[];
  const paid = payouts.filter((payout) => payout.status === 'paid');
  const pending = payouts.filter((payout) => payout.status !== 'paid');
  const gstCollected = (reports?.gst ?? []).reduce((sum, entry) => sum + entry.collected, 0);

  return (
    <div>
      <PageHeader title="Accounts" description="Revenue in, GST held, and what we owe artists." />

      <SubNav
        items={[
          { to: '/console/payments', label: 'Payments in' },
          { to: '/console/accounts', label: 'Payouts out' },
        ]}
      />

      <StatGrid className="mb-8">
        <StatTile
          label="Revenue"
          value={analytics?.revenue ?? 0}
          format="currency-compact"
          icon={TrendingUp}
        />
        <StatTile label="GST collected" value={gstCollected} format="currency" icon={Receipt} />
        <StatTile
          label="Paid to artists"
          value={paid.reduce((sum, payout) => sum + payout.amount, 0)}
          format="currency"
          icon={Banknote}
        />
        <StatTile
          label="Pending payouts"
          value={pending.reduce((sum, payout) => sum + payout.amount, 0)}
          format="currency"
          hint={`${pending.length} awaiting`}
        />
      </StatGrid>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Artist payouts</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv('ARTINU-payouts.csv', [
                ['Artist', 'Order', 'Period', 'Amount', 'Status', 'Paid on'],
                ...payouts.map((payout) => [
                  payout.artistName ?? '',
                  payout.orderReference ?? '',
                  payout.periodLabel,
                  payout.amount,
                  payout.status,
                  payout.paidAt ? formatDate(payout.paidAt) : '',
                ]),
              ])
            }
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : payouts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artist</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="text-ink">{payout.artistName ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {payout.orderReference ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted">{payout.periodLabel}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink">
                      {formatCurrency(payout.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={payout.status === 'paid' ? 'success' : 'warning'}>
                        {payout.status === 'paid' ? 'Paid' : 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {payout.status !== 'paid' && (
                        <Button variant="ghost" size="sm" onClick={() => setPaying(payout)}>
                          Mark as paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={<Banknote />} title="No payouts recorded yet." />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>GST by month</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv('ARTINU-gst.csv', [
                ['Period', 'GST collected'],
                ...(reports?.gst ?? []).map((entry) => [entry.period, entry.collected]),
              ])
            }
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">GST collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reports?.gst ?? []).map((entry) => (
                <TableRow key={entry.period}>
                  <TableCell>{entry.period}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink">
                    {formatCurrency(entry.collected)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-3 rounded-lg border border-line bg-surface p-5">
        <Info className="size-4 shrink-0 text-bronze" aria-hidden />
        <div className="text-sm text-muted">
          <p className="font-medium text-ink">How the artist share is derived</p>
          <p className="mt-1 leading-relaxed">
            Each frame carries an artwork licence fee of{' '}
            {formatCurrency(PRICING.ARTWORK_LICENSE_FEE)}. The artist receives{' '}
            {PRICING.ARTIST_COMMISSION_RATE * 100}% of that per frame, recorded on the order line
            when the payment clears — so a payout can always be traced back to a specific order.
          </p>
        </div>
      </div>

      <Dialog open={Boolean(paying)} onOpenChange={(open) => !open && setPaying(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark this payout as paid?</DialogTitle>
            <DialogDescription>
              You&rsquo;re recording that {formatCurrency(paying?.amount ?? 0)} has been transferred
              to {paying?.artistName}. This notifies them and cannot be undone here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button loading={pay.isPending} onClick={() => pay.mutate(paying!.id)}>
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
