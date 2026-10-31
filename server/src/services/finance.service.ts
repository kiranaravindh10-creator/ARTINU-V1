import {
  branchOfRecord,
  DEFAULT_APPROVAL_ROUTING,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_FINANCE_SETTINGS,
  EDITABLE_EXPENSE_STATUSES,
  EXPENSE_PAYMENT_ARRANGEMENT_LABELS,
  EXPENSE_STATUS_LABELS,
  FINANCE_SETTINGS_ID,
  formatAmount,
  fromPaise,
  hasPermission,
  inBranchScope,
  LEDGER_ENTRY_TYPE_LABELS,
  ORDER_PAYMENT_TERMS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECOGNISED_EXPENSE_STATUSES,
  ROLE_MODULES,
  toPaise,
  type BranchScope,
  type Client,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpensePayment,
  type ExpensePaymentInput,
  type ExpenseView,
  type FinanceSettings,
  type FinanceSettingsInput,
  type LedgerEntry,
  type Order,
  type Payment,
  type Space,
} from '@artinu/shared';
import { db, writesAreLocked, type StoredUser } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { branchForNewRecord, branchScopeOf, configuredBranches } from '@/services/branch.service';
import {
  assignmentProblem,
  decisionRight,
  noApproverError,
  normalizeRouting,
  reportRoutingGap,
  routeExpense,
  sameRouting,
  staffDirectory,
  tellApprover,
  validateRouting,
  type Staff,
} from '@/services/expense-approval.service';
import { notify } from '@/services/notification.service';
import { orderMoney } from '@/services/order-money.service';
import { readPrivateFile, storePrivateDataUrl } from '@/services/private-storage.service';
import { badRequest, conflict, forbidden, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';
import type { Cell, Table } from '@/utils/spreadsheet';

/**
 * Expenses, the transaction register, the financial dashboard and the
 * accounting exports.
 *
 * ── One place for each amount ───────────────────────────────────────────────
 *
 * Nothing here keeps a running total. Money in is read from `payments`, money
 * out from `expense_payments`, commitments from `expenses`, and every figure on
 * every screen and in every export is worked out from those rows at the moment
 * it is asked for, in integer paise. Two screens therefore cannot disagree, and
 * a transaction cannot be counted twice because it appears in two reports.
 *
 * ── Dates ───────────────────────────────────────────────────────────────────
 *
 * ARTINU runs on Indian time. A payment at 11pm on the 31st belongs to that
 * month, not the next one, so timestamps are bucketed in Asia/Kolkata; dates
 * that are already calendar dates (an expense date, a payment date typed in by
 * staff) are used as they are.
 */

type Actor = Pick<StoredUser, 'id' | 'email' | 'role'> & { branch?: string | null };

// ── Helpers ──────────────────────────────────────────────────────────────────

const IST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** An ISO timestamp → its calendar date in India, YYYY-MM-DD. */
export function istDate(iso: string | null | undefined): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : IST.format(date);
}

const monthOf = (date: string) => date.slice(0, 7);
const inRange = (date: string, from?: string, to?: string) =>
  Boolean(date) && (!from || date >= from) && (!to || date <= to);

