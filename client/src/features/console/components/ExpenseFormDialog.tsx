import {
  APPROVAL_SETTINGS_PATH,
  EXPENSE_PAYMENT_ARRANGEMENT_LABELS,
  EXPENSE_PAYMENT_ARRANGEMENTS,
  expenseInputSchema,
  formatAmount,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type ExpenseInput,
  type ExpensePaymentArrangement,
  type ExpenseView,
  type PaymentMethod,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Paperclip, Search, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Label } from '@/components/ui/field';
import { DateInput, Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { useDebounced } from '@/hooks/useDebounced';
import { errorMessage, fieldErrors, toApiError } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { fileToBase64, formatBytes, isHeicFile } from '@/lib/utils';
import { consoleOrdersService } from '@/services/console-orders.service';
import { financeService } from '@/services/finance.service';

// ── Receipts ─────────────────────────────────────────────────────────────────

export const RECEIPT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif,.pdf';
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Why this file cannot be a receipt, or null if it can. Mirrors the server's own check. */
export function receiptProblem(file: File): string | null {
  const known =
    /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i.test(file.type) ||
    /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);
  if (!known) return 'Attach a photograph (JPEG, PNG, WebP, HEIC) or a PDF.';
  if (file.size > RECEIPT_MAX_BYTES) return `That file is ${formatBytes(file.size)}. Receipts can be up to 10 MB.`;
  return null;
}

/**
 * The receipt as a data URL the private store accepts. Same problem as
 * fileToImageDataUrl: a desktop picker often reports no type for a HEIC, and
 * the server refuses a data URL without one.
 */
export async function receiptDataUrl(file: File): Promise<string> {
  const raw = await fileToBase64(file);
  const type = isHeicFile(file)
    ? 'image/heic'
    : /\.pdf$/i.test(file.name)
      ? 'application/pdf'
      : file.type || 'image/jpeg';
  return raw.replace(/^data:[^;,]*(;[^,]*)?;base64,/i, `data:${type};base64,`);
}

// ── The form ─────────────────────────────────────────────────────────────────

/** Where the dialog was opened from, when that decides part of the answer. */
export interface ExpensePreset {
  order?: { id: string; label: string };
}

interface Draft {
  title: string;
  categoryId: string;
  amount: string;
  expenseDate: string;
  paymentArrangement: ExpensePaymentArrangement | '';
  paymentMethod: PaymentMethod | '';
  vendor: string;
  transactionReference: string;
  branch: string;
  paidBy: string;
  notes: string;
  order: { id: string; label: string } | null;
  customer: { clientId: string | null; spaceId: string | null; label: string } | null;
  receipt: { dataUrl: string; fileName: string; size: number } | null;
}

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function draftFrom(expense: ExpenseView | null | undefined, preset: ExpensePreset | undefined): Draft {
  const linkedCustomer = !expense?.orderId && (expense?.clientId || expense?.spaceId);
  return {
    title: expense?.title ?? '',
    categoryId: expense?.categoryId ?? '',
    amount: expense ? String(expense.amount) : '',
    expenseDate: expense ? String(expense.expenseDate).slice(0, 10) : today(),
    paymentArrangement: expense?.paymentArrangement ?? '',
    paymentMethod: expense?.paymentMethod ?? '',
    vendor: expense?.vendor ?? '',
    transactionReference: expense?.transactionReference ?? '',
    branch: expense?.branch ?? '',
    paidBy: expense?.paidBy ?? '',
    notes: expense?.notes ?? '',
    order: expense?.orderId
      ? { id: expense.orderId, label: expense.orderReference ?? 'Linked order' }
      : (preset?.order ?? null),
    customer: expense && linkedCustomer
      ? { clientId: expense.clientId ?? null, spaceId: expense.spaceId ?? null, label: expense.clientName ?? 'Linked customer' }
      : null,
    receipt: null,
  };
}

const ARRANGEMENT_HINTS: Record<ExpensePaymentArrangement, string> = {
  unpaid: 'A supplier or a bill still waiting to be paid.',
  employee_reimbursable: 'Someone paid out of their own pocket. Finance pays them back.',
  company_paid: "ARTINU's own account or card has paid. Finance records that payment against it.",
};

/** Who-paid applies when someone's money has actually gone out. */
const asksWhoPaid = (arrangement: Draft['paymentArrangement']) =>
  arrangement === 'employee_reimbursable' || arrangement === 'company_paid';

