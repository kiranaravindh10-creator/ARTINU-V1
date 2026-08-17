import {
  CONTACT,
  formatCurrency,
  formatDate,
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GLASS_TYPES,
  PRICING,
  PRINT_FINISHES,
  type FrameConfiguration,
  type Invoice,
  type Order,
  type Space,
} from '@artinu/shared';
import { db } from '@/database/db';
import { invoiceNumber, now } from '@/utils/ids';

/** Issue the GST invoice for a paid order — idempotent per order. */
export async function issueInvoice(order: Order): Promise<Invoice> {
  const existing = await db.invoices.findOne({ orderId: order.id });
  if (existing) return existing;

  const sequence = (await db.invoices.count()) + 1;

  const invoice = await db.invoices.insert({
    number: invoiceNumber(1000 + sequence),
    orderId: order.id,
    spaceId: order.spaceId,
    ownerId: order.ownerId,
    amount: order.pricing.total,
    gst: order.pricing.gst,
    issuedAt: now(),
    pdfUrl: null,
  });

  await db.orders.update(order.id, { invoiceId: invoice.id });
  return invoice;
}

const label = <T extends readonly { value: string; label: string }[]>(options: T, value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export function describeFrame(frame: FrameConfiguration): string {
  return [
    label(FRAME_SIZES, frame.size),
    label(FRAME_MATERIALS, frame.material),
    label(FRAME_COLORS, frame.color),
    `${label(GLASS_TYPES, frame.glass)} glass`,
    `${label(PRINT_FINISHES, frame.finish)} print`,
  ].join(' · ');
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(value: number): string {
  if (value < 20) return ONES[value]!;
  return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ''}`;
}

/** Indian numbering — an invoice has to be readable by an accountant. */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  if (rupees === 0) return 'Zero Rupees Only';

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = Math.floor((rupees % 1000) / 100);
  const rest = rupees % 100;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  return `${parts.join(' ')} Rupees Only`;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/**
 * A complete, printable GST invoice. It is rendered as self-contained HTML
 * rather than a PDF: no PDF toolchain in the MVP, and a browser prints this
 * perfectly well to paper or PDF.
 */
export function renderInvoiceHtml(invoice: Invoice, order: Order, space: Space | null): string {
  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td>
          <strong>${escapeHtml(item.artworkTitle)}</strong>
          <div class="muted">by ${escapeHtml(item.artistName)}</div>
          <div class="spec">${escapeHtml(describeFrame(item.frame))}</div>
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num">${formatCurrency(item.unitPrice)}</td>
        <td class="num">${formatCurrency(item.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  const line = (labelText: string, value: string, strong = false) => `
    <tr class="${strong ? 'total' : ''}">
      <td colspan="3" class="right">${labelText}</td>
      <td class="num">${value}</td>
    </tr>`;

  const { pricing } = order;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${invoice.number} — ARTINU</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #14120f;
         background: #f7f5f2; margin: 0; padding: 32px; line-height: 1.55; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fffefc; padding: 48px;
           border: 1px solid #e4ddd2; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 34px; margin: 0; font-weight: 400; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 1px solid #e4ddd2; padding-bottom: 24px; margin-bottom: 28px; }
  .eyebrow { font-family: ui-monospace, Menlo, monospace; font-size: 10px; letter-spacing: .18em;
             text-transform: uppercase; color: #9a7b4c; margin: 0 0 6px; }
  .meta { text-align: right; font-size: 13px; }
  .meta strong { display: block; font-size: 15px; }
  .parties { display: flex; gap: 48px; margin-bottom: 32px; font-size: 13px; }
  .parties h3 { font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
                color: #928a80; margin: 0 0 8px; font-weight: 500;
                font-family: ui-monospace, Menlo, monospace; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-family: ui-monospace, Menlo, monospace; font-size: 10px;
       letter-spacing: .14em; text-transform: uppercase; color: #928a80; font-weight: 500;
       padding: 0 8px 10px; border-bottom: 1px solid #e4ddd2; }
  td { padding: 14px 8px; border-bottom: 1px solid #efe9e0; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .right { text-align: right; color: #6b645c; }
  .muted { color: #6b645c; font-size: 12px; }
  .spec { color: #928a80; font-size: 11px; margin-top: 3px; }
  tr.total td { border-top: 1px solid #14120f; border-bottom: none; font-size: 17px;
                font-weight: 600; padding-top: 16px; }
  .words { margin-top: 20px; padding: 14px 16px; background: #f3efe8; font-size: 13px; }
  footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e4ddd2;
           font-size: 12px; color: #6b645c; display: flex; justify-content: space-between; gap: 24px; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: none; padding: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <p class="eyebrow">Tax Invoice</p>
        <h1>ARTINU</h1>
        <div class="muted" style="margin-top:8px">
          ${escapeHtml(CONTACT.address.line1)}<br />
          ${escapeHtml(CONTACT.address.line2)}<br />
          ${escapeHtml(CONTACT.address.city)} ${escapeHtml(CONTACT.address.pin)}, ${escapeHtml(CONTACT.address.country)}
        </div>
      </div>
      <div class="meta">
        <strong>${escapeHtml(invoice.number)}</strong>
        <div class="muted">Issued ${formatDate(invoice.issuedAt, 'long')}</div>
        <div class="muted">Order ${escapeHtml(order.reference)}</div>
      </div>
    </div>

    <div class="parties">
      <div style="flex:1">
        <h3>Billed to</h3>
        ${space ? `<strong>${escapeHtml(space.name)}</strong><br />` : ''}
        ${space ? `${escapeHtml(space.contactName)}<br />` : ''}
        ${space ? `${escapeHtml(space.addressLine1)}${space.addressLine2 ? `, ${escapeHtml(space.addressLine2)}` : ''}<br />` : ''}
        ${space ? `${escapeHtml(space.city)} ${escapeHtml(space.pin ?? '')}<br />` : ''}
        ${space ? `${escapeHtml(space.contactEmail)}` : ''}
      </div>
      <div style="flex:1">
        <h3>Installation address</h3>
        ${space ? `${escapeHtml(space.addressLine1)}<br />${escapeHtml(space.city)}` : '—'}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Unit</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${line('Subtotal', formatCurrency(pricing.subtotal))}
        ${pricing.discount > 0 ? line(`Discount${pricing.couponCode ? ` (${escapeHtml(pricing.couponCode)})` : ''}`, `− ${formatCurrency(pricing.discount)}`) : ''}
        ${line('Delivery', pricing.delivery === 0 ? 'Free' : formatCurrency(pricing.delivery))}
        ${line('Installation', formatCurrency(pricing.installation))}
        ${line(`GST @ ${PRICING.GST_RATE * 100}%`, formatCurrency(pricing.gst))}
        ${pricing.securityDeposit > 0 ? line('Refundable security deposit', formatCurrency(pricing.securityDeposit)) : ''}
        ${line('Total', formatCurrency(pricing.total), true)}
      </tbody>
    </table>

    <div class="words"><strong>Amount in words:</strong> ${amountInWords(pricing.total)}</div>

    <footer>
      <div>
        ${escapeHtml(CONTACT.email)} · ${escapeHtml(CONTACT.phone)}<br />
        This is a computer-generated invoice and does not require a signature.
      </div>
      <div style="text-align:right">
        Frames remain the property of ARTINU<br />and are provided on rotation.
      </div>
    </footer>
  </div>
</body>
</html>`;
}
