import { EXPENSE_STATUS_LABELS, formatAmount, formatDate, type ExpenseView } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Inbox, Paperclip } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Block, PageHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EXPENSE_BADGE, ExpenseDetailSheet } from '@/features/console/components/ExpenseDetailSheet';
import { MoneyNav } from '@/features/console/components/MoneyNav';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { consoleOrdersService } from '@/services/console-orders.service';
import { financeService } from '@/services/finance.service';

/**
 * Awaiting my approval.
 *
 * Every expense here was routed to the person looking at it, or is one they
 * may decide as the backup approver - the server decides which, and checks
 * again when they press a button. Approving accepts the cost; it pays nobody.
 * Returning it needs a reason, because the person who recorded it reads it.
 */
export default function ConsoleExpenseApprovalsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [returning, setReturning] = React.useState<ExpenseView | null>(null);
  const [reason, setReason] = React.useState('');

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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.expenseApprovals,
    queryFn: () => financeService.approvals(),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders', 'finance'] });
  };

  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject'; note?: string }) =>
      financeService.decideExpense(id, decision, note),
    onSuccess: (updated) => {
      toast.success(
        updated.status === 'approved'
          ? `${updated.number} approved. Finance records the payment separately.`
          : `${updated.number} returned with your reason.`,
      );
      setReturning(null);
      setReason('');
      refresh();
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  // Order prices waiting for a decision, for whoever may approve them.
  const { can } = usePermissions();
  const prices = useQuery({
    queryKey: qk.admin.priceApprovals,
    queryFn: () => consoleOrdersService.priceApprovals(),
    enabled: can('orders.approve_price'),
  });

  const mine = (data ?? []).filter((expense) => !expense.decidesAsBackup);
  const asBackup = (data ?? []).filter((expense) => expense.decidesAsBackup);

  const table = (rows: ExpenseView[]) => (
    <Card>
      <CardContent className="p-0 sm:p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Submitted by</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>
                  <p className="font-mono text-[0.6875rem] text-subtle">{expense.number}</p>
                  <p className="max-w-[18rem] truncate text-ink">{expense.title}</p>
                  {expense.vendor && <p className="max-w-[18rem] truncate text-xs text-muted">{expense.vendor}</p>}
                </TableCell>
                <TableCell className="text-right tabular-nums text-ink">{formatAmount(expense.amount)}</TableCell>
                <TableCell className="text-xs text-muted">{expense.categoryName}</TableCell>
                <TableCell className="text-xs text-muted">{expense.branch ?? '-'}</TableCell>
                <TableCell className="max-w-[10rem] truncate text-xs text-ink-soft">
                  {expense.createdByName ?? expense.createdByEmail ?? '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {expense.submittedAt ? formatDate(expense.submittedAt) : '-'}
                </TableCell>
                <TableCell className="text-xs text-muted">
                  {expense.hasReceipt ? (
                    <span className="inline-flex items-center gap-1 text-ink-soft">
                      <Paperclip className="size-3" aria-hidden /> Attached
                    </span>
                  ) : (
                    'None'
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={EXPENSE_BADGE[expense.status]}>{EXPENSE_STATUS_LABELS[expense.status]}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(expense.id)}>
                      View
                    </Button>
                    <Button
                      size="sm"
                      loading={decide.isPending && decide.variables?.id === expense.id && decide.variables.decision === 'approve'}
                      onClick={() => decide.mutate({ id: expense.id, decision: 'approve' })}
                    >
                      <CircleCheck /> Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReason('');
                        setReturning(expense);
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Awaiting my approval"
        description="Expenses routed to you, and order prices waiting for a decision. Approving accepts the cost - finance records the payment separately."
      />

      <MoneyNav />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <div className="space-y-10">
          {mine.length > 0 ? (
            table(mine)
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="Nothing is waiting for you."
              description="When someone submits an expense routed to you, it appears here and in your notifications."
            />
          )}

          {asBackup.length > 0 && (
            <Block
              label="As backup approver"
              hint="Routed to someone else. You may decide these if they cannot."
            >
              {table(asBackup)}
            </Block>
          )}

          {can('orders.approve_price') && (prices.data ?? []).length > 0 && (
            <Block label="Order prices awaiting approval" hint="Custom prices further below the tariff than the limit allows.">
              <Card>
                <CardContent className="p-0 sm:p-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Price asked</TableHead>
                        <TableHead className="text-right">Standard</TableHead>
                        <TableHead>Below standard</TableHead>
                        <TableHead>Set by</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(prices.data ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <p className="font-mono text-xs text-ink">{row.reference}</p>
                            {row.reason && <p className="max-w-[18rem] truncate text-xs text-muted">{row.reason}</p>}
                          </TableCell>
                          <TableCell className="text-sm text-ink-soft">{row.customer}</TableCell>
                          <TableCell className="text-right tabular-nums text-ink">{formatAmount(row.total)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted">
                            {row.standardTotal != null ? formatAmount(row.standardTotal) : '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted">
                            {row.reductionPercent}% (limit {row.thresholdPercent}%)
                          </TableCell>
                          <TableCell className="text-xs text-subtle">{row.requestedByEmail ?? '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => navigate(`/console/orders/${row.id}`)}>
                              {row.mayDecide ? 'Review' : 'View'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Block>
          )}
        </div>
      )}

      <Dialog open={Boolean(returning)} onOpenChange={(open) => !open && !decide.isPending && setReturning(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {returning?.number}</DialogTitle>
            <DialogDescription>
              It goes back to {returning?.createdByName ?? 'the person who recorded it'}, who can correct and resubmit it.
              They see your reason.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="reject-reason" required>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="The bill is for a personal purchase"
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" disabled={decide.isPending} onClick={() => setReturning(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending && decide.variables?.decision === 'reject'}
              disabled={reason.trim().length < 3}
              onClick={() => returning && decide.mutate({ id: returning.id, decision: 'reject', note: reason.trim() })}
            >
              Reject expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExpenseDetailSheet
        expenseId={openId}
        onClose={() => setOpenId(null)}
        onEdit={(expense) => navigate(`/console/expenses?expense=${expense.id}`)}
      />
    </div>
  );
}
