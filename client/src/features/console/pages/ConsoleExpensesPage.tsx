import {
  EXPENSE_STATUS_LABELS,
  formatAmount,
  formatDate,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  RECOGNISED_EXPENSE_STATUSES,
  sumRupees,
  type ExpenseView,
} from '@artinu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Plus, ReceiptIndianRupee, Search, Tags } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckboxRow } from '@/components/ui/checkbox';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { DateInput, Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { SimpleSelect } from '@/components/ui/select';
import { StatGrid, StatTile } from '@/components/ui/stat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FilterChips } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { ExpenseCategoriesDialog } from '@/features/console/components/ExpenseCategoriesDialog';
import { EXPENSE_BADGE, ExpenseDetailSheet } from '@/features/console/components/ExpenseDetailSheet';
import { ExpenseFormDialog } from '@/features/console/components/ExpenseFormDialog';
import { MoneyNav } from '@/features/console/components/MoneyNav';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { financeService } from '@/services/finance.service';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending_approval', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved, unpaid' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'draft', label: 'Drafts' },
  { value: 'rejected', label: 'Returned' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

const thisMonth = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 7);
};

/**
 * Money going out.
 *
 * Anyone who records expenses sees the ones they recorded - and, for the
 * roles that run orders, the costs put against an order. Finance, approvers
 * and the CEO see all of them. The server decides that; this page shows
 * whatever comes back.
 */
