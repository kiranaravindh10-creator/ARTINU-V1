import {
  ROTATION_RESCHEDULE_WINDOW_DAYS,
  formatDate,
  rescheduleOptions,
  shiftedDueAt,
  type RotationCycle,
} from '@artinu/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/**
 * The rotation calendar earns its place only because a space can run several
 * rooms on different clocks — the month grid is where overlapping due dates
 * become obvious in a way a list of dates never does. With a single space it
 * still answers the one question worth asking on this screen: how far away is
 * the next change, and what is going up.
 */
export function RotationCalendar({
  cycles,
  spaceName,
  className,
  onReschedule,
  rescheduling = false,
}: {
  cycles: RotationCycle[];
  spaceName: (spaceId: string) => string;
  className?: string;
  /**
   * Move the next rotation by a whole number of days. Omit to render the
   * calendar read-only, which is what a staff view would want.
   */
  onReschedule?: (cycleId: string, days: number) => void;
  rescheduling?: boolean;
}) {
  const upcoming = React.useMemo(
    () =>
      [...cycles]
        .filter((cycle) => cycle.status !== 'installed')
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    [cycles],
  );

  const next = upcoming[0];
  const [cursor, setCursor] = React.useState(() =>
    next ? new Date(next.dueAt) : new Date(),
  );

  /*
    Every UPCOMING due date, keyed by day, so a cell can look itself up.

    This iterated `cycles`, which includes installed ones, so a rotation that
    happened three months ago still painted a solid bronze dot on the grid - a
    calendar of things to come, marking things already done.
  */
  const dueByDay = React.useMemo(() => {
    const map = new Map<string, RotationCycle[]>();
    for (const cycle of upcoming) {
      const key = dayKey(new Date(cycle.dueAt));
      map.set(key, [...(map.get(key) ?? []), cycle]);
    }
    return map;
  }, [upcoming]);

  /*
    The days the next rotation may be moved to.

    The window is measured from where the cycle was ORIGINALLY due, so someone
    who has already pulled it forward a day can only push it one further - which
    is the same rule the server enforces, shown rather than discovered by
    getting an error back. Rendering it as selectable days is the whole reason
    this is a calendar: "the 23rd, but not the 24th" is obvious on a grid and
    invisible in a stepper.
  */
  const movable = React.useMemo(() => {
    if (!next || !onReschedule) return new Map<string, number>();
    const options = new Map<string, number>();
    for (const days of rescheduleOptions(next.dueAt, next.rescheduledFrom)) {
      options.set(dayKey(new Date(shiftedDueAt(next.dueAt, days))), days);
    }
    return options;
  }, [next, onReschedule]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = dayKey(new Date());

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const shift = (delta: number) => setCursor(new Date(year, month + delta, 1));

  // Follow the date when it moves, so the grid does not sit on last month after
  // a reschedule pushes the rotation into the next one.
  const nextDueAt = next?.dueAt;
  React.useEffect(() => {
    if (nextDueAt) setCursor(new Date(nextDueAt));
  }, [nextDueAt]);
  const daysAway = next
    ? Math.ceil((new Date(next.dueAt).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className={cn('grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]', className)}>
      <div>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="font-display text-xl leading-none text-ink">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="flex size-7 items-center justify-center rounded-full text-subtle transition-colors hover:bg-sand-soft hover:text-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Next month"
              className="flex size-7 items-center justify-center rounded-full text-subtle transition-colors hover:bg-sand-soft hover:text-ink"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div
          role="grid"
          aria-label={`Rotation dates for ${MONTHS[month]} ${year}`}
          className="mt-5"
        >
          <div className="grid grid-cols-7 gap-y-2">
            {DAY_LABELS.map((label) => (
              <span
                key={label}
                className="text-center font-label text-[0.5625rem] uppercase tracking-[0.14em] text-subtle"
              >
                {label.slice(0, 3)}
              </span>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-y-1.5">
            {cells.map((day, index) => {
              if (day === null) return <span key={`pad-${index}`} aria-hidden />;

              const key = dayKey(new Date(year, month, day));
              const due = dueByDay.get(key);
              const isToday = key === today;
              const moveBy = movable.get(key);

              /*
                A day you can move the rotation to is a real button; every other
                day stays a span. An element that looks clickable and is not is
                worse than one that plainly is not, and a keyboard user needs
                the difference to be in the markup rather than in the styling.
              */
              if (moveBy !== undefined && next && onReschedule) {
                return (
                  <div key={key} className="flex justify-center">
                    <button
                      type="button"
                      disabled={rescheduling}
                      onClick={() => onReschedule(next.id, moveBy)}
                      title={`Move the rotation to ${formatDate(new Date(year, month, day), 'long')}`}
                      aria-label={`Move the rotation to ${formatDate(new Date(year, month, day), 'long')}`}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full text-[0.8125rem] tabular-nums transition-colors',
                        'text-ink ring-1 ring-dashed ring-bronze/60 hover:bg-bronze hover:text-white',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze',
                        rescheduling && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {day}
                    </button>
                  </div>
                );
              }

              return (
                <div key={key} className="flex justify-center">
                  <span
                    title={
                      due
                        ? due.map((cycle) => `${spaceName(cycle.spaceId)} rotation`).join(', ')
                        : undefined
                    }
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-[0.8125rem] tabular-nums transition-colors',
                      due
                        ? 'bg-bronze font-medium text-white'
                        : isToday
                          ? 'text-ink ring-1 ring-line-strong'
                          : 'text-muted',
                    )}
                  >
                    {day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {next && (
        <aside className="lg:border-l lg:border-line lg:pl-14">
          <p className="eyebrow eyebrow-muted">Next rotation</p>
          <p className="mt-4 font-display text-[2rem] leading-none text-ink">
            {formatDate(next.dueAt, 'long')}
          </p>
          <p className="mt-2 text-sm text-muted">
            {daysAway === null
              ? null
              : daysAway >= 0
                ? `in ${daysAway} ${daysAway === 1 ? 'day' : 'days'}`
                : `${Math.abs(daysAway)} days overdue`}
            {' · '}
            {spaceName(next.spaceId)}
          </p>

          {next.proposedArtworkIds && next.proposedArtworkIds.length > 0 && (
            <p className="mt-6 text-sm text-muted">
              {next.proposedArtworkIds.length} photographs proposed for this cycle.
            </p>
          )}

          {/*
            Say that the dotted days are clickable. A ring around a number is
            not self-explanatory, and the alternative - discovering it by
            hovering every cell - is not discovery.
          */}
          {onReschedule && movable.size > 0 && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm leading-relaxed text-muted">
                Closed that day, or expecting a rush? Pick any circled date on the calendar to move
                this rotation up to {ROTATION_RESCHEDULE_WINDOW_DAYS} days either way.
              </p>
              {next.rescheduledFrom && (
                <p className="mt-2 text-xs text-subtle">
                  Originally due {formatDate(next.rescheduledFrom, 'long')}.
                </p>
              )}
              <p className="mt-2 text-xs text-subtle">
                Need a bigger change? Call us and we will find a date that works.
              </p>
            </div>
          )}

          {/* Same page — a real fragment link, not a route. */}
          <a
            href="#cycles"
            className="mt-7 inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-sm text-canvas transition-colors hover:bg-ink-soft"
          >
            View rotation details
          </a>
        </aside>
      )}
    </div>
  );
}
