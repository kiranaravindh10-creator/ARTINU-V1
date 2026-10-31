import { z } from 'zod';
import { isMoneyAmount } from './money.js';

/**
 * Expenses, the transaction register and the finance settings behind them.
 *
 * ── What this is, and what it is not ────────────────────────────────────────
 *
 * ARTINU needs to see money going out as clearly as money coming in. This is a
 * practical operational ledger for that: every customer collection, refund and
 * expense payment, each traceable to the record it came from. It is NOT
 * double-entry bookkeeping and the Console never calls it that - there are no
 * journals, no chart of accounts and no balance sheet, and a register that
 * pretended otherwise would mislead whoever files the returns.
 */

// ── Expense workflow ─────────────────────────────────────────────────────────

export const EXPENSE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'partially_paid',
  'paid',
  'cancelled',
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

/** Statuses in which the details may still be edited. Anything later is final. */
export const EDITABLE_EXPENSE_STATUSES: readonly ExpenseStatus[] = ['draft', 'rejected'];

/**
 * Statuses that count as a real business expense in reports. Drafts are not
 * yet claimed, rejected ones were refused, cancelled ones were reversed.
 */
export const RECOGNISED_EXPENSE_STATUSES: readonly ExpenseStatus[] = [
  'approved',
  'partially_paid',
  'paid',
];

/**
 * The categories ARTINU starts with. They are rows, not code: the Finance
 * Manager can rename, add or retire them, and the migration seeds these once.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { slug: 'transport-fuel', name: 'Transportation and fuel' },
  { slug: 'delivery-logistics', name: 'Delivery and logistics' },
  { slug: 'frame-manufacturing', name: 'Frame manufacturing' },
  { slug: 'printing', name: 'Printing' },
  { slug: 'packaging', name: 'Packaging' },
  { slug: 'installation', name: 'Installation' },
  { slug: 'artist-payments', name: 'Artist payments and commissions' },
  { slug: 'salaries', name: 'Employee salaries' },
  { slug: 'rent-utilities', name: 'Rent and utilities' },
  { slug: 'marketing', name: 'Marketing and advertising' },
  { slug: 'software', name: 'Software subscriptions' },
  { slug: 'hosting', name: 'Website hosting and infrastructure' },
  { slug: 'travel', name: 'Travel and accommodation' },
  { slug: 'office-supplies', name: 'Office supplies' },
  { slug: 'equipment', name: 'Equipment and maintenance' },
  { slug: 'bank-charges', name: 'Bank and payment gateway charges' },
  { slug: 'taxes', name: 'Taxes and statutory expenses' },
  { slug: 'misc', name: 'Miscellaneous' },
] as const;

/**
 * Payment status at the moment an expense is recorded.
 *
 * The expense's own status (paid, partially paid) follows the payments finance
 * records. This is what the person recording it knows at that moment - which
 * decides who finance will be paying: a supplier, or a colleague who paid out
 * of their own pocket.
 */
export const EXPENSE_PAYMENT_ARRANGEMENTS = ['unpaid', 'employee_reimbursable', 'company_paid'] as const;
export type ExpensePaymentArrangement = (typeof EXPENSE_PAYMENT_ARRANGEMENTS)[number];

export const EXPENSE_PAYMENT_ARRANGEMENT_LABELS: Record<ExpensePaymentArrangement, string> = {
  unpaid: 'Not paid yet - ARTINU to pay',
  employee_reimbursable: 'Paid by an employee - to be reimbursed',
  company_paid: 'Already paid by ARTINU - to be recorded',
};

