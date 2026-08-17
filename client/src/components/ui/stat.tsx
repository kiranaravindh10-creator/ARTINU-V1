import { formatCurrency, formatNumber } from '@artinu/shared';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Dashboard metric.
 *
 * These used to be four identical bordered boxes in a row — the shape every
 * dashboard defaults to, and the reason the screens read as generic. Figures on
 * paper don't need a box each; a hairline between columns separates them just as
 * clearly and lets the numbers themselves carry the page. The number leads, in
 * the display serif, with the label above it in mono.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  format = 'number',
  className,
  href,
}: {
  label: string;
  value: number | string;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /** Percentage change against the previous period. */
  delta?: number | null;
  format?: 'number' | 'currency' | 'currency-compact' | 'raw';
  className?: string;
  href?: string;
}) {
  const display =
    typeof value === 'string'
      ? value
      : format === 'currency'
        ? formatCurrency(value)
        : format === 'currency-compact'
          ? formatCurrency(value, { compact: true })
          : format === 'raw'
            ? String(value)
            : formatNumber(value);

  const Wrapper = href ? 'a' : 'div';

  return (
    <Wrapper
      {...(href ? { href } : {})}
      className={cn(
        'flex flex-col gap-2 py-1',
        href && 'transition-colors hover:text-bronze',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-3.5 shrink-0 stroke-[1.6] text-bronze" aria-hidden />}
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-subtle">{label}</p>
      </div>

      <p className="font-display text-[2.125rem] leading-none text-ink">{display}</p>

      {(hint || typeof delta === 'number') && (
        <div className="flex items-center gap-2 text-xs text-muted">
          {typeof delta === 'number' && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                delta >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {delta >= 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </Wrapper>
  );
}

/**
 * Column separators, written out per count so Tailwind can see the literals it
 * needs to generate. `:not(:nth-child(Nn+1))` is every tile that is not the
 * first in its row.
 *
 * Only drawn at `lg`, where the grid genuinely has that many columns. Below it
 * the tiles wrap two-up and a vertical hairline would either land at the start
 * of a row or crowd figures that already have gap between them.
 */
const RULE = {
  between: '[&>*]:border-line',
  lg: (n: number) =>
    ({
      3: 'lg:[&>*:not(:nth-child(3n+1))]:border-l lg:[&>*:not(:nth-child(3n+1))]:pl-6',
      4: 'lg:[&>*:not(:nth-child(4n+1))]:border-l lg:[&>*:not(:nth-child(4n+1))]:pl-6',
      5: 'lg:[&>*:not(:nth-child(5n+1))]:border-l lg:[&>*:not(:nth-child(5n+1))]:pl-6',
    })[n] ?? '',
} as const;

/** Responsive row of tiles. */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-x-6 gap-y-7 border-y border-line py-7',
        // A hairline between columns replaces a box around each figure — but only
        // at the breakpoint where the grid really has that many columns, or the
        // rule lands at the start of a wrapped row.
        RULE.between,
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && ['sm:grid-cols-2 lg:grid-cols-3', RULE.lg(3)],
        columns === 4 && ['sm:grid-cols-2 lg:grid-cols-4', RULE.lg(4)],
        columns === 5 && ['sm:grid-cols-2 lg:grid-cols-5', RULE.lg(5)],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Label/value pair used in summaries, price breakdowns and detail panels. */
export function DataRow({
  label,
  value,
  emphasis,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5 text-sm',
        emphasis && 'border-t border-line pt-3 text-base',
        className,
      )}
    >
      <span className={cn(emphasis ? 'font-medium text-ink' : 'text-muted')}>{label}</span>
      <span
        className={cn(
          'text-right tabular-nums',
          emphasis ? 'font-display text-xl text-ink' : 'text-ink-soft',
        )}
      >
        {value}
      </span>
    </div>
  );
}
