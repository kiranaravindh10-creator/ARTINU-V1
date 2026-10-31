import {
  EXPENSE_STATUS_LABELS,
  formatAmount,
  formatDate,
  formatDateTime,
  ORDER_LINE_KIND_LABELS,
  ORDER_PAYMENT_TERMS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PRICING,
  type ExpenseView,
  type Order,
  type OrderPaymentState,
  type Payment,
  type PaymentMethod,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Link2, Plus, ReceiptIndianRupee, Search, Wallet } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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
import { ErrorState, Skeleton } from '@/components/ui/display';
import { Field } from '@/components/ui/field';
import { DateInput, Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { DataRow } from '@/components/ui/stat';
import { useAuth } from '@/contexts/AuthContext';
import { EXPENSE_BADGE } from '@/features/console/components/ExpenseDetailSheet';
import { ExpenseFormDialog } from '@/features/console/components/ExpenseFormDialog';
import { LinkClientAccount } from '@/features/console/components/LinkClientAccount';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { consoleOrdersService } from '@/services/console-orders.service';
import { financeService } from '@/services/finance.service';

const STATE: Record<OrderPaymentState, { label: string; variant: NonNullable<BadgeProps['variant']> }> = {
  unpaid: { label: 'Unpaid', variant: 'warning' },
  partially_paid: { label: 'Part-paid', variant: 'bronze' },
  paid: { label: 'Paid', variant: 'success' },
  refunded: { label: 'Refunded', variant: 'info' },
};

const PAYMENT_STATUS: Record<string, NonNullable<BadgeProps['variant']>> = {
  created: 'neutral',
  awaiting_payment: 'warning',
  verifying: 'info',
  succeeded: 'success',
  failed: 'danger',
  expired: 'neutral',
  refunded: 'info',
};

/** Where the money came from - a gateway's confirmation and a person's record are never the same thing. */
function paymentSource(payment: Payment): { label: string; variant: NonNullable<BadgeProps['variant']> } {
  if (payment.provider === 'manual') return { label: 'Recorded by staff', variant: 'outline' };
  if ((payment.provider === 'razorpay' || payment.provider === 'stripe') && payment.gatewayPaymentId) {
    return { label: 'Payment gateway', variant: 'success' };
  }
  if (payment.provider === 'mock_qr') return { label: 'UPI QR, checked by staff', variant: 'info' };
  return { label: 'Online, not confirmed', variant: 'neutral' };
}

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const label = 'font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle';

/**
 * The money on one order: what was agreed, what has been paid and by what
 * route, what is still owed, whether the price is approved, and the costs put
 * against it.
 *
 * Every figure is the server's - the agreed price is the order's stored
 * breakdown, paid and outstanding are worked out from its payment rows - so
 * this panel, the register and the dashboard cannot disagree. Recording a
 * payment goes through the same service as everywhere else: never more than is
 * owed, never twice for one click, and the payment that completes the total
 * confirms the order exactly as an online payment would.
 */
export function OrderMoneyPanel({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can, hasModule } = usePermissions();

  const finance = useQuery({
    queryKey: qk.admin.orderFinance(order.id),
    queryFn: () => consoleOrdersService.finance(order.id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.admin.orderFinance(order.id) });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
    onChanged();
  };

  const [paying, setPaying] = React.useState(false);
  const [addingCost, setAddingCost] = React.useState(false);
  const [linkingCost, setLinkingCost] = React.useState(false);
  const [deciding, setDeciding] = React.useState<'approve' | 'reject' | null>(null);

  if (finance.isError) return <ErrorState error={finance.error} onRetry={() => void finance.refetch()} />;
  if (finance.isLoading || !finance.data) return <Skeleton className="h-72 w-full rounded-lg" />;

  const { money, payments, expenses, contribution, client } = finance.data;
  const pricing = order.pricing;
  const approval = pricing.approval;
  const approvalPending = approval?.status === 'pending';
  const custom = pricing.mode === 'custom';
  const state = STATE[money.state];

  const payBlocked =
    order.status === 'cancelled'
      ? 'A cancelled order cannot take a payment.'
      : approvalPending
        ? 'The price is waiting for approval. Payments can be recorded once it is approved.'
        : money.outstanding <= 0
          ? 'Nothing is owed on this order.'
          : null;

  const costTotals = {
    approved: expenses.filter((expense) => ['approved', 'partially_paid', 'paid'].includes(expense.status)),
    paid: expenses.reduce((sum, expense) => sum + expense.paidAmount, 0),
  };

  return (
    <div className="space-y-5">
      {/* ── What was agreed, and what has been paid ─────────────────────── */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Money</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{custom ? 'Custom price' : 'Standard tariff'}</Badge>
            <Badge variant={state.variant}>{state.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {(pricing.lines ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle">
                    <th className="py-2 pr-3 font-normal">Item</th>
                    <th className="px-3 py-2 text-right font-normal">Qty</th>
                    <th className="px-3 py-2 text-right font-normal">Standard</th>
                    <th className="px-3 py-2 text-right font-normal">Agreed each</th>
                    <th className="py-2 pl-3 text-right font-normal">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {(pricing.lines ?? []).map((line) => (
                    <tr key={line.key}>
                      <td className="py-2.5 pr-3 text-ink">
                        {line.description}
                        <span className="block text-xs text-subtle">
                          {line.kind === 'frames' ? 'Monthly rate per framed photograph' : ORDER_LINE_KIND_LABELS[line.kind]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {line.standardUnitPrice != null ? formatAmount(line.standardUnitPrice) : 'No tariff'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatAmount(line.unitPrice)}
                        {line.priceSource === 'custom' && line.standardUnitPrice != null && line.unitPrice !== line.standardUnitPrice && (
                          <span className="ml-1.5 text-xs text-bronze">custom</span>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-ink">{formatAmount(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {order.items.length} framed {order.items.length === 1 ? 'photograph' : 'photographs'}, priced at checkout - see
              the list above for each one.
            </p>
          )}

          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <dl>
              <DataRow label="Subtotal" value={formatAmount(pricing.subtotal)} />
              {pricing.discount > 0 && (
                <DataRow
                  label={pricing.couponCode ? `Discount (${pricing.couponCode})` : 'Discount'}
                  value={`− ${formatAmount(pricing.discount)}`}
                />
              )}
              {pricing.delivery > 0 && <DataRow label="Delivery" value={formatAmount(pricing.delivery)} />}
              {pricing.installation > 0 && <DataRow label="Installation" value={formatAmount(pricing.installation)} />}
              {(pricing.otherCharges ?? 0) > 0 && <DataRow label="Other charges" value={formatAmount(pricing.otherCharges ?? 0)} />}
              {/* Only an order that was actually charged GST shows it. GST is off in this version. */}
              {pricing.gst > 0 && <DataRow label={`GST @ ${PRICING.GST_RATE * 100}%`} value={formatAmount(pricing.gst)} />}
              {pricing.securityDeposit > 0 && <DataRow label="Refundable deposit" value={formatAmount(pricing.securityDeposit)} />}
              <DataRow label="Order total" value={formatAmount(money.total)} emphasis />
              {custom && pricing.standardTotal != null && (
                <p className="mt-2 text-xs text-muted">
                  Standard price {formatAmount(pricing.standardTotal)}
                  {approval && approval.reductionPercent !== 0 &&
                    ` · ${Math.abs(approval.reductionPercent)}% ${approval.reductionPercent > 0 ? 'below' : 'above'} it`}
                </p>
              )}
              {pricing.priceReason && <p className="mt-1 text-xs text-muted">Why: {pricing.priceReason}</p>}
              {pricing.commercialTerms && <p className="mt-1 text-xs text-muted">Terms: {pricing.commercialTerms}</p>}
            </dl>
            <dl>
              <DataRow label="Paid" value={formatAmount(money.paid)} />
              {money.refunded > 0 && <DataRow label="Refunded" value={`− ${formatAmount(money.refunded)}`} />}
              <DataRow label="Outstanding" value={formatAmount(money.outstanding)} emphasis />
              {order.paymentTerms && <DataRow label="Payment terms" value={ORDER_PAYMENT_TERMS_LABELS[order.paymentTerms]} />}
              {order.createdByEmail && <DataRow label="Created by" value={order.createdByEmail} />}
              <div className="mt-4">
                {can('payments.record_offline') && (
                  <>
                    <Button size="sm" disabled={Boolean(payBlocked)} onClick={() => setPaying(true)}>
                      <Wallet /> Record a payment
                    </Button>
                    {payBlocked && <p className="mt-1.5 text-xs text-subtle">{payBlocked}</p>}
                  </>
                )}
              </div>
            </dl>
          </div>

          <div>
            <p className={label}>Payments</p>
            {payments.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No payments yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-subtle">
                      <th className="py-2 pr-3 font-normal">Date</th>
                      <th className="px-3 py-2 text-right font-normal">Amount</th>
                      <th className="px-3 py-2 font-normal">Method</th>
                      <th className="px-3 py-2 font-normal">Reference</th>
                      <th className="px-3 py-2 font-normal">Source</th>
                      <th className="py-2 pl-3 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {payments.map((payment) => {
                      const source = paymentSource(payment);
                      return (
                        <tr key={payment.id}>
                          <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted">{formatDate(payment.paidAt ?? payment.createdAt)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                            {formatAmount(payment.amount)}
                            {payment.status === 'refunded' && payment.refundedAmount != null && (
                              <span className="block text-xs text-subtle">− {formatAmount(payment.refundedAmount)} refunded</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted">
                            {payment.method ? (PAYMENT_METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method) : '-'}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted">{payment.reference}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant={source.variant}>{source.label}</Badge>
                            {payment.recordedByEmail && <span className="mt-0.5 block text-xs text-subtle">{payment.recordedByEmail}</span>}
                          </td>
                          <td className="py-2.5 pl-3">
                            <Badge variant={PAYMENT_STATUS[payment.status] ?? 'neutral'}>{payment.status.replace(/_/g, ' ')}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Price approval ──────────────────────────────────────────────── */}
      {approval?.required && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Price approval</CardTitle>
            <Badge
              variant={
                approval.status === 'approved' ? 'success' : approval.status === 'rejected' ? 'danger' : approval.status === 'pending' ? 'warning' : 'neutral'
              }
            >
              {approval.status === 'pending' ? 'Waiting' : approval.status === 'approved' ? 'Approved' : 'Rejected'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-ink-soft">
              {Math.abs(approval.reductionPercent)}% below the standard price - more than the {approval.thresholdPercent}% a custom
              price may go without approval.
            </p>
            <dl>
              <DataRow label="Price asked" value={formatAmount(pricing.total)} />
              {pricing.standardTotal != null && <DataRow label="Standard price" value={formatAmount(pricing.standardTotal)} />}
              {approval.reason && <DataRow label="Reason given" value={approval.reason} />}
              {approval.requestedByEmail && (
                <DataRow
                  label="Set by"
                  value={`${approval.requestedByEmail}${approval.requestedAt ? ` · ${formatDateTime(approval.requestedAt)}` : ''}`}
                />
              )}
              {approval.decidedByEmail && approval.status !== 'pending' && (
                <DataRow
                  label={approval.status === 'approved' ? 'Approved by' : 'Rejected by'}
                  value={`${approval.decidedByEmail}${approval.decidedAt ? ` · ${formatDateTime(approval.decidedAt)}` : ''}`}
                />
              )}
              {approval.decisionNote && <DataRow label="Note" value={approval.decisionNote} />}
            </dl>
            {approvalPending &&
              (can('orders.approve_price') && approval.requestedBy !== user?.id ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setDeciding('approve')}>
                    <CircleCheck /> Approve price
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeciding('reject')}>
                    Reject
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-subtle">
                  {approval.requestedBy === user?.id
                    ? 'You set this price, so someone else approves it.'
                    : 'Waiting for Accounts or the CEO. No payment can be taken until it is decided.'}
                </p>
              ))}
          </CardContent>
        </Card>
      )}

      {/* ── Costs put against this order ────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Costs linked to this order</CardTitle>
          {can('expenses.create') && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setLinkingCost(true)}>
                <Link2 /> Link an expense
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddingCost(true)}>
                <Plus /> Add a cost
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {expenses.length === 0 ? (
            <p className="text-sm text-muted">
              No expenses are linked to this order. Frames, printing, delivery and installation costs recorded against it appear
              here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle">
                    <th className="py-2 pr-3 font-normal">Expense</th>
                    <th className="px-3 py-2 font-normal">Category</th>
                    <th className="px-3 py-2 text-right font-normal">Amount</th>
                    <th className="px-3 py-2 font-normal">Status</th>
                    <th className="px-3 py-2 text-right font-normal">Paid</th>
                    <th className="py-2 pl-3 text-right font-normal">Still to pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="py-2.5 pr-3">
                        {hasModule('expenses') ? (
                          <Link to={`/console/expenses?expense=${expense.id}`} className="text-ink hover:text-bronze">
                            {expense.title}
                          </Link>
                        ) : (
                          <span className="text-ink">{expense.title}</span>
                        )}
                        <span className="block font-mono text-[0.6875rem] text-subtle">{expense.number}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">{expense.categoryName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatAmount(expense.amount)}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant={EXPENSE_BADGE[expense.status]}>{EXPENSE_STATUS_LABELS[expense.status]}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatAmount(expense.paidAmount)}</td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-muted">
                        {expense.status === 'approved' || expense.status === 'partially_paid' ? formatAmount(expense.outstandingAmount) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {contribution && costTotals.approved.length > 0 && (
            <div className="rounded-md bg-sand-soft px-4 py-3">
              <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <DataRow label="Order value" value={formatAmount(contribution.orderValue)} />
                <DataRow label="Collected so far" value={formatAmount(Math.max(0, money.paid - money.refunded))} />
                <DataRow label="Approved costs linked" value={formatAmount(contribution.recordedCosts)} />
                <DataRow label="Of which paid" value={formatAmount(costTotals.paid)} />
              </dl>
              <p className="mt-2 border-t border-line pt-2 text-sm text-ink">
                Contribution {formatAmount(contribution.contribution)}
                <span className="ml-2 text-xs text-muted">
                  = order value less approved costs linked here. Not money received, and not profit: overheads and unlinked costs
                  are not in it.
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── The client, when the order is for one ───────────────────────── */}
      {client && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Client</CardTitle>
            <Badge variant={client.linkedUserId ? 'success' : 'neutral'}>
              {client.linkedUserId ? 'Has an ARTINU account' : 'No ARTINU account'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium text-ink">
              {client.name}
              {client.code && <span className="ml-2 font-mono text-xs text-subtle">{client.code}</span>}
            </p>
            <p className="text-muted">
              {client.contactName} · <a href={`tel:${client.phone}`} className="hover:text-bronze">{client.phone}</a>
              {client.email && (
                <>
                  {' '}
                  · <a href={`mailto:${client.email}`} className="hover:text-bronze">{client.email}</a>
                </>
              )}
            </p>
            <p className="text-muted">
              {client.addressLine1}
              {client.addressLine2 ? `, ${client.addressLine2}` : ''}, {client.city}
              {client.pin ? ` ${client.pin}` : ''}
            </p>
            {!client.linkedUserId && can('clients.manage') && (
              <div className="pt-3">
                <LinkClientAccount clientId={client.id} clientName={client.name} onLinked={refresh} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <RecordPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        order={order}
        outstanding={money.outstanding}
        onRecorded={refresh}
      />

      <PriceDecisionDialog
        decision={deciding}
        onClose={() => setDeciding(null)}
        order={order}
        onDecided={refresh}
      />

      <ExpenseFormDialog
        open={addingCost}
        onOpenChange={setAddingCost}
        preset={{ order: { id: order.id, label: `${order.reference}${client ? ` · ${client.name}` : ''}` } }}
        onSaved={refresh}
      />

      <LinkExpenseDialog
        open={linkingCost}
        onOpenChange={setLinkingCost}
        order={order}
        linkedIds={expenses.map((expense) => expense.id)}
        onLinked={refresh}
      />
    </div>
  );
}

// ── Record a payment ───────────────────────────────────────────────────────

function RecordPaymentDialog({
  open,
  onOpenChange,
  order,
  outstanding,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  outstanding: number;
  onRecorded: () => void;
}) {
  const [form, setForm] = React.useState({
    amount: '',
    receivedOn: today(),
    method: 'upi' as PaymentMethod,
    reference: '',
    notes: '',
    key: newKey(),
  });
  const [problem, setProblem] = React.useState<string | null>(null);

  // A fresh request key every time the dialog opens: one click, one payment.
  React.useEffect(() => {
    if (!open) return;
    setForm({ amount: String(outstanding), receivedOn: today(), method: 'upi', reference: '', notes: '', key: newKey() });
    setProblem(null);
  }, [open, outstanding]);

  const record = useMutation({
    mutationFn: () =>
      consoleOrdersService.recordPayment(order.id, {
        amount: Number(form.amount),
        receivedOn: form.receivedOn,
        method: form.method,
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
        idempotencyKey: form.key,
      }),
    onSuccess: (result) => {
      toast.success(
        result.replayed
          ? 'That payment was already recorded.'
          : result.money.outstanding > 0
            ? `${formatAmount(Number(form.amount))} recorded. ${formatAmount(result.money.outstanding)} still owed.`
            : `${formatAmount(Number(form.amount))} recorded. Paid in full${result.order.status === 'confirmed' ? ' - the order is confirmed and invoiced' : ''}.`,
      );
      onOpenChange(false);
      onRecorded();
    },
    onError: (error) => setProblem(errorMessage(error)),
  });

  const amount = Number(form.amount);
  const tooMuch = Math.round(amount * 100) > Math.round(outstanding * 100);

  return (
    <Dialog open={open} onOpenChange={(next) => !record.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Money received outside the payment gateway for {order.reference}. {formatAmount(outstanding)} is owed; a smaller
            amount records a part payment.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" htmlFor="order-pay-amount" required error={tooMuch ? 'More than is owed.' : null}>
            <Input
              id="order-pay-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={outstanding}
              value={form.amount}
              invalid={tooMuch}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            />
          </Field>
          <Field label="Received on" htmlFor="order-pay-date" required>
            <DateInput
              id="order-pay-date"
              value={form.receivedOn}
              onChange={(event) => setForm((current) => ({ ...current, receivedOn: event.target.value }))}
            />
          </Field>
          <Field label="Method" htmlFor="order-pay-method" required>
            <SimpleSelect
              id="order-pay-method"
              value={form.method}
              onValueChange={(method) => setForm((current) => ({ ...current, method: method as PaymentMethod }))}
              options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
            />
          </Field>
          <Field label="Reference" htmlFor="order-pay-reference" hint="UPI, UTR or cheque number.">
            <Input
              id="order-pay-reference"
              value={form.reference}
              onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
            />
          </Field>
          <Field label="Notes" htmlFor="order-pay-notes" className="sm:col-span-2">
            <Textarea
              id="order-pay-notes"
              rows={2}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </Field>
        </div>
        {problem && (
          <p className="text-sm text-danger" role="alert">
            {problem}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={record.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={record.isPending} disabled={!(amount > 0) || tooMuch || !form.receivedOn} onClick={() => record.mutate()}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Decide a price ─────────────────────────────────────────────────────────

function PriceDecisionDialog({
  decision,
  onClose,
  order,
  onDecided,
}: {
  decision: 'approve' | 'reject' | null;
  onClose: () => void;
  order: Order;
  onDecided: () => void;
}) {
  const [note, setNote] = React.useState('');
  React.useEffect(() => setNote(''), [decision]);

  const decide = useMutation({
    mutationFn: () => consoleOrdersService.decidePrice(order.id, decision!, note.trim() || undefined),
    onSuccess: () => {
      toast.success(decision === 'approve' ? 'Price approved. Payment can now be taken.' : 'Price rejected and the order cancelled.');
      onClose();
      onDecided();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={Boolean(decision)} onOpenChange={(next) => !next && !decide.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{decision === 'approve' ? 'Approve this price' : 'Reject this price'}</DialogTitle>
          <DialogDescription>
            {decision === 'approve'
              ? `${formatAmount(order.pricing.total)} for ${order.reference}. Whoever set it is told, and payments can then be recorded.`
              : `Rejecting cancels ${order.reference}. Whoever set the price is told your reason, and can create a new order at a price that works.`}
          </DialogDescription>
        </DialogHeader>
        <Field label={decision === 'approve' ? 'Note (optional)' : 'Reason'} htmlFor="price-note" required={decision === 'reject'}>
          <Textarea id="price-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" disabled={decide.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === 'reject' ? 'danger' : 'primary'}
            loading={decide.isPending}
            disabled={decision === 'reject' && note.trim().length < 3}
            onClick={() => decide.mutate()}
          >
            {decision === 'approve' ? 'Approve price' : 'Reject and cancel order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Link an existing expense ───────────────────────────────────────────────

function LinkExpenseDialog({
  open,
  onOpenChange,
  order,
  linkedIds,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  linkedIds: string[];
  onLinked: () => void;
}) {
  const [q, setQ] = React.useState('');
  const term = useDebounced(q.trim(), 250);
  React.useEffect(() => {
    if (open) setQ('');
  }, [open]);

  const params = term ? { q: term } : {};
  const results = useQuery({
    queryKey: qk.admin.expenses(params),
    queryFn: () => financeService.expenses(params),
    enabled: open,
  });
  const candidates = (results.data ?? []).filter(
    (expense: ExpenseView) => expense.status !== 'cancelled' && !linkedIds.includes(expense.id),
  );

  const link = useMutation({
    mutationFn: (expense: ExpenseView) => financeService.linkExpenseToOrder(expense.id, order.id),
    onSuccess: (expense) => {
      toast.success(`${expense.number} now counts against ${order.reference}.`);
      onOpenChange(false);
      onLinked();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Link an expense to {order.reference}</DialogTitle>
          <DialogDescription>
            Only which order it counts against changes - its amount, approval and payments stay as they are. The move is on the
            audit trail.
          </DialogDescription>
        </DialogHeader>
        <Input icon={<Search />} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Number, title, vendor or reference" aria-label="Search expenses" />
        <div className="max-h-80 overflow-y-auto rounded-md border border-line">
          {results.isLoading ? (
            <p className="px-4 py-6 text-sm text-muted">Searching…</p>
          ) : results.isError ? (
            <p className="px-4 py-6 text-sm text-danger">{errorMessage(results.error)}</p>
          ) : candidates.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No expense you can see matches. Add a new cost instead.</p>
          ) : (
            <ul className="divide-y divide-line">
              {candidates.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{expense.title}</span>
                    <span className="block truncate text-xs text-subtle">
                      {expense.number} · {formatAmount(expense.amount)} · {EXPENSE_STATUS_LABELS[expense.status]}
                      {expense.orderReference ? ` · now on ${expense.orderReference}` : ''}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" loading={link.isPending && link.variables?.id === expense.id} onClick={() => link.mutate(expense)}>
                    <ReceiptIndianRupee /> Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
