import {
  expenseCategorySchema,
  expenseDecisionSchema,
  expenseInputSchema,
  expensePaymentSchema,
  expenseReassignSchema,
  financeSettingsSchema,
  reasonSchema,
} from '@artinu/shared';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler, requireInternal, requireModule, requirePermission, validate } from '@/middleware/index';
import {
  approverOptions,
  eligibleApprovers,
  reassignApprover,
  routeWaitingExpenses,
} from '@/services/expense-approval.service';
import {
  approvalQueue,
  attachReceipt,
  buildReport,
  cancelExpense,
  createCategory,
  createExpense,
  decideExpense,
  expenseOrderOptions,
  expenseReceipt,
  FINANCE_REPORTS,
  financeDashboard,
  financeSettings,
  getExpense,
  ledger,
  listCategories,
  listExpenses,
  linkExpenseToOrder,
  listInvoices,
  recordExpensePayment,
  reverseExpense,
  submitExpense,
  updateCategory,
  updateExpense,
  updateFinanceSettings,
  type FinanceReportKey,
} from '@/services/finance.service';
import { branchScopeOf } from '@/services/branch.service';
import { recordAudit } from '@/services/audit.service';
import { toCsv, toXlsx } from '@/utils/spreadsheet';
import { badRequest } from '@/utils/errors';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = z.object({ from: date.optional(), to: date.optional() });

function sendFile(res: Response, buffer: Buffer, contentType: string, fileName: string) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\w.\- ]/g, '_')}"`);
  // Financial documents are never cached by anything in between.
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

// ── Finance: dashboard, register, invoices, exports, settings ────────────────

/** Mounted at /admin/finance. The money view: CEO and accounts. */
export const financeRouter = Router();
financeRouter.use(requireInternal);

financeRouter.get(
  '/dashboard',
  requireModule('finance'),
  requirePermission('finance.view'),
  asyncHandler(async (req, res) => {
    res.json(await financeDashboard(await branchScopeOf(req.user!)));
  }),
);

financeRouter.get(
  '/transactions',
  requireModule('finance'),
  requirePermission('finance.view'),
  validate(
    range.extend({
      type: z.string().max(40).optional(),
      direction: z.enum(['in', 'out', 'all']).optional(),
      q: z.string().max(120).optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    res.json(await ledger(req.valid, await branchScopeOf(req.user!)));
  }),
);

financeRouter.get(
  '/invoices',
  requireModule('finance'),
  requirePermission('finance.view'),
  validate(range.extend({ q: z.string().max(120).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listInvoices(req.valid, await branchScopeOf(req.user!)));
  }),
);

financeRouter.get(
  '/reports',
  requireModule('finance'),
  requirePermission('finance.view'),
  asyncHandler(async (_req, res) => {
    res.json(Object.entries(FINANCE_REPORTS).map(([key, title]) => ({ key, title })));
  }),
);

financeRouter.get(
  '/exports/:report',
  requireModule('finance'),
  requirePermission('finance.export'),
  validate(range.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }), 'query'),
  asyncHandler(async (req, res) => {
    const key = req.params.report as FinanceReportKey;
    if (!(key in FINANCE_REPORTS)) throw badRequest('That report does not exist.');
    const { format, from, to } = req.valid as { format: 'csv' | 'xlsx'; from?: string; to?: string };

    const table = await buildReport(key, { from, to }, await branchScopeOf(req.user!));
    const stamp = [from, to].filter(Boolean).join('_to_') || new Date().toISOString().slice(0, 10);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'finance.exported',
      entity: 'report',
      entityId: key,
      meta: { format, from: from ?? null, to: to ?? null, rows: table.rows.length },
    });

    if (format === 'xlsx') {
      sendFile(res, toXlsx(table), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `artinu-${key}-${stamp}.xlsx`);
    } else {
      sendFile(res, toCsv(table), 'text/csv; charset=utf-8', `artinu-${key}-${stamp}.csv`);
    }
  }),
);

/**
 * Settings are readable by anyone who records expenses - the form needs the
 * branch list - and changeable only with finance.settings.
 */
financeRouter.get(
  '/settings',
  requireModule('expenses'),
  asyncHandler(async (_req, res) => {
    res.json(await financeSettings());
  }),
);

/** Staff the approval routing can choose from, each with the slots they fit. */
financeRouter.get(
  '/approvers',
  requirePermission('finance.settings', 'expenses.configure_approvals'),
  asyncHandler(async (_req, res) => {
    res.json(await approverOptions());
  }),
);

financeRouter.put(
  '/settings',
  requirePermission('finance.settings'),
  validate(financeSettingsSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateFinanceSettings(req.user!, req.valid));
  }),
);

// ── Expenses ─────────────────────────────────────────────────────────────────

/** Mounted at /admin/expenses. */
export const expenseRouter = Router();
expenseRouter.use(requireInternal, requireModule('expenses'));

