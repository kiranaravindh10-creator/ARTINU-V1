import {
  APPROVAL_ROUTE_LABELS,
  APPROVAL_SETTINGS_PATH,
  EDITABLE_EXPENSE_STATUSES,
  EXPENSE_PAYMENT_ARRANGEMENT_LABELS,
  EXPENSE_STATUS_LABELS,
  formatAmount,
  formatDate,
  formatDateTime,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  ROLE_LABELS,
  type ExpenseStatus,
  type ExpenseView,
  type PaymentMethod,
  type Role,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CircleCheck,
  FileText,
  Hourglass,
  Paperclip,
  Pencil,
  Send,
  Settings2,
  TriangleAlert,
  Undo2,
  UserCheck,
  Wallet,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogTitle, Sheet, SheetContent } from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { DateInput, Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { DataRow } from '@/components/ui/stat';
import { useAuth } from '@/contexts/AuthContext';
import { RECEIPT_ACCEPT, receiptDataUrl, receiptProblem } from '@/features/console/components/ExpenseFormDialog';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { financeService } from '@/services/finance.service';

export const EXPENSE_BADGE: Record<ExpenseStatus, NonNullable<BadgeProps['variant']>> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'info',
  rejected: 'danger',
  partially_paid: 'bronze',
  paid: 'success',
  cancelled: 'outline',
};

type Panel = 'reject' | 'pay' | 'cancel' | 'reverse' | 'reassign' | null;

export const roleName = (role: string) => ROLE_LABELS[role as Role] ?? role;

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** One per payment form opened: a retried or double-clicked submission records one payment, not two. */
const requestKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const label = 'font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle';

/**
 * One expense: what it was, where it stands, and the next thing that can
 * happen to it - offered only to the role that may do it. The server applies
 * every one of these rules again; hiding a button is courtesy, not security.
 *
 * Approval and payment are deliberately separate steps with separate buttons.
 * An approved expense says so in as many words - "approved, not paid" - so
 * nobody reads a green badge as money having left the account.
 */
