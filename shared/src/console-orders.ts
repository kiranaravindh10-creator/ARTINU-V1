import { z } from 'zod';
import {
  FRAME_COLORS,
  FRAME_SIZES,
  MIN_ORDER_QUANTITY,
  PRICING,
  SPACE_TYPES,
} from './constants.js';
import { PAYMENT_METHODS } from './finance.js';
import { fromPaise, isMoneyAmount, toPaise } from './money.js';
import { monthlyRatePerFrame, type TariffBook } from './pricing.js';

/**
 * Orders built by staff in the Console: for any client, at the standard tariff
 * or at a negotiated price.
 *
 * ── Clients are not accounts ────────────────────────────────────────────────
 *
 * A business ARTINU works with may never sign in. It is a `clients` row - a
 * name, a contact, an address - and the place the frames hang is a space that
 * belongs to that client rather than to a login. If they register later, a
 * member of staff links the two deliberately; nothing links on a matching
 * email alone.
 *
 * ── Prices ──────────────────────────────────────────────────────────────────
 *
 * The browser proposes; the server decides. `priceConsoleOrder` is shared so
 * the running total in the Console and the total the server stores come from
 * the same arithmetic, but the server re-runs it from the line items alone and
 * never reads a total, a standard price or an approval flag from a request.
 */

// ── Clients ──────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  /** CLT-0001, issued by the server. */
  code?: string | null;
  /** The business name. */
  name: string;
  type: (typeof SPACE_TYPES)[number];
  contactName: string;
  /** Optional: some businesses deal by phone only. */
  email?: string | null;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string | null;
  pin?: string | null;
  /** Kept for invoices once ARTINU is GST registered. Optional, unchecked against any registry. */
  gstin?: string | null;
  notes?: string | null;
  /** Set only by a deliberate link from staff, never by a matching email. */
  linkedUserId?: string | null;
  linkedAt?: string | null;
  linkedBy?: string | null;
  status: 'active' | 'archived';
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const clientInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter the business name').max(160),
  type: z.enum(SPACE_TYPES),
  contactName: z.string().trim().min(2, 'Enter a contact person').max(120),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .optional()
    .nullable()
    .or(z.literal('')),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
  addressLine1: z.string().trim().min(4, 'Enter the street address').max(200),
  addressLine2: optionalText(200),
  city: z.string().trim().min(2, 'Enter the city').max(120),
  state: optionalText(120),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a 6-digit PIN code')
    .optional()
    .nullable()
    .or(z.literal('')),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z]{15}$/, 'A GSTIN is 15 letters and digits')
    .optional()
    .nullable()
    .or(z.literal('')),
  notes: optionalText(600),
  /**
   * Where the frames go, when that is not the business address above. Becomes
   * the installation location; the client record keeps the billing address.
   */
  installAddress: z
    .object({
      addressLine1: z.string().trim().min(4, 'Enter the installation address').max(200),
      addressLine2: optionalText(200),
      city: z.string().trim().min(2).max(120),
      pin: z
        .string()
        .trim()
        .regex(/^\d{6}$/, 'Enter a 6-digit PIN code')
        .optional()
        .nullable()
        .or(z.literal('')),
    })
    .optional()
    .nullable(),
});
export type ClientInput = z.infer<typeof clientInputSchema>;

/** One result in "find an existing client": a registered space, or a client record. */
export interface ClientSearchResult {
  kind: 'space' | 'client';
  /** The space the order would be installed at, when one is known. */
  spaceId: string | null;
  clientId: string | null;
  name: string;
  city: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  spaceType: string | null;
  /** Whether a login account is attached. */
  hasAccount: boolean;
  /** Locations on file for a client, so the order can pick one. */
  spaces?: { id: string; name: string; city: string }[];
}

// ── Order lines ──────────────────────────────────────────────────────────────

export const ORDER_LINE_KINDS = ['frames', 'printing', 'installation', 'delivery', 'other'] as const;
export type OrderLineKind = (typeof ORDER_LINE_KINDS)[number];

export const ORDER_LINE_KIND_LABELS: Record<OrderLineKind, string> = {
  frames: 'Framed photographs',
  printing: 'Printing',
  installation: 'Installation',
  delivery: 'Delivery and transport',
  other: 'Other charge',
};

