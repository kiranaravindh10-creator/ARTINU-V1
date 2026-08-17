import { createPaymentSchema, PRICING, verifyPaymentSchema, type Order, type Payment } from '@artinu/shared';
import { Router } from 'express';
import { db } from '@/database/db';
import { asyncHandler, requireAuth, requireRole, validate } from '@/middleware/index';
import { badRequest, forbidden, notFound } from '@/utils/errors';
import { now, paymentReference } from '@/utils/ids';
import { recordAudit } from '@/services/audit.service';
import {
  sendArtistSelectedEmail,
  sendOrderConfirmation,
  sendPaymentConfirmation,
} from '@/services/email.service';
import { notify, notifyRole } from '@/services/notification.service';
import { issueInvoice } from '@/services/invoice.service';
import { advanceOrder } from '@/services/order.service';
import { getPaymentProvider } from '@/services/payment.service';
import { profileFor } from '@/services/auth.service';

export const paymentRouter = Router();

const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];

paymentRouter.use(requireAuth);

async function loadOwnPayment(id: string, userId: string, role: string): Promise<{ payment: Payment; order: Order }> {
  const payment = await db.payments.byId(id);
  if (!payment) throw notFound('That payment');

  const order = await db.orders.byId(payment.orderId);
  if (!order) throw notFound('That order');

  if (order.ownerId !== userId && !INTERNAL.includes(role)) {
    throw forbidden('That payment belongs to another account.');
  }
  return { payment, order };
}

/** Open a payment for an order. The amount always comes from the order. */
paymentRouter.post(
  '/',
  requireRole('space_owner'),
  validate(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const { orderId } = req.valid as { orderId: string };

    const order = await db.orders.byId(orderId);
    if (!order) throw notFound('That order');
    if (order.ownerId !== req.user!.id) throw forbidden('That order belongs to another account.');
    if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
      throw badRequest('This order has already been paid for.');
    }

    const provider = getPaymentProvider();
    const reference = paymentReference();
    const charge = await provider.createCharge({
      orderId: order.id,
      amount: order.pricing.total,
      reference,
    });

    const payment = await db.payments.insert({
      orderId: order.id,
      provider: provider.id,
      amount: order.pricing.total,
      currency: PRICING.CURRENCY,
      status: 'awaiting_payment',
      qrPayload: charge.qrPayload ?? null,
      qrImageDataUrl: charge.qrImageDataUrl ?? null,
      reference,
      expiresAt: charge.expiresAt,
      attempts: 1,
      failureReason: null,
      createdAt: now(),
      updatedAt: now(),
    });

    await db.orders.update(order.id, { paymentId: payment.id, updatedAt: now() });
    res.status(201).json(payment);
  }),
);

paymentRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { payment } = await loadOwnPayment(req.params.id, req.user!.id, req.user!.role);
    res.json(payment);
  }),
);

/**
 * Verification is the hinge of the whole commercial flow: it confirms the money,
 * moves the order, issues the invoice, pays the artists and tells everyone.
 * It is idempotent — verifying an already-successful payment returns the same
 * result rather than issuing a second invoice or a second payout.
 */