/** How money moved, for expenses and for offline collections alike. */
export const PAYMENT_METHODS = ['upi', 'cash', 'bank_transfer', 'card', 'cheque', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

export interface ExpenseCategory {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  /** EXP-2026-0001, issued by the server. */
  number: string;
  title: string;
  categoryId: string;
  /** Rupees, two decimals. */
  amount: number;
  /** YYYY-MM-DD - the day the cost was incurred, not the day it was typed in. */
  expenseDate: string;
  status: ExpenseStatus;
  /**
   * How the money stood when the expense was recorded - the "payment status"
   * the person entering it knows. Informational: it never marks anything paid
   * in the books. Only a recorded ExpensePayment does that.
   */
  paymentArrangement: ExpensePaymentArrangement;
  vendor?: string | null;
  /** How it was (or will be) paid. The actual payments are ExpensePayment rows. */
  paymentMethod?: PaymentMethod | null;
  transactionReference?: string | null;
  branch?: string | null;
  orderId?: string | null;
  clientId?: string | null;
  spaceId?: string | null;
  /** Who paid out of pocket, e.g. the employee who bought fuel for an installation. */
  paidBy?: string | null;
  notes?: string | null;
  /** Private storage path. Never a public URL - see the receipt endpoint. */
  receiptPath?: string | null;
  receiptName?: string | null;
  receiptType?: string | null;
  createdBy: string | null;
  createdByEmail?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedByEmail?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  /**
   * Who has to decide it. Chosen by the approval routing when it is submitted,
   * and changed after that only by an administrator reassigning it. Null on a
   * draft, and on an expense submitted before routing existed.
   */
  approverId?: string | null;
  approverEmail?: string | null;
  /** Which rule chose the approver - see APPROVAL_ROUTE_LABELS. */
  approvalRoute?: ApprovalRoute | null;
  approverAssignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensePayment {
  id: string;
  expenseId: string;
  amount: number;
  /** YYYY-MM-DD */
  paidOn: string;
  method: PaymentMethod;
  reference?: string | null;
  paidBy?: string | null;
  notes?: string | null;
  recordedBy: string | null;
  recordedByEmail?: string | null;
  /** Client-generated key: a retried request returns the first payment, never a second. */
  idempotencyKey?: string | null;
  reversedAt?: string | null;
  reversedBy?: string | null;
  reversalReason?: string | null;
  createdAt: string;
}

/** An expense as the Console shows it: the row plus what has actually been paid. */
export interface ExpenseView extends Expense {
  categoryName: string;
  paidAmount: number;
  outstandingAmount: number;
  orderReference?: string | null;
  clientName?: string | null;
  hasReceipt: boolean;
  payments?: ExpensePayment[];
  createdByName?: string | null;
  /** The assigned approver as their account stands now. */
  approver?: { id: string; name: string; email: string; role: string; active: boolean } | null;
  /** Why nobody valid is assigned to this waiting expense, when that is the case. */
  approvalProblem?: string | null;
  /** Whether the person asking may approve or reject it - the server's answer, not a guess. */
  mayDecide?: boolean;
  /** They may, but as the backup approver rather than the assigned one. */
  decidesAsBackup?: boolean;
}

// ── Approval routing ─────────────────────────────────────────────────────────

/**
 * Who approves which expenses - Finance → Settings → Expense approval routing.
 *
 * Every slot holds a user id. When an expense is submitted the routing is read
 * in this order, and the first eligible person who is not the submitter is
 * assigned:
 *
 *   operations and other staff   branch approver → default approver → the only active manager
 *   a manager                    approver for managers' expenses → the only active CEO
 *   Accounts                     approver for Accounts' expenses → the only active CEO
 *   the CEO                      the approver the CEO designated - never chosen automatically
 *
 * and the backup approver after any of them. With nobody eligible, the
 * submission is refused with a configuration error rather than left waiting
 * for no one.
 */
export interface ExpenseApprovalRouting {
  defaultApproverId: string | null;
  /** Branch name → approver, normally that branch's manager. */
  branchApprovers: Record<string, string>;
  /** Steps in when the routed approver cannot, and may decide any expense routed to someone else. */
  backupApproverId: string | null;
  managerExpensesApproverId: string | null;
  accountsExpensesApproverId: string | null;
  /** The explicit authorisation the CEO's expenses need. No role carries it implicitly. */
  ceoExpensesApproverId: string | null;
}

export const DEFAULT_APPROVAL_ROUTING: ExpenseApprovalRouting = {
  defaultApproverId: null,
  branchApprovers: {},
  backupApproverId: null,
  managerExpensesApproverId: null,
  accountsExpensesApproverId: null,
  ceoExpensesApproverId: null,
};

export const APPROVAL_SLOTS = [
  'default',
  'branch',
  'backup',
  'manager_expenses',
  'accounts_expenses',
  'ceo_expenses',
] as const;
export type ApprovalSlot = (typeof APPROVAL_SLOTS)[number];

export const APPROVAL_SLOT_LABELS: Record<ApprovalSlot, string> = {
  default: 'Default expense approver',
  branch: 'Branch approver',
  backup: 'Backup approver',
  manager_expenses: "Approver for managers' expenses",
  accounts_expenses: "Approver for Accounts' expenses",
  ceo_expenses: "Approver for the CEO's expenses",
};

/**
 * Roles each slot may be filled from. Whoever approves a manager's, Accounts'
 * or the CEO's expenses - or backs everyone up - must be Accounts or a CEO.
 * Every one of them must also hold `expenses.approve` and be active.
 */
export const APPROVAL_SLOT_ROLES: Record<ApprovalSlot, readonly string[]> = {
  default: ['manager', 'accounts', 'ceo'],
  branch: ['manager', 'accounts', 'ceo'],
  backup: ['accounts', 'ceo'],
  manager_expenses: ['accounts', 'ceo'],
  accounts_expenses: ['accounts', 'ceo'],
  ceo_expenses: ['accounts', 'ceo'],
};

/** Roles that may decide an expense recorded by someone in `submitterRole`. */
export function approverRolesFor(submitterRole: string | null | undefined): readonly string[] {
  return submitterRole === 'ceo' || submitterRole === 'manager' || submitterRole === 'accounts'
    ? ['accounts', 'ceo']
    : ['manager', 'accounts', 'ceo'];
}

export const APPROVAL_ROUTES = [
  'branch',
  'default',
  'sole_manager',
  'manager_expenses',
  'accounts_expenses',
  'ceo_expenses',
  'sole_ceo',
  'backup',
  'manual',
] as const;
export type ApprovalRoute = (typeof APPROVAL_ROUTES)[number];

export const APPROVAL_ROUTE_LABELS: Record<ApprovalRoute, string> = {
  branch: 'Branch approver',
  default: 'Default approver',
  sole_manager: 'The only active manager',
  manager_expenses: "Approver for managers' expenses",
  accounts_expenses: "Approver for Accounts' expenses",
  ceo_expenses: "Approver designated for the CEO's expenses",
  sole_ceo: 'The CEO',
  backup: 'Backup approver',
  manual: 'Assigned by an administrator',
};

/** Where routing is fixed. Every "no approver" message links here. */
export const APPROVAL_SETTINGS_PATH = '/console/finance?settings=approvals';

/** A member of staff as the routing settings list them. */
export interface ApproverOption {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  canApprove: boolean;
  /** The slots they are eligible for. Empty means they cannot be chosen anywhere. */
  slots: ApprovalSlot[];
}

// ── Finance settings ─────────────────────────────────────────────────────────

export interface FinanceSettings {
  /**
   * Expenses at or below this amount skip the approval step on submission.
   * Zero means everything is approved by someone.
   */
  autoApproveLimit: number;
  /**
   * Nobody approves their own expense. Always true now - it is enforced
   * whatever this says - and kept so settings saved earlier still read.
   */
  requireSeparateApprover: boolean;
  approvalRouting: ExpenseApprovalRouting;
  /**
   * A custom price that takes more than this percentage off the standard
   * price needs approval by someone holding `orders.approve_price`.
   */
  priceOverrideApprovalPercent: number;
  /** Operating locations expenses can be attributed to. */
  branches: string[];
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  autoApproveLimit: 0,
  requireSeparateApprover: true,
  approvalRouting: DEFAULT_APPROVAL_ROUTING,
  priceOverrideApprovalPercent: 15,
  branches: ['Bengaluru'],
};

/** ui_content row the settings live in. Internal only - never in PUBLIC_CONTENT_IDS. */
export const FINANCE_SETTINGS_ID = 'finance_settings';

// ── Transaction register ─────────────────────────────────────────────────────

export const LEDGER_ENTRY_TYPES = [
  'customer_payment',
  'offline_collection',
  'refund',
  'expense_payment',
  'expense_reversal',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  customer_payment: 'Customer payment',
  offline_collection: 'Offline collection',
  refund: 'Refund',
  expense_payment: 'Expense payment',
  expense_reversal: 'Expense reversal',
};

/**
 * One line in the register. Derived from the record it describes, never
 * stored on its own, so there is exactly one place each amount lives.
 */
export interface LedgerEntry {
  /** Stable: PAY-<payment id>, REF-<payment id>, XP-<expense payment id>, XR-<expense payment id>. */
  id: string;
  date: string;
  type: LedgerEntryType;
  direction: 'in' | 'out';
  amount: number;
  status: string;
  description: string;
  reference?: string | null;
  method?: string | null;
  /** 'gateway' when a payment provider confirmed it, 'staff' when a person recorded or verified it. */
  verification: 'gateway' | 'staff';
  source: { kind: 'payment' | 'expense_payment'; id: string; orderId?: string | null; expenseId?: string | null };
  orderReference?: string | null;
  counterparty?: string | null;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const money = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be more than zero`)
    .max(10_000_000, `${label} is unrealistically large`)
    .refine(isMoneyAmount, `${label} can have at most two decimal places`);

const isoDate = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date`)
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${label} must be a real date`);

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const expenseInputSchema = z.object({
  title: z.string().trim().min(3, 'Give the expense a title').max(140),
  categoryId: z.string().min(1, 'Choose a category'),
  amount: money('Amount'),
  expenseDate: isoDate('Expense date'),
  paymentArrangement: z.enum(EXPENSE_PAYMENT_ARRANGEMENTS, {
    errorMap: () => ({ message: 'Say whether it has been paid, and by whom' }),
  }),
  vendor: optionalText(140),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
  transactionReference: optionalText(120),
  branch: optionalText(80),
  orderId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  spaceId: z.string().optional().nullable(),
  paidBy: optionalText(120),
  notes: optionalText(1000),
  /** Optional receipt or invoice, as a data URL. Stored privately. */
  receipt: z
    .object({
      dataUrl: z.string().min(20),
      fileName: z.string().trim().max(160),
    })
    .optional()
    .nullable(),
  /** Save as a draft, or submit straight away. */
  submit: z.boolean().default(false),
}).superRefine((expense, ctx) => {
  // A reimbursement has to say who is owed it.
  if (expense.paymentArrangement === 'employee_reimbursable' && !expense.paidBy?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Who paid, so finance knows whom to reimburse', path: ['paidBy'] });
  }
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const expenseDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(400).optional().nullable(),
});

export const expensePaymentSchema = z.object({
  amount: money('Amount'),
  paidOn: isoDate('Payment date'),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  paidBy: optionalText(120),
  notes: optionalText(400),
  idempotencyKey: z.string().min(8).max(80),
});
export type ExpensePaymentInput = z.infer<typeof expensePaymentSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason - it goes on the audit trail').max(400),
});

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: optionalText(200),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
});

/** Empty means "not set". */
const approverId = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((value) => value || null);

export const approvalRoutingSchema = z.object({
  defaultApproverId: approverId,
  branchApprovers: z.record(z.string().trim().max(80), z.string().trim().max(80)).default({}),
  backupApproverId: approverId,
  managerExpensesApproverId: approverId,
  accountsExpensesApproverId: approverId,
  ceoExpensesApproverId: approverId,
});

export const financeSettingsSchema = z.object({
  autoApproveLimit: z.coerce.number().min(0).max(1_000_000),
  requireSeparateApprover: z.boolean(),
  /** Left out, the routing stays as it is - saving branches never clears it. */
  approvalRouting: approvalRoutingSchema.optional(),
  priceOverrideApprovalPercent: z.coerce.number().min(0).max(100),
  branches: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
});
export type FinanceSettingsInput = z.infer<typeof financeSettingsSchema>;

/** Hand a waiting expense to a different approver. */
export const expenseReassignSchema = z.object({
  approverId: z.string().trim().min(1, 'Choose the approver'),
  reason: z.string().trim().min(5, 'Give a reason - it goes on the audit trail').max(400),
});

/**
 * Money received outside the gateway: cash, a UPI transfer straight to the
 * account, a bank transfer, a cheque. Recorded by a person, so it is marked as
 * such everywhere it appears and is never presented as gateway-verified.
 */
export const offlinePaymentSchema = z.object({
  amount: money('Amount received'),
  receivedOn: isoDate('Date received'),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  notes: optionalText(400),
  idempotencyKey: z.string().min(8).max(80),
});
export type OfflinePaymentInput = z.infer<typeof offlinePaymentSchema>;