export const PRICING_MODES = ['standard', 'custom'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const ORDER_PAYMENT_TERMS = ['request_payment', 'paid_offline', 'collect_later', 'credit'] as const;
export type OrderPaymentTerms = (typeof ORDER_PAYMENT_TERMS)[number];

export const ORDER_PAYMENT_TERMS_LABELS: Record<OrderPaymentTerms, string> = {
  request_payment: 'Payment required from client',
  paid_offline: 'Client has already paid offline',
  collect_later: 'Payment will be collected later',
  credit: 'Approved credit - confirm before payment',
};

const SIZE_VALUES = FRAME_SIZES.map((size) => size.value) as [string, ...string[]];
const COLOR_VALUES = FRAME_COLORS.map((color) => color.value) as [string, ...string[]];

export interface ConsoleOrderLineInput {
  kind: OrderLineKind;
  description?: string | null;
  /** Frames only. */
  size?: string;
  color?: string;
  /** Frames only: the photographs in this line, one print each. */
  artworkIds?: string[];
  /** Services and charges only. Frames count their photographs. */
  quantity?: number;
  /** A negotiated price. Absent on a frames line means the standard tariff. */
  unitPrice?: number | null;
}

export interface PricedOrderLine {
  key: string;
  kind: OrderLineKind;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** The tariff rate for a frames line; null for services, which have no standard. */
  standardUnitPrice: number | null;
  priceSource: 'standard' | 'custom';
  size?: string;
  color?: string;
  artworkIds?: string[];
}

export interface ConsoleQuote {
  mode: PricingMode;
  lines: PricedOrderLine[];
  frameCount: number;
  framesTotal: number;
  standardFramesTotal: number;
  printing: number;
  installation: number;
  delivery: number;
  otherCharges: number;
  /** Every line, before discount and tax. */
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  /** What the same order costs at the standard tariff (services as entered). */
  standardTotal: number;
  /** How far below the standard price this is, in percent. Negative means above it. */
  reductionPercent: number;
  /** Any line off the tariff, any discount, or any service line. */
  customised: boolean;
  requiresApproval: boolean;
  taxNote: string;
}

export interface QuoteOptions {
  book: TariffBook;
  discount?: number;
  approvalThresholdPercent: number;
  gstRegistered?: boolean;
  gstRate?: number;
}

const FRAME_SIZE_LABEL = Object.fromEntries(FRAME_SIZES.map((size) => [size.value, size.label]));
const FRAME_COLOR_LABEL = Object.fromEntries(FRAME_COLORS.map((color) => [color.value, color.label]));

export function describeFrameLine(size?: string, color?: string): string {
  const material = color === 'white' ? 'metal' : 'wooden';
  return `${FRAME_SIZE_LABEL[size ?? ''] ?? size ?? 'Frame'} ${(FRAME_COLOR_LABEL[color ?? ''] ?? color ?? '').trim()} ${material} frame`.replace(/\s+/g, ' ');
}

/**
 * Price a Console order from its lines.
 *
 * All arithmetic is in integer paise. Throws a plain Error with a sentence a
 * person can act on when a line cannot be priced; the server turns that into a
 * 400 and the Console shows it beside the total.
 */
export function priceConsoleOrder(
  mode: PricingMode,
  lines: ConsoleOrderLineInput[],
  options: QuoteOptions,
): ConsoleQuote {
  const frameCount = lines
    .filter((line) => line.kind === 'frames')
    .reduce((count, line) => count + (line.artworkIds?.length ?? 0), 0);

  let framesPaise = 0;
  let standardFramesPaise = 0;
  const servicePaise: Record<Exclude<OrderLineKind, 'frames'>, number> = {
    printing: 0,
    installation: 0,
    delivery: 0,
    other: 0,
  };
  let customised = false;

  const priced: PricedOrderLine[] = lines.map((line, index) => {
    if (line.kind === 'frames') {
      const quantity = line.artworkIds?.length ?? 0;
      if (quantity < 1) throw new Error('Each frame line needs at least one photograph.');

      // The tier is set by the whole order's frame count, exactly as at checkout.
      const standard = monthlyRatePerFrame(line.size ?? '', frameCount, options.book);
      if (standard === null) {
        throw new Error(`There is no standard price for ${line.size ?? 'that'} frames.`);
      }

      const standardPaise = toPaise(standard);
      const custom = mode === 'custom' && line.unitPrice !== null && line.unitPrice !== undefined;
      const unitPaise = custom ? toPaise(line.unitPrice) : standardPaise;
      if (custom && unitPaise !== standardPaise) customised = true;

      framesPaise += unitPaise * quantity;
      standardFramesPaise += standardPaise * quantity;

      return {
        key: `frames-${index}`,
        kind: 'frames',
        description: line.description?.trim() || describeFrameLine(line.size, line.color),
        quantity,
        unitPrice: fromPaise(unitPaise),
        lineTotal: fromPaise(unitPaise * quantity),
        standardUnitPrice: standard,
        priceSource: custom ? 'custom' : 'standard',
        size: line.size,
        color: line.color,
        artworkIds: [...(line.artworkIds ?? [])],
      };
    }

    if (mode !== 'custom') {
      throw new Error('Services and extra charges are only available with custom pricing.');
    }
    const quantity = Math.max(1, Math.trunc(line.quantity ?? 1));
    if (line.unitPrice === null || line.unitPrice === undefined) {
      throw new Error(`Enter a price for ${ORDER_LINE_KIND_LABELS[line.kind].toLowerCase()}.`);
    }
    const unitPaise = toPaise(line.unitPrice);
    servicePaise[line.kind] += unitPaise * quantity;
    customised = true;

    return {
      key: `${line.kind}-${index}`,
      kind: line.kind,
      description: line.description?.trim() || ORDER_LINE_KIND_LABELS[line.kind],
      quantity,
      unitPrice: fromPaise(unitPaise),
      lineTotal: fromPaise(unitPaise * quantity),
      standardUnitPrice: null,
      priceSource: 'custom',
    };
  });

  const servicesPaise =
    servicePaise.printing + servicePaise.installation + servicePaise.delivery + servicePaise.other;
  const subtotalPaise = framesPaise + servicesPaise;

  // A discount can never take the order below zero.
  const requestedDiscount = mode === 'custom' ? toPaise(options.discount ?? 0) : 0;
  const discountPaise = Math.min(Math.max(0, requestedDiscount), subtotalPaise);
  if (discountPaise > 0) customised = true;

  const taxablePaise = subtotalPaise - discountPaise;
  const gstRegistered = options.gstRegistered ?? PRICING.GST_REGISTERED;
  const taxPaise = gstRegistered ? Math.round(taxablePaise * (options.gstRate ?? PRICING.GST_RATE)) : 0;
  const totalPaise = taxablePaise + taxPaise;

  // Services have no standard price, so they count at the price entered.
  const standardPaise = standardFramesPaise + servicesPaise;
  const reductionPercent =
    standardPaise > 0 ? Math.round(((standardPaise - taxablePaise) / standardPaise) * 10000) / 100 : 0;

  return {
    mode,
    lines: priced,
    frameCount,
    framesTotal: fromPaise(framesPaise),
    standardFramesTotal: fromPaise(standardFramesPaise),
    printing: fromPaise(servicePaise.printing),
    installation: fromPaise(servicePaise.installation),
    delivery: fromPaise(servicePaise.delivery),
    otherCharges: fromPaise(servicePaise.other),
    subtotal: fromPaise(subtotalPaise),
    discount: fromPaise(discountPaise),
    taxable: fromPaise(taxablePaise),
    tax: fromPaise(taxPaise),
    total: fromPaise(totalPaise),
    standardTotal: fromPaise(standardPaise),
    reductionPercent,
    customised: mode === 'custom' && customised,
    requiresApproval: mode === 'custom' && reductionPercent > options.approvalThresholdPercent,
    taxNote: gstRegistered
      ? `GST at ${Math.round((options.gstRate ?? PRICING.GST_RATE) * 100)}%`
      : 'GST is not charged - ARTINU is not yet GST registered.',
  };
}

// ── Approval and money on an order ───────────────────────────────────────────

export interface PriceApproval {
  required: boolean;
  status: 'not_required' | 'pending' | 'approved' | 'rejected';
  thresholdPercent: number;
  reductionPercent: number;
  reason?: string | null;
  requestedBy?: string | null;
  requestedByEmail?: string | null;
  requestedAt?: string | null;
  decidedBy?: string | null;
  decidedByEmail?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
}

export type OrderPaymentState = 'unpaid' | 'partially_paid' | 'paid' | 'refunded';

/** What has been paid against an order, worked out from its payment rows. */
export interface OrderMoney {
  total: number;
  paid: number;
  refunded: number;
  outstanding: number;
  state: OrderPaymentState;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const moneyOrZero = z.coerce
  .number()
  .min(0, 'Amounts cannot be negative')
  .max(10_000_000)
  .refine(isMoneyAmount, 'At most two decimal places');

export const consoleOrderLineSchema = z
  .object({
    kind: z.enum(ORDER_LINE_KINDS),
    description: optionalText(140),
    size: z.enum(SIZE_VALUES).optional(),
    color: z.enum(COLOR_VALUES).optional(),
    artworkIds: z.array(z.string().min(1)).max(60).optional(),
    quantity: z.coerce.number().int().min(1).max(500).optional(),
    unitPrice: moneyOrZero.optional().nullable(),
  })
  .superRefine((line, ctx) => {
    if (line.kind === 'frames') {
      if (!line.size) ctx.addIssue({ code: 'custom', message: 'Choose a frame size', path: ['size'] });
      if (!line.color) ctx.addIssue({ code: 'custom', message: 'Choose a frame colour', path: ['color'] });
      if (!line.artworkIds?.length) {
        ctx.addIssue({ code: 'custom', message: 'Add the photographs for this frame line', path: ['artworkIds'] });
      }
    } else if (line.unitPrice === null || line.unitPrice === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Enter a price for this line', path: ['unitPrice'] });
    }
    if (line.kind === 'other' && !line.description?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Say what this charge is for', path: ['description'] });
    }
  });

export const consoleClientRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('space'), spaceId: z.string().min(1, 'Choose the space') }),
  z.object({
    kind: z.literal('client'),
    clientId: z.string().min(1),
    /** Which of the client's locations; a new one is created from the client's address if absent. */
    spaceId: z.string().optional().nullable(),
  }),
  z.object({ kind: z.literal('new'), client: clientInputSchema }),
]);