export default function ConsoleExpensesPage() {
  const { user } = useAuth();
  const { can, hasModule } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [q, setQ] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('all');
  const [branch, setBranch] = React.useState('all');
  const [method, setMethod] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [mine, setMine] = React.useState(false);
  const term = useDebounced(q.trim(), 300);

  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseView | null>(null);
  const [managingCategories, setManagingCategories] = React.useState(false);

  // The open expense lives in the URL, so a link can point straight at one.
  const openId = searchParams.get('expense');
  const setOpenId = (id: string | null) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('expense', id);
        else next.delete('expense');
        return next;
      },
      { replace: true },
    );

  // Only the filters actually set, so the unfiltered list and the summary share one request.
  const params = React.useMemo(() => {
    const entries: Record<string, string | boolean> = {};
    if (status !== 'all') entries.status = status;
    if (term) entries.q = term;
    if (categoryId !== 'all') entries.categoryId = categoryId;
    if (branch !== 'all') entries.branch = branch;
    if (method !== 'all') entries.paymentMethod = method;
    if (from) entries.from = from;
    if (to) entries.to = to;
    if (mine) entries.mine = true;
    return entries;
  }, [status, term, categoryId, branch, method, from, to, mine]);
  const filtered = Object.keys(params).length > 0;

  const list = useQuery({
    queryKey: qk.admin.expenses(params),
    queryFn: () => financeService.expenses(params),
  });
  const everything = useQuery({
    queryKey: qk.admin.expenses({}),
    queryFn: () => financeService.expenses(),
  });
  const categories = useQuery({
    queryKey: qk.admin.expenseCategories(true),
    queryFn: () => financeService.categories(true),
  });
  const settings = useQuery({
    queryKey: qk.admin.financeSettings,
    queryFn: () => financeService.settings(),
  });

  const exportReport = useMutation({
    mutationFn: ({ report, format }: { report: string; format: 'csv' | 'xlsx' }) =>
      financeService.exportReport(report, format, { from: from || undefined, to: to || undefined }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const summary = React.useMemo(() => {
    const all = everything.data ?? [];
    const month = thisMonth();
    const pending = all.filter((expense) => expense.status === 'pending_approval');
    const unpaid = all.filter((expense) => expense.status === 'approved' || expense.status === 'partially_paid');
    const recognisedThisMonth = all.filter(
      (expense) =>
        RECOGNISED_EXPENSE_STATUSES.includes(expense.status) && String(expense.expenseDate).startsWith(month),
    );
    const needsMe = all.filter(
      (expense) => expense.createdBy === user?.id && (expense.status === 'draft' || expense.status === 'rejected'),
    );
    return {
      pending: { count: pending.length, amount: sumRupees(pending.map((expense) => expense.amount)) },
      unpaid: { count: unpaid.length, amount: sumRupees(unpaid.map((expense) => expense.outstandingAmount)) },
      recognisedThisMonth: sumRupees(recognisedThisMonth.map((expense) => expense.amount)),
      needsMe: needsMe.length,
    };
  }, [everything.data, user?.id]);

  const expenses = list.data ?? [];
  const branches = settings.data?.branches ?? [];
  const canExport = can('finance.export') && hasModule('finance');
  const seesAll = can('expenses.view_all') || can('finance.view');

  const clearFilters = () => {
    setStatus('all');
    setQ('');
    setCategoryId('all');
    setBranch('all');
    setMethod('all');
    setFrom('');
    setTo('');
    setMine(false);
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Money going out: what it was for, who approved it, and what has actually been paid."
        actions={
          <>
            {can('expenses.manage_categories') && (
              <Button variant="ghost" onClick={() => setManagingCategories(true)}>
                <Tags /> Categories
              </Button>
            )}
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" loading={exportReport.isPending}>
                    <Download /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{from || to ? 'For the dates chosen' : 'All dates'}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => exportReport.mutate({ report: 'expense-register', format: 'xlsx' })}>
                    Expense register (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportReport.mutate({ report: 'expense-register', format: 'csv' })}>
                    Expense register (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => exportReport.mutate({ report: 'expense-categories', format: 'xlsx' })}>
                    By category (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportReport.mutate({ report: 'branches', format: 'xlsx' })}>
                    By branch (Excel)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {can('expenses.create') && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Add expense
              </Button>
            )}
          </>
        }
      />

      <MoneyNav />

      <StatGrid columns={4} className="mb-8">
        <StatTile
          label="Waiting for approval"
          value={summary.pending.count}
          hint={formatAmount(summary.pending.amount)}
          icon={ReceiptIndianRupee}
        />
        <StatTile
          label="Approved, not yet paid"
          value={formatAmount(summary.unpaid.amount)}
          hint={`${summary.unpaid.count} ${summary.unpaid.count === 1 ? 'expense' : 'expenses'} to pay`}
        />
        <StatTile
          label="Approved costs this month"
          value={formatAmount(summary.recognisedThisMonth)}
          hint="By expense date, paid or not"
        />
        <StatTile label="Your drafts and returns" value={summary.needsMe} hint="Waiting on you" />
      </StatGrid>

      <div className="mb-6 space-y-4">
        <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.4fr)_repeat(3,minmax(9rem,1fr))_repeat(2,minmax(9.5rem,1fr))]">
          <Input
            aria-label="Search expenses"
            icon={<Search />}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Number, title, vendor, reference"
          />
          <SimpleSelect
            value={categoryId}
            onValueChange={setCategoryId}
            options={[
              { value: 'all', label: 'All categories' },
              ...(categories.data ?? []).map((category) => ({
                value: category.id,
                label: category.active ? category.name : `${category.name} (retired)`,
              })),
            ]}
          />
          <SimpleSelect
            value={branch}
            onValueChange={setBranch}
            options={[{ value: 'all', label: 'All branches' }, ...branches.map((name) => ({ value: name, label: name }))]}
          />
          <SimpleSelect
            value={method}
            onValueChange={setMethod}
            options={[
              { value: 'all', label: 'Any method' },
              ...PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] })),
            ]}
          />
          <DateInput aria-label="From date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          <DateInput aria-label="To date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {seesAll && <CheckboxRow checked={mine} onCheckedChange={setMine} label="Only expenses I recorded" />}
          {filtered && (
            <button type="button" onClick={clearFilters} className="text-sm text-bronze hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : expenses.length > 0 ? (
        <Card>
          <CardContent className="p-0 sm:p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Still to pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recorded by</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id} className="cursor-pointer" onClick={() => setOpenId(expense.id)}>
                    <TableCell>
                      <p className="font-mono text-[0.6875rem] text-subtle">{expense.number}</p>
                      <p className="max-w-[22rem] truncate text-ink">{expense.title}</p>
                      {(expense.vendor || expense.orderReference) && (
                        <p className="max-w-[22rem] truncate text-xs text-muted">
                          {[expense.vendor, expense.orderReference].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted">
                      {formatDate(`${String(expense.expenseDate).slice(0, 10)}T00:00:00`)}
                    </TableCell>
                    <TableCell className="text-xs text-muted">{expense.categoryName}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink">{formatAmount(expense.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted">
                      {expense.status === 'approved' || expense.status === 'partially_paid'
                        ? formatAmount(expense.outstandingAmount)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={EXPENSE_BADGE[expense.status]}>{EXPENSE_STATUS_LABELS[expense.status]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs text-subtle">
                      {expense.createdBy === user?.id ? 'You' : (expense.createdByEmail ?? '-')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenId(expense.id);
                        }}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : filtered ? (
        <EmptyState
          icon={<Search />}
          title="No expenses match these filters."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<ReceiptIndianRupee />}
          title="No expenses recorded yet."
          description="Fuel for an installation, a printing run, a month's hosting - record it here and it goes for approval."
          action={
            can('expenses.create') ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Add expense
              </Button>
            ) : undefined
          }
        />
      )}

      <ExpenseFormDialog
        open={creating || Boolean(editing)}
        onOpenChange={(open) => {
          if (open) return;
          setCreating(false);
          setEditing(null);
        }}
        expense={editing}
        onSaved={(saved) => setOpenId(saved.id)}
      />

      <ExpenseDetailSheet
        expenseId={openId}
        onClose={() => setOpenId(null)}
        onEdit={(expense) => {
          setOpenId(null);
          setEditing(expense);
        }}
      />

      {can('expenses.manage_categories') && (
        <ExpenseCategoriesDialog open={managingCategories} onOpenChange={setManagingCategories} />
      )}
    </div>
  );
}
