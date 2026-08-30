import type { Order, Payment } from '@artinu/shared';
import { db } from '@/database/db';
import { now } from '@/utils/ids';
import { recordAudit } from '@/services/audit.service';
import { profileFor } from '@/services/auth.service';
import {
  sendArtistSelectedEmail,
  sendOrderConfirmation,
  sendPaymentConfirmation,
} from '@/services/email.service';
import { issueInvoice } from '@/services/invoice.service';
import { notify, notifyRole } from '@/services/notification.service';
import { advanceOrder } from '@/services/order.service';

/**
 * SETTLEMENT - what happens the moment money is actually in.
 *
 * This used to live inside payment.routes.ts, private to it, shared between the
 * browser callback and the Razorpay webhook. It moved here when a THIRD caller
 * appeared: staff recording an order that was paid in cash or by bank transfer,
 * for a cafe owner who will never log in.
 *
 * It matters that all three go through this one function, because confirming an
 * order is not one write. It is eight:
 *
 *   1. the payment row flips to succeeded
 *   2. the order advances to confirmed, with a timeline entry
 *   3. an invoice is issued
 *   4. the owner is notified
 *   5. every artist whose work was chosen is notified and emailed
 *   6. each chosen artwork's selection count goes up
 *   7. each artist's commission is accrued as a pending payout
 *   8. operations and the manager are told there is work to do
 *
 * Skip this and call the status endpoint directly - which is entirely possible,
 * `canTransition('pending_payment', 'confirmed')` is true - and the order looks
 * right in the console while no invoice exists, no artist knows, and nobody is
 * ever paid.
 */

/**
 * Everything that happens once money has actually arrived: confirm the order,
 * issue the invoice, tell the owner, tell every artist whose work was chosen,
 * accrue their commission as a pending payout, and alert production.
 *
 * Extracted so the two paths that can confirm a payment cannot drift apart —
 * the browser callback on /:id/verify, and the Razorpay webhook. Before this
 * existed the whole sequence lived inline in the verify handler, so settling
 * from a webhook would have meant reimplementing invoicing, artist
 * notification and payout accrual, and getting one of them subtly wrong.
 *
 * NOT idempotent by itself: the caller must check `status !== "succeeded"`
 * first, or an order pays its artists twice.
 */
export async function settlePayment(
  payment: Payment,
  order: Order,
  gatewayPaymentId: string | null,
  options: {
    reference?: string | null;
    actor?: { id: string; email: string };
    ip?: string;
  } = {},
): Promise<{ payment: Payment; order: Order }> {
  const { reference, actor, ip } = options;

  const paid = await db.payments.update(payment.id, {
    status: 'succeeded',
    failureReason: null,
    // Traceability: a settlement in our books can be matched to the exact
    // payment in the gateway's dashboard during reconciliation.
    gatewayPaymentId: gatewayPaymentId ?? payment.gatewayPaymentId ?? null,
    updatedAt: now(),
  });

  const confirmed = await advanceOrder(order, 'confirmed', {
    note: `Payment received (${reference ?? payment.reference}).`,
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
      /*
        Resolve each Photo ID before sending.

        The order item stores the artwork id and the title, but not the Photo
        ID, so it has to be read from the artwork itself. That lookup is the
        only thing that lets a photographer match "your work is on a wall" to
        one specific print - the ID on the plate beside it.
      */
      const placements = [];
      for (const item of theirItems) {
        const artwork = await db.artworks.byId(item.artworkId);
        placements.push({ title: item.artworkTitle, photoId: artwork?.photoId ?? null });
      }

      void sendArtistSelectedEmail(
        artistUser.email,
        artistProfile?.fullName ?? 'there',
        placements,
        space?.name ?? 'an ARTINU space',
        space?.city ?? '',
        space?.type === 'home_decor',
      );
    }

    for (const item of theirItems) {
      const artwork = await db.artworks.byId(item.artworkId);
      if (artwork) {
        await db.artworks.update(artwork.id, { selections: artwork.selections + item.quantity });
      }
    }

    /*
      No payout row is created, because there is no payout.

      This used to open one per artist per order, pending a payout run that
      would never pay anything. A row saying somebody is owed money is a
      liability on the books and a promise in the Console; writing one for a
      sum that is always zero is worse than writing none. The table itself is
      left in place so historical rows still read.
    */
  }

  await notifyRole('operations', {
    type: 'order_update',
    title: `New order ready for production - ${order.reference}`,
    body: `${confirmed.pricing.quantity} frames for ${space?.name ?? 'a space'}.`,
    link: `/console/orders/${order.id}`,
  });
  await notifyRole('manager', {
    type: 'order_update',
    title: `Order confirmed - ${order.reference}`,
    body: `${space?.name ?? 'A space'} placed an order.`,
    link: `/console/orders/${order.id}`,
  });

  const ownerUser = await db.users.byId(order.ownerId);
  if (ownerUser) {
    void sendPaymentConfirmation(ownerUser.email, ownerName, confirmed);
    void sendOrderConfirmation(ownerUser.email, ownerName, confirmed);
  }

  await recordAudit({
    actor,
    action: 'payment.verified',
    entity: 'payment',
    entityId: payment.id,
    meta: { orderId: order.id, amount: payment.amount, invoice: invoice.number },
    ip,
  });


  return { payment: paid, order: (await db.orders.byId(order.id))! };
}
