import {
  APPROVAL_SLOT_LABELS,
  DEFAULT_APPROVAL_ROUTING,
  financeSettingsSchema,
  type ApprovalSlot,
  type ApproverOption,
  type ExpenseApprovalRouting,
  type FinanceSettingsInput,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Route, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { Input, Textarea } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { roleName } from '@/features/console/components/ExpenseDetailSheet';
import { errorMessage } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { qk } from '@/lib/query';
import { financeService } from '@/services/finance.service';

type SlotField = keyof Omit<ExpenseApprovalRouting, 'branchApprovers'>;

const SLOTS: { field: SlotField; slot: ApprovalSlot; hint: string }[] = [
  {
    field: 'defaultApproverId',
    slot: 'default',
    hint: "Operations' expenses when their branch has no approver of its own. Left empty: the manager, when there is only one.",
  },
  {
    field: 'managerExpensesApproverId',
    slot: 'manager_expenses',
    hint: 'Accounts or the CEO. Left empty: the CEO, when there is only one.',
  },
  {
    field: 'accountsExpensesApproverId',
    slot: 'accounts_expenses',
    hint: 'The CEO, or another Accounts user. Left empty: the CEO, when there is only one.',
  },
  {
    field: 'ceoExpensesApproverId',
    slot: 'ceo_expenses',
    hint: "Never chosen automatically - until someone is named here, the CEO's expenses cannot be submitted.",
  },
  {
    field: 'backupApproverId',
    slot: 'backup',
    hint: 'Takes over when the routed approver cannot act, and may decide anything routed to someone else.',
  },
];

const PERMISSION_NOTE: Record<ApprovalSlot, string> = {
  default: 'Approves expenses (expenses.approve)',
  branch: 'Approves expenses (expenses.approve)',
  backup: 'Approves expenses (expenses.approve), as backup for every route',
  manager_expenses: "Approves expenses (expenses.approve), including managers'",
  accounts_expenses: "Approves expenses (expenses.approve), including Accounts'",
  ceo_expenses: "Approves expenses (expenses.approve), explicitly designated for the CEO's",
};

const parseBranches = (text: string) => [...new Set(text.split(/\n|,/).map((name) => name.trim()).filter(Boolean))];

/**
 * The rules finance runs on: what needs an approver and who it is, how far a
 * custom price may drop before someone signs it off, and the branches costs
 * belong to. Every change is on the audit trail with its before and after.
 *
 * Approval rules - the routing and the auto-approval limit - are the CEO's:
 * anyone else could route their own expenses to themselves or raise the limit
 * past them. Others with finance settings see them, read-only.
 */
export function FinanceSettingsDialog({
  open,
  onOpenChange,
  focusApprovals = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from a "no approver" message: scroll to the routing. */
  focusApprovals?: boolean;
}) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const configures = can('expenses.configure_approvals');
  const routingRef = React.useRef<HTMLFieldSetElement>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.admin.financeSettings,
    queryFn: () => financeService.settings(),
    enabled: open,
  });
  const people = useQuery({
    queryKey: qk.admin.approverOptions,
    queryFn: () => financeService.approverOptions(),
    enabled: open,
  });

  const [form, setForm] = React.useState({
    autoApproveLimit: '0',
    priceOverrideApprovalPercent: '15',
    branches: '',
  });
  const [routing, setRouting] = React.useState<ExpenseApprovalRouting>(DEFAULT_APPROVAL_ROUTING);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !data) return;
    setForm({
      autoApproveLimit: String(data.autoApproveLimit),
      priceOverrideApprovalPercent: String(data.priceOverrideApprovalPercent),
      branches: data.branches.join('\n'),
    });
    setRouting({ ...DEFAULT_APPROVAL_ROUTING, ...data.approvalRouting });
    setProblem(null);
  }, [open, data]);

  React.useEffect(() => {
    if (open && focusApprovals && data) {
      const timer = setTimeout(() => routingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      return () => clearTimeout(timer);
    }
  }, [open, focusApprovals, data]);

  const refreshExpenses = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'expenses'] });
  };

  const save = useMutation({
    mutationFn: (settings: FinanceSettingsInput) => financeService.updateSettings(settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.admin.financeSettings, saved);
      refreshExpenses();
      toast.success('Finance settings saved.');
      onOpenChange(false);
    },
    onError: (mutationError) => setProblem(errorMessage(mutationError)),
  });

  const routeWaiting = useMutation({
    mutationFn: () => financeService.routePending(),
    onSuccess: (result) => {
      refreshExpenses();
      const unresolved = result.unresolved.length;
      toast[unresolved ? 'warning' : 'success'](
        `${result.assigned.length} assigned, ${result.unchanged} already had an approver` +
          (unresolved ? `, ${unresolved} still without one: ${result.unresolved[0]!.problem}` : '.'),
      );
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  const branches = parseBranches(form.branches);

  const submit = () => {
    const parsed = financeSettingsSchema.safeParse({
      autoApproveLimit: form.autoApproveLimit.trim() || '0',
      requireSeparateApprover: true,
      priceOverrideApprovalPercent: form.priceOverrideApprovalPercent.trim() || '0',
      branches,
      approvalRouting: {
        ...routing,
        branchApprovers: Object.fromEntries(
          Object.entries(routing.branchApprovers).filter(([branch, id]) => branches.includes(branch) && id),
        ),
      },
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the values.');
      return;
    }
    setProblem(null);
    save.mutate(parsed.data);
  };

  const options = people.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Finance settings</DialogTitle>
          <DialogDescription>Changes apply from now on. Decisions already made are not revisited.</DialogDescription>
        </DialogHeader>

        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <form
            className="space-y-7"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="space-y-5">
              <Field
                label="Approve automatically up to (₹)"
                htmlFor="finance-auto-limit"
                hint={
                  configures
                    ? 'A submitted expense at or below this skips approval. 0 means every expense is approved by a person.'
                    : 'Set by the CEO. 0 means every expense is approved by a person.'
                }
              >
                <Input
                  id="finance-auto-limit"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  disabled={!configures}
                  value={form.autoApproveLimit}
                  onChange={(event) => setForm((current) => ({ ...current, autoApproveLimit: event.target.value }))}
                />
              </Field>

              <p className="text-sm text-ink-soft">
                Nobody approves their own expense.{' '}
                <span className="text-xs text-subtle">Always enforced, for every role including the CEO.</span>
              </p>

              <Field
                label="Custom price needs approval below (% off standard)"
                htmlFor="finance-price-percent"
                hint="A custom-priced order that takes more than this off the standard price waits for someone who can approve prices."
              >
                <Input
                  id="finance-price-percent"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="1"
                  value={form.priceOverrideApprovalPercent}
                  onChange={(event) => setForm((current) => ({ ...current, priceOverrideApprovalPercent: event.target.value }))}
                />
              </Field>

              <Field label="Branches" htmlFor="finance-branches" hint="One per line. Expenses can be attributed to these.">
                <Textarea
                  id="finance-branches"
                  rows={3}
                  value={form.branches}
                  onChange={(event) => setForm((current) => ({ ...current, branches: event.target.value }))}
                />
              </Field>
            </div>

            <fieldset ref={routingRef} className="min-w-0 scroll-mt-4 border-t border-line pt-6">
              <legend className="flex items-center gap-2 pr-2 font-display text-xl text-ink">
                <Route className="size-4 text-bronze" aria-hidden /> Expense approval routing
              </legend>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Every submitted expense goes to one named approver, chosen here, and nobody is ever routed their own.
                {!configures && ' Only the CEO can change this.'}
              </p>

              {people.isError ? (
                <p className="mt-4 text-sm text-danger">{errorMessage(people.error)}</p>
              ) : (
                <div className="mt-5 space-y-5">
                  {SLOTS.map(({ field, slot, hint }) => (
                    <ApproverPicker
                      key={field}
                      id={`routing-${field}`}
                      label={APPROVAL_SLOT_LABELS[slot]}
                      hint={hint}
                      slot={slot}
                      value={routing[field]}
                      options={options}
                      disabled={!configures}
                      loading={people.isLoading}
                      onChange={(value) => setRouting((current) => ({ ...current, [field]: value }))}
                    />
                  ))}

                  <div className="space-y-4 rounded-md border border-line p-4">
                    <p className="text-[0.8125rem] font-medium text-ink-soft">Branch approvers</p>
                    <p className="-mt-3 text-xs text-subtle">
                      Operations&apos; expenses for a branch go to its approver - normally that branch&apos;s manager.
                    </p>
                    {branches.map((branch) => (
                      <ApproverPicker
                        key={branch}
                        id={`routing-branch-${branch}`}
                        label={branch}
                        slot="branch"
                        branch={branch}
                        value={routing.branchApprovers[branch] ?? null}
                        options={options}
                        disabled={!configures}
                        loading={people.isLoading}
                        onChange={(value) =>
                          setRouting((current) => {
                            const next = { ...current.branchApprovers };
                            if (value) next[branch] = value;
                            else delete next[branch];
                            return { ...current, branchApprovers: next };
                          })
                        }
                      />
                    ))}
                  </div>

                  {configures && (
                    <div className="rounded-md bg-sand-soft px-4 py-3">
                      <p className="text-sm text-ink-soft">Expenses already waiting</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Give every waiting expense that has no workable approver one from the saved routing. Expenses with a
                        sound approver are left as they are; each change is audited. Save first if you changed the routing.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        loading={routeWaiting.isPending}
                        onClick={() => routeWaiting.mutate()}
                      >
                        Route waiting expenses
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </fieldset>

            {problem && (
              <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {problem}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                Save settings
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One routing slot: a choice of the people eligible for it, and the chosen
 * person spelled out - name, email, role, branch and the permission that makes
 * them eligible - so nobody has to guess who "the approver" is.
 */
function ApproverPicker({
  id,
  label,
  hint,
  slot,
  branch,
  value,
  options,
  disabled,
  loading,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  slot: ApprovalSlot;
  branch?: string;
  value: string | null;
  options: ApproverOption[];
  disabled: boolean;
  loading: boolean;
  onChange: (value: string | null) => void;
}) {
  const eligible = options.filter((option) => option.slots.includes(slot));
  const chosen = value ? options.find((option) => option.id === value) : undefined;
  const chosenFits = Boolean(chosen?.slots.includes(slot));

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <SimpleSelect
        id={id}
        value={value ?? 'none'}
        disabled={disabled || loading}
        onValueChange={(next) => onChange(next === 'none' ? null : next)}
        options={[
          { value: 'none', label: loading ? 'Loading staff…' : 'Not set' },
          ...eligible.map((option) => ({ value: option.id, label: `${option.name} - ${roleName(option.role)}` })),
          // Someone chosen earlier who is no longer eligible still shows, flagged below.
          ...(value && !chosenFits ? [{ value, label: `${chosen?.name ?? 'Unknown account'} (not eligible)` }] : []),
        ]}
      />
      {value && (
        <dl
          className={
            chosenFits
              ? 'mt-2 grid gap-x-4 gap-y-0.5 rounded-md bg-sand-soft px-3 py-2 text-xs sm:grid-cols-[auto_1fr]'
              : 'mt-2 grid gap-x-4 gap-y-0.5 rounded-md border border-danger/25 bg-danger-soft/50 px-3 py-2 text-xs sm:grid-cols-[auto_1fr]'
          }
        >
          <dt className="text-subtle">Name</dt>
          <dd className="text-ink">{chosen?.name ?? 'Unknown account'}</dd>
          <dt className="text-subtle">Email</dt>
          <dd className="text-ink-soft">{chosen?.email ?? '-'}</dd>
          <dt className="text-subtle">Role</dt>
          <dd className="text-ink-soft">{chosen ? roleName(chosen.role) : '-'}</dd>
          {branch && (
            <>
              <dt className="text-subtle">Branch</dt>
              <dd className="text-ink-soft">{branch}</dd>
            </>
          )}
          <dt className="text-subtle">Permission</dt>
          <dd className={chosenFits ? 'text-ink-soft' : 'text-danger'}>
            {chosenFits
              ? PERMISSION_NOTE[slot]
              : !chosen
                ? 'This account no longer exists. Routing passes over it.'
                : !chosen.active
                  ? 'Not an active account. Routing passes over them.'
                  : 'Not eligible for this slot. Routing passes over them.'}
          </dd>
        </dl>
      )}
    </Field>
  );
}
