import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Shared furniture for the Studio and Space screens.
 *
 * Everything here is drawn with a hairline, a bronze rule or a change of type —
 * never a box. The photography is the only thing on these pages allowed to hold
 * a hard edge.
 */

/* ── Figures ──────────────────────────────────────────────────────────────── */

/**
 * A headline number. The bronze tick above it is the only ornament; the value
 * carries the display serif, the label says what it counts and the hint gives
 * the one piece of context that stops the number being ambiguous.
 */
export function Figure({
  value,
  label,
  hint,
  trend,
  to,
  className,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Rendered after the hint, in success or danger. */
  trend?: { direction: 'up' | 'down'; text: string };
  to?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className="block h-px w-6 bg-bronze" aria-hidden />
      <p className="mt-4 font-display text-[2.25rem] leading-none text-ink lg:text-[2.5rem]">
        {value}
      </p>
      <p className="mt-3 text-[0.8125rem] text-ink-soft">{label}</p>
      {(hint || trend) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
          {hint}
          {trend && (
            <span className={trend.direction === 'up' ? 'text-success' : 'text-danger'}>
              {trend.direction === 'up' ? '↑' : '↓'} {trend.text}
            </span>
          )}
        </p>
      )}
    </>
  );

  const classes = cn('min-w-0', to && 'transition-opacity hover:opacity-70', className);

  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** The row of figures under a screen's opening. */
export function FigureRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-8 gap-y-9 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-16',
        '[&>*]:lg:min-w-[9rem]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Section heads ────────────────────────────────────────────────────────── */

/**
 * The head of a section inside a screen: a serif title with an optional line of
 * context, and whatever belongs on the right.
 */
export function SectionHead({
  title,
  description,
  aside,
  icon: Icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-xl leading-none text-ink">
          {Icon && <Icon className="size-4 shrink-0 stroke-[1.4] text-bronze" aria-hidden />}
          {title}
        </h2>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-3">{aside}</div>}
    </div>
  );
}

/** The quiet "more of this elsewhere" link that ends most sections. */
export function ViewAll({
  to,
  children = 'View all',
  className,
}: {
  to: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex items-center gap-2 text-[0.8125rem] text-muted transition-colors hover:text-ink',
        className,
      )}
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-1" />
    </Link>
  );
}

/**
 * A ringed arrow. Reserved for the one forward action a screen is really about
 * — never more than one per screen, or it stops meaning anything.
 */
export function CircleArrow({
  to,
  label,
  onClick,
  className,
}: {
  to?: string;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const classes = cn(
    'flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink',
    'transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-canvas',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40',
    className,
  );

  return to ? (
    <Link to={to} aria-label={label} title={label} className={classes}>
      <ArrowRight className="size-4" />
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={classes}>
      <ArrowRight className="size-4" />
    </button>
  );
}

/* ── Status ───────────────────────────────────────────────────────────────── */

export type StatusTone = 'neutral' | 'info' | 'bronze' | 'success' | 'warning' | 'danger';

const TONE: Record<StatusTone, string> = {
  neutral: 'text-subtle',
  info: 'text-info',
  bronze: 'text-bronze',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * Status reads as coloured words, not as a pill.
 *
 * A row of filled badges turns a list into a colour chart and makes every state
 * shout equally loudly. Set at the size of the text around it and simply
 * tinted, the state stays scannable and the list stays calm.
 */
export function Status({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('text-[0.8125rem]', TONE[tone], className)}>{children}</span>;
}

/* ── Lists ────────────────────────────────────────────────────────────────── */

/** Hairline-separated rows. The default list shape across both dashboards. */
export function Rows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={cn('divide-y divide-line-soft', className)}>{children}</ul>;
}

/**
 * A vertical timeline. Used where the order of events is the point — an order
 * moving through its stages, a feed of recent activity.
 */
export function Timeline({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ol className={cn('relative', className)}>{children}</ol>;
}

export function TimelineItem({
  current,
  done,
  last,
  children,
  className,
}: {
  current?: boolean;
  done?: boolean;
  last?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn('relative flex gap-4 pb-6 last:pb-0', className)}>
      {!last && (
        <span
          className={cn('absolute left-[0.1875rem] top-3 h-full w-px', done ? 'bg-line-strong' : 'bg-line')}
          aria-hidden
        />
      )}
      <span
        className={cn(
          'relative mt-1.5 size-[0.4375rem] shrink-0 rounded-full',
          current ? 'bg-bronze ring-4 ring-bronze/15' : done ? 'bg-ink' : 'border border-line-strong bg-canvas',
        )}
        aria-hidden
      />
      <div className="-mt-1 min-w-0 flex-1">{children}</div>
    </li>
  );
}