const quoteFields = {
  client: consoleClientRefSchema,
  pricingMode: z.enum(PRICING_MODES),
  lines: z.array(consoleOrderLineSchema).min(1, 'Add at least one line').max(40),
  discount: moneyOrZero.default(0),
  couponCode: z.string().trim().max(40).optional().nullable(),
  /** Why the price differs from the tariff. Required whenever it does. */
  priceReason: optionalText(400),
  commercialTerms: optionalText(1000),
  notes: optionalText(600),
};

function checkOrderShape(
  order: {
    pricingMode: PricingMode;
    lines: z.infer<typeof consoleOrderLineSchema>[];
    discount: number;
    couponCode?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  const photographs = order.lines.flatMap((line) => (line.kind === 'frames' ? (line.artworkIds ?? []) : []));
  if (new Set(photographs).size !== photographs.length) {
    ctx.addIssue({ code: 'custom', message: 'The same photograph appears twice', path: ['lines'] });
  }

  if (order.pricingMode === 'standard') {
    if (order.lines.some((line) => line.kind !== 'frames')) {
      ctx.addIssue({ code: 'custom', message: 'Extra charges need custom pricing', path: ['lines'] });
    }
    if (order.lines.some((line) => line.unitPrice !== null && line.unitPrice !== undefined)) {
      ctx.addIssue({ code: 'custom', message: 'Standard pricing does not take a typed price', path: ['lines'] });
    }
    if (order.discount > 0) {
      ctx.addIssue({ code: 'custom', message: 'A discount needs custom pricing, or a coupon', path: ['discount'] });
    }
    // The product rule for a self-service collection still holds for a standard one.
    if (new Set(photographs).size < MIN_ORDER_QUANTITY) {
      ctx.addIssue({
        code: 'custom',
        message: `A standard collection starts at ${MIN_ORDER_QUANTITY} photographs`,
        path: ['lines'],
      });
    }
  } else if (order.couponCode?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Use the discount field with custom pricing', path: ['couponCode'] });
  }
}

export const consoleQuoteSchema = z.object(quoteFields).superRefine(checkOrderShape);
export type ConsoleQuoteInput = z.infer<typeof consoleQuoteSchema>;

export const consoleOrderPaymentSchema = z.discriminatedUnion('terms', [
  z.object({ terms: z.literal('request_payment') }),
  z.object({ terms: z.literal('collect_later') }),
  z.object({ terms: z.literal('credit'), note: optionalText(400) }),
  z.object({
    terms: z.literal('paid_offline'),
    amount: z.coerce
      .number()
      .positive('Enter the amount received')
      .max(10_000_000)
      .refine(isMoneyAmount, 'At most two decimal places'),
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date received'),
    method: z.enum(PAYMENT_METHODS),
    reference: optionalText(120),
    notes: optionalText(400),
  }),
]);

export const consoleOrderSchema = z
  .object({
    ...quoteFields,
    payment: consoleOrderPaymentSchema,
    /**
     * The branch handling the order. Central staff may choose; anyone held to a
     * branch records into their own, and naming another is refused.
     */
    branch: z.string().trim().max(80).optional().nullable(),
    /** Generated by the Console per attempt, so a double click cannot create two orders. */
    idempotencyKey: z.string().min(8).max(80),
  })
  .superRefine(checkOrderShape);
export type ConsoleOrderInput = z.infer<typeof consoleOrderSchema>;

export const priceApprovalDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(400).optional().nullable(),
});

export const linkClientAccountSchema = z
  .object({
    userId: z.string().min(1).optional(),
    /** The address the account signs in with - matched exactly, never guessed. */
    email: z.string().trim().toLowerCase().email('Enter the email address the account signs in with').optional(),
    reason: z.string().trim().min(5, 'Say how you confirmed this is the same business').max(400),
  })
  .refine((input) => Boolean(input.userId || input.email), {
    message: 'Say which account to link',
    path: ['email'],
  });
