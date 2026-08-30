import { couponDiscount, type Coupon } from '@artinu/shared';
import { db } from '@/database/db';

/**
 * Coupon validation, in one place.
 *
 * Every rule that can refuse a code lives here rather than in the route, so the
 * cart preview, the server quote and the order that is finally charged all
 * reach the same verdict. A code that previews as valid and is then refused at
 * checkout is worse than one that never worked.
 *
 * The reasons are deliberately specific. "That code is not valid" for an
 * expired coupon sends somebody to support to ask why; "that code expired on
 * the 3rd" answers it.
 */
export interface CouponVerdict {
  ok: boolean;
  coupon?: Coupon;
  /** Rupees off, already computed against this subtotal. */
  discount?: number;
  message: string;
}

/** Case-insensitive lookup. Codes are stored upper case; customers type anything. */
export async function findCoupon(code: string): Promise<Coupon | null> {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return null;
  const all = (await db.coupons.find({})) as Coupon[];
  return all.find((coupon) => coupon.code.trim().toUpperCase() === wanted) ?? null;
}

/**
 * Can this code be used on this order, right now?
 *
 * `subtotal` and `category` are passed in rather than looked up because the
 * caller already has them, and because a coupon has to be judged against the
 * basket in front of it - not against the order as it was when the code was
 * typed.
 */
export async function validateCoupon(
  code: string,
  subtotal: number,
  category?: string | null,
): Promise<CouponVerdict> {
  const coupon = await findCoupon(code);
  if (!coupon) return { ok: false, message: 'That code is not one of ours.' };

  if (!coupon.active) {
    return { ok: false, coupon, message: 'That code is no longer active.' };
  }

  const now = Date.now();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    return { ok: false, coupon, message: 'That code cannot be used yet.' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) {
    return { ok: false, coupon, message: 'That code has expired.' };
  }

  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, coupon, message: 'That code has already been fully used.' };
  }

  if (coupon.minOrderAmount != null && subtotal < coupon.minOrderAmount) {
    return {
      ok: false,
      coupon,
      message: `That code needs an order of at least ₹${coupon.minOrderAmount.toLocaleString('en-IN')}.`,
    };
  }

  /*
    An empty category list means "everywhere". Only a non-empty list restricts,
    so a coupon created without thinking about categories still works.
  */
  const limitedTo = coupon.categories ?? [];
  if (limitedTo.length > 0 && category && !limitedTo.includes(category)) {
    return { ok: false, coupon, message: 'That code does not apply to this kind of space.' };
  }

  return {
    ok: true,
    coupon,
    discount: couponDiscount(coupon, subtotal),
    message: coupon.label,
  };
}

/**
 * Count a use, once the order actually exists.
 *
 * Deliberately not called during validation: a customer who types a code and
 * then abandons the basket has not used it, and counting them would burn a
 * limited coupon on somebody who never paid.
 */
export async function recordCouponUse(code: string): Promise<void> {
  const coupon = await findCoupon(code);
  if (!coupon) return;
  await db.coupons.update(coupon.id, {
    usedCount: (coupon.usedCount ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  });
}