paymentRouter.post(
  '/:id/verify',
  requireRole('space_owner'),
  validate(verifyPaymentSchema.omit({ paymentId: true }).partial()),
  asyncHandler(async (req, res) => {
    const { payment, order } = await loadOwnPayment(req.params.id, req.user!.id, req.user!.role);

    if (payment.status === 'succeeded') {
      res.json({ payment, order: (await db.orders.byId(order.id))! });
      return;
    }

    const input = req.valid as { reference?: string | null; simulate?: 'success' | 'failure' };
    const result = await getPaymentProvider().verifyCharge(payment, input);

    if (result.status !== 'succeeded') {
      const failed = await db.payments.update(payment.id, {
        status: 'failed',
        failureReason: result.failureReason ?? 'We could not confirm that payment.',
        updatedAt: now(),
      });
      const failedOrder = await advanceOrder(order, 'payment_failed', {
        note: result.failureReason ?? 'Payment could not be verified.',
      });

      await notify({
        userId: order.ownerId,
        type: 'payment_failed',
        title: `Payment for ${order.reference} did not go through`,
        body: `${result.failureReason ?? 'We could not confirm the payment.'} You can retry from your order.`,
        link: `/space/orders/${order.id}`,
      });

      res.json({ payment: failed, order: failedOrder });
      return;
    }

    // ── Success ──────────────────────────────────────────────────────────────
    const paid = await db.payments.update(payment.id, {
      status: 'succeeded',
      failureReason: null,
      updatedAt: now(),
    });

    const confirmed = await advanceOrder(order, 'confirmed', {
      note: `Payment received (${input.reference ?? payment.reference}).`,
    });

    const invoice = await issueInvoice(confirmed);
    const space = await db.spaces.byId(order.spaceId);
    const profile = await profileFor(order.ownerId);
    const ownerName = profile?.fullName ?? 'there';

    await notify({
      userId: order.ownerId,
      type: 'payment_received',
      title: 'Payment received',
      body: `Your order ${order.reference} is confirmed. We will start printing right away.`,
      link: `/space/orders/${order.id}`,
    });

    // Tell each artist their work was chosen, and count the selection.
    const artistIds = [...new Set(confirmed.items.map((item) => item.artistId))];
    for (const artistId of artistIds) {
      const theirItems = confirmed.items.filter((item) => item.artistId === artistId);
      const titles = theirItems.map((item) => item.artworkTitle);

      await notify({
        userId: artistId,
        type: 'artwork_selected',
        title: titles.length === 1 ? `“${titles[0]}” was selected` : `${titles.length} of your photographs were selected`,
        body: `${space?.name ?? 'A space'} in ${space?.city ?? 'India'} has chosen your work for their collection.`,
        link: '/studio/installations',
      });

      const artistUser = await db.users.byId(artistId);
      const artistProfile = await profileFor(artistId);
      if (artistUser) {
        void sendArtistSelectedEmail(
          artistUser.email,
          artistProfile?.fullName ?? 'there',
          titles.join(', '),
          space?.name ?? 'an ARTINU space',
        );
      }

      for (const item of theirItems) {
        const artwork = await db.artworks.byId(item.artworkId);
        if (artwork) {
          await db.artworks.update(artwork.id, { selections: artwork.selections + item.quantity });
        }
      }

      // The artist's share, held pending until the payout run.
      const amount = theirItems.reduce((sum, item) => sum + item.artistCommission, 0);
      await db.payouts.insert({
        artistId,
        orderId: order.id,
        amount,
        status: 'pending',
        periodLabel: new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
        paidAt: null,
        createdAt: now(),
      });
    }

    await notifyRole('operations', {
      type: 'order_update',
      title: `New order ready for production — ${order.reference}`,
      body: `${confirmed.pricing.quantity} frames for ${space?.name ?? 'a space'}.`,
      link: `/console/orders/${order.id}`,
    });
    await notifyRole('manager', {
      type: 'order_update',
      title: `Order confirmed — ${order.reference}`,
      body: `${space?.name ?? 'A space'} placed an order.`,
      link: `/console/orders/${order.id}`,
    });

    const ownerUser = await db.users.byId(order.ownerId);
    if (ownerUser) {
      void sendPaymentConfirmation(ownerUser.email, ownerName, confirmed);
      void sendOrderConfirmation(ownerUser.email, ownerName, confirmed);
    }

    await recordAudit({
      actor: { id: req.user!.id, email: req.user!.email },
      action: 'payment.verified',
      entity: 'payment',
      entityId: payment.id,
      meta: { orderId: order.id, amount: payment.amount, invoice: invoice.number },
      ip: req.ip,
    });

    res.json({ payment: paid, order: (await db.orders.byId(order.id))! });
  }),
);

/** A fresh QR on the same order — the old one has expired or was never paid. */
paymentRouter.post(
  '/:id/retry',
  requireRole('space_owner'),
  asyncHandler(async (req, res) => {
    const { payment, order } = await loadOwnPayment(req.params.id, req.user!.id, req.user!.role);
    if (payment.status === 'succeeded') throw badRequest('This payment has already succeeded.');

    const provider = getPaymentProvider();
    const reference = paymentReference();
    const charge = await provider.createCharge({
      orderId: order.id,
      amount: order.pricing.total,
      reference,
    });

    const updated = await db.payments.update(payment.id, {
      status: 'awaiting_payment',
      qrPayload: charge.qrPayload ?? null,
      qrImageDataUrl: charge.qrImageDataUrl ?? null,
      reference,
      expiresAt: charge.expiresAt,
      attempts: payment.attempts + 1,
      failureReason: null,
      updatedAt: now(),
    });

    if (order.status === 'payment_failed') {
      await advanceOrder(order, 'pending_payment', { note: 'Retrying payment.' });
    }

    res.json(updated);
  }),
);
