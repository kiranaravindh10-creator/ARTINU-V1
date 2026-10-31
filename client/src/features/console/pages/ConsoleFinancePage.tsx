import { formatAmount } from '@artinu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Landmark, Settings2 } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Block, PageHeader } from '@/components/layout/DashboardShell';
import { RankBars, TrendChart } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/display';
import { DateInput } from '@/components/ui/input';
import { StatGrid, StatTile } from '@/components/ui/stat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FinanceSettingsDialog } from '@/features/console/components/FinanceSettingsDialog';
import { MoneyNav } from '@/features/console/components/MoneyNav';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';
import { financeService, type FinanceDashboard } from '@/services/finance.service';

const monthLabel = (month: string, style: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('en-IN', { month: style, year: style === 'long' ? 'numeric' : '2-digit' }).format(
    new Date(`${month}-01T00:00:00`),
  );

/**
 * The money view, for the CEO and finance.
 *
 * Every figure is labelled with what it counts, because the two questions
 * people ask - "what came in" and "what did we spend" - each have two honest
 * answers. Cash figures count money when it actually moved: payments received
 * less refunds, expense payments less reversals. Approved costs count an
 * expense when it was incurred, paid or not. Neither is profit, and nothing on
 * this page calls it that: there is no accrual accounting, depreciation or tax
 * here, and a number labelled "profit" would be quoted as one.
 */
export default function ConsoleFinancePage() {
  const { can } = usePermissions();
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // "Open approval settings", from an expense nobody can approve, lands here.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusApprovals = searchParams.get('settings') === 'approvals';
  React.useEffect(() => {
    if (focusApprovals && can('finance.settings')) setSettingsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusApprovals]);
  const closeSettings = (open: boolean) => {
    setSettingsOpen(open);
    if (!open && focusApprovals) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('settings');
          return next;
        },
        { replace: true },
      );
    }
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.financeDashboard,
    queryFn: () => financeService.dashboard(),
  });

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Money in and money out, from the payments and expenses on record."
        actions={
          can('finance.settings') ? (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 /> Settings
            </Button>
          ) : undefined
        }
      />

      <MoneyNav />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      ) : (
        <Dashboard data={data} canExport={can('finance.export')} />
      )}

      {can('finance.settings') && (
        <FinanceSettingsDialog open={settingsOpen} onOpenChange={closeSettings} focusApprovals={focusApprovals} />
      )}
    </div>
  );
}

