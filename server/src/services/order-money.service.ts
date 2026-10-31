import { fromPaise, toPaise, type Order, type OrderMoney, type Payment } from '@artinu/shared';
import { db } from '@/database/db';

/**
 * What has actually been paid against an order.
 *
 * Worked out from the payment rows every time, never stored, so there is one
 * source for it. The rules that keep it honest:
 *
 *   - Only money that arrived counts. A gateway attempt that was created,
 *     expired or failed is not money; neither is a reference waiting to be
 *     verified.
 *   - A refunded payment arrived and then partly or wholly went back. It counts
 *     as received, and the refund is counted separately - so neither the
 *     collection nor the refund disappears from the record.
 *   - A refund recorded before refunds had an amount was always in full.
 *   - A cancelled order owes nothing, whatever was or was not paid.
 */
export function orderMoney(order: Order, payments: Payment[]): OrderMoney {
  let receivedPaise = 0;
  let refundedPaise = 0;

  for (const payment of payments) {
    if (payment.orderId !== order.id) continue;
    if (payment.status === 'succeeded') {
      receivedPaise += toPaise(payment.amount);
    } else if (payment.status === 'refunded') {
      receivedPaise += toPaise(payment.amount);
      refundedPaise += toPaise(payment.refundedAmount ?? payment.amount);
    }
  }

  const totalPaise = toPaise(order.pricing.total);
  const netPaise = receivedPaise - refundedPaise;
  const outstandingPaise = order.status === 'cancelled' ? 0 : Math.max(0, totalPaise - netPaise);

  const state: OrderMoney['state'] =
    refundedPaise > 0 && netPaise <= 0
      ? 'refunded'
      : netPaise <= 0
        ? 'unpaid'
        : netPaise < totalPaise
          ? 'partially_paid'
          : 'paid';

  return {
    total: fromPaise(totalPaise),
    paid: fromPaise(receivedPaise),
    refunded: fromPaise(refundedPaise),
    outstanding: fromPaise(outstandingPaise),
    state,
  };
}

export async function orderMoneyFor(order: Order): Promise<OrderMoney> {
  const payments = await db.payments.find({ where: { orderId: order.id } });
  return orderMoney(order, payments);
}

/** The amount an online checkout should ask for: what is still owed. */
export async function outstandingFor(order: Order): Promise<number> {
  return (await orderMoneyFor(order)).outstanding;
}
