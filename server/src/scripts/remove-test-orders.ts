/**
 * Removes specific orders by reference, with their payments and invoices.
 *
 *   npx tsx src/scripts/remove-test-orders.ts ARTINU-2026-1006 ARTINU-2026-1003
 *
 * For clearing orders created while testing against a real database. It takes
 * explicit references rather than a date range or a status, because "everything
 * from today" is exactly the kind of filter that eventually catches a real
 * customer's order.
 *
 * Refuses anything already paid: a settled order has an invoice and a payment
 * behind it, and deleting one is a hole in the accounts rather than a tidy-up.
 */

import { db } from '@/database/db';

async function main(): Promise<void> {
  const references = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  if (references.length === 0) {
    console.error('Give one or more order references to remove.');
    process.exitCode = 1;
    return;
  }

  for (const reference of references) {
    const order = await db.orders.findOne({ reference });
    if (!order) {
      console.log(`skip   ${reference} - no such order`);
      continue;
    }

    if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
      console.log(`REFUSE ${reference} - status is "${order.status}", not an unpaid order`);
      continue;
    }

    let payments = 0;
    for (const payment of await db.payments.find({})) {
      if (payment.orderId !== order.id) continue;
      await db.payments.remove(payment.id);
      payments += 1;
    }

    let invoices = 0;
    for (const invoice of await db.invoices.find({ where: { orderId: order.id } })) {
      await db.invoices.remove(invoice.id);
      invoices += 1;
    }

    await db.orders.remove(order.id);
    console.log(`remove ${reference} - with ${payments} payment(s), ${invoices} invoice(s)`);
  }
}

void main();
