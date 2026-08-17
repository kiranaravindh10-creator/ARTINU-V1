import {
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GLASS_TYPES,
  PRICING,
  PRINT_FINISHES,
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

export interface PricedLine {
  framePrice: number;
  printPrice: number;
  licensePrice: number;
  unitPrice: number;
  lineTotal: number;
  artistCommission: number;
}

/** Price a single configured frame (per unit, then multiplied by quantity). */
export function priceLine(frame: FrameConfiguration, quantity: number): PricedLine {
  const sizeMultiplier = lookup(FRAME_SIZES, frame.size);
  const materialMultiplier = lookup(FRAME_MATERIALS, frame.material);
  const colorMultiplier = lookup(FRAME_COLORS, frame.color);
  const glassMultiplier = lookup(GLASS_TYPES, frame.glass);
  const finishMultiplier = lookup(PRINT_FINISHES, frame.finish);

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
  couponCode?: string | null;
  includeSecurityDeposit?: boolean;
  /** Set false for rotation refreshes where the crew is already on site. */
  chargeInstallation?: boolean;
}

/** Build the full breakdown a space owner sees at checkout (requirements §9). */
export function calculatePricing(
  items: PriceableItem[],
  options: PricingOptions = {},
): PriceBreakdown {
  const {
    discountPercent = 0,
    couponCode = null,
    includeSecurityDeposit = false,
    chargeInstallation = true,
  } = options;

  let artworkTotal = 0;
  let frameTotal = 0;
  let printingTotal = 0;
  let quantity = 0;

  for (const item of items) {
    const qty = Math.max(1, Math.trunc(item.quantity));
    const line = priceLine(item.frame, qty);
    artworkTotal += line.licensePrice * qty;
    frameTotal += line.framePrice * qty;
    printingTotal += line.printPrice * qty;
    quantity += qty;
  }

  const subtotal = artworkTotal + frameTotal + printingTotal;
  const discount = round((subtotal * clamp(discountPercent, 0, 100)) / 100);
  const taxable = subtotal - discount;

  const delivery = taxable >= PRICING.FREE_DELIVERY_THRESHOLD ? 0 : PRICING.DELIVERY_CHARGE;
  const installation = chargeInstallation ? PRICING.INSTALLATION_CHARGE_PER_FRAME * quantity : 0;
  const securityDeposit = includeSecurityDeposit
    ? PRICING.SECURITY_DEPOSIT_PER_FRAME * quantity
    : 0;

  // GST applies to goods and services, not to the refundable deposit.
  const gst = round((taxable + delivery + installation) * PRICING.GST_RATE);
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

/** Coupons are seeded rather than stored for the MVP. */
export const COUPONS: Record<string, { percent: number; label: string }> = {
  CURATE10: { percent: 10, label: '10% off your first collection' },
  FIRSTSPACE: { percent: 15, label: '15% off — new space welcome' },
  ROTATE5: { percent: 5, label: '5% off rotation refresh' },
};

export function resolveCoupon(code?: string | null): { percent: number; label: string } | null {
  if (!code) return null;
  return COUPONS[code.trim().toUpperCase()] ?? null;
}

/** The default frame a space owner starts from before they configure anything. */
export const DEFAULT_FRAME: FrameConfiguration = {
  size: 'a3_landscape',
  material: 'wood',
  color: 'black',
  glass: 'matte',
  finish: 'matte',
};

/**
 * The least expensive complete configuration. Every multiplier in the catalogue
 * is >= 1, so this is genuinely the floor — which is what "Starting price" on an
 * artwork has to mean for the number to be honest.
 */
export const CHEAPEST_FRAME: FrameConfiguration = {
  size: 'a3_landscape',
  material: 'wood',
  color: 'black',
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
