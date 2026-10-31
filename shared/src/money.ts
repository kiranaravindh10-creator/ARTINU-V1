/**
 * Money arithmetic in whole paise.
 *
 * Rupee amounts are stored as numeric(12,2) and travel as JS numbers, which
 * cannot represent most decimal fractions exactly: 0.1 + 0.2 is not 0.3, and a
 * column of a few hundred expenses summed as floats drifts off by a paisa. So
 * every new financial calculation converts to integer paise, adds and
 * multiplies there, and converts back once at the end.
 */

/** ₹12.34 → 1234. Rounds half away from zero at the paisa. */
export function toPaise(rupees: number | string | null | undefined): number {
  const value = typeof rupees === 'string' ? Number(rupees) : (rupees ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** 1234 → 12.34 */
export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/** Sum rupee amounts exactly. */
export function sumRupees(values: Array<number | string | null | undefined>): number {
  return fromPaise(values.reduce<number>((total, value) => total + toPaise(value), 0));
}

/** quantity × unit price, exactly. */
export function lineTotalRupees(quantity: number, unitPrice: number): number {
  return fromPaise(Math.trunc(quantity) * toPaise(unitPrice));
}

/** True for a non-negative amount with at most two decimal places. */
export function isMoneyAmount(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/**
 * ₹1,724 or ₹349.50 - paise shown only when there are any. formatCurrency
 * rounds to whole rupees, which suits a price list and not an expense register.
 */
export function formatAmount(rupees: number | string | null | undefined): string {
  const paise = toPaise(rupees);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(fromPaise(paise));
}
