import {
  RENTAL_TARIFF,
  HOME_TARIFF_SPACE_TYPES,
  ALL_FRAME_COLORS,
  ALL_FRAME_MATERIALS,
  ALL_FRAME_SIZES,
  ALL_GLASS_TYPES,
  ALL_PRINT_FINISHES,
  PRICING,
} from './constants.js';
import type { FrameConfiguration, PriceBreakdown } from './types.js';

/**
 * Pricing lives in shared/ deliberately: the checkout preview the space owner
 * sees and the total the server charges are produced by the same function, so
 * they cannot disagree. The server result is always authoritative.
 */

const lookup = <T extends readonly { value: string; multiplier: number }[]>(
  options: T,
  value: string,
): number => options.find((o) => o.value === value)?.multiplier ?? 1;

export type TariffBook = keyof typeof RENTAL_TARIFF;
export type SubscriptionTerm = 'monthly' | 'quarterly' | 'biannual';

/** Which price book a space type is billed from. */
export function tariffBookFor(spaceType?: string | null): TariffBook {
  return (HOME_TARIFF_SPACE_TYPES as readonly string[]).includes(spaceType ?? '')
    ? 'home_decor'
    : 'standard';
}

/**
 * The monthly rate for ONE frame, given how many the space is taking.
 *
 * Returns null for a size the tariff does not cover, so a caller can refuse the
 * order rather than silently charge zero for it - a frame with no published
 * rate is a business decision, not a rounding case.
 */
export function monthlyRatePerFrame(
  size: string,
  frameCount: number,
  book: TariffBook = 'standard',
  term: SubscriptionTerm = 'monthly',
): number | null {
  const sizes = RENTAL_TARIFF[book] as Record<string, Partial<Record<SubscriptionTerm, readonly number[]>>>;
  const bySize = sizes[size];
  if (!bySize) return null;

  // The home book publishes only a monthly column; fall back rather than invent
  // a discount for a term it does not price.
  const row = bySize[term] ?? bySize.monthly;
  if (!row || row.length === 0) return null;

  const index = Math.min(Math.max(1, Math.trunc(frameCount)), row.length) - 1;
  return row[index] ?? null;
}

export interface PricedLine {
  framePrice: number;
  printPrice: number;
  licensePrice: number;
  unitPrice: number;
  lineTotal: number;
  artistCommission: number;
}

/**
 * The OLD sale calculation - base frame cost, print cost and artwork licence.
 *
 * Retained for two callers only: reading back an order placed before the
 * rental tariff, and pricing a size the tariff does not publish (a withdrawn
 * size still sitting in a restored cart). New orders are priced by
 * `monthlyRatePerFrame`; nothing should route new work through here.
 */
export function priceLine(frame: FrameConfiguration, quantity: number): PricedLine {
  // ALL_, not the offered lists: an order placed last month still has to price
  // to the same number it was charged.
  const sizeMultiplier = lookup(ALL_FRAME_SIZES, frame.size);
  const materialMultiplier = lookup(ALL_FRAME_MATERIALS, frame.material);
  const colorMultiplier = lookup(ALL_FRAME_COLORS, frame.color);
  const glassMultiplier = lookup(ALL_GLASS_TYPES, frame.glass);
  const finishMultiplier = lookup(ALL_PRINT_FINISHES, frame.finish);

  const framePrice = round(
    PRICING.BASE_FRAME_COST * sizeMultiplier * materialMultiplier * colorMultiplier * glassMultiplier,
  );
  const printPrice = round(PRICING.BASE_PRINT_COST * sizeMultiplier * finishMultiplier);
  const licensePrice = PRICING.ARTWORK_LICENSE_FEE;

  const unitPrice = framePrice + printPrice + licensePrice;
  const qty = Math.max(1, Math.trunc(quantity));

  return {
    framePrice,
    printPrice,
    licensePrice,
    unitPrice,
    lineTotal: unitPrice * qty,
    artistCommission: round(licensePrice * PRICING.ARTIST_COMMISSION_RATE) * qty,
  };
}

export interface PriceableItem {
  frame: FrameConfiguration;
  quantity: number;
}

export interface PricingOptions {
  /** Percentage discount applied to the subtotal, 0–100. */
  discountPercent?: number;
  /**
   * A flat discount in rupees, applied INSTEAD of the percentage.
   *
   * Separate from `discountPercent` rather than pre-converted to one,
   * because "₹100 off" expressed as a percentage of a changing subtotal
   * stops being ₹100 the moment another frame is added. Clamped to the
   * subtotal below, so a discount larger than the order cannot produce a
   * negative total.
   */
  discountAmount?: number;
  couponCode?: string | null;
  includeSecurityDeposit?: boolean;
  /** Set false for rotation refreshes where the crew is already on site. */
  chargeInstallation?: boolean;
  /**
   * Which price book to bill from. Derived from the space type by
   * `tariffBookFor`; defaults to the standard (business) tariff.
   */
  book?: TariffBook;
  /** Commitment term. Only 'monthly' is sold today. */
  term?: SubscriptionTerm;
  /**
   * Where the crew is installing - 'cafe' or 'home'.
   *
   * Undefined means no installation charge at all, which is the behaviour
   * every existing caller gets without changing a line. Nothing is inferred
   * from the space type: charging somebody because a field was guessed is
   * worse than not charging them.
   */
  installationType?: string | null;
}