export function ExpenseDetailSheet({
  expenseId,
  onClose,
  onEdit,
}: {
  expenseId: string | null;
  onClose: () => void;
  onEdit: (expense: ExpenseView) => void;
}) {
  const open = Boolean(expenseId);
  const { user } = useAuth();
  const { can, hasModule } = usePermissions();
  const queryClient = useQueryClient();

  const { data: expense, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.expense(expenseId ?? ''),
    queryFn: () => financeService.expense(expenseId!),
    enabled: open,
  });
  const navigate = useNavigate();
  const configures = can('expenses.configure_approvals');

  const [panel, setPanel] = React.useState<Panel>(null);
  const [reason, setReason] = React.useState('');
  const [newApprover, setNewApprover] = React.useState('');

  // Who it could be handed to - asked only when an administrator opens "Reassign".
  const candidates = useQuery({
    queryKey: qk.admin.eligibleApprovers(expenseId ?? ''),
    queryFn: () => financeService.eligibleApprovers(expenseId!),
    enabled: open && panel === 'reassign' && configures,
  });
  const [payment, setPayment] = React.useState({
    amount: '',
    paidOn: today(),
    method: 'bank_transfer' as PaymentMethod,
    reference: '',
    paidBy: '',
    notes: '',
    key: requestKey(),
  });

  React.useEffect(() => {
    setPanel(null);
    setReason('');
  }, [expenseId]);

  const openPanel = (next: Panel) => {
    setReason('');
    setNewApprover('');
    if (next === 'pay' && expense) {
      setPayment({
        amount: String(expense.outstandingAmount),
        paidOn: today(),
        method: expense.paymentMethod ?? 'bank_transfer',
        reference: '',
        paidBy: '',
        notes: '',
        key: requestKey(),
      });
    }
    setPanel(next);
  };

  const done = (updated: ExpenseView, message: string) => {
    queryClient.setQueryData(qk.admin.expense(updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders', 'finance'] });
    setPanel(null);
    setReason('');
    toast.success(message);
  };
  const fail = (mutationError: unknown) => toast.error(errorMessage(mutationError));

  const submit = useMutation({
    mutationFn: (id: string) => financeService.submitExpense(id),
    onSuccess: (updated) =>
      done(updated, updated.status === 'approved' ? 'Approved automatically - within the limit.' : 'Sent for approval.'),
    onError: fail,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject'; note?: string }) =>
      financeService.decideExpense(id, decision, note),
    onSuccess: (updated) =>
      done(updated, updated.status === 'approved' ? 'Approved. Finance can now record the payment.' : 'Returned with your reason.'),
    onError: fail,
  });
  const pay = useMutation({
    mutationFn: (id: string) =>
      financeService.payExpense(id, {
        amount: Number(payment.amount),
        paidOn: payment.paidOn,
        method: payment.method,
        reference: payment.reference.trim() || null,
        paidBy: payment.paidBy.trim() || null,
        notes: payment.notes.trim() || null,
        idempotencyKey: payment.key,
      }),
    onSuccess: (updated) =>
      done(updated, updated.status === 'paid' ? 'Payment recorded. Fully paid.' : `Payment recorded. ${formatAmount(updated.outstandingAmount)} still to pay.`),
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => financeService.cancelExpense(id, reason.trim()),
    onSuccess: (updated) => done(updated, 'Expense cancelled. It stays on record.'),
    onError: fail,
  });
  const reverse = useMutation({
    mutationFn: (id: string) => financeService.reverseExpense(id, reason.trim()),
    onSuccess: (updated) => done(updated, 'Reversed. The payments stay on record, marked reversed.'),
    onError: fail,
  });
  const attach = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) =>
      financeService.attachReceipt(id, { dataUrl: await receiptDataUrl(file), fileName: file.name }),
    onSuccess: (updated) => done(updated, 'Receipt attached.'),
    onError: fail,
  });
  const openReceipt = useMutation({
    mutationFn: (id: string) => financeService.openReceipt(id),
    onError: fail,
  });
  const reassign = useMutation({
    mutationFn: (id: string) => financeService.reassignApprover(id, newApprover, reason.trim()),
    onSuccess: (updated) =>
      done(updated, `Now with ${updated.approver?.name ?? 'the new approver'}. They have been told, and the change is on the audit trail.`),
    onError: fail,
  });

  const renderBody = () => {
    // The dialog is named even before the expense arrives, for screen readers.
    const unnamed = (
      <>
        <DialogTitle className="sr-only">Expense</DialogTitle>
        <DialogDescription className="sr-only">Details of one expense.</DialogDescription>
      </>
    );
    if (isError) {
      return (
        <>
          {unnamed}
          <ErrorState error={error} onRetry={() => void refetch()} />
        </>
      );
    }
    if (isLoading || !expense) {
      return (
        <div className="space-y-4">
          {unnamed}
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      );
    }

    const mine = expense.createdBy === user?.id;
    const editable = EDITABLE_EXPENSE_STATUSES.includes(expense.status);
    const handles = mine || can('expenses.approve') || can('expenses.pay');
    const canEdit = editable && handles && can('expenses.create');
    // The server's answer: the assigned approver or the backup, never the submitter.
    const canDecide = Boolean(expense.mayDecide);
    const waiting = expense.status === 'pending_approval';
    const decided = expense.status !== 'draft' && expense.status !== 'pending_approval';
    const canPay = (expense.status === 'approved' || expense.status === 'partially_paid') && can('expenses.pay');
    const canCancel =
      ['draft', 'pending_approval', 'approved', 'rejected'].includes(expense.status) &&
      ((mine && ['draft', 'pending_approval', 'rejected'].includes(expense.status)) ||
        can('expenses.approve') ||
        can('expenses.pay'));
    const canReverse = (expense.status === 'paid' || expense.status === 'partially_paid') && can('expenses.reverse');
    const canAttach = expense.status !== 'cancelled' && handles;
    const payable = expense.status === 'approved' || expense.status === 'partially_paid';

    return (
      <div className="space-y-7">
        <div>
          <p className="font-mono text-xs text-subtle">{expense.number}</p>
          <DialogTitle className="mt-1.5">{expense.title}</DialogTitle>
          <DialogDescription className="mt-1">
            {expense.categoryName} · {formatDate(`${String(expense.expenseDate).slice(0, 10)}T00:00:00`)}
          </DialogDescription>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="font-display text-3xl leading-none text-ink">{formatAmount(expense.amount)}</span>
            <Badge variant={EXPENSE_BADGE[expense.status]}>{EXPENSE_STATUS_LABELS[expense.status]}</Badge>
          </div>
        </div>

        {/* Approval is not payment. Say so where it matters. */}
        {payable && (
          <p className="flex items-start gap-2.5 rounded-md border border-info/25 bg-info-soft/50 px-3.5 py-3 text-sm text-ink-soft">
            <Wallet className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <span>
              {expense.status === 'approved' ? 'Approved, not paid yet. ' : 'Partly paid. '}
              <span className="font-medium text-ink">{formatAmount(expense.outstandingAmount)}</span> still to pay
              {expense.paymentArrangement === 'employee_reimbursable' && expense.paidBy ? ` - reimburse ${expense.paidBy}.` : '.'}
            </span>
          </p>
        )}
        {expense.status === 'rejected' && expense.rejectionReason && (
          <p className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger-soft/50 px-3.5 py-3 text-sm text-ink-soft">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <span>
              <span className="font-medium text-ink">Returned: </span>
              {expense.rejectionReason}
            </span>
          </p>
        )}
        {/* Who it is waiting for - or that nobody valid is, and how that gets fixed. */}
        {waiting &&
          (expense.approvalProblem ? (
            <div className="rounded-md border border-danger/25 bg-danger-soft/50 px-3.5 py-3 text-sm text-ink-soft">
              <p className="flex items-start gap-2.5">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span>
                  <span className="font-medium text-ink">No eligible approver is configured for this expense.</span>{' '}
                  {expense.approvalProblem}
                </span>
              </p>
              {configures ? (
                <div className="mt-3 flex flex-wrap gap-2 pl-6.5">
                  <Button size="sm" onClick={() => openPanel('reassign')}>
                    <UserCheck /> Assign an approver
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(APPROVAL_SETTINGS_PATH)}>
                    <Settings2 /> Approval settings
                  </Button>
                </div>
              ) : (
                <p className="mt-2 pl-6.5 text-xs text-muted">
                  Whoever configures expense approvals - the CEO - has to assign one before it can be decided.
                </p>
              )}
            </div>
          ) : expense.approver ? (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning-soft/50 px-3.5 py-3 text-sm text-ink-soft">
              <Hourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 flex-1">
                <p>
                  Awaiting approval from{' '}
                  <span className="font-medium text-ink">
                    {expense.approver.id === user?.id ? 'you' : expense.approver.name}
                  </span>{' '}
                  ({roleName(expense.approver.role)}).
                </p>
                {canDecide && expense.decidesAsBackup && (
                  <p className="mt-1 text-xs text-muted">You can also decide it, as the backup approver.</p>
                )}
                {configures && (
                  <button
                    type="button"
                    onClick={() => openPanel('reassign')}
                    className="mt-1.5 text-xs text-bronze hover:underline"
                  >
                    Reassign to someone else
                  </button>
                )}
              </div>
            </div>
          ) : null)}

        {expense.status !== 'draft' && (
          <div>
            <p className={label}>Approval</p>
            <dl className="mt-1">
              <DataRow label="Submitted by" value={expense.createdByName ?? expense.createdByEmail ?? '-'} />
              {expense.approver && (
                <DataRow
                  label="Assigned approver"
                  value={`${expense.approver.name}${expense.approver.role ? ` (${roleName(expense.approver.role)})` : ''}`}
                />
              )}
              {expense.approvalRoute && <DataRow label="Assigned as" value={APPROVAL_ROUTE_LABELS[expense.approvalRoute]} />}
              <DataRow label="Approval status" value={EXPENSE_STATUS_LABELS[expense.status]} />
              {expense.submittedAt && <DataRow label="Submitted" value={formatDateTime(expense.submittedAt)} />}
              {decided && expense.approvedAt && <DataRow label="Approved" value={formatDateTime(expense.approvedAt)} />}
              {expense.rejectedAt && <DataRow label="Returned" value={formatDateTime(expense.rejectedAt)} />}
              {expense.status === 'rejected' && expense.rejectionReason && (
                <DataRow label="Reason" value={expense.rejectionReason} />
              )}
            </dl>
          </div>
        )}

        {panel === 'reassign' && (
          <ActionPanel
            title="Assign an approver"
            description="Only people who may approve this expense are listed: active, holding the approval permission, of a role senior enough for whoever recorded it, and not that person. They are told, and the change goes on the audit trail."
            confirmLabel="Assign"
            busy={reassign.isPending}
            disabled={!newApprover || reason.trim().length < 5}
            onCancel={() => setPanel(null)}
            onConfirm={() => reassign.mutate(expense.id)}
          >
            <div className="space-y-3">
              {candidates.isError ? (
                <p className="text-sm text-danger">{errorMessage(candidates.error)}</p>
              ) : (
                <SimpleSelect
                  value={newApprover}
                  onValueChange={setNewApprover}
                  placeholder={candidates.isLoading ? 'Loading…' : (candidates.data ?? []).length ? 'Choose the approver' : 'Nobody eligible'}
                  options={(candidates.data ?? [])
                    .filter((option) => option.id !== expense.approverId)
                    .map((option) => ({ value: option.id, label: `${option.name} - ${roleName(option.role)} - ${option.email}` }))}
                />
              )}
              <Textarea
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why - e.g. the approver is on leave"
                aria-label="Reason for the reassignment"
              />
            </div>
          </ActionPanel>
        )}

        <dl>
          <DataRow label="Payment status when recorded" value={EXPENSE_PAYMENT_ARRANGEMENT_LABELS[expense.paymentArrangement] ?? '-'} />
          {expense.paidBy && <DataRow label="Paid by" value={expense.paidBy} />}
          {expense.vendor && <DataRow label="Vendor or payee" value={expense.vendor} />}
          {expense.paymentMethod && <DataRow label="Method" value={PAYMENT_METHOD_LABELS[expense.paymentMethod]} />}
          {expense.transactionReference && (
            <DataRow label="Reference" value={<span className="font-mono text-xs">{expense.transactionReference}</span>} />
          )}
          {expense.branch && <DataRow label="Branch" value={expense.branch} />}
          {expense.orderId && (
            <DataRow
              label="Order"
              value={
                (hasModule('orders') || hasModule('finance')) ? (
                  <Link to={`/console/orders/${expense.orderId}`} className="font-mono text-xs text-bronze hover:underline">
                    {expense.orderReference ?? 'Open order'}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{expense.orderReference ?? '-'}</span>
                )
              }
            />
          )}
          {expense.clientName && <DataRow label="Customer" value={expense.clientName} />}
          <DataRow label="Paid so far" value={formatAmount(expense.paidAmount)} />
          {payable && <DataRow label="Still to pay" value={formatAmount(expense.outstandingAmount)} emphasis />}
        </dl>

        {expense.notes && (
          <div>
            <p className={label}>Notes</p>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{expense.notes}</p>
          </div>
        )}

        <div>
          <p className={label}>Receipt</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {expense.hasReceipt ? (
              <Button
                variant="outline"
                size="sm"
                loading={openReceipt.isPending}
                onClick={() => openReceipt.mutate(expense.id)}
              >
                <FileText /> Open {expense.receiptName ?? 'receipt'}
              </Button>
            ) : (
              <span className="text-sm text-muted">None attached.</span>
            )}
            {canAttach && (
              <Button variant="ghost" size="sm" asChild disabled={attach.isPending}>
                <label htmlFor="expense-detail-receipt" className="cursor-pointer">
                  <Paperclip /> {attach.isPending ? 'Attaching…' : expense.hasReceipt ? 'Replace' : 'Attach'}
                  <input
                    id="expense-detail-receipt"
                    type="file"
                    accept={RECEIPT_ACCEPT}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      const problem = receiptProblem(file);
                      if (problem) toast.error(problem);
                      else attach.mutate({ id: expense.id, file });
                    }}
                  />
                </label>
              </Button>
            )}
          </div>
        </div>

        {(expense.payments ?? []).length > 0 && (
          <div>
            <p className={label}>Payments</p>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {(expense.payments ?? []).map((entry) => (
                <li key={entry.id} className="py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={entry.reversedAt ? 'text-subtle line-through' : 'text-ink'}>
                      {formatAmount(entry.amount)} · {PAYMENT_METHOD_LABELS[entry.method] ?? entry.method}
                    </span>
                    <span className="text-xs text-subtle">{formatDate(`${entry.paidOn}T00:00:00`)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {[entry.reference, entry.paidBy && `paid by ${entry.paidBy}`, entry.recordedByEmail && `recorded by ${entry.recordedByEmail}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {entry.reversedAt && (
                    <p className="mt-1 text-xs text-danger">
                      Reversed {formatDateTime(entry.reversedAt)}
                      {entry.reversalReason ? ` - ${entry.reversalReason}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className={label}>History</p>
          <ol className="mt-2 space-y-1.5 text-xs text-muted">
            <li>
              Recorded by {expense.createdByEmail ?? 'a former member of staff'} · {formatDateTime(expense.createdAt)}
            </li>
            {expense.submittedAt && <li>Submitted for approval · {formatDateTime(expense.submittedAt)}</li>}
            {expense.approvedAt && (
              <li>
                {expense.approvedBy ? `Approved by ${expense.approvedByEmail}` : expense.approvedByEmail} ·{' '}
                {formatDateTime(expense.approvedAt)}
              </li>
            )}
            {expense.rejectedAt && <li>Returned · {formatDateTime(expense.rejectedAt)}</li>}
            {expense.cancelledAt && (
              <li>
                Cancelled · {formatDateTime(expense.cancelledAt)}
                {expense.cancellationReason ? ` - ${expense.cancellationReason}` : ''}
              </li>
            )}
          </ol>
        </div>

        {/* ── What can happen next ─────────────────────────────────────── */}

        {panel === 'reject' && (
          <ActionPanel
            title="Return it with a reason"
            description="The person who recorded it sees this and can correct and resubmit."
            confirmLabel="Return expense"
            busy={decide.isPending}
            disabled={reason.trim().length < 3}
            onCancel={() => setPanel(null)}
            onConfirm={() => decide.mutate({ id: expense.id, decision: 'reject', note: reason.trim() })}
          >
            <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="The bill is for a personal purchase" />
          </ActionPanel>
        )}

        {panel === 'cancel' && (
          <ActionPanel
            title="Cancel this expense"
            description="No money has been paid on it. It stays on record as cancelled, with your reason."
            confirmLabel="Cancel expense"
            tone="danger"
            busy={cancel.isPending}
            disabled={reason.trim().length < 5}
            onCancel={() => setPanel(null)}
            onConfirm={() => cancel.mutate(expense.id)}
          >
            <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Recorded twice" />
          </ActionPanel>
        )}

        {panel === 'reverse' && (
          <ActionPanel
            title="Reverse a paid expense"
            description={`Marks ${formatAmount(expense.paidAmount)} of payments as reversed and cancels the expense. Nothing is deleted - the register shows each payment and its reversal. Only do this once the money has actually come back, or the payment was recorded in error.`}
            confirmLabel="Reverse expense"
            tone="danger"
            busy={reverse.isPending}
            disabled={reason.trim().length < 5}
            onCancel={() => setPanel(null)}
            onConfirm={() => reverse.mutate(expense.id)}
          >
            <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Vendor refunded the full amount on 28 Oct" />
          </ActionPanel>
        )}

        {panel === 'pay' && (
          <ActionPanel
            title="Record a payment"
            description={`Record money that has actually left ARTINU. ${formatAmount(expense.outstandingAmount)} is still to pay; a smaller amount records a part payment.`}
            confirmLabel="Record payment"
            busy={pay.isPending}
            disabled={!(Number(payment.amount) > 0) || !payment.paidOn}
            onCancel={() => setPanel(null)}
            onConfirm={() => pay.mutate(expense.id)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount (₹)" htmlFor="expense-pay-amount" required>
                <Input
                  id="expense-pay-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  max={expense.outstandingAmount}
                  value={payment.amount}
                  onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))}
                />
              </Field>
              <Field label="Paid on" htmlFor="expense-pay-date" required>
                <DateInput
                  id="expense-pay-date"
                  value={payment.paidOn}
                  onChange={(event) => setPayment((current) => ({ ...current, paidOn: event.target.value }))}
                />
              </Field>
              <Field label="Method" htmlFor="expense-pay-method" required>
                <SimpleSelect
                  id="expense-pay-method"
                  value={payment.method}
                  onValueChange={(value) => setPayment((current) => ({ ...current, method: value as PaymentMethod }))}
                  options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
                />
              </Field>
              <Field label="Reference" htmlFor="expense-pay-reference">
                <Input
                  id="expense-pay-reference"
                  value={payment.reference}
                  onChange={(event) => setPayment((current) => ({ ...current, reference: event.target.value }))}
                  placeholder="UTR or cheque number"
                />
              </Field>
              <Field label="Paid from" htmlFor="expense-pay-by" hint="Account or person who made the payment." className="sm:col-span-2">
                <Input
                  id="expense-pay-by"
                  value={payment.paidBy}
                  onChange={(event) => setPayment((current) => ({ ...current, paidBy: event.target.value }))}
                  placeholder="Current account"
                />
              </Field>
            </div>
          </ActionPanel>
        )}

        {panel === null && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            {canDecide && (
              <>
                <Button
                  size="sm"
                  loading={decide.isPending && decide.variables?.decision === 'approve'}
                  onClick={() => decide.mutate({ id: expense.id, decision: 'approve' })}
                >
                  <CircleCheck /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPanel('reject')}>
                  Return
                </Button>
              </>
            )}
            {canPay && (
              <Button size="sm" onClick={() => openPanel('pay')}>
                <Wallet /> Record payment
              </Button>
            )}
            {canEdit && (
              <>
                <Button size="sm" variant="outline" onClick={() => onEdit(expense)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="outline" loading={submit.isPending} onClick={() => submit.mutate(expense.id)}>
                  <Send /> {expense.status === 'rejected' ? 'Resubmit' : 'Submit for approval'}
                </Button>
              </>
            )}
            {canCancel && (
              <Button size="sm" variant="ghost" onClick={() => openPanel('cancel')}>
                <Ban /> Cancel
              </Button>
            )}
            {canReverse && (
              <Button size="sm" variant="ghost" onClick={() => openPanel('reverse')}>
                <Undo2 /> Reverse
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="max-w-lg">
        {renderBody()}
      </SheetContent>
    </Sheet>
  );
}

function ActionPanel({
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy,
  disabled,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  busy: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
      <div className="mt-3">{children}</div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Back
        </Button>
        <Button size="sm" variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} disabled={disabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
