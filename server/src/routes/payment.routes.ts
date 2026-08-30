import { createPaymentSchema, PRICING, verifyPaymentSchema, type Order, type Payment } from '@artinu/shared';
import { Router } from 'express';
import { CONTACT, formatCurrency } from '@artinu/shared';
import { db } from '@/database/db';
import { asyncHandler, requireAuth, requireRole, validate } from '@/middleware/index';
import { badRequest, forbidden, notFound } from '@/utils/errors';
import { now, paymentReference } from '@/utils/ids';
import { recordAudit } from '@/services/audit.service';
import {
  sendArtistSelectedEmail,
  sendOrderConfirmation,
  sendPaymentConfirmation,
  sendStaffAlert,
} from '@/services/email.service';
import { notify, notifyRole } from '@/services/notification.service';
import { issueInvoice } from '@/services/invoice.service';
import { advanceOrder } from '@/services/order.service';
import { getPaymentProvider, verifyRazorpayWebhook } from '@/services/payment.service';
import { logger } from '@/utils/logger';
import { profileFor } from '@/services/auth.service';
import { settlePayment } from '@/services/settlement.service';

export const paymentRouter = Router();

const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];


/**
 * Razorpay webhook.
 *
 * Mounted above `requireAuth` on purpose: the caller is Razorpay, which has no
 * ARTINU session. Its authentication is the HMAC over the raw body, checked
 * before anything else happens.
 *
 * WHY THIS EXISTS ALONGSIDE /:id/verify
 *
 * The browser callback is the fast path and the happy path, and it is not
 * reliable: the customer can close the tab, lose signal, or have the redirect
 * eaten between paying and telling us. The money still moved. The webhook is the
 * path that does not depend on the customer's browser surviving, and it is what
 * makes "paid but the order never confirmed" a state that heals itself.
 *
 * Idempotent by construction: a payment already `succeeded` returns 200 without
 * re-issuing an invoice or a second payout, and Razorpay retries until it gets a
 * 2xx, so anything other than success must NOT return 200.
 */
paymentRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const signature = req.header('x-razorpay-signature');

    if (!verifyRazorpayWebhook(raw, signature)) {
      // 401, not 400: this is a failed authentication, and Razorpay should not
      // keep retrying a body we will never trust.
      logger.warn('Rejected a payment webhook with an invalid signature.');
      res.status(401).json({ message: 'Invalid signature.' });
      return;
    }

    let event: {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } };
    };
    try {
      event = JSON.parse(raw);
    } catch {
      res.status(400).json({ message: 'Malformed payload.' });
      return;
    }

    const entity = event.payload?.payment?.entity;
    const gatewayOrderId = entity?.order_id;

    // Only settlement events act. Everything else is acknowledged so Razorpay
    // stops retrying, but changes nothing.
    if (event.event !== 'payment.captured' || !gatewayOrderId) {
      res.json({ received: true, acted: false });
      return;
    }

    const payment = await db.payments.findOne({ gatewayOrderId });
    if (!payment) {
      // 200: the event is validly signed but references something we do not
      // hold. Retrying will not change that.
      logger.warn(`Webhook for unknown gateway order ${gatewayOrderId} - ignored.`);
      res.json({ received: true, acted: false });
      return;
    }

    if (payment.status === 'succeeded') {
      res.json({ received: true, acted: false, reason: 'already settled' });
      return;
    }

    const order = await db.orders.byId(payment.orderId);
    if (!order) {
      logger.error(`Webhook: payment ${payment.id} has no order ${payment.orderId}.`);
      res.json({ received: true, acted: false });
      return;
    }

    /*
      Trust the amount the gateway reports, not the event's word for it.

      Razorpay reports amounts in paise. If it captured less than the order is
      for, this is not a settlement — it is a partial payment, and confirming the
      order would ship framed prints for less than they cost.
    */
    const capturedPaise = entity?.amount ?? 0;
    const expectedPaise = Math.round(payment.amount * 100);
    if (capturedPaise < expectedPaise) {
      logger.error(
        `Webhook: ${payment.reference} captured ${capturedPaise} paise but the order is ${expectedPaise}. Not confirming.`,
      );
      res.json({ received: true, acted: false, reason: 'amount mismatch' });
      return;
    }

    await settlePayment(payment, order, entity?.id ?? null);
    logger.info(`Webhook settled ${payment.reference} for order ${order.reference}.`);
    res.json({ received: true, acted: true });
  }),
);

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
      /*
        Only written when there IS one.

        It was always written, as `null` for the UPI/QR provider - which has no
        gateway order to reference. The live `payments` table has no
        `gateway_order_id` column, so PostgREST rejected the whole insert with
        "Could not find the 'gateway_order_id' column in the schema cache" and
        every single payment failed with a 500. The customer pressed the button
        and nothing happened: no QR, no error they could act on.

        Omitting a null costs nothing - the field is only meaningful for a real
        gateway, where verification compares the signature against THIS id
        rather than one the browser sends back (see RazorpayProvider). If a
        gateway is switched on before the column is added, that insert will
        fail loudly, which is correct: it genuinely needs the column.
      */
      ...(charge.gatewayOrderId ? { gatewayOrderId: charge.gatewayOrderId } : {}),
      expiresAt: charge.expiresAt,
      attempts: 1,
      failureReason: null,
      createdAt: now(),
      updatedAt: now(),
    });

    await db.orders.update(order.id, { paymentId: payment.id, updatedAt: now() });

    /*
      `gateway` is returned alongside the record rather than stored on it: it
      carries the publishable key and the amount in minor units, which the client
      needs only to open the hosted checkout and which would be stale the moment
      the key rotated. The mock provider omits it and sends a QR instead.
    */
    res.status(201).json({ ...payment, gateway: charge.gateway ?? null });
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

    const input = req.valid as {
      reference?: string | null;
      simulate?: 'success' | 'failure';
      gatewayPaymentId?: string;
      gatewaySignature?: string;
      paidVia?: 'gpay' | 'upi' | 'bank';
    };
    const result = await getPaymentProvider().verifyCharge(payment, input);

    /*
      ── The customer says they have paid, and a person has to check ─────────

      Money arrives in a UPI account. There is no gateway to ask, so the only
      honest state here is "claimed, not confirmed": the reference is recorded,
      the order does NOT advance, no invoice is issued and no settlement runs.
      Staff confirm it against the account and release it from the Console.

      This branch has to sit above the failure branch below, which treats
      anything that is not `succeeded` as a decline - without it a customer who
      correctly submitted their UTR would be told their payment failed.
    */
    if (result.status === 'verifying') {
      /*
        The mode is written only if the column is there.

        `paid_via` arrives with migration 013. Until that is applied, naming it
        makes PostgREST reject the whole update - which would fail the
        submission itself and leave the customer staring at an error after they
        had genuinely paid. Recording the payment matters more than recording
        how it was made, so the mode is dropped and the claim still lands.

        Once 013 is applied the first branch simply succeeds and the fallback
        stops being reached. Nothing needs changing here then.
      */
      const core = {
        status: 'verifying' as const,
        reference: input.reference?.trim() || payment.reference,
        updatedAt: now(),
      };

      let claimed;
      try {
        claimed = await db.payments.update(payment.id, {
          ...core,
          ...(input.paidVia ? { paidVia: input.paidVia } : {}),
        });
      } catch (error) {
        const missingColumn = String((error as Error)?.message ?? '').includes('paid_via');
        if (!missingColumn) throw error;
        logger.warn(
          'payments.paid_via is missing - apply migration 013 to record how customers paid.',
        );
        claimed = await db.payments.update(payment.id, core);
      }

      await notify({
        userId: order.ownerId,
        type: 'payment_received',
        title: `We have your payment details for ${order.reference}`,
        body: 'Our team is checking the transfer against our account. You will get your invoice by email once it is confirmed.',
        link: `/space/orders/${order.id}`,
      });

      /*
        Manager and operations, not accounts.

        These are the two desks that actually reconcile a UPI transfer - one
        opens the Google Pay ledger or the bank statement, the other is holding
        the order that cannot go to print until the money is confirmed. Routing
        it to accounts alone meant the people waiting on it were never told.
      */
      /*
        Two methods now, matching the two the payment page offers. 'gpay' is
        still read because payments submitted before the chooser was simplified
        carry it, and an old record should not describe itself as "unstated".
      */
      const paidViaLabel =
        input.paidVia === 'bank'
          ? 'net banking / bank transfer'
          : input.paidVia === 'upi' || input.paidVia === 'gpay'
            ? 'UPI / Google Pay'
            : 'an unstated method';

      for (const desk of ['manager', 'operations'] as const) {
        await notifyRole(desk, {
          type: 'payment_received',
          title: `Payment to verify - ${order.reference}`,
          body: `${formatCurrency(payment.amount)} claimed via ${paidViaLabel}, reference ${input.reference?.trim() ?? '-'}. Check it against the account before releasing the order.`,
          link: '/console/payments',
        });
      }

      /*
        Tell hello@ as well as the Console.

        A notification only exists for somebody already signed in and looking.
        Money arriving is the one event that has to reach a person who is not,
        so it goes to the shared inbox with everything needed to check it
        without opening anything else.

        Fire-and-forget on purpose: the claim is already saved, and a payment
        must never be reported as failed because SMTP was down.
      */
      const space = await db.spaces.byId(order.spaceId);
      void sendStaffAlert(
        CONTACT.email,
        `Payment to verify - ${order.reference}`,
        `${formatCurrency(payment.amount)} submitted for verification`,
        [
          `Order: ${order.reference}`,
          `Space: ${space?.name ?? '-'}${space?.city ? `, ${space.city}` : ''}`,
          `Category: ${space?.type ?? '-'}`,
          `Amount: ${formatCurrency(payment.amount)}`,
          `Paid via: ${paidViaLabel}`,
          `Transaction / UTR: ${input.reference?.trim() ?? '-'}`,
          `Submitted: ${new Date().toLocaleString('en-IN')}`,
          '',
          'The customer says they have paid. Check this against the account before releasing the order - nothing has been confirmed automatically.',
        ].join('\n'),
        '/console/payments',
      );

      res.json({ payment: claimed, order });
      return;
    }

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

    // ── Success ────────────────────────────────────────────────────────────
    const settled = await settlePayment(payment, order, result.gatewayPaymentId ?? null, {
      reference: input.reference,
      actor: { id: req.user!.id, email: req.user!.email },
      ip: req.ip,
    });

    res.json(settled);
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
