import { randomInt, randomUUID } from 'node:crypto';

export const uuid = () => randomUUID();

export const now = () => new Date().toISOString();

export function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function monthsFromNow(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

export function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export const isPast = (iso: string | null | undefined) =>
  Boolean(iso) && new Date(iso as string).getTime() < Date.now();

const pad = (value: number, length = 4) => String(value).padStart(length, '0');

/** CUR-2026-0417 — human-quotable in an email or over the phone. */
export function orderReference(sequence?: number): string {
  const year = new Date().getFullYear();
  return `CUR-${year}-${pad(sequence ?? randomInt(1000, 9999))}`;
}

/** INV-2026-0417 — matches the order it belongs to where possible. */
export function invoiceNumber(sequence?: number): string {
  const year = new Date().getFullYear();
  return `INV-${year}-${pad(sequence ?? randomInt(1000, 9999))}`;
}

export function paymentReference(): string {
  return `PAY${Date.now().toString(36).toUpperCase()}${randomInt(100, 999)}`;
}

/** Turns a name into a URL slug, keeping it unique against a set of taken ones. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root =
    base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'artist';

  if (!taken.has(root)) return root;
  let index = 2;
  while (taken.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
}
