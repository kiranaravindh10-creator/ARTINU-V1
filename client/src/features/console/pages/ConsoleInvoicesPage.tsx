import { formatAmount, formatDate, type OrderPaymentState } from '@artinu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileText, Search } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { DateInput, Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyNav } from '@/features/console/components/MoneyNav';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { financeService, type InvoiceRow } from '@/services/finance.service';
import { invoiceService } from '@/services/space.service';

const STATE: Record<OrderPaymentState, { label: string; variant: NonNullable<BadgeProps['variant']> }> = {
  unpaid: { label: 'Unpaid', variant: 'warning' },
  partially_paid: { label: 'Part-paid', variant: 'bronze' },
  paid: { label: 'Paid', variant: 'success' },
  refunded: { label: 'Refunded', variant: 'info' },
};

/**
 * Every invoice issued, beside what has actually been paid against its order -
 * an invoice on a credit order is issued before the money arrives, so the two
 * are shown together rather than one standing in for the other.
 */
export default function ConsoleInvoicesPage() {
  const { hasModule } = usePermissions();
  const [q, setQ] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const term = useDebounced(q.trim(), 300);

  const params = React.useMemo(() => {
    const entries: Record<string, string> = {};
    if (term) entries.q = term;
    if (from) entries.from = from;
    if (to) entries.to = to;
    return entries;
  }, [term, from, to]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.invoices(params),
    queryFn: () => financeService.invoices(params),
  });

  const download = useMutation({
    mutationFn: (invoice: InvoiceRow) => invoiceService.download(invoice),
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  const invoices = data ?? [];

  return (
    <div>
      <PageHeader title="Invoices" description="Every invoice issued, with what has been paid against its order." />

      <MoneyNav />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(2,minmax(9.5rem,1fr))]">
        <Input
          aria-label="Search invoices"
          icon={<Search />}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Invoice number, order or customer"
        />
        <DateInput aria-label="Issued from" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        <DateInput aria-label="Issued to" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : invoices.length > 0 ? (
        <Card>
          <CardContent className="p-0 sm:p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const state = invoice.money ? STATE[invoice.money.state] : null;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs text-ink">{invoice.number}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted">{formatDate(invoice.issuedAt)}</TableCell>
                      <TableCell className="max-w-[14rem] truncate text-ink-soft">{invoice.customer ?? '-'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {invoice.orderReference && (hasModule('orders') || hasModule('finance')) ? (
                          <Link to={`/console/orders/${invoice.orderId}`} className="text-bronze hover:underline">
                            {invoice.orderReference}
                          </Link>
                        ) : (
                          (invoice.orderReference ?? '-')
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-ink">{formatAmount(invoice.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {invoice.money ? formatAmount(invoice.money.paid) : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {invoice.money ? formatAmount(invoice.money.outstanding) : '-'}
                      </TableCell>
                      <TableCell>{state ? <Badge variant={state.variant}>{state.label}</Badge> : '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={download.isPending && download.variables?.id === invoice.id}
                          onClick={() => download.mutate(invoice)}
                        >
                          <Download /> Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<FileText />}
          title={Object.keys(params).length > 0 ? 'No invoices match.' : 'No invoices issued yet.'}
          description="An invoice is issued when an order is confirmed - on payment, or straight away for a credit order."
        />
      )}
    </div>
  );
}