/**
 * Record an expense, or correct a draft or a rejected one.
 *
 * "Payment status" here is what the person entering it knows - unpaid, paid by
 * a colleague, or paid by the company - and nothing more. It never marks the
 * expense paid: that happens only when finance records a payment against it,
 * after approval. The form says so, because "I paid this" and "the books show
 * this as paid" are different facts and an expense system that conflates them
 * pays people twice.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  preset,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this one; otherwise a new expense. */
  expense?: ExpenseView | null;
  preset?: ExpensePreset;
  onSaved?: (expense: ExpenseView) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(expense, preset));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [reading, setReading] = React.useState(false);
  const [routingProblem, setRoutingProblem] = React.useState<string | null>(null);
  const { can } = usePermissions();
  const navigate = useNavigate();

  // A fresh form every time it opens, filled from the expense being edited.
  React.useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(expense, preset));
    setErrors({});
    setRoutingProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const categories = useQuery({
    queryKey: qk.admin.expenseCategories(false),
    queryFn: () => financeService.categories(false),
    enabled: open,
  });
  const settings = useQuery({
    queryKey: qk.admin.financeSettings,
    queryFn: () => financeService.settings(),
    enabled: open,
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const { [key]: _cleared, ...rest } = current;
      return rest;
    });
  };

  const save = useMutation({
    mutationFn: (input: ExpenseInput) =>
      expense ? financeService.updateExpense(expense.id, input) : financeService.createExpense(input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders', 'finance'] });
      toast.success(
        saved.status === 'approved'
          ? `${saved.number} approved automatically - it is within the auto-approval limit. Finance still records the payment.`
          : saved.status === 'pending_approval'
            ? `${saved.number} sent for approval.`
            : `${saved.number} saved as a draft.`,
      );
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (error) => {
      // Nobody can approve it yet: nothing was saved, and the form says what to do about it.
      if (toApiError(error).code === 'no_eligible_approver') {
        setRoutingProblem(errorMessage(error));
        return;
      }
      const fields = fieldErrors(error);
      if (Object.keys(fields).length > 0) setErrors(fields);
      toast.error(errorMessage(error));
    },
  });

  const submitWith = (submit: boolean) => {
    setRoutingProblem(null);
    const whoPaid = asksWhoPaid(draft.paymentArrangement);
    const parsed = expenseInputSchema.safeParse({
      title: draft.title,
      categoryId: draft.categoryId,
      // Empty coerces to 0, which reads as "must be more than zero".
      amount: draft.amount.trim(),
      expenseDate: draft.expenseDate,
      paymentArrangement: draft.paymentArrangement || undefined,
      paymentMethod: draft.paymentMethod || null,
      vendor: draft.vendor || null,
      transactionReference: draft.transactionReference || null,
      branch: draft.branch || null,
      orderId: draft.order?.id ?? null,
      clientId: draft.order ? null : (draft.customer?.clientId ?? null),
      spaceId: draft.order ? null : (draft.customer?.spaceId ?? null),
      paidBy: whoPaid ? draft.paidBy || null : null,
      notes: draft.notes || null,
      receipt: draft.receipt ? { dataUrl: draft.receipt.dataUrl, fileName: draft.receipt.fileName } : null,
      submit,
    });
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        found[key] ??= issue.message;
      }
      setErrors(found);
      return;
    }
    save.mutate(parsed.data);
  };

  const pickReceipt = async (file: File | undefined) => {
    if (!file) return;
    const problem = receiptProblem(file);
    if (problem) {
      setErrors((current) => ({ ...current, receipt: problem }));
      return;
    }
    setReading(true);
    try {
      set('receipt', { dataUrl: await receiptDataUrl(file), fileName: file.name, size: file.size });
    } catch {
      setErrors((current) => ({ ...current, receipt: 'That file could not be read. Try saving it again first.' }));
    } finally {
      setReading(false);
    }
  };

  const categoryOptions = React.useMemo(() => {
    const options = (categories.data ?? []).map((category) => ({ value: category.id, label: category.name }));
    // A category retired since this expense was recorded still has to show.
    if (expense && !options.some((option) => option.value === expense.categoryId)) {
      options.push({ value: expense.categoryId, label: `${expense.categoryName} (retired)` });
    }
    return options;
  }, [categories.data, expense]);

  const branches = settings.data?.branches ?? [];
  const autoLimit = settings.data?.autoApproveLimit ?? 0;
  const resubmitting = expense?.status === 'rejected';
  const busy = save.isPending || reading;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{expense ? `Edit ${expense.number}` : 'Add an expense'}</DialogTitle>
          <DialogDescription>
            {expense
              ? 'Changes are recorded on the audit trail.'
              : 'Record what was spent. It goes to an approver, then finance records the payment.'}
          </DialogDescription>
        </DialogHeader>

        {resubmitting && expense?.rejectionReason && (
          <p className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger-soft/50 px-3.5 py-3 text-sm text-ink-soft">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <span>
              <span className="font-medium text-ink">Returned: </span>
              {expense.rejectionReason}
            </span>
          </p>
        )}

        <form
          className="space-y-7"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitWith(true);
          }}
        >
          <FormSection title="What it was">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="expense-title" required error={errors.title} className="sm:col-span-2">
                <Input
                  id="expense-title"
                  value={draft.title}
                  onChange={(event) => set('title', event.target.value)}
                  placeholder="Fuel for the Koramangala installation"
                  invalid={Boolean(errors.title)}
                  maxLength={140}
                />
              </Field>
              <Field label="Category" htmlFor="expense-category" required error={errors.categoryId}>
                <SimpleSelect
                  id="expense-category"
                  value={draft.categoryId}
                  onValueChange={(value) => set('categoryId', value)}
                  options={categoryOptions}
                  placeholder={categories.isLoading ? 'Loading categories…' : 'Choose a category'}
                  invalid={Boolean(errors.categoryId)}
                />
              </Field>
              <Field label="Amount (₹)" htmlFor="expense-amount" required error={errors.amount}>
                <Input
                  id="expense-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={draft.amount}
                  onChange={(event) => set('amount', event.target.value)}
                  placeholder="0.00"
                  invalid={Boolean(errors.amount)}
                />
              </Field>
              <Field
                label="Expense date"
                htmlFor="expense-date"
                required
                hint="The day the cost was incurred."
                error={errors.expenseDate}
              >
                <DateInput
                  id="expense-date"
                  value={draft.expenseDate}
                  onChange={(event) => set('expenseDate', event.target.value)}
                  invalid={Boolean(errors.expenseDate)}
                />
              </Field>
              <Field label="Vendor or payee" htmlFor="expense-vendor" error={errors.vendor}>
                <Input
                  id="expense-vendor"
                  value={draft.vendor}
                  onChange={(event) => set('vendor', event.target.value)}
                  placeholder="Indian Oil, Koramangala"
                  maxLength={140}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Payment status">
            <div className="space-y-4">
              <div>
                <Label id="expense-arrangement-label" required>
                  Has it been paid?
                </Label>
                <RadioGroup
                  className="mt-2"
                  aria-labelledby="expense-arrangement-label"
                  value={draft.paymentArrangement}
                  onValueChange={(value) => set('paymentArrangement', value as ExpensePaymentArrangement)}
                >
                  {EXPENSE_PAYMENT_ARRANGEMENTS.map((value) => (
                    <label
                      key={value}
                      htmlFor={`expense-arrangement-${value}`}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface px-3.5 py-3 transition-colors hover:border-line-strong has-data-[state=checked]:border-ink"
                    >
                      <RadioGroupItem id={`expense-arrangement-${value}`} value={value} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm text-ink">{EXPENSE_PAYMENT_ARRANGEMENT_LABELS[value]}</span>
                        <span className="block text-xs text-muted">{ARRANGEMENT_HINTS[value]}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
                {errors.paymentArrangement ? (
                  <p className="mt-1.5 text-xs text-danger" role="alert">
                    {errors.paymentArrangement}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-subtle">
                    This records how things stand. The expense shows as paid only once finance records the payment.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {asksWhoPaid(draft.paymentArrangement) && (
                  <Field
                    label={draft.paymentArrangement === 'employee_reimbursable' ? 'Who paid' : 'Paid by'}
                    htmlFor="expense-paid-by"
                    required={draft.paymentArrangement === 'employee_reimbursable'}
                    hint={
                      draft.paymentArrangement === 'employee_reimbursable'
                        ? 'The person finance will reimburse.'
                        : 'The card holder or account, if useful.'
                    }
                    error={errors.paidBy}
                    className="sm:col-span-2"
                  >
                    <Input
                      id="expense-paid-by"
                      value={draft.paidBy}
                      onChange={(event) => set('paidBy', event.target.value)}
                      placeholder={draft.paymentArrangement === 'employee_reimbursable' ? 'Rahul Menon' : 'Company HDFC card'}
                      invalid={Boolean(errors.paidBy)}
                      maxLength={120}
                    />
                  </Field>
                )}
                <Field label="Payment method" htmlFor="expense-method">
                  <SimpleSelect
                    id="expense-method"
                    value={draft.paymentMethod || 'none'}
                    onValueChange={(value) => set('paymentMethod', value === 'none' ? '' : (value as PaymentMethod))}
                    options={[
                      { value: 'none', label: 'Not known yet' },
                      ...PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] })),
                    ]}
                  />
                </Field>
                <Field label="Transaction reference" htmlFor="expense-reference" hint="UPI reference, bill or invoice number.">
                  <Input
                    id="expense-reference"
                    value={draft.transactionReference}
                    onChange={(event) => set('transactionReference', event.target.value)}
                    maxLength={120}
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection title="Where it belongs" hint="Optional. Linking a cost to an order counts it against that order's contribution.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Branch" htmlFor="expense-branch" error={errors.branch}>
                <SimpleSelect
                  id="expense-branch"
                  value={draft.branch || 'none'}
                  onValueChange={(value) => set('branch', value === 'none' ? '' : value)}
                  options={[
                    { value: 'none', label: 'Not branch-specific' },
                    ...branches.map((name) => ({ value: name, label: name })),
                  ]}
                  invalid={Boolean(errors.branch)}
                />
              </Field>
              <Field label="Related order" htmlFor="expense-order" error={errors.orderId}>
                <OrderPicker value={draft.order} onChange={(value) => set('order', value)} enabled={open} />
              </Field>
              <Field
                label="Related customer"
                htmlFor="expense-customer"
                hint={draft.order ? 'Taken from the order.' : 'For a cost that belongs to a client but no single order.'}
                error={errors.clientId ?? errors.spaceId}
                className="sm:col-span-2"
              >
                {draft.order ? (
                  <Picked label="The order's customer" />
                ) : (
                  <CustomerPicker value={draft.customer} onChange={(value) => set('customer', value)} enabled={open} />
                )}
              </Field>
            </div>
          </FormSection>

          <FormSection title="Receipt and notes">
            <div className="space-y-4">
              <Field
                label="Receipt or bill"
                htmlFor="expense-receipt"
                hint={
                  expense?.hasReceipt && !draft.receipt
                    ? `On file: ${expense.receiptName ?? 'receipt'}. Choosing another keeps the old one on record.`
                    : 'A photo or PDF, up to 10 MB. Stored privately - only staff who can see this expense can open it.'
                }
                error={errors.receipt}
              >
                {draft.receipt ? (
                  <Picked
                    label={`${draft.receipt.fileName} · ${formatBytes(draft.receipt.size)}`}
                    icon={<Paperclip className="size-3.5" aria-hidden />}
                    onClear={() => set('receipt', null)}
                  />
                ) : (
                  <label
                    htmlFor="expense-receipt"
                    className="flex h-11 cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-line-strong bg-surface px-3.5 text-sm text-muted transition-colors hover:border-bronze hover:text-ink"
                  >
                    {reading ? (
                      <Loader2 className="size-4 animate-spin text-bronze" aria-hidden />
                    ) : (
                      <Paperclip className="size-4 text-bronze" aria-hidden />
                    )}
                    {reading ? 'Reading the file…' : 'Choose a file'}
                    <input
                      id="expense-receipt"
                      type="file"
                      accept={RECEIPT_ACCEPT}
                      className="sr-only"
                      onChange={(event) => {
                        void pickReceipt(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                )}
              </Field>
              <Field label="Notes" htmlFor="expense-notes" error={errors.notes}>
                <Textarea
                  id="expense-notes"
                  rows={3}
                  value={draft.notes}
                  onChange={(event) => set('notes', event.target.value)}
                  maxLength={1000}
                  placeholder="Anything the approver should know."
                />
              </Field>
            </div>
          </FormSection>

          {autoLimit > 0 && (
            <p className="text-xs text-subtle">
              Expenses up to {formatAmount(autoLimit)} are approved automatically when submitted.
            </p>
          )}

          {routingProblem && (
            <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft/50 px-3.5 py-3 text-sm text-ink-soft">
              <p className="flex items-start gap-2.5">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span>
                  <span className="font-medium text-ink">Not submitted - nothing was saved. </span>
                  {routingProblem}
                </span>
              </p>
              <p className="mt-2 pl-6.5 text-xs text-muted">
                {can('expenses.configure_approvals')
                  ? 'Set an approver, then submit again - or save it as a draft for now.'
                  : 'Whoever configures expense approvals has been told. Save it as a draft for now and submit it once they have set an approver.'}
              </p>
              {can('expenses.configure_approvals') && (
                <div className="mt-3 pl-6.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(APPROVAL_SETTINGS_PATH);
                    }}
                  >
                    Open approval settings
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              loading={save.isPending && save.variables?.submit === false}
              onClick={() => submitWith(false)}
            >
              {expense ? 'Save changes' : 'Save as draft'}
            </Button>
            <Button type="submit" disabled={busy} loading={save.isPending && save.variables?.submit === true}>
              {resubmitting ? 'Resubmit for approval' : 'Submit for approval'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="eyebrow eyebrow-muted">{title}</legend>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

/** A chosen value, shown in place of the control that chose it. */
function Picked({ label, icon, onClear }: { label: string; icon?: React.ReactNode; onClear?: () => void }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 rounded-md border border-line bg-sand-soft px-3.5 text-sm text-ink">
      <span className="flex min-w-0 items-center gap-2 truncate">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-sm p-1 text-subtle transition-colors hover:bg-sand hover:text-ink"
          aria-label={`Remove ${label}`}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Results({ loading, empty, children }: { loading: boolean; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 max-h-56 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-subtle">
      {loading && empty ? (
        <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching…
        </p>
      ) : empty ? (
        <p className="px-2.5 py-2 text-sm text-muted">Nothing matches.</p>
      ) : (
        children
      )}
    </div>
  );
}

const resultClass =
  'flex w-full items-baseline justify-between gap-3 rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-sand-soft focus:bg-sand-soft focus:outline-none';

function OrderPicker({
  value,
  onChange,
  enabled,
}: {
  value: Draft['order'];
  onChange: (value: Draft['order']) => void;
  enabled: boolean;
}) {
  const [q, setQ] = React.useState('');
  const term = useDebounced(q.trim(), 250);
  const options = useQuery({
    queryKey: ['admin', 'expenses', 'order-options', term],
    queryFn: () => financeService.orderOptions(term),
    enabled: enabled && !value && term.length >= 2,
  });

  if (value) return <Picked label={value.label} onClear={() => onChange(null)} />;

  return (
    <div>
      <Input
        id="expense-order"
        icon={<Search />}
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Order reference or customer"
        autoComplete="off"
      />
      {term.length >= 2 && (
        <Results loading={options.isFetching} empty={(options.data ?? []).length === 0}>
          {(options.data ?? []).map((option) => (
            <button
              key={option.id}
              type="button"
              className={resultClass}
              onClick={() => {
                onChange({ id: option.id, label: `${option.reference} · ${option.customer}` });
                setQ('');
              }}
            >
              <span className="font-mono text-xs text-ink">{option.reference}</span>
              <span className="truncate text-sm text-muted">{option.customer}</span>
            </button>
          ))}
        </Results>
      )}
    </div>
  );
}

function CustomerPicker({
  value,
  onChange,
  enabled,
}: {
  value: Draft['customer'];
  onChange: (value: Draft['customer']) => void;
  enabled: boolean;
}) {
  const [q, setQ] = React.useState('');
  const term = useDebounced(q.trim(), 250);
  const results = useQuery({
    queryKey: qk.admin.clients(term),
    queryFn: () => consoleOrdersService.searchClients(term),
    enabled: enabled && !value && term.length >= 2,
  });

  if (value) return <Picked label={value.label} onClear={() => onChange(null)} />;

  return (
    <div>
      <Input
        id="expense-customer"
        icon={<Search />}
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Business, contact, phone or email"
        autoComplete="off"
      />
      {term.length >= 2 && (
        <Results loading={results.isFetching} empty={(results.data ?? []).length === 0}>
          {(results.data ?? []).map((result) => (
            <button
              key={`${result.kind}-${result.clientId ?? result.spaceId}`}
              type="button"
              className={resultClass}
              onClick={() => {
                onChange({
                  clientId: result.clientId,
                  spaceId: result.spaceId,
                  label: [result.name, result.city].filter(Boolean).join(', '),
                });
                setQ('');
              }}
            >
              <span className="truncate text-sm text-ink">{result.name}</span>
              <span className="shrink-0 text-xs text-subtle">
                {[result.city, result.hasAccount ? 'has an account' : 'no account'].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </Results>
      )}
    </div>
  );
}