expenseRouter.get(
  '/',
  validate(
    range.extend({
      q: z.string().max(120).optional(),
      status: z.string().max(40).optional(),
      categoryId: z.string().max(80).optional(),
      branch: z.string().max(80).optional(),
      paymentMethod: z.string().max(40).optional(),
      orderId: z.string().max(80).optional(),
      mine: z.enum(['true', 'false']).optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    res.json(await listExpenses(req.user!, { ...req.valid, mine: req.valid.mine === 'true' }));
  }),
);

expenseRouter.get(
  '/categories',
  validate(z.object({ all: z.enum(['true', 'false']).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listCategories(req.valid.all === 'true'));
  }),
);

/** "Awaiting my approval" - assigned to the person asking, or open to them as backup. */
expenseRouter.get(
  '/approvals',
  requirePermission('expenses.approve'),
  asyncHandler(async (req, res) => {
    res.json(await approvalQueue(req.user!));
  }),
);

/** Give every waiting expense without a workable approver one from the current routing. */
expenseRouter.post(
  '/route-pending',
  requirePermission('expenses.configure_approvals'),
  asyncHandler(async (req, res) => {
    res.json(await routeWaitingExpenses(req.user!, (await financeSettings()).approvalRouting));
  }),
);

expenseRouter.get(
  '/order-options',
  requirePermission('expenses.create'),
  validate(z.object({ q: z.string().max(120).default('') }), 'query'),
  asyncHandler(async (req, res) => {
    res.json(await expenseOrderOptions(req.valid.q, req.user!));
  }),
);

expenseRouter.post(
  '/categories',
  requirePermission('expenses.manage_categories'),
  validate(expenseCategorySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createCategory(req.user!, req.valid));
  }),
);

expenseRouter.patch(
  '/categories/:id',
  requirePermission('expenses.manage_categories'),
  validate(expenseCategorySchema),
  asyncHandler(async (req, res) => {
    res.json(await updateCategory(req.user!, req.params.id, req.valid));
  }),
);

expenseRouter.post(
  '/',
  requirePermission('expenses.create'),
  validate(expenseInputSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createExpense(req.user!, req.valid));
  }),
);

expenseRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getExpense(req.user!, req.params.id));
  }),
);

expenseRouter.put(
  '/:id',
  requirePermission('expenses.create'),
  validate(expenseInputSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateExpense(req.user!, req.params.id, req.valid));
  }),
);

expenseRouter.post(
  '/:id/submit',
  requirePermission('expenses.create'),
  asyncHandler(async (req, res) => {
    res.json(await submitExpense(req.user!, req.params.id));
  }),
);

expenseRouter.post(
  '/:id/decision',
  requirePermission('expenses.approve'),
  validate(expenseDecisionSchema),
  asyncHandler(async (req, res) => {
    res.json(await decideExpense(req.user!, req.params.id, req.valid.decision, req.valid.note));
  }),
);

expenseRouter.get(
  '/:id/eligible-approvers',
  requirePermission('expenses.configure_approvals'),
  asyncHandler(async (req, res) => {
    res.json(await eligibleApprovers(req.user!, req.params.id));
  }),
);

expenseRouter.post(
  '/:id/approver',
  requirePermission('expenses.configure_approvals'),
  validate(expenseReassignSchema),
  asyncHandler(async (req, res) => {
    await reassignApprover(req.user!, req.params.id, req.valid.approverId, req.valid.reason);
    res.json(await getExpense(req.user!, req.params.id));
  }),
);

expenseRouter.post(
  '/:id/order',
  requirePermission('expenses.create'),
  validate(z.object({ orderId: z.string().trim().min(1).nullable() })),
  asyncHandler(async (req, res) => {
    res.json(await linkExpenseToOrder(req.user!, req.params.id, req.valid.orderId));
  }),
);

expenseRouter.post(
  '/:id/payments',
  requirePermission('expenses.pay'),
  validate(expensePaymentSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await recordExpensePayment(req.user!, req.params.id, req.valid));
  }),
);

expenseRouter.post(
  '/:id/cancel',
  validate(reasonSchema),
  asyncHandler(async (req, res) => {
    res.json(await cancelExpense(req.user!, req.params.id, req.valid.reason));
  }),
);

expenseRouter.post(
  '/:id/reverse',
  requirePermission('expenses.reverse'),
  validate(reasonSchema),
  asyncHandler(async (req, res) => {
    res.json(await reverseExpense(req.user!, req.params.id, req.valid.reason));
  }),
);

expenseRouter.post(
  '/:id/receipt',
  validate(z.object({ dataUrl: z.string().min(20), fileName: z.string().trim().min(1).max(160) })),
  asyncHandler(async (req, res) => {
    res.json(await attachReceipt(req.user!, req.params.id, req.valid));
  }),
);

expenseRouter.get(
  '/:id/receipt',
  asyncHandler(async (req, res) => {
    const file = await expenseReceipt(req.user!, req.params.id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  }),
);
