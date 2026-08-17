import { PRICING } from './constants.js';

/** Indian-format currency, no decimals — ₹12,450. */
export function formatCurrency(amount: number, options: { compact?: boolean } = {}): string {
  if (options.compact) {
    if (amount >= 10000000) return `${PRICING.CURRENCY_SYMBOL}${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `${PRICING.CURRENCY_SYMBOL}${(amount / 100000).toFixed(2)} L`;
    if (amount >= 1000) return `${PRICING.CURRENCY_SYMBOL}${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: PRICING.CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatDate(value: string | Date, style: 'short' | 'long' = 'short'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const abs = Math.abs(diffMinutes);
  if (abs < 60) return rtf.format(diffMinutes, 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(diffMinutes / 60), 'hour');
  if (abs < 60 * 24 * 30) return rtf.format(Math.round(diffMinutes / (60 * 24)), 'day');
  return rtf.format(Math.round(diffMinutes / (60 * 24 * 30)), 'month');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
