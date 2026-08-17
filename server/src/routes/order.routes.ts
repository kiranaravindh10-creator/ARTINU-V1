import { createOrderSchema, type CartItem } from '@artinu/shared';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/database/db';
import { paginate } from '@/database/table';
import { asyncHandler, requireAuth, requireRole, validate } from '@/middleware/index';
import { badRequest, forbidden, notFound } from '@/utils/errors';
import { recordAudit } from '@/services/audit.service';
import { notifyRole } from '@/services/notification.service';
import { advanceOrder, buildOrderItems, createOrder, priceDraft } from '@/services/order.service';

export const orderRouter = Router();

const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];

orderRouter.use(requireAuth);

/** Live checkout preview — priced by the server, never persisted. */
orderRouter.post(
  '/quote',
  validate(createOrderSchema),
  asyncHandler(async (req, res) => {
    const draft = req.valid as {
      spaceId: string;
      items: CartItem[];
      couponCode?: string | null;
      includeSecurityDeposit?: boolean;
    };

    const items = await buildOrderItems(draft.items);
    res.json(priceDraft(items, draft));
  }),
);

orderRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(60, Number(req.query.pageSize ?? 20));

    const orders = await db.orders.find({
      where: INTERNAL.includes(user.role) ? undefined : { ownerId: user.id },
      filter: status && status !== 'all' ? (order) => order.status === status : undefined,
      orderBy: { field: 'placedAt', direction: 'desc' },
    });

    res.json(paginate(orders, page, pageSize));
  }),
);

orderRouter.post(
  '/',
  requireRole('space_owner'),
  validate(createOrderSchema),
  asyncHandler(async (req, res) => {
    const draft = req.valid as Parameters<typeof createOrder>[0];
    const order = await createOrder(draft, req.user!);

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'order.created',
      entity: 'order',
      entityId: order.id,
      meta: { reference: order.reference, total: order.pricing.total },
      ip: req.ip,
    });

    res.status(201).json(order);
  }),
);

orderRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await db.orders.byId(req.params.id);
    if (!order) throw notFound('That order');
    if (order.ownerId !== req.user!.id && !INTERNAL.includes(req.user!.role)) {
      throw forbidden('That order belongs to another account.');
    }
    res.json(order);
  }),
);

orderRouter.post(
  '/:id/cancel',
  validate(z.object({ reason: z.string().max(400).optional() })),
  asyncHandler(async (req, res) => {
    const order = await db.orders.byId(req.params.id);
    if (!order) throw notFound('That order');

    const internal = INTERNAL.includes(req.user!.role);
    if (order.ownerId !== req.user!.id && !internal) {
      throw forbidden('That order belongs to another account.');
    }

    // Once production has started, cancelling is an internal decision — there is
    // a printed photograph and a cut frame on the other side of it.
    const past = ['printing', 'framing', 'dispatched', 'out_for_delivery', 'installation_scheduled'];
    if (!internal && past.includes(order.status)) {
      throw badRequest(
        'This order is already in production. Contact support and we will sort it out with you.',
      );
    }
    if (order.status === 'completed') throw badRequest('This order is already complete.');
    if (order.status === 'cancelled') {
      res.json(order);
      return;
    }

    const { reason } = req.valid as { reason?: string };
    const updated = await advanceOrder(order, 'cancelled', {
      note: reason ?? 'Cancelled at the customer’s request.',
      by: req.user!.email,
    });

    await notifyRole('operations', {
      type: 'order_update',
      title: `Order ${order.reference} cancelled`,
      body: reason ?? 'The customer cancelled this order.',
      link: `/console/orders/${order.id}`,
    });

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'order.cancelled',
      entity: 'order',
      entityId: order.id,
      meta: { reason: reason ?? null },
      ip: req.ip,
    });

    res.json(updated);
  }),
);
