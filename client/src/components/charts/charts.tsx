import { formatCurrency, formatNumber, type TrendPoint } from '@artinu/shared';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Hand-drawn SVG charts rather than a charting library — the brief asks for
 * "no unnecessary charts or enterprise BI dashboards", so these are deliberately
 * small, single-series and readable at a glance. One ink line on paper, bronze
 * only for the value under the cursor.
 */

const PALETTE = {
  ink: 'var(--color-ink)',
  bronze: 'var(--color-bronze)',
  line: 'var(--color-line)',
  sand: 'var(--color-sand)',
};

function niceMax(values: number[]): number {
  const max = Math.max(...values, 1);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

const formatValue = (value: number, format: 'number' | 'currency') =>
  format === 'currency' ? formatCurrency(value, { compact: true }) : formatNumber(value);

/**
 * Measures its own box.
 *
 * A viewBox alone scales the drawing to the container, so a chart asked for
 * 200px tall rendered at 400 in a wide column and took the stroke weight and
 * the axis type up with it. Reading the real width means `height` means pixels,
 * and the line stays a hairline whatever the column does.
 */
function useMeasuredWidth(fallback = 640) {
  const [width, setWidth] = React.useState(fallback);
  const observer = React.useRef<ResizeObserver | null>(null);

  // A callback ref, not useRef + useEffect: the chart renders a placeholder
  // while its series loads, so the element this measures does not exist on
  // mount. A mount effect would attach to nothing and never run again.
  const ref = React.useCallback((node: Element | null) => {
    observer.current?.disconnect();
    if (!node) return;

    observer.current = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0;
      if (next > 0) setWidth(next);
    });
    observer.current.observe(node);
  }, []);

  React.useEffect(() => () => observer.current?.disconnect(), []);

  return { ref, width };
}

/** Trend line with an area wash — earnings and orders over the last 12 months. */
export function TrendChart({
  data,
  format = 'number',
  height = 200,
  className,
  label,
}: {
  data: TrendPoint[];
  format?: 'number' | 'currency';
  height?: number;
  className?: string;
  /** Only rendered when the surrounding section does not already say it. */
  label?: string;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const id = React.useId();
  const { ref, width } = useMeasuredWidth();

  if (data.length === 0) {
    return (
      <div className={cn('flex h-40 items-center text-sm text-subtle', className)}>
        Nothing to chart yet.
      </div>
    );
  }

  const padding = { top: 14, right: 10, bottom: 24, left: 44 };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const max = niceMax(data.map((point) => point.value));

  const x = (index: number) =>
    padding.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  const linePath = data
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`)
    .join(' ');
  const areaPath = `${linePath} L${x(data.length - 1)},${padding.top + plotHeight} L${x(0)},${
    padding.top + plotHeight
  } Z`;

  const last = data.length - 1;
  const shown = active ?? last;
  const point = data[shown]!;
  const gridlines = [0, 0.5, 1];
  const everyNth = Math.ceil(data.length / 6);

  return (
    <figure ref={ref} className={cn('w-full', className)}>
      {label && (
        <figcaption className="mb-3 font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
          {label}
        </figcaption>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-full overflow-visible"
        role="img"
        aria-label={`${label ?? 'Trend'}: ${data
          .map((entry) => `${entry.label} ${formatValue(entry.value, format)}`)
          .join(', ')}`}
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={`wash-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PALETTE.bronze} stopOpacity="0.16" />
            <stop offset="100%" stopColor={PALETTE.bronze} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid, with the value each line stands for. */}
        {gridlines.map((fraction) => {
          const lineY = padding.top + plotHeight * fraction;
          return (
            <g key={fraction}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={lineY}
                y2={lineY}
                stroke={PALETTE.line}
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={lineY + 3}
                textAnchor="end"
                className="fill-[var(--color-subtle)] font-label tabular-nums text-[9px]"
              >
                {formatValue(max * (1 - fraction), format)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#wash-${id})`} />
        <path
          d={linePath}
          fill="none"
          stroke={PALETTE.bronze}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* The point under the cursor, or the latest one when idle. */}
        {active !== null && (
          <line
            x1={x(shown)}
            x2={x(shown)}
            y1={padding.top}
            y2={padding.top + plotHeight}
            stroke={PALETTE.bronze}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
        <circle
          cx={x(shown)}
          cy={y(point.value)}
          r="4"
          fill={PALETTE.bronze}
          stroke="var(--color-canvas)"
          strokeWidth="2"
        />

        {data.map((entry, index) => (
          <g key={entry.label + index}>
            <rect
              x={x(index) - plotWidth / (data.length * 2)}
              y={padding.top}
              width={plotWidth / data.length}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
            />
            {index % everyNth === 0 && (
              <text
                x={x(index)}
                y={height - 5}
                textAnchor="middle"
                className="fill-[var(--color-subtle)] font-label tabular-nums text-[9px]"
              >
                {entry.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      <p className="mt-2 text-xs text-muted">
        <span className="font-display text-base text-ink">{formatValue(point.value, format)}</span>
        <span className="ml-2">{point.label}</span>
      </p>
    </figure>
  );
}

export function RankBars({
  data,
  format = 'number',
  className,
  emptyLabel = 'No data yet.',
}: {
  data: { label: string; value: number; sublabel?: string }[];
  format?: 'number' | 'currency';
  className?: string;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <p className={cn('py-6 text-sm text-subtle', className)}>{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((entry) => entry.value), 1);

  return (
    <ul className={cn('flex flex-col gap-3.5', className)}>
      {data.map((entry) => (
        <li key={entry.label} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate text-ink-soft">{entry.label}</span>
            <span className="shrink-0 tabular-nums text-ink">{formatValue(entry.value, format)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sand">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-700 ease-[var(--ease-out-soft)]"
              style={{ width: `${Math.max(3, (entry.value / max) * 100)}%` }}
            />
          </div>
          {entry.sublabel && <p className="text-xs text-subtle">{entry.sublabel}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Compact inline sparkline for a stat tile. */
export function Sparkline({
  data,
  className,
  height = 32,
}: {
  data: number[];
  className?: string;
  height?: number;
}) {
  if (data.length < 2) return null;
  const width = 120;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;

  const path = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('h-8 w-full', className)} aria-hidden>
      <path d={path} fill="none" stroke={PALETTE.bronze} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Share-of-total ring — used sparingly, e.g. payment mix. */
export function DonutRing({
  value,
  total,
  label,
  size = 96,
  className,
}: {
  value: number;
  total: number;
  label?: string;
  size?: number;
  className?: string;
}) {
  const fraction = total > 0 ? Math.min(1, value / total) : 0;
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn('inline-flex flex-col items-center gap-2', className)}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={PALETTE.sand}
          strokeWidth="8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={PALETTE.ink}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-soft)]"
        />
      </svg>
      <span className="font-display text-lg text-ink">{Math.round(fraction * 100)}%</span>
      {label && <span className="text-xs text-muted">{label}</span>}
    </div>
  );
}