/** Build the full breakdown a space owner sees at checkout (requirements §9). */
export function calculatePricing(
  items: PriceableItem[],
  options: PricingOptions = {},
): PriceBreakdown {
  const {
    discountPercent = 0,
    discountAmount = 0,
    couponCode = null,
    includeSecurityDeposit = false,
    chargeInstallation = true,
    installationType = null,
    book = 'standard',
    term = 'monthly',
  } = options;

  let artworkTotal = 0;
  let frameTotal = 0;
  let printingTotal = 0;
  let quantity = 0;

  /*
    ── Priced from the rental tariff ─────────────────────────────────────────

    ARTINU rents framed photographs by the month. The tariff publishes a rate
    per frame per month, and that rate depends on HOW MANY frames the space
    takes - so the whole basket has to be counted before any line can be
    priced. That is why this is two passes and not one.

    The tier applies to every frame, not just the ones past a threshold: four
    A3 frames on the home book are 4 x 259, which is what the CEO's tables
    show when you multiply their per-frame column by their count column.

    The old model - base frame cost x size multiplier, plus a print cost, plus
    a ₹1,200 artwork licence - is gone from new orders. It described a sale,
    and nothing here is sold: the frame and the print both come back when the
    subscription ends.
  */
  const frameCount = items.reduce((sum, item) => sum + Math.max(1, Math.trunc(item.quantity)), 0);

  for (const item of items) {
    const qty = Math.max(1, Math.trunc(item.quantity));
    const rate = monthlyRatePerFrame(item.frame.size, frameCount, book, term);

    if (rate === null) {
      /*
        No published rate for this size - only reachable for a size withdrawn
        from sale that is still sitting in somebody's restored cart. Falling
        back to the old calculation keeps that cart readable rather than
        pricing it at zero; the configurator will not let a new one be built.
      */
      const legacy = priceLine(item.frame, qty);
      artworkTotal += legacy.licensePrice * qty;
      frameTotal += legacy.framePrice * qty;
      printingTotal += legacy.printPrice * qty;
    } else {
      /*
        The rate IS the price. It is not split into a frame part and a print
        part, because the tariff does not publish one and inventing a split
        would put made-up numbers on a real invoice.
      */
      frameTotal += rate * qty;
    }

    quantity += qty;
  }

  const subtotal = artworkTotal + frameTotal + printingTotal;
  /*
    A flat discount wins when one is given, and neither can exceed the
    subtotal. The clamp is what stops a ₹500 coupon on a ₹369 order
    producing a negative total.
  */
  const discount = round(
    discountAmount > 0
      ? Math.min(discountAmount, subtotal)
      : (subtotal * clamp(discountPercent, 0, 100)) / 100,
  );
  const taxable = subtotal - discount;

  /*
    Delivery, installation and GST are all zero right now, and each for its own
    reason - see PRICING in constants.ts.

    They are still computed rather than deleted. The breakdown is what an
    invoice is rendered from and what an order stores, so the fields have to
    keep existing and keep reading back correctly for orders that WERE charged
    these amounts. When the GSTIN arrives, flipping GST_REGISTERED is the whole
    change; nothing here needs editing.
  */
  const delivery = PRICING.DELIVERY_INCLUDED
    ? 0
    : taxable >= PRICING.FREE_DELIVERY_THRESHOLD
      ? 0
      : PRICING.DELIVERY_CHARGE;
  /*
    Once for the order, not once per frame - see INSTALLATION_CHARGE_PER_ORDER.
    `quantity` is deliberately not part of this expression.
  */
  const installation =
    chargeInstallation && installationType
      ? (PRICING.INSTALLATION_CHARGE_PER_ORDER[installationType] ?? 0)
      : 0;
  const securityDeposit = includeSecurityDeposit
    ? PRICING.SECURITY_DEPOSIT_PER_FRAME * quantity
    : 0;

  // GST applies to goods and services, not to the refundable deposit - and not
  // at all until ARTINU is registered to charge it.
  const gst = PRICING.GST_REGISTERED
    ? round((taxable + delivery + installation) * PRICING.GST_RATE)
    : 0;
  const total = round(taxable + delivery + installation + gst + securityDeposit);

  return {
    artworkTotal: round(artworkTotal),
    frameTotal: round(frameTotal),
    printingTotal: round(printingTotal),
    subtotal: round(subtotal),
    discount,
    couponCode,
    gst,
    delivery,
    installation,
    securityDeposit,
    total,
    quantity,
  };
}

/**
 * What a validated coupon takes off an order.
 *
 * The seeded `COUPONS` object that used to sit here is gone. It could not be
 * edited without a deploy, and one of its codes still carried the old brand
 * name customers were typing. Coupons are rows now and the server resolves
 * them; this is only the arithmetic, shared so the cart preview and the
 * charged total cannot disagree.
 */
export function couponDiscount(
  coupon: { type: 'percent' | 'flat'; value: number; maxDiscount?: number | null },
  subtotal: number,
): number {
  if (coupon.type === 'flat') return round(Math.min(coupon.value, subtotal));
  const raw = (subtotal * clamp(coupon.value, 0, 100)) / 100;
  return round(coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw);
}

/** The default frame a space owner starts from before they configure anything. */
export const DEFAULT_FRAME: FrameConfiguration = {
  size: 'a3',
  material: 'wood',
  color: 'brown',
  glass: 'normal',
  finish: 'matte',
};

/**
 * The least expensive complete configuration. Every multiplier in the catalogue
 * is >= 1, so this is genuinely the floor — which is what "Starting price" on an
 * artwork has to mean for the number to be honest.
 */
export const CHEAPEST_FRAME: FrameConfiguration = {
  size: 'a4',
  material: 'wood',
  color: 'brown',
  glass: 'normal',
  finish: 'matte',
};

/** "From ₹3,299" — one framed print in the entry configuration. */
export function startingPrice(): number {
  return priceLine(CHEAPEST_FRAME, 1).unitPrice;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
