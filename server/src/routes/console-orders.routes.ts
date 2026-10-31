import {
  clientInputSchema,
  consoleOrderSchema,
  consoleQuoteSchema,
  hasPermission,
  linkClientAccountSchema,
  offlinePaymentSchema,
  priceApprovalDecisionSchema,
  ROLE_MODULES,
} from '@artinu/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { asyncHandler, requireInternal, requirePermission, validate } from '@/middleware/index';
import { createClient, findDuplicateClient, getClient, linkClientAccount, searchClients } from '@/services/client.service';
import {
  createConsoleOrder,
  decidePriceApproval,
  pendingPriceApprovals,
  quoteConsoleOrder,
  recordOfflinePayment,
} from '@/services/console-order.service';
import { orderFinance } from '@/services/finance.service';
import { forbidden, notFound } from '@/utils/errors';

// ── Clients ──────────────────────────────────────────────────────────────────

/** Mounted at /admin/clients. */
export const clientRouter = Router();
clientRouter.use(requireInternal);

clientRouter.get(
  '/',
  requirePermission('clients.manage', 'orders.create'),
  validate(z.object({ q: z.string().max(120).default('') }), 'query'),
  asyncHandler(async (req, res) => {
    res.json(await searchClients(req.valid.q));
  }),
);

clientRouter.post(
  '/check-duplicate',
  requirePermission('clients.manage', 'orders.create'),
  validate(clientInputSchema),
  asyncHandler(async (req, res) => {
    res.json({ duplicate: await findDuplicateClient(req.valid) });
  }),
);

clientRouter.post(
  '/',
  requirePermission('clients.manage'),
  validate(clientInputSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createClient(req.user!, req.valid));
  }),
);

clientRouter.get(
  '/:id',
  requirePermission('clients.manage', 'orders.create'),
  asyncHandler(async (req, res) => {
    res.json(await getClient(req.params.id));
  }),
);

clientRouter.post(
  '/:id/link',
  requirePermission('clients.manage'),
  validate(linkClientAccountSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await linkClientAccount(req.user!, req.params.id, { userId: req.valid.userId, email: req.valid.email }, req.valid.reason),
    );
  }),
);

// ── Console orders ───────────────────────────────────────────────────────────

/**
 * Mounted at /admin/orders, after the existing admin router, so its paths
 * (quote, console, :id/finance, :id/payments, :id/price-approval) sit beside
 * the order routes that were already there without replacing any of them.
 */
export const consoleOrderRouter = Router();
consoleOrderRouter.use(requireInternal);

/** Order money is for the people who run orders, and for finance. */
const mayViewOrderMoney: RequestHandler = (req, _res, next) => {
  const role = req.user!.role;
  if ((ROLE_MODULES[role] ?? []).includes('orders') || hasPermission(role, 'finance.view')) return next();
  next(forbidden('Your role does not include orders or finance.'));
};

/** Custom prices waiting for a decision, for whoever may approve them. */
consoleOrderRouter.get(
  '/price-approvals',
  requirePermission('orders.approve_price'),
  asyncHandler(async (req, res) => {
    res.json(await pendingPriceApprovals(req.user!));
  }),
);

consoleOrderRouter.post(
  '/quote',
  requirePermission('orders.create'),
  validate(consoleQuoteSchema),
  asyncHandler(async (req, res) => {
    res.json(await quoteConsoleOrder(req.valid));
  }),
);

consoleOrderRouter.post(
  '/console',
  requirePermission('orders.create'),
  validate(consoleOrderSchema),
  asyncHandler(async (req, res) => {
    const result = await createConsoleOrder(req.user!, req.valid);
    res.status(result.replayed ? 200 : 201).json(result);
  }),
);

consoleOrderRouter.get(
  '/:id/finance',
  mayViewOrderMoney,
  asyncHandler(async (req, res) => {
    const finance = await orderFinance(req.user!, req.params.id);
    const order = await db.orders.byId(req.params.id);
    if (!order) throw notFound('That order');
    const client = order.clientId ? await db.clients.byId(order.clientId) : null;
    res.json({ ...finance, client });
  }),
);

consoleOrderRouter.post(
  '/:id/payments',
  requirePermission('payments.record_offline'),
  validate(offlinePaymentSchema),
  asyncHandler(async (req, res) => {
    const result = await recordOfflinePayment(req.user!, req.params.id, req.valid);
    res.status(result.replayed ? 200 : 201).json(result);
  }),
);

consoleOrderRouter.post(
  '/:id/price-approval',
  requirePermission('orders.approve_price'),
  validate(priceApprovalDecisionSchema),
  asyncHandler(async (req, res) => {
    res.json(await decidePriceApproval(req.user!, req.params.id, req.valid.decision, req.valid.note));
  }),
);