function Dashboard({ data, canExport }: { data: FinanceDashboard; canExport: boolean }) {
  const { revenue, expenses, collections, profitability } = data;
  const months = profitability.months;
  const thisMonth = monthLabel(data.month, 'long');

  // Both trends on one scale, so the smaller one is not drawn as big as the larger.
  const ceiling = Math.max(0, ...months.map((row) => Math.max(row.netCollected, row.expensesPaid)));
  const clipped = months.some((row) => row.netCollected < 0 || row.expensesPaid < 0);
  const trend = (pick: (row: (typeof months)[number]) => number) =>
    months.map((row) => ({ label: monthLabel(row.month), value: Math.max(0, pick(row)) }));

  const contribution = profitability.contribution;

  return (
    <div className="space-y-12">
      <section aria-label={`This month, ${thisMonth}`}>
        <p className="eyebrow eyebrow-muted mb-1">
          {thisMonth} · {data.scope.all ? 'All branches' : `${data.scope.branch} branch`}
        </p>
        <StatGrid columns={4}>
          <StatTile
            label="Net collected"
            value={formatAmount(revenue.netCollectedThisMonth)}
            hint="Payments received, less refunds"
            icon={Landmark}
          />
          <StatTile
            label="Expenses paid"
            value={formatAmount(expenses.paidThisMonth)}
            hint="Expense payments, less reversals"
          />
          <StatTile
            label="Cash surplus"
            value={formatAmount(profitability.surplusThisMonth)}
            hint="Net collected less expenses paid. Not profit."
          />
          <StatTile
            label="Approved costs"
            value={formatAmount(expenses.recognisedThisMonth)}
            hint="Incurred this month, paid or not"
          />
        </StatGrid>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Block label="Still to come in" hint="Owed by customers">
          <dl className="space-y-4">
            <Owed
              label="Waiting for the customer to pay"
              count={collections.awaitingPayment.count}
              amount={collections.awaitingPayment.amount}
              note={
                collections.awaitingVerification.count > 0
                  ? `Includes ${formatAmount(collections.awaitingVerification.amount)} customers say they have paid - check it on Payments.`
                  : undefined
              }
            />
            <Owed
              label="Owed on confirmed orders"
              count={collections.outstandingOnConfirmed.count}
              amount={collections.outstandingOnConfirmed.amount}
              note="Credit, collect-later and part-paid orders."
            />
            <Owed
              label="Payment failed"
              count={collections.failedPayments.count}
              amount={collections.failedPayments.amount}
              note="The customer can retry; nothing has been received."
            />
          </dl>
        </Block>

        <Block
          label="Still to pay"
          hint="Owed by ARTINU"
          aside={
            <Link to="/console/expenses" className="text-xs text-bronze hover:underline">
              Expenses
            </Link>
          }
        >
          <dl className="space-y-4">
            <Owed
              label="Approved, not yet paid"
              count={expenses.unpaidApproved.count}
              amount={expenses.unpaidApproved.amount}
              note="Includes the unpaid part of part-paid expenses."
            />
            <Owed
              label="Waiting for approval"
              count={expenses.pendingApproval.count}
              amount={expenses.pendingApproval.amount}
              note="Not a cost until someone approves it."
            />
          </dl>
        </Block>
      </div>

      <Block label="Last 12 months" hint="Cash basis: by the date money moved">
        <div className="grid gap-8 lg:grid-cols-2">
          <TrendChart data={trend((row) => row.netCollected)} format="currency" height={180} label="Net collected" ceiling={ceiling} />
          <TrendChart data={trend((row) => row.expensesPaid)} format="currency" height={180} label="Expenses paid" ceiling={ceiling} />
        </div>
        {clipped && (
          <p className="mt-3 text-xs text-subtle">A month below zero is drawn at zero. The table has the exact figures.</p>
        )}

        <div className="mt-8 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead className="text-right">Net collected</TableHead>
                <TableHead className="text-right">Expenses paid</TableHead>
                <TableHead className="text-right">Cash surplus</TableHead>
                <TableHead className="text-right">Approved costs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...months].reverse().map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="whitespace-nowrap text-ink">{monthLabel(row.month, 'long')}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(row.collected)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{formatAmount(row.refunded)}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink">{formatAmount(row.netCollected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(row.expensesPaid)}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', row.surplus < 0 ? 'text-danger' : 'text-ink')}>
                    {formatAmount(row.surplus)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{formatAmount(row.recognisedExpenses)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-subtle">
          Approved costs are by expense date and include expenses not paid yet, so they need not match expenses paid.
        </p>
      </Block>

      <div className="grid gap-10 lg:grid-cols-2">
        <Block label="Approved costs by category" hint="All time">
          <RankBars
            format="currency"
            data={expenses.byCategory.slice(0, 8).map((row) => ({ label: row.name, value: row.amount }))}
            emptyLabel="No approved expenses yet."
          />
        </Block>
        <Block label="Approved costs by branch" hint="All time">
          <RankBars
            format="currency"
            data={expenses.byBranch.map((row) => ({ label: row.name, value: row.amount }))}
            emptyLabel="No approved expenses yet."
          />
        </Block>
        <Block label="Net collected by city" hint="All time">
          <RankBars
            format="currency"
            data={revenue.byCity.slice(0, 8).map((row) => ({ label: row.name, value: Math.max(0, row.amount) }))}
            emptyLabel="Nothing collected yet."
          />
        </Block>
        <Block label="Top customers" hint="Net collected, all time">
          <RankBars
            format="currency"
            data={revenue.byCustomer.map((row) => ({ label: row.name, value: Math.max(0, row.amount) }))}
            emptyLabel="Nothing collected yet."
          />
        </Block>
      </div>

      <BranchTable rows={data.branches} all={data.scope.all} />

      <Block label="Order contribution" hint="Orders with costs recorded against them">
        {contribution.ordersWithCosts === 0 ? (
          <p className="max-w-2xl text-sm text-muted">
            No approved expense is linked to an order yet. Link frame, printing, delivery and installation costs to their order
            when recording them, and each order's contribution shows here and on the order.
          </p>
        ) : (
          <div className="max-w-2xl">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
              <Figure label="Value of those orders" value={formatAmount(contribution.orderValue)} />
              <Figure label="Costs recorded" value={formatAmount(contribution.recordedCosts)} />
              <Figure label="Contribution" value={formatAmount(contribution.contribution)} />
            </dl>
            <p className="mt-4 text-xs text-subtle">
              Across {contribution.ordersWithCosts} {contribution.ordersWithCosts === 1 ? 'order' : 'orders'}. Order value less
              the costs linked to it - only as complete as the costs recorded, and not the business's profit: rent, salaries and
              other overheads are not in it.
            </p>
          </div>
        )}
      </Block>

      {canExport && <Exports />}

      <p className="max-w-3xl border-t border-line pt-6 text-xs leading-relaxed text-subtle">
        These are management figures in Indian rupees, built from ARTINU's own payment and expense records. They are not GST
        returns, statutory accounts or audited statements - share the exports with your accountant for those.
      </p>
    </div>
  );
}

function Owed({ label, count, amount, note }: { label: string; count: number; amount: number; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-sm text-ink-soft">
          {label}
          <span className="ml-2 font-label text-[0.6875rem] tabular-nums text-subtle">{count}</span>
        </dt>
        <dd className="text-right font-display text-xl text-ink">{formatAmount(amount)}</dd>
      </div>
      {note && <p className="mt-0.5 text-xs text-subtle">{note}</p>}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-1.5 font-display text-2xl text-ink">{value}</dd>
    </div>
  );
}

/** Every report, for a chosen period, as CSV or Excel. One date row scopes them all. */
function Exports() {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const reports = useQuery({ queryKey: ['admin', 'finance', 'reports'], queryFn: () => financeService.reports() });
  const run = useMutation({
    mutationFn: ({ key, format }: { key: string; format: 'csv' | 'xlsx' }) =>
      financeService.exportReport(key, format, { from: from || undefined, to: to || undefined }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Block label="Exports" hint="Amounts in INR. Every export is recorded on the audit trail.">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-xs text-subtle">
          From
          <DateInput value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="w-44" />
        </label>
        <label className="grid gap-1.5 text-xs text-subtle">
          To
          <DateInput value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="w-44" />
        </label>
        <p className="pb-3 text-xs text-subtle">{from || to ? 'Only this period.' : 'Leave empty for all dates.'}</p>
      </div>

      {reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {(reports.data ?? []).map((report) => (
            <li key={report.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm text-ink-soft">{report.title}</span>
              <span className="flex gap-2">
                {(['xlsx', 'csv'] as const).map((format) => (
                  <Button
                    key={format}
                    size="sm"
                    variant="ghost"
                    loading={run.isPending && run.variables?.key === report.key && run.variables.format === format}
                    onClick={() => run.mutate({ key: report.key, format })}
                  >
                    <Download /> {format === 'xlsx' ? 'Excel' : 'CSV'}
                  </Button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

/**
 * Branch by branch, from the same rows as every figure above. The CEO and the
 * central functions see each branch beside the others; someone held to a
 * branch sees only their own row - the API decides which rows exist.
 */
function BranchTable({ rows, all }: { rows: FinanceDashboard['branches']; all: boolean }) {
  return (
    <Block
      label={all ? 'Branch by branch' : 'Your branch'}
      hint="All time. Orders and collections by the order's branch, costs by the expense's."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Branch</TableHead>
            <TableHead className="text-right">Orders</TableHead>
            <TableHead className="text-right">Net collected</TableHead>
            <TableHead className="text-right">Balance due</TableHead>
            <TableHead className="text-right">Approved costs</TableHead>
            <TableHead className="text-right">Costs paid</TableHead>
            <TableHead className="text-right">Cash surplus</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.branch}>
              <TableCell className="font-medium text-ink">{row.branch}</TableCell>
              <TableCell className="text-right tabular-nums">{row.orders}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(row.netCollected)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(row.balanceDue)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(row.expensesRecognised)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(row.expensesPaid)}</TableCell>
              <TableCell className={cn('text-right tabular-nums', row.surplus < 0 && 'text-danger')}>
                {formatAmount(row.surplus)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Block>
  );
}
