import { Router } from 'express';
import { db } from '@/database/db';
import { asyncHandler, requireAuth } from '@/middleware/index';
import { forbidden, notFound } from '@/utils/errors';
import { renderInvoiceHtml } from '@/services/invoice.service';

export const invoiceRouter = Router();

const INTERNAL = ['ceo', 'manager', 'accounts', 'operations', 'it_team'];

invoiceRouter.use(requireAuth);

invoiceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const invoices = await db.invoices.find({
      where: INTERNAL.includes(user.role) ? undefined : { ownerId: user.id },
      orderBy: { field: 'issuedAt', direction: 'desc' },
    });
    res.json(invoices);
  }),
);

async function loadInvoice(id: string, userId: string, role: string) {
  const invoice = await db.invoices.byId(id);
  if (!invoice) throw notFound('That invoice');
  if (invoice.ownerId !== userId && !INTERNAL.includes(role)) {
    throw forbidden('That invoice belongs to another account.');
  }

  const order = await db.orders.byId(invoice.orderId);
  if (!order) throw notFound('The order for that invoice');

  return { invoice, order };
}

invoiceRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { invoice, order } = await loadInvoice(req.params.id, req.user!.id, req.user!.role);
    res.json({ invoice, order });
  }),
);

invoiceRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const { invoice, order } = await loadInvoice(req.params.id, req.user!.id, req.user!.role);
    const space = await db.spaces.byId(invoice.spaceId);

    // Self-contained HTML rather than a PDF: no PDF toolchain in the MVP, and
    // the browser prints this to paper or PDF perfectly well.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.html"`);
    res.send(renderInvoiceHtml(invoice, order, space));
  }),
);
