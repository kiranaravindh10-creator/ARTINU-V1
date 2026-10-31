import {
  formatAmount,
  formatDate,
  LEDGER_ENTRY_TYPE_LABELS,
  LEDGER_ENTRY_TYPES,
  sumRupees,
  type LedgerEntry,
} from '@artinu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Download, Search } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { DateInput, Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { SimpleSelect } from '@/components/ui/select';
import { StatGrid, StatTile } from '@/components/ui/stat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FilterChips } from '@/components/ui/tabs';
import { MoneyNav } from '@/features/console/components/MoneyNav';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { financeService } from '@/services/finance.service';

const DIRECTIONS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Money out' },
] as const;

const PAGE = 100;

/**
 * The transaction register: every rupee that moved, one line per movement.
 *
 * Nothing here is stored on its own - each line is derived from the payment or
 * expense payment it describes, so an amount lives in exactly one place and
 * the register cannot drift from the records. A refund is its own line beside
 * the payment it refunds, and a reversed expense payment shows as the payment
 * and then its reversal: corrections add lines, they never erase one.
 */
export default function ConsoleTransactionsPage() {
  const { can, hasModule } = usePermissions();
  const [direction, setDirection] = React.useState<(typeof DIRECTIONS)[number]['value']>('all');
  const [type, setType] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [shown, setShown] = React.useState(PAGE);
  const term = useDebounced(q.trim(), 300);

  const params = React.useMemo(() => {
    const entries: Record<string, string> = {};
    if (direction !== 'all') entries.direction = direction;
    if (type !== 'all') entries.type = type;
    if (term) entries.q = term;
    if (from) entries.from = from;
    if (to) entries.to = to;
    return entries;
  }, [direction, type, term, from, to]);

  React.useEffect(() => setShown(PAGE), [params]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.transactions(params),
    queryFn: () => financeService.transactions(params),
  });

  const exportReport = useMutation({
    mutationFn: (format: 'csv' | 'xlsx') =>
      financeService.exportReport('transactions', format, { from: from || undefined, to: to || undefined }),
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  const entries = data ?? [];
  const moneyIn = sumRupees(entries.filter((entry) => entry.direction === 'in').map((entry) => entry.amount));
  const moneyOut = sumRupees(entries.filter((entry) => entry.direction === 'out').map((entry) => entry.amount));
  const net = sumRupees([moneyIn, -moneyOut]);

  return (
    <div>
      <PageHeader
        title="Accounts & transactions"
        description="Every rupee in and out, each traced to the payment or expense it came from."
        actions={
          can('finance.export') ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" loading={exportReport.isPending}>
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{from || to ? 'For the dates chosen' : 'All dates'}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportReport.mutate('xlsx')}>Transaction register (Excel)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportReport.mutate('csv')}>Transaction register (CSV)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />

      <MoneyNav />

      <div className="mb-6 space-y-4">
        <FilterChips options={DIRECTIONS} value={direction} onChange={setDirection} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.5fr)_minmax(12rem,1fr)_repeat(2,minmax(9.5rem,1fr))]">
          <Input
            aria-label="Search transactions"
            icon={<Search />}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Description, reference, customer, order"
          />
          <SimpleSelect
            value={type}
            onValueChange={setType}
            options={[
              { value: 'all', label: 'Every kind' },
              ...LEDGER_ENTRY_TYPES.map((value) => ({ value, label: LEDGER_ENTRY_TYPE_LABELS[value] })),
            ]}
          />
          <DateInput aria-label="From date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          <DateInput aria-label="To date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </div>
      </div>

      <StatGrid columns={3} className="mb-8">
        <StatTile label="Money in" value={formatAmount(moneyIn)} hint="Collections, and expense payments reversed" icon={ArrowDownLeft} />
        <StatTile label="Money out" value={formatAmount(moneyOut)} hint="Refunds and expense payments" icon={ArrowUpRight} />
        <StatTile label="Net movement" value={formatAmount(net)} hint={`Across the ${entries.length} lines shown by these filters`} />
      </StatGrid>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : entries.length > 0 ? (
        <>
          <Card>
            <CardContent className="p-0 sm:p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Confirmed by</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.slice(0, shown).map((entry) => (
                    <Line key={entry.id} entry={entry} linkOrders={hasModule('orders') || hasModule('finance')} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {entries.length > shown && (
            <div className="mt-4 flex items-center gap-4">
              <Button variant="outline" onClick={() => setShown((count) => count + PAGE)}>
                Show more
              </Button>
              <p className="text-xs text-subtle">
                Showing {shown} of {entries.length}. The totals above count all of them.
              </p>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Search />}
          title={Object.keys(params).length > 0 ? 'Nothing matches these filters.' : 'No money has moved yet.'}
          description="Customer payments, refunds and expense payments appear here as they are recorded."
        />
      )}
    </div>
  );
}

function Line({ entry, linkOrders }: { entry: LedgerEntry; linkOrders: boolean }) {
  const order =
    entry.orderReference && entry.source.orderId && linkOrders ? (
      <Link to={`/console/orders/${entry.source.orderId}`} className="text-bronze hover:underline">
        {entry.orderReference}
      </Link>
    ) : (
      entry.orderReference
    );
  const struck = entry.status === 'reversed';

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted">{formatDate(`${entry.date}T00:00:00`)}</TableCell>
      <TableCell>
        <p className={struck ? 'max-w-[24rem] truncate text-subtle line-through' : 'max-w-[24rem] truncate text-ink'}>
          {entry.description}
        </p>
        <p className="max-w-[24rem] truncate text-xs text-muted">
          {[entry.counterparty, entry.reference].filter(Boolean).join(' · ')}
          {order && (
            <>
              {entry.counterparty || entry.reference ? ' · ' : ''}
              {order}
            </>
          )}
        </p>
      </TableCell>
      <TableCell className="text-xs text-muted">{LEDGER_ENTRY_TYPE_LABELS[entry.type]}</TableCell>
      <TableCell className="text-xs capitalize text-muted">{entry.method?.replace(/_/g, ' ') ?? '-'}</TableCell>
      <TableCell>
        {/* Gateway-confirmed and staff-recorded money are never presented as the same thing. */}
        <Badge variant={entry.verification === 'gateway' ? 'success' : 'outline'}>
          {entry.verification === 'gateway' ? 'Payment gateway' : 'Staff record'}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums text-ink">
        {entry.direction === 'in' ? formatAmount(entry.amount) : ''}
      </TableCell>
      <TableCell className="text-right tabular-nums text-ink">
        {entry.direction === 'out' ? formatAmount(entry.amount) : ''}
      </TableCell>
    </TableRow>
  );
}