/** The last `count` months, oldest first, as YYYY-MM. */
function lastMonths(count: number, today = istDate(new Date().toISOString())): string[] {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const sum = (values: number[]) => fromPaise(values.reduce((total, value) => total + toPaise(value), 0));

// ── Settings ─────────────────────────────────────────────────────────────────

export async function financeSettings(): Promise<FinanceSettings> {
  const record = await db.uiContent.byId(FINANCE_SETTINGS_ID).catch(() => null);
  const stored = (record?.data ?? {}) as Partial<FinanceSettings>;
  return {
    ...DEFAULT_FINANCE_SETTINGS,
    ...stored,
    // Nobody approves their own expense, whatever an older saved setting says.
    requireSeparateApprover: true,
    approvalRouting: {
      ...DEFAULT_APPROVAL_ROUTING,
      ...(stored.approvalRouting ?? {}),
      branchApprovers: { ...(stored.approvalRouting?.branchApprovers ?? {}) },
    },
    branches: Array.isArray(stored.branches) && stored.branches.length ? stored.branches : DEFAULT_FINANCE_SETTINGS.branches,
  };
}

export async function updateFinanceSettings(actor: Actor, input: FinanceSettingsInput): Promise<FinanceSettings> {
  const before = await financeSettings();
  const branches = [...new Set(input.branches.map((branch) => branch.trim()))];
  const previous = normalizeRouting(before.approvalRouting, branches);
  const routing = normalizeRouting(input.approvalRouting ?? before.approvalRouting, branches);

  /*
    Whether and by whom an expense is approved is the CEO's to decide. Anyone
    else holding finance.settings (Accounts) could otherwise raise the
    auto-approval limit past their own expenses, or route them to themselves.
    Branches and the price threshold stay theirs to change.
  */
  const approvalRulesChanged =
    toPaise(input.autoApproveLimit) !== toPaise(before.autoApproveLimit) || !sameRouting(routing, previous);
  if (approvalRulesChanged && !hasPermission(actor.role, 'expenses.configure_approvals')) {
    throw forbidden('Only the CEO can change how expenses are approved - the approval routing and the auto-approval limit.');
  }

  const data: FinanceSettings = {
    autoApproveLimit: input.autoApproveLimit,
    requireSeparateApprover: true,
    approvalRouting: await validateRouting(routing, previous),
    priceOverrideApprovalPercent: input.priceOverrideApprovalPercent,
    branches,
  };
  const existing = await db.uiContent.byId(FINANCE_SETTINGS_ID).catch(() => null);
  if (existing) {
    await db.uiContent.update(FINANCE_SETTINGS_ID, { data, updatedAt: now() } as never);
  } else {
    await db.uiContent.insert({ id: FINANCE_SETTINGS_ID, data, updatedAt: now() } as never);
  }
  await recordAudit({ actor, action: 'finance.settings_updated', entity: 'system', meta: { from: before, to: data } });
  return data;
}

// ── Categories ───────────────────────────────────────────────────────────────

/**
 * The defaults, when there are no categories at all.
 *
 * Migration 017 seeds them in Postgres. The in-memory store (local demo, the
 * test suites) starts empty, and without categories nothing can be recorded,
 * so they are written here the first time anything asks. It never touches a
 * table that already has rows - renamed or retired categories stay as they are.
 */
async function ensureDefaultCategories(): Promise<void> {
  // Read-only mode lists what is stored and invents nothing.
  if (writesAreLocked()) return;
  if ((await db.expenseCategories.count()) > 0) return;
  await db.expenseCategories.insertMany(
    DEFAULT_EXPENSE_CATEGORIES.map((category, index) => ({
      slug: category.slug,
      name: category.name,
      description: null,
      active: true,
      sortOrder: (index + 1) * 10,
      createdAt: now(),
      updatedAt: now(),
    })),
  );
}

export async function listCategories(includeInactive = false): Promise<ExpenseCategory[]> {
  await ensureDefaultCategories();
  const rows = await db.expenseCategories.find({ orderBy: { field: 'sortOrder', direction: 'asc' } });
  return includeInactive ? rows : rows.filter((row) => row.active);
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'category';

export async function createCategory(
  actor: Actor,
  input: { name: string; description?: string | null; active: boolean; sortOrder: number },
): Promise<ExpenseCategory> {
  const existing = await db.expenseCategories.find();
  if (existing.some((row) => row.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    throw conflict('A category with that name already exists.');
  }
  let slug = slugify(input.name);
  for (let attempt = 2; existing.some((row) => row.slug === slug); attempt += 1) slug = `${slugify(input.name)}-${attempt}`;

  const category = await db.expenseCategories.insert({
    slug,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    active: input.active,
    sortOrder: input.sortOrder,
    createdAt: now(),
    updatedAt: now(),
  });
  await recordAudit({ actor, action: 'expense_category.created', entity: 'expense_category', entityId: category.id, meta: { name: category.name } });
  return category;
}

/** Categories are renamed or retired, never deleted - expenses point at them. */
export async function updateCategory(
  actor: Actor,
  id: string,
  input: { name: string; description?: string | null; active: boolean; sortOrder: number },
): Promise<ExpenseCategory> {
  const category = await db.expenseCategories.byId(id);
  if (!category) throw notFound('That category');
  const clash = (await db.expenseCategories.find()).find(
    (row) => row.id !== id && row.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
  );
  if (clash) throw conflict('A category with that name already exists.');

  const updated = await db.expenseCategories.update(id, {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    active: input.active,
    sortOrder: input.sortOrder,
    updatedAt: now(),
  });
  await recordAudit({
    actor,
    action: 'expense_category.updated',
    entity: 'expense_category',
    entityId: id,
    meta: { from: { name: category.name, active: category.active }, to: { name: updated.name, active: updated.active } },
  });
  return updated;
}

// ── Expenses: visibility and presentation ────────────────────────────────────

const mayViewAll = (actor: Actor) =>
  hasPermission(actor.role, 'expenses.view_all') || hasPermission(actor.role, 'finance.view');

/**
 * Who sees an expense. Finance, approvers and the CEO see everything; anyone
 * else sees what they recorded, plus - for the roles that run orders - the
 * costs attached to an order, which is the operational picture they need.
 */
function mayView(actor: Actor, expense: Expense, scope: BranchScope): boolean {
  // Another branch's expense is invisible, whatever the role.
  if (!inBranchScope(scope, expense.branch)) return false;
  if (mayViewAll(actor)) return true;
  if (expense.createdBy === actor.id) return true;
  return Boolean(expense.orderId) && (ROLE_MODULES[actor.role] ?? []).includes('orders');
}

/** An expense this person may see - or the 404 an unknown one gets. */
async function visibleExpense(actor: Actor, id: string): Promise<Expense> {
  const [expense, scope] = await Promise.all([db.expenses.byId(id), branchScopeOf(actor)]);
  if (!expense || !mayView(actor, expense, scope)) throw notFound('That expense');
  return expense;
}

/**
 * Approving, paying and reversing go by role rather than authorship, but never
 * across branches: an approver in one branch cannot act on another's expense
 * by knowing its id.
 */
async function expenseInBranch(actor: Actor, id: string): Promise<Expense> {
  const [expense, scope] = await Promise.all([db.expenses.byId(id), branchScopeOf(actor)]);
  if (!expense || !inBranchScope(scope, expense.branch)) throw notFound('That expense');
  return expense;
}

/**
 * The rows a scope covers: its branch's orders and expenses, and what hangs off
 * them - payments and invoices by their order, expense payments by their
 * expense. The register, the dashboard, the invoice list and every export are
 * built from these, so none of them can count another branch's money.
 */
async function rowsInScope(scope: BranchScope) {
  const [orders, payments, invoices, expenses, expensePayments] = await Promise.all([
    db.orders.find(),
    db.payments.find(),
    db.invoices.find({ orderBy: { field: 'issuedAt', direction: 'desc' } }),
    db.expenses.find(),
    db.expensePayments.find(),
  ]);
  const ownOrders = orders.filter((order) => inBranchScope(scope, order.branch));
  const orderIds = new Set(ownOrders.map((order) => order.id));
  const ownExpenses = expenses.filter((expense) => inBranchScope(scope, expense.branch));
  const expenseIds = new Set(ownExpenses.map((expense) => expense.id));
  return {
    orders: ownOrders,
    payments: payments.filter((payment) => orderIds.has(payment.orderId)),
    invoices: invoices.filter((invoice) => orderIds.has(invoice.orderId)),
    expenses: ownExpenses,
    expensePayments: expensePayments.filter((payment) => expenseIds.has(payment.expenseId)),
  };
}

function paidOf(payments: ExpensePayment[]): number {
  return sum(payments.filter((payment) => !payment.reversedAt).map((payment) => payment.amount));
}

async function lookups() {
  const [categories, orders, clients, spaces, staff, settings] = await Promise.all([
    db.expenseCategories.find(),
    db.orders.find(),
    db.clients.find().catch(() => [] as Client[]),
    db.spaces.find(),
    staffDirectory(),
    financeSettings(),
  ]);
  return {
    categoryById: new Map(categories.map((row) => [row.id, row])),
    orderById: new Map(orders.map((row) => [row.id, row])),
    clientById: new Map(clients.map((row) => [row.id, row])),
    spaceById: new Map(spaces.map((row) => [row.id, row])),
    staff,
    routing: settings.approvalRouting,
    fallbackBranch: settings.branches[0] ?? '',
  };
}

type Lookups = Awaited<ReturnType<typeof lookups>>;

function present(
  expense: Expense,
  payments: ExpensePayment[],
  lookup: Lookups,
  withPayments = false,
  viewer?: Actor,
): ExpenseView {
  const mine = payments.filter((payment) => payment.expenseId === expense.id);
  const paid = paidOf(mine);
  const outstanding =
    expense.status === 'cancelled' || expense.status === 'rejected' || expense.status === 'draft'
      ? 0
      : Math.max(0, fromPaise(toPaise(expense.amount) - toPaise(paid)));
  const order = expense.orderId ? lookup.orderById.get(expense.orderId) : null;
  const client = expense.clientId ? lookup.clientById.get(expense.clientId) : null;
  const space = expense.spaceId ? lookup.spaceById.get(expense.spaceId) : null;
  const approver: Staff | undefined = expense.approverId ? lookup.staff.get(expense.approverId) : undefined;
  const right = viewer ? decisionRight(viewer, expense, lookup.routing, lookup.staff) : null;

  return {
    ...expense,
    amount: Number(expense.amount),
    categoryName: lookup.categoryById.get(expense.categoryId)?.name ?? 'Uncategorised',
    paidAmount: paid,
    outstandingAmount: outstanding,
    orderReference: order?.reference ?? null,
    clientName: client?.name ?? space?.name ?? null,
    hasReceipt: Boolean(expense.receiptPath),
    ...(withPayments ? { payments: mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) } : {}),
    createdByName: expense.createdBy ? (lookup.staff.get(expense.createdBy)?.name ?? null) : null,
    approver: approver
      ? {
          id: approver.user.id,
          name: approver.name,
          email: approver.user.email,
          role: approver.user.role,
          active: approver.user.status === 'verified',
        }
      : expense.approverId
        ? { id: expense.approverId, name: expense.approverEmail ?? 'A former member of staff', email: expense.approverEmail ?? '', role: '', active: false }
        : null,
    approvalProblem: assignmentProblem(expense, lookup.staff, lookup.fallbackBranch),
    mayDecide: right?.ok ?? false,
    decidesAsBackup: right?.ok ? right.asBackup : false,
  };
}

export interface ExpenseFilter {
  q?: string;
  status?: string;
  categoryId?: string;
  branch?: string;
  paymentMethod?: string;
  from?: string;
  to?: string;
  orderId?: string;
  mine?: boolean;
}

export async function listExpenses(actor: Actor, filter: ExpenseFilter): Promise<ExpenseView[]> {
  const [expenses, payments, lookup, scope] = await Promise.all([
    db.expenses.find({ orderBy: { field: 'expenseDate', direction: 'desc' } }),
    db.expensePayments.find(),
    lookups(),
    branchScopeOf(actor),
  ]);
  const q = filter.q?.trim().toLowerCase();

  return expenses
    .filter((expense) => mayView(actor, expense, scope))
    .filter((expense) => {
      if (filter.mine && expense.createdBy !== actor.id) return false;
      if (filter.status && filter.status !== 'all' && expense.status !== filter.status) return false;
      if (filter.categoryId && filter.categoryId !== 'all' && expense.categoryId !== filter.categoryId) return false;
      if (filter.branch && filter.branch !== 'all' && (expense.branch ?? '') !== filter.branch) return false;
      if (filter.paymentMethod && filter.paymentMethod !== 'all' && expense.paymentMethod !== filter.paymentMethod) return false;
      if (filter.orderId && expense.orderId !== filter.orderId) return false;
      if ((filter.from || filter.to) && !inRange(String(expense.expenseDate).slice(0, 10), filter.from, filter.to)) return false;
      if (!q) return true;
      return [expense.number, expense.title, expense.vendor, expense.transactionReference, expense.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .map((expense) => present(expense, payments, lookup, false, actor));
}

export async function getExpense(actor: Actor, id: string): Promise<ExpenseView> {
  const expense = await visibleExpense(actor, id);
  const [payments, lookup] = await Promise.all([db.expensePayments.find({ where: { expenseId: id } }), lookups()]);
  return present(expense, payments, lookup, true, actor);
}

/**
 * "Awaiting my approval": what the person asking may decide - routed to them,
 * or open to them as the backup approver - oldest submission first.
 */
export async function approvalQueue(actor: Actor): Promise<ExpenseView[]> {
  const [expenses, payments, lookup, scope] = await Promise.all([
    db.expenses.find({ where: { status: 'pending_approval' } }),
    db.expensePayments.find(),
    lookups(),
    branchScopeOf(actor),
  ]);
  return expenses
    .filter((expense) => inBranchScope(scope, expense.branch))
    .map((expense) => present(expense, payments, lookup, false, actor))
    .filter((view) => view.mayDecide)
    .sort((a, b) => String(a.submittedAt ?? a.createdAt).localeCompare(String(b.submittedAt ?? b.createdAt)));
}

/**
 * Orders an expense can be attached to: the reference and the customer, and
 * nothing else about the order. It lets someone in finance - who has no Orders
 * module - put a frame or a delivery cost against the order it was for.
 */
export async function expenseOrderOptions(q: string, actor: Actor) {
  const needle = q.trim().toLowerCase();
  const [orders, lookup, scope] = await Promise.all([
    db.orders.find({ orderBy: { field: 'placedAt', direction: 'desc' } }),
    lookups(),
    branchScopeOf(actor),
  ]);
  return orders
    .filter((order) => inBranchScope(scope, order.branch))
    .map((order) => ({
      id: order.id,
      reference: order.reference,
      customer: customerName(order, lookup.spaceById, lookup.clientById),
      status: order.status,
      placedAt: order.placedAt,
    }))
    .filter((option) => !needle || `${option.reference} ${option.customer}`.toLowerCase().includes(needle))
    .slice(0, 10);
}

// ── Expenses: writing ────────────────────────────────────────────────────────

async function nextExpenseNumber(): Promise<string> {
  const year = istDate(new Date().toISOString()).slice(0, 4);
  const existing = await db.expenses.find();
  let sequence = existing.reduce((highest, row) => {
    const match = /-(\d+)$/.exec(row.number ?? '');
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const taken = new Set(existing.map((row) => row.number));
  let number = `EXP-${year}-${String(sequence + 1).padStart(4, '0')}`;
  while (taken.has(number)) {
    sequence += 1;
    number = `EXP-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }
  return number;
}

/** Resolves and checks the links on an expense, filling in what follows from an order. */
async function resolveLinks(
  input: Pick<ExpenseInput, 'categoryId' | 'orderId' | 'clientId' | 'spaceId' | 'branch'>,
  scope: BranchScope,
) {
  const category = await db.expenseCategories.byId(input.categoryId);
  if (!category || !category.active) throw badRequest('Choose an active expense category.');

  let orderId = input.orderId || null;
  let clientId = input.clientId || null;
  let spaceId = input.spaceId || null;

  let orderBranch: string | null = null;
  if (orderId) {
    const order = await db.orders.byId(orderId);
    // Another branch's order is answered like one that does not exist.
    if (!order || !inBranchScope(scope, order.branch)) throw badRequest('That order could not be found.');
    clientId ??= order.clientId ?? null;
    spaceId ??= order.spaceId;
    orderBranch = branchOfRecord(order.branch, scope.fallback);
  }
  if (clientId && !(await db.clients.byId(clientId))) throw badRequest('That client could not be found.');
  if (spaceId && !(await db.spaces.byId(spaceId))) throw badRequest('That space could not be found.');

  // A named branch is checked against the list and against the person's own;
  // a cost on an order belongs to the order's branch; otherwise branch-bound
  // staff record for their own branch and central staff may leave it open.
  const branch = input.branch?.trim()
    ? await branchForNewRecord(scope, input.branch)
    : (orderBranch ?? (scope.all ? null : scope.branch));

  return { orderId, clientId, spaceId, branch };
}

/**
 * Submitting: straight to approved under the configured limit (₹0 by default,
 * so never), otherwise to one named approver from the routing. `recordedBy`
 * is whose expense it is; `submittedBy` may be finance submitting it for them.
 * Neither can be its approver.
 *
 * With nobody eligible the submission is refused before anything is written,
 * and the people who configure routing are told - a pending expense that no
 * one is responsible for is worse than no submission.
 */
async function submissionPatch(
  amount: number,
  branch: string | null,
  recordedBy: { id: string | null; role: string },
  submittedBy: Actor,
): Promise<Partial<Expense>> {
  const settings = await financeSettings();
  if (settings.autoApproveLimit > 0 && toPaise(amount) <= toPaise(settings.autoApproveLimit)) {
    return {
      status: 'approved',
      submittedAt: now(),
      approvedBy: null,
      approvedByEmail: `Auto-approved (₹${settings.autoApproveLimit} limit)`,
      approvedAt: now(),
    };
  }
  const staff = await staffDirectory();
  const routed = routeExpense(recordedBy, branch, settings.approvalRouting, staff, [recordedBy.id, submittedBy.id], settings.branches[0]);
  if ('problem' in routed) {
    await reportRoutingGap(routed.problem, staff.get(submittedBy.id)?.name ?? submittedBy.email);
    throw noApproverError(routed.problem);
  }
  return {
    status: 'pending_approval',
    submittedAt: now(),
    approverId: routed.approver.user.id,
    approverEmail: routed.approver.user.email,
    approvalRoute: routed.route,
    approverAssignedAt: now(),
  };
}

/** Whose expense it is, for routing: the person who recorded it, as their account stands now. */
const recorder = async (expense: Expense) => {
  const user = expense.createdBy ? await db.users.byId(expense.createdBy) : null;
  return { id: expense.createdBy ?? null, role: user?.role ?? 'operations' };
};

const nameOf = async (actor: Actor) => (await staffDirectory()).get(actor.id)?.name ?? actor.email;

export async function createExpense(actor: Actor, input: ExpenseInput): Promise<ExpenseView> {
  const links = await resolveLinks(input, await branchScopeOf(actor));
  const submission = input.submit
    ? await submissionPatch(input.amount, links.branch, { id: actor.id, role: actor.role }, actor)
    : {};
  const receipt = input.receipt?.dataUrl ? await storePrivateDataUrl(input.receipt.dataUrl) : null;

  const base: Omit<Expense, 'id'> = {
    number: await nextExpenseNumber(),
    title: input.title.trim(),
    categoryId: input.categoryId,
    amount: input.amount,
    expenseDate: input.expenseDate,
    status: 'draft',
    paymentArrangement: input.paymentArrangement,
    vendor: input.vendor?.trim() || null,
    paymentMethod: input.paymentMethod ?? null,
    transactionReference: input.transactionReference?.trim() || null,
    paidBy: input.paidBy?.trim() || null,
    notes: input.notes?.trim() || null,
    receiptPath: receipt?.path ?? null,
    receiptName: receipt ? (input.receipt?.fileName ?? 'receipt') : null,
    receiptType: receipt?.contentType ?? null,
    createdBy: actor.id,
    createdByEmail: actor.email,
    submittedAt: null,
    approvedBy: null,
    approvedByEmail: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: now(),
    updatedAt: now(),
    ...links,
  };

  const created = await db.expenses.insert({ ...base, ...submission });

  await recordAudit({
    actor,
    action: input.submit ? 'expense.submitted' : 'expense.created',
    entity: 'expense',
    entityId: created.id,
    meta: {
      number: created.number,
      amount: created.amount,
      status: created.status,
      orderId: created.orderId ?? null,
      approverId: created.approverId ?? null,
      approverEmail: created.approverEmail ?? null,
      approvalRoute: created.approvalRoute ?? null,
    },
  });
  await tellApprover(created, await nameOf(actor));
  return getExpense(actor, created.id);
}

function mayEdit(actor: Actor, expense: Expense) {
  return (
    expense.createdBy === actor.id ||
    hasPermission(actor.role, 'expenses.approve') ||
    hasPermission(actor.role, 'expenses.pay')
  );
}

/**
 * Put an existing expense against an order, move it to another, or take it
 * off. Only which order the cost counts against changes - the amount, status,
 * approval and payments do not - and the move is on the audit trail. It works
 * at any stage short of cancelled, because "this courier was for that order"
 * is often only known after the bill is paid.
 */
export async function linkExpenseToOrder(actor: Actor, id: string, orderId: string | null): Promise<ExpenseView> {
  const expense = await visibleExpense(actor, id);
  if (expense.status === 'cancelled') throw badRequest('A cancelled expense cannot be put against an order.');
  if (!mayEdit(actor, expense)) throw forbidden('Only the person who recorded this expense, or finance, can change its order.');
  if ((expense.orderId ?? null) === orderId) return getExpense(actor, id);

  let link: Partial<Expense> = { orderId: null };
  if (orderId) {
    const order = await db.orders.byId(orderId);
    if (!order || !inBranchScope(await branchScopeOf(actor), order.branch)) throw badRequest('That order could not be found.');
    link = { orderId, clientId: order.clientId ?? null, spaceId: order.spaceId };
  }
  await db.expenses.update(id, { ...link, updatedAt: now() } as never);
  await recordAudit({
    actor,
    action: 'expense.order_linked',
    entity: 'expense',
    entityId: id,
    meta: { number: expense.number, amount: expense.amount, from: expense.orderId ?? null, to: orderId },
  });
  return getExpense(actor, id);
}

export async function updateExpense(actor: Actor, id: string, input: ExpenseInput): Promise<ExpenseView> {
  const expense = await visibleExpense(actor, id);
  if (!EDITABLE_EXPENSE_STATUSES.includes(expense.status)) {
    throw badRequest(`A ${EXPENSE_STATUS_LABELS[expense.status].toLowerCase()} expense cannot be edited. Cancel or reverse it instead.`);
  }
  if (!mayEdit(actor, expense)) throw forbidden('Only the person who recorded this expense, or finance, can edit it.');

  const links = await resolveLinks(input, await branchScopeOf(actor));
  const submission = input.submit
    ? await submissionPatch(input.amount, links.branch, await recorder(expense), actor)
    : {};
  const receipt = input.receipt?.dataUrl ? await storePrivateDataUrl(input.receipt.dataUrl) : null;

  const patch: Partial<Expense> = {
    title: input.title.trim(),
    categoryId: input.categoryId,
    amount: input.amount,
    expenseDate: input.expenseDate,
    paymentArrangement: input.paymentArrangement,
    vendor: input.vendor?.trim() || null,
    paymentMethod: input.paymentMethod ?? null,
    transactionReference: input.transactionReference?.trim() || null,
    paidBy: input.paidBy?.trim() || null,
    notes: input.notes?.trim() || null,
    ...links,
    ...(receipt
      ? { receiptPath: receipt.path, receiptName: input.receipt?.fileName ?? 'receipt', receiptType: receipt.contentType }
      : {}),
    // Editing a rejected expense puts it back to draft for resubmission.
    status: 'draft',
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: expense.rejectionReason ?? null,
    updatedAt: now(),
    ...submission,
  };

  await db.expenses.update(id, patch as never);
  await recordAudit({
    actor,
    action: input.submit ? 'expense.resubmitted' : 'expense.updated',
    entity: 'expense',
    entityId: id,
    meta: {
      from: { amount: expense.amount, title: expense.title, categoryId: expense.categoryId, status: expense.status },
      to: { amount: input.amount, title: input.title, categoryId: input.categoryId },
      receiptReplaced: Boolean(receipt && expense.receiptPath),
      approverId: submission.approverId ?? null,
      approverEmail: submission.approverEmail ?? null,
    },
  });
  await tellApprover({ ...expense, ...submission } as Expense, await nameOf(actor));
  return getExpense(actor, id);
}

export async function submitExpense(actor: Actor, id: string): Promise<ExpenseView> {
  const expense = await visibleExpense(actor, id);
  if (!EDITABLE_EXPENSE_STATUSES.includes(expense.status)) throw badRequest('Only a draft can be submitted.');
  if (!mayEdit(actor, expense)) throw forbidden('Only the person who recorded this expense can submit it.');

  const submission = await submissionPatch(expense.amount, expense.branch ?? null, await recorder(expense), actor);
  await db.expenses.update(id, { ...submission, updatedAt: now() } as never);
  await recordAudit({
    actor,
    action: 'expense.submitted',
    entity: 'expense',
    entityId: id,
    meta: {
      amount: expense.amount,
      status: submission.status,
      approverId: submission.approverId ?? null,
      approverEmail: submission.approverEmail ?? null,
      approvalRoute: submission.approvalRoute ?? null,
    },
  });
  await tellApprover({ ...expense, ...submission } as Expense, await nameOf(actor));
  return getExpense(actor, id);
}

/**
 * Approve or reject. Approval says the business accepts the cost; it does not
 * say anyone has been paid - that is a separate, recorded payment.
 */
export async function decideExpense(
  actor: Actor,
  id: string,
  decision: 'approve' | 'reject',
  note?: string | null,
): Promise<ExpenseView> {
  if (!hasPermission(actor.role, 'expenses.approve')) throw forbidden('Your role cannot approve expenses.');
  const expense = await expenseInBranch(actor, id);

  // Only the assigned approver or the backup - checked here, whatever the screen showed.
  const [settings, staff] = await Promise.all([financeSettings(), staffDirectory()]);
  const right = decisionRight(actor, expense, settings.approvalRouting, staff);
  if (!right.ok) throw right.status === 400 ? badRequest(right.reason!) : forbidden(right.reason!);
  if (decision === 'reject' && !note?.trim()) throw badRequest('Say why it is rejected - the person who recorded it sees this.');

  await db.expenses.update(
    id,
    (decision === 'approve'
      ? { status: 'approved', approvedBy: actor.id, approvedByEmail: actor.email, approvedAt: now(), updatedAt: now() }
      : { status: 'rejected', rejectedBy: actor.id, rejectedAt: now(), rejectionReason: note!.trim(), updatedAt: now() }) as never,
  );
  await recordAudit({
    actor,
    action: decision === 'approve' ? 'expense.approved' : 'expense.rejected',
    entity: 'expense',
    entityId: id,
    meta: {
      number: expense.number,
      amount: expense.amount,
      note: note?.trim() || null,
      createdBy: expense.createdBy,
      assignedApprover: expense.approverId ?? null,
      decidedAsBackup: right.asBackup,
    },
  });

  // The person who recorded it hears the outcome. Approval is not payment, and the message says so.
  if (expense.createdBy) {
    const decidedBy = staff.get(actor.id)?.name ?? actor.email;
    await notify({
      userId: expense.createdBy,
      type: 'system',
      title: decision === 'approve' ? `Expense ${expense.number} approved` : `Expense ${expense.number} returned`,
      body:
        decision === 'approve'
          ? `${decidedBy} approved ${formatAmount(expense.amount)} - ${expense.title}. Finance records the payment separately.`
          : `${decidedBy} returned ${expense.title}: ${note!.trim()}`,
      link: `/console/expenses?expense=${expense.id}`,
    });
  }
  return getExpense(actor, id);
}

export async function recordExpensePayment(actor: Actor, id: string, input: ExpensePaymentInput): Promise<ExpenseView> {
  if (!hasPermission(actor.role, 'expenses.pay')) throw forbidden('Your role cannot record expense payments.');

  // A retried submission returns what the first one did, never a second payment.
  const replay = await db.expensePayments.findOne({ idempotencyKey: input.idempotencyKey } as never);
  if (replay) {
    if (replay.expenseId !== id) throw conflict('That request key was already used for another expense.');
    return getExpense(actor, id);
  }

  const expense = await expenseInBranch(actor, id);
  if (expense.status !== 'approved' && expense.status !== 'partially_paid') {
    throw badRequest(
      expense.status === 'pending_approval'
        ? 'This expense has not been approved yet.'
        : `A ${EXPENSE_STATUS_LABELS[expense.status].toLowerCase()} expense cannot be paid.`,
    );
  }

  const payments = await db.expensePayments.find({ where: { expenseId: id } });
  const outstandingPaise = toPaise(expense.amount) - toPaise(paidOf(payments));
  if (toPaise(input.amount) > outstandingPaise) {
    throw badRequest(`That is more than the ${fromPaise(outstandingPaise).toFixed(2)} still owed on this expense.`);
  }

  const payment = await db.expensePayments.insert({
    expenseId: id,
    amount: input.amount,
    paidOn: input.paidOn,
    method: input.method,
    reference: input.reference?.trim() || null,
    paidBy: input.paidBy?.trim() || null,
    notes: input.notes?.trim() || null,
    recordedBy: actor.id,
    recordedByEmail: actor.email,
    idempotencyKey: input.idempotencyKey,
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
    createdAt: now(),
  });

  const fullyPaid = toPaise(input.amount) === outstandingPaise;
  await db.expenses.update(id, { status: fullyPaid ? 'paid' : 'partially_paid', updatedAt: now() } as never);
  await recordAudit({
    actor,
    action: 'expense.payment_recorded',
    entity: 'expense',
    entityId: id,
    meta: { paymentId: payment.id, amount: input.amount, method: input.method, reference: payment.reference, fullyPaid },
  });
  return getExpense(actor, id);
}

/** Withdraw an expense no money has moved on. */
export async function cancelExpense(actor: Actor, id: string, reason: string): Promise<ExpenseView> {
  const expense = await visibleExpense(actor, id);
  if (!['draft', 'pending_approval', 'approved', 'rejected'].includes(expense.status)) {
    throw badRequest('Money has been paid on this expense - reverse it instead, so the payment stays on record.');
  }
  const own = expense.createdBy === actor.id && ['draft', 'pending_approval', 'rejected'].includes(expense.status);
  if (!own && !hasPermission(actor.role, 'expenses.approve') && !hasPermission(actor.role, 'expenses.pay')) {
    throw forbidden('Only finance or an approver can cancel this expense.');
  }

  await db.expenses.update(id, {
    status: 'cancelled',
    cancelledBy: actor.id,
    cancelledAt: now(),
    cancellationReason: reason.trim(),
    updatedAt: now(),
  } as never);
  await recordAudit({ actor, action: 'expense.cancelled', entity: 'expense', entityId: id, meta: { from: expense.status, reason } });
  return getExpense(actor, id);
}

/**
 * Undo an expense that was paid in error.
 *
 * Nothing is deleted. Each payment is marked reversed - with who, when and why
 * - and shows in the register as an outgoing payment followed by its reversal,
 * which is the trail an accountant needs to see.
 */
export async function reverseExpense(actor: Actor, id: string, reason: string): Promise<ExpenseView> {
  if (!hasPermission(actor.role, 'expenses.reverse')) throw forbidden('Your role cannot reverse expenses.');
  const expense = await expenseInBranch(actor, id);
  if (expense.status !== 'paid' && expense.status !== 'partially_paid') {
    throw badRequest('Only an expense that has been paid can be reversed. Cancel it instead.');
  }

  const payments = (await db.expensePayments.find({ where: { expenseId: id } })).filter((payment) => !payment.reversedAt);
  for (const payment of payments) {
    await db.expensePayments.update(payment.id, { reversedAt: now(), reversedBy: actor.id, reversalReason: reason.trim() } as never);
  }
  await db.expenses.update(id, {
    status: 'cancelled',
    cancelledBy: actor.id,
    cancelledAt: now(),
    cancellationReason: `Reversed: ${reason.trim()}`,
    updatedAt: now(),
  } as never);
  await recordAudit({
    actor,
    action: 'expense.reversed',
    entity: 'expense',
    entityId: id,
    meta: { reason, paymentsReversed: payments.length, amountReversed: paidOf(payments) },
  });
  return getExpense(actor, id);
}

export async function attachReceipt(
  actor: Actor,
  id: string,
  receipt: { dataUrl: string; fileName: string },
): Promise<ExpenseView> {
  const expense = await visibleExpense(actor, id);
  if (expense.status === 'cancelled') throw badRequest('A cancelled expense cannot take a new receipt.');
  if (!mayEdit(actor, expense)) throw forbidden('Only the person who recorded this expense, or finance, can attach a receipt.');

  const stored = await storePrivateDataUrl(receipt.dataUrl);
  await db.expenses.update(id, {
    receiptPath: stored.path,
    receiptName: receipt.fileName,
    receiptType: stored.contentType,
    updatedAt: now(),
  } as never);
  await recordAudit({
    actor,
    action: 'expense.receipt_attached',
    entity: 'expense',
    entityId: id,
    // The previous file is kept in storage: replacing a receipt must not erase one.
    meta: { previous: expense.receiptPath ?? null, fileName: receipt.fileName },
  });
  return getExpense(actor, id);
}

export async function expenseReceipt(actor: Actor, id: string) {
  const expense = await visibleExpense(actor, id);
  if (!expense.receiptPath) throw notFound('A receipt for that expense');
  const file = await readPrivateFile(expense.receiptPath);
  return { ...file, fileName: expense.receiptName ?? 'receipt' };
}

// ── Customers on orders ──────────────────────────────────────────────────────

function customerName(order: Order, spaceById: Map<string, Space>, clientById: Map<string, Client>) {
  if (order.clientId) {
    const client = clientById.get(order.clientId);
    if (client) return client.name;
  }
  return spaceById.get(order.spaceId)?.name ?? 'Unknown customer';
}

const collectionDate = (payment: Payment) => istDate(payment.paidAt ?? payment.createdAt);
const refundDate = (payment: Payment) => istDate(payment.refundedAt ?? payment.updatedAt);

// ── Transaction register ─────────────────────────────────────────────────────

export interface LedgerFilter {
  from?: string;
  to?: string;
  type?: string;
  direction?: string;
  q?: string;
}

export async function ledger(filter: LedgerFilter, scope: BranchScope): Promise<LedgerEntry[]> {
  const [{ payments, expensePayments, expenses }, lookup] = await Promise.all([rowsInScope(scope), lookups()]);
  const expenseById = new Map(expenses.map((row) => [row.id, row]));
  const entries: LedgerEntry[] = [];

  for (const payment of payments) {
    if (payment.status !== 'succeeded' && payment.status !== 'refunded') continue;
    const order = lookup.orderById.get(payment.orderId);
    const counterparty = order ? customerName(order, lookup.spaceById, lookup.clientById) : null;
    const gateway = payment.provider === 'razorpay' || payment.provider === 'stripe';
    const offline = payment.provider === 'manual';

    entries.push({
      id: `PAY-${payment.id}`,
      date: collectionDate(payment),
      type: offline ? 'offline_collection' : 'customer_payment',
      direction: 'in',
      amount: Number(payment.amount),
      status: payment.status,
      description: `${offline ? 'Offline payment' : 'Payment'} for ${order?.reference ?? 'an order'}`,
      reference: payment.reference,
      method: payment.method ?? payment.paidVia ?? payment.provider,
      verification: gateway && payment.gatewayPaymentId ? 'gateway' : 'staff',
      source: { kind: 'payment', id: payment.id, orderId: payment.orderId },
      orderReference: order?.reference ?? null,
      counterparty,
    });

    if (payment.status === 'refunded') {
      entries.push({
        id: `REF-${payment.id}`,
        date: refundDate(payment),
        type: 'refund',
        direction: 'out',
        amount: Number(payment.refundedAmount ?? payment.amount),
        status: 'refunded',
        description: `Refund on ${order?.reference ?? 'an order'}`,
        reference: payment.reference,
        method: payment.method ?? payment.provider,
        verification: 'staff',
        source: { kind: 'payment', id: payment.id, orderId: payment.orderId },
        orderReference: order?.reference ?? null,
        counterparty,
      });
    }
  }

  for (const payment of expensePayments) {
    const expense = expenseById.get(payment.expenseId);
    const description = expense ? `${expense.number} · ${expense.title}` : 'Expense payment';
    const counterparty = expense?.vendor ?? expense?.paidBy ?? null;
    const orderReference = expense?.orderId ? (lookup.orderById.get(expense.orderId)?.reference ?? null) : null;

    entries.push({
      id: `XP-${payment.id}`,
      date: payment.paidOn,
      type: 'expense_payment',
      direction: 'out',
      amount: Number(payment.amount),
      status: payment.reversedAt ? 'reversed' : 'paid',
      description,
      reference: payment.reference ?? null,
      method: payment.method,
      verification: 'staff',
      source: { kind: 'expense_payment', id: payment.id, expenseId: payment.expenseId },
      orderReference,
      counterparty,
    });

    if (payment.reversedAt) {
      entries.push({
        id: `XR-${payment.id}`,
        date: istDate(payment.reversedAt),
        type: 'expense_reversal',
        direction: 'in',
        amount: Number(payment.amount),
        status: 'reversal',
        description: `Reversal of ${description}${payment.reversalReason ? ` - ${payment.reversalReason}` : ''}`,
        reference: payment.reference ?? null,
        method: payment.method,
        verification: 'staff',
        source: { kind: 'expense_payment', id: payment.id, expenseId: payment.expenseId },
        orderReference,
        counterparty,
      });
    }
  }

  const q = filter.q?.trim().toLowerCase();
  return entries
    .filter((entry) => (!filter.from && !filter.to) || inRange(entry.date, filter.from, filter.to))
    .filter((entry) => !filter.type || filter.type === 'all' || entry.type === filter.type)
    .filter((entry) => !filter.direction || filter.direction === 'all' || entry.direction === filter.direction)
    .filter(
      (entry) =>
        !q ||
        [entry.description, entry.reference, entry.counterparty, entry.orderReference]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

// ── Dashboard ────────────────────────────────────────────────────────────────

const RECOGNISED = new Set<string>(RECOGNISED_EXPENSE_STATUSES);

export async function financeDashboard(scope: BranchScope) {
  const [{ orders, payments, expenses, expensePayments }, lookup] = await Promise.all([rowsInScope(scope), lookups()]);
  const today = istDate(new Date().toISOString());
  const thisMonth = monthOf(today);
  const months = lastMonths(12, today);

  // Money in, by the day it arrived; refunds by the day they went back.
  const collectedByMonth = new Map<string, number>();
  const refundedByMonth = new Map<string, number>();
  const collectedByCity = new Map<string, number>();
  const collectedByCustomer = new Map<string, { name: string; amount: number }>();
  let collected = 0;
  let refunded = 0;

  for (const payment of payments) {
    if (payment.status !== 'succeeded' && payment.status !== 'refunded') continue;
    const paise = toPaise(payment.amount);
    const month = monthOf(collectionDate(payment));
    collected += paise;
    collectedByMonth.set(month, (collectedByMonth.get(month) ?? 0) + paise);

    const order = lookup.orderById.get(payment.orderId);
    const space = order ? lookup.spaceById.get(order.spaceId) : null;
    const city = space?.city?.trim() || 'Unknown';
    collectedByCity.set(city, (collectedByCity.get(city) ?? 0) + paise);
    if (order) {
      const key = order.clientId ?? order.spaceId;
      const name = customerName(order, lookup.spaceById, lookup.clientById);
      const entry = collectedByCustomer.get(key) ?? { name, amount: 0 };
      entry.amount += paise;
      collectedByCustomer.set(key, entry);
    }

    if (payment.status === 'refunded') {
      const refundPaise = toPaise(payment.refundedAmount ?? payment.amount);
      refunded += refundPaise;
      const refundMonth = monthOf(refundDate(payment));
      refundedByMonth.set(refundMonth, (refundedByMonth.get(refundMonth) ?? 0) + refundPaise);
      collectedByCity.set(city, (collectedByCity.get(city) ?? 0) - refundPaise);
      if (order) {
        const entry = collectedByCustomer.get(order.clientId ?? order.spaceId);
        if (entry) entry.amount -= refundPaise;
      }
    }
  }

  // Money out: expense payments net of reversals, by payment date.
  const paidOutByMonth = new Map<string, number>();
  let paidOut = 0;
  for (const payment of expensePayments) {
    const paise = toPaise(payment.amount);
    paidOut += paise;
    paidOutByMonth.set(monthOf(payment.paidOn), (paidOutByMonth.get(monthOf(payment.paidOn)) ?? 0) + paise);
    if (payment.reversedAt) {
      paidOut -= paise;
      const month = monthOf(istDate(payment.reversedAt));
      paidOutByMonth.set(month, (paidOutByMonth.get(month) ?? 0) - paise);
    }
  }

  // Recognised expenses: approved or paid, by the date the cost was incurred.
  const recognisedByMonth = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byBranch = new Map<string, number>();
  let recognised = 0;
  let pendingCount = 0;
  let pendingPaise = 0;
  let unpaidCount = 0;
  let unpaidPaise = 0;
  const paidByExpense = new Map<string, number>();
  for (const payment of expensePayments) {
    if (payment.reversedAt) continue;
    paidByExpense.set(payment.expenseId, (paidByExpense.get(payment.expenseId) ?? 0) + toPaise(payment.amount));
  }

  for (const expense of expenses) {
    const paise = toPaise(expense.amount);
    if (expense.status === 'pending_approval') {
      pendingCount += 1;
      pendingPaise += paise;
    }
    if (!RECOGNISED.has(expense.status)) continue;
    recognised += paise;
    const month = monthOf(String(expense.expenseDate));
    recognisedByMonth.set(month, (recognisedByMonth.get(month) ?? 0) + paise);
    const category = lookup.categoryById.get(expense.categoryId)?.name ?? 'Uncategorised';
    byCategory.set(category, (byCategory.get(category) ?? 0) + paise);
    const branch = expense.branch?.trim() || 'Unassigned';
    byBranch.set(branch, (byBranch.get(branch) ?? 0) + paise);
    const outstanding = paise - (paidByExpense.get(expense.id) ?? 0);
    if (outstanding > 0) {
      unpaidCount += 1;
      unpaidPaise += outstanding;
    }
  }

  // Collections still to come in.
  const paymentsByOrder = new Map<string, Payment[]>();
  for (const payment of payments) {
    const list = paymentsByOrder.get(payment.orderId) ?? [];
    list.push(payment);
    paymentsByOrder.set(payment.orderId, list);
  }
  const awaiting = { count: 0, paise: 0 };
  const failed = { count: 0, paise: 0 };
  const outstandingConfirmed = { count: 0, paise: 0 };
  const verifying = { count: 0, paise: 0 };

  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    const money = orderMoney(order, paymentsByOrder.get(order.id) ?? []);
    const owed = toPaise(money.outstanding);
    if (owed <= 0) continue;
    if (order.status === 'pending_payment') {
      awaiting.count += 1;
      awaiting.paise += owed;
    } else if (order.status === 'payment_failed') {
      failed.count += 1;
      failed.paise += owed;
    } else {
      outstandingConfirmed.count += 1;
      outstandingConfirmed.paise += owed;
    }
  }
  for (const payment of payments) {
    if (payment.status !== 'verifying') continue;
    verifying.count += 1;
    verifying.paise += toPaise(payment.amount);
  }

  // Order contribution, only where costs have actually been recorded.
  const linkedByOrder = new Map<string, number>();
  for (const expense of expenses) {
    if (!expense.orderId || !RECOGNISED.has(expense.status)) continue;
    linkedByOrder.set(expense.orderId, (linkedByOrder.get(expense.orderId) ?? 0) + toPaise(expense.amount));
  }
  let contributionValue = 0;
  let contributionCosts = 0;
  for (const [orderId, costs] of linkedByOrder) {
    const order = lookup.orderById.get(orderId);
    if (!order || order.status === 'cancelled') continue;
    contributionValue += toPaise(order.pricing.total);
    contributionCosts += costs;
  }

  const monthRow = (month: string) => {
    const inPaise = (collectedByMonth.get(month) ?? 0) - (refundedByMonth.get(month) ?? 0);
    const outPaise = paidOutByMonth.get(month) ?? 0;
    return {
      month,
      collected: fromPaise(collectedByMonth.get(month) ?? 0),
      refunded: fromPaise(refundedByMonth.get(month) ?? 0),
      netCollected: fromPaise(inPaise),
      expensesPaid: fromPaise(outPaise),
      surplus: fromPaise(inPaise - outPaise),
      recognisedExpenses: fromPaise(recognisedByMonth.get(month) ?? 0),
    };
  };
  const current = monthRow(thisMonth);
  const ranked = (map: Map<string, number>) =>
    [...map.entries()].map(([name, paise]) => ({ name, amount: fromPaise(paise) })).sort((a, b) => b.amount - a.amount);

  /*
    Branch by branch, from the same rows as every figure above: orders and
    collections by the order's branch, costs by the expense's. A branch-bound
    viewer's rows are one branch already; the CEO sees each beside the others.
  */
  const branchTotals = new Map<string, { orders: number; collected: number; refunded: number; balanceDue: number; expenses: number; expensesPaid: number }>();
  const branchSlot = (branch: string | null | undefined) => {
    const name = branchOfRecord(branch, scope.fallback);
    let slot = branchTotals.get(name);
    if (!slot) {
      slot = { orders: 0, collected: 0, refunded: 0, balanceDue: 0, expenses: 0, expensesPaid: 0 };
      branchTotals.set(name, slot);
    }
    return slot;
  };
  for (const name of scope.all ? await configuredBranches() : [scope.branch]) branchSlot(name);
  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    const slot = branchSlot(order.branch);
    slot.orders += 1;
    slot.balanceDue += toPaise(orderMoney(order, paymentsByOrder.get(order.id) ?? []).outstanding);
  }
  for (const payment of payments) {
    if (payment.status !== 'succeeded' && payment.status !== 'refunded') continue;
    const slot = branchSlot(lookup.orderById.get(payment.orderId)?.branch);
    slot.collected += toPaise(payment.amount);
    if (payment.status === 'refunded') slot.refunded += toPaise(payment.refundedAmount ?? payment.amount);
  }
  const branchOfExpense = new Map(expenses.map((expense) => [expense.id, expense.branch]));
  for (const expense of expenses) {
    if (RECOGNISED.has(expense.status)) branchSlot(expense.branch).expenses += toPaise(expense.amount);
  }
  for (const payment of expensePayments) {
    if (!payment.reversedAt) branchSlot(branchOfExpense.get(payment.expenseId)).expensesPaid += toPaise(payment.amount);
  }
  const branchRows = [...branchTotals.entries()].map(([branch, totals]) => ({
    branch,
    orders: totals.orders,
    netCollected: fromPaise(totals.collected - totals.refunded),
    balanceDue: fromPaise(totals.balanceDue),
    expensesRecognised: fromPaise(totals.expenses),
    expensesPaid: fromPaise(totals.expensesPaid),
    surplus: fromPaise(totals.collected - totals.refunded - totals.expensesPaid),
  }));

  return {
    generatedAt: now(),
    month: thisMonth,
    scope: { all: scope.all, branch: scope.branch },
    branches: branchRows,
    revenue: {
      collected: fromPaise(collected),
      refunded: fromPaise(refunded),
      netCollected: fromPaise(collected - refunded),
      netCollectedThisMonth: current.netCollected,
      byCity: ranked(collectedByCity),
      byCustomer: [...collectedByCustomer.values()]
        .map((entry) => ({ name: entry.name, amount: fromPaise(entry.amount) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    },
    expenses: {
      recognised: fromPaise(recognised),
      recognisedThisMonth: current.recognisedExpenses,
      paid: fromPaise(paidOut),
      paidThisMonth: current.expensesPaid,
      byCategory: ranked(byCategory),
      byBranch: ranked(byBranch),
      pendingApproval: { count: pendingCount, amount: fromPaise(pendingPaise) },
      unpaidApproved: { count: unpaidCount, amount: fromPaise(unpaidPaise) },
    },
    collections: {
      awaitingPayment: { count: awaiting.count, amount: fromPaise(awaiting.paise) },
      failedPayments: { count: failed.count, amount: fromPaise(failed.paise) },
      outstandingOnConfirmed: { count: outstandingConfirmed.count, amount: fromPaise(outstandingConfirmed.paise) },
      awaitingVerification: { count: verifying.count, amount: fromPaise(verifying.paise) },
    },
    profitability: {
      surplusThisMonth: current.surplus,
      months: months.map(monthRow),
      contribution: {
        ordersWithCosts: [...linkedByOrder.keys()].filter((id) => lookup.orderById.get(id)?.status !== 'cancelled').length,
        orderValue: fromPaise(contributionValue),
        recordedCosts: fromPaise(contributionCosts),
        contribution: fromPaise(contributionValue - contributionCosts),
      },
    },
  };
}

// ── Order-level costs ────────────────────────────────────────────────────────

export async function orderFinance(actor: Actor, orderId: string) {
  const [order, scope] = await Promise.all([db.orders.byId(orderId), branchScopeOf(actor)]);
  if (!order || !inBranchScope(scope, order.branch)) throw notFound('That order');
  const [payments, expenses, lookup] = await Promise.all([
    db.payments.find({ where: { orderId } }),
    db.expenses.find({ where: { orderId } }),
    lookups(),
  ]);
  const expensePayments = await db.expensePayments.find();
  const visible = expenses.filter((expense) => mayView(actor, expense, scope)).map((expense) => present(expense, expensePayments, lookup));
  const recognisedCosts = sum(visible.filter((expense) => RECOGNISED.has(expense.status)).map((expense) => expense.amount));

  return {
    money: orderMoney(order, payments),
    payments: payments
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(({ qrImageDataUrl: _qr, qrPayload: _payload, ...payment }) => payment),
    expenses: visible,
    contribution:
      visible.length > 0
        ? { orderValue: order.pricing.total, recordedCosts: recognisedCosts, contribution: sum([order.pricing.total, -recognisedCosts]) }
        : null,
  };
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export async function listInvoices(filter: { q?: string; from?: string; to?: string }, scope: BranchScope) {
  const [{ invoices, payments }, lookup] = await Promise.all([rowsInScope(scope), lookups()]);
  const q = filter.q?.trim().toLowerCase();
  return invoices
    .map((invoice) => {
      const order = lookup.orderById.get(invoice.orderId);
      return {
        ...invoice,
        orderReference: order?.reference ?? null,
        customer: order ? customerName(order, lookup.spaceById, lookup.clientById) : null,
        money: order ? orderMoney(order, payments.filter((payment) => payment.orderId === order.id)) : null,
      };
    })
    .filter((invoice) => (!filter.from && !filter.to) || inRange(istDate(invoice.issuedAt), filter.from, filter.to))
    .filter((invoice) => !q || [invoice.number, invoice.orderReference, invoice.customer].filter(Boolean).join(' ').toLowerCase().includes(q));
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const FINANCE_REPORTS = {
  'income-expense': 'Monthly income and expense summary',
  'expense-register': 'Expense register',
  collections: 'Customer collections',
  outstanding: 'Outstanding payments',
  'expense-categories': 'Expenses by category',
  branches: 'Branch-wise summary',
  'order-profitability': 'Order profitability',
  transactions: 'Transaction register',
} as const;
export type FinanceReportKey = keyof typeof FINANCE_REPORTS;

const money = (value: number) => Math.round(toPaise(value)) / 100;

export async function buildReport(
  key: FinanceReportKey,
  range: { from?: string; to?: string },
  scope: BranchScope,
): Promise<Table> {
  const title = FINANCE_REPORTS[key];
  const { from, to } = range;
  const scoped = await rowsInScope(scope);

  if (key === 'transactions') {
    const rows = await ledger({ from, to }, scope);
    return {
      title,
      columns: ['Date', 'Entry', 'Type', 'In (₹)', 'Out (₹)', 'Status', 'Description', 'Counterparty', 'Order', 'Reference', 'Method', 'Verified by'],
      rows: rows.map((entry) => [
        entry.date,
        entry.id,
        LEDGER_ENTRY_TYPE_LABELS[entry.type],
        entry.direction === 'in' ? money(entry.amount) : null,
        entry.direction === 'out' ? money(entry.amount) : null,
        entry.status,
        entry.description,
        entry.counterparty ?? null,
        entry.orderReference ?? null,
        entry.reference ?? null,
        entry.method ?? null,
        entry.verification === 'gateway' ? 'Payment gateway' : 'Staff',
      ]),
    };
  }

  if (key === 'income-expense') {
    const dashboard = await financeDashboard(scope);
    const rows = dashboard.profitability.months.filter((row) => (!from || row.month >= from.slice(0, 7)) && (!to || row.month <= to.slice(0, 7)));
    return {
      title,
      columns: ['Month', 'Collected (₹)', 'Refunded (₹)', 'Net collected (₹)', 'Expenses paid (₹)', 'Collections minus expenses paid (₹)', 'Expenses recognised (₹)'],
      rows: rows.map((row) => [row.month, row.collected, row.refunded, row.netCollected, row.expensesPaid, row.surplus, row.recognisedExpenses]),
    };
  }

  const lookup = await lookups();

  if (key === 'expense-register' || key === 'expense-categories' || key === 'branches') {
    const { expenses, expensePayments: payments } = scoped;
    const inPeriod = expenses
      .filter((expense) => (!from && !to) || inRange(String(expense.expenseDate).slice(0, 10), from, to))
      .sort((a, b) => String(b.expenseDate).localeCompare(String(a.expenseDate)));

    if (key === 'expense-register') {
      return {
        title,
        columns: ['Number', 'Date', 'Title', 'Category', 'Vendor', 'Amount (₹)', 'Paid (₹)', 'Outstanding (₹)', 'Status', 'Arrangement', 'Paid by', 'Branch', 'Order', 'Method', 'Reference', 'Recorded by', 'Approved by'],
        rows: inPeriod.map((expense) => {
          const view = present(expense, payments, lookup);
          return [
            view.number,
            String(view.expenseDate).slice(0, 10),
            view.title,
            view.categoryName,
            view.vendor ?? null,
            money(view.amount),
            money(view.paidAmount),
            money(view.outstandingAmount),
            EXPENSE_STATUS_LABELS[view.status],
            view.paymentArrangement ? EXPENSE_PAYMENT_ARRANGEMENT_LABELS[view.paymentArrangement] : null,
            view.paidBy ?? null,
            view.branch ?? null,
            view.orderReference ?? null,
            view.paymentMethod ? PAYMENT_METHOD_LABELS[view.paymentMethod] : null,
            view.transactionReference ?? null,
            view.createdByEmail ?? null,
            view.approvedByEmail ?? null,
          ] as Cell[];
        }),
      };
    }

    const recognised = inPeriod.filter((expense) => RECOGNISED.has(expense.status));
    const group = (keyOf: (expense: Expense) => string) => {
      const totals = new Map<string, { count: number; paise: number }>();
      for (const expense of recognised) {
        const name = keyOf(expense);
        const entry = totals.get(name) ?? { count: 0, paise: 0 };
        entry.count += 1;
        entry.paise += toPaise(expense.amount);
        totals.set(name, entry);
      }
      return [...totals.entries()].sort((a, b) => b[1].paise - a[1].paise);
    };

    if (key === 'expense-categories') {
      return {
        title,
        columns: ['Category', 'Expenses', 'Amount recognised (₹)'],
        rows: group((expense) => lookup.categoryById.get(expense.categoryId)?.name ?? 'Uncategorised').map(([name, entry]) => [
          name,
          entry.count,
          fromPaise(entry.paise),
        ]),
      };
    }

    // Branches: expenses by the branch they were attributed to, and collections
    // by the city of the space the order was for. Two different bases, labelled
    // as such, rather than one blended number that means neither.
    const collections = new Map<string, number>();
    for (const payment of scoped.payments) {
      if (payment.status !== 'succeeded' && payment.status !== 'refunded') continue;
      if ((from || to) && !inRange(collectionDate(payment), from, to)) continue;
      const order = lookup.orderById.get(payment.orderId);
      const city = (order && lookup.spaceById.get(order.spaceId)?.city?.trim()) || 'Unknown';
      const net = toPaise(payment.amount) - (payment.status === 'refunded' ? toPaise(payment.refundedAmount ?? payment.amount) : 0);
      collections.set(city, (collections.get(city) ?? 0) + net);
    }
    return {
      title,
      columns: ['Basis', 'Branch / city', 'Count', 'Amount (₹)'],
      rows: [
        ...group((expense) => expense.branch?.trim() || 'Unassigned').map(
          ([name, entry]) => ['Expenses recognised, by branch', name, entry.count, fromPaise(entry.paise)] as Cell[],
        ),
        ...[...collections.entries()].map(([city, paise]) => ['Net collections, by space city', city, null, fromPaise(paise)] as Cell[]),
      ],
    };
  }

  const { orders, payments } = scoped;
  const paymentsByOrder = new Map<string, Payment[]>();
  for (const payment of payments) {
    const list = paymentsByOrder.get(payment.orderId) ?? [];
    list.push(payment);
    paymentsByOrder.set(payment.orderId, list);
  }

  if (key === 'collections') {
    const rows = payments
      .filter((payment) => payment.status === 'succeeded' || payment.status === 'refunded')
      .filter((payment) => (!from && !to) || inRange(collectionDate(payment), from, to))
      .sort((a, b) => collectionDate(b).localeCompare(collectionDate(a)));
    return {
      title,
      columns: ['Date', 'Payment reference', 'Order', 'Customer', 'Provider', 'Method', 'Amount (₹)', 'Refunded (₹)', 'Status', 'Recorded by', 'Verified by'],
      rows: rows.map((payment) => {
        const order = lookup.orderById.get(payment.orderId);
        const gateway = (payment.provider === 'razorpay' || payment.provider === 'stripe') && payment.gatewayPaymentId;
        return [
          collectionDate(payment),
          payment.reference,
          order?.reference ?? null,
          order ? customerName(order, lookup.spaceById, lookup.clientById) : null,
          payment.provider,
          payment.method ?? payment.paidVia ?? null,
          money(Number(payment.amount)),
          payment.status === 'refunded' ? money(Number(payment.refundedAmount ?? payment.amount)) : 0,
          payment.status,
          payment.recordedByEmail ?? null,
          gateway ? 'Payment gateway' : 'Staff',
        ] as Cell[];
      }),
    };
  }

  if (key === 'outstanding') {
    const rows = orders
      .filter((order) => order.status !== 'cancelled')
      .filter((order) => (!from && !to) || inRange(istDate(order.placedAt), from, to))
      .map((order) => ({ order, money: orderMoney(order, paymentsByOrder.get(order.id) ?? []) }))
      .filter((row) => row.money.outstanding > 0)
      .sort((a, b) => b.money.outstanding - a.money.outstanding);
    return {
      title,
      columns: ['Order', 'Customer', 'Placed', 'Status', 'Payment terms', 'Total (₹)', 'Paid (₹)', 'Outstanding (₹)'],
      rows: rows.map(({ order, money: m }) => [
        order.reference,
        customerName(order, lookup.spaceById, lookup.clientById),
        istDate(order.placedAt),
        ORDER_STATUS_LABELS[order.status] ?? order.status,
        order.paymentTerms ? ORDER_PAYMENT_TERMS_LABELS[order.paymentTerms] : null,
        m.total,
        sum([m.paid, -m.refunded]),
        m.outstanding,
      ]),
    };
  }

  // Order profitability.
  const expenses = scoped.expenses;
  const costsByOrder = new Map<string, number>();
  for (const expense of expenses) {
    if (!expense.orderId || !RECOGNISED.has(expense.status)) continue;
    costsByOrder.set(expense.orderId, (costsByOrder.get(expense.orderId) ?? 0) + toPaise(expense.amount));
  }
  const rows = orders
    .filter((order) => order.status !== 'cancelled' && costsByOrder.has(order.id))
    .filter((order) => (!from && !to) || inRange(istDate(order.placedAt), from, to));
  return {
    title,
    columns: ['Order', 'Customer', 'Placed', 'Status', 'Order value (₹)', 'Collected (₹)', 'Recorded costs (₹)', 'Contribution (₹)', 'Contribution %'],
    rows: rows.map((order) => {
      const m = orderMoney(order, paymentsByOrder.get(order.id) ?? []);
      const costs = costsByOrder.get(order.id) ?? 0;
      const valuePaise = toPaise(order.pricing.total);
      return [
        order.reference,
        customerName(order, lookup.spaceById, lookup.clientById),
        istDate(order.placedAt),
        ORDER_STATUS_LABELS[order.status] ?? order.status,
        fromPaise(valuePaise),
        sum([m.paid, -m.refunded]),
        fromPaise(costs),
        fromPaise(valuePaise - costs),
        valuePaise > 0 ? Math.round(((valuePaise - costs) / valuePaise) * 1000) / 10 : null,
      ];
    }),
  };
}
