import { VALIDATION_CHECK_LABELS, type ArtworkValidationResult } from '@artinu/shared';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * How the five automated checks are shown, everywhere.
 *
 * No percentages. The checks are heuristics, not calibrated classifiers, and a
 * number like "92%" invites exactly the wrong reading — next to "AI-Generated
 * Detection" it looks like "92% AI" when it meant the opposite. The outcome and
 * a plain sentence say more, and say it acARTINUly.
 */

const STYLES = {
  pass: {
    Icon: CircleCheck,
    tone: 'text-success',
    chip: null as string | null,
    chipClass: '',
  },
  warning: {
    Icon: TriangleAlert,
    tone: 'text-warning',
    chip: 'Needs a look',
    chipClass: 'bg-warning-soft text-warning',
  },
  fail: {
    Icon: CircleX,
    tone: 'text-danger',
    chip: 'Blocked',
    chipClass: 'bg-danger-soft text-danger',
  },
} as const;

export function ValidationResults({
  results,
  className,
}: {
  results: ArtworkValidationResult[];
  className?: string;
}) {
  if (results.length === 0) {
    return <p className={cn('text-sm text-subtle', className)}>This one hasn’t been checked yet.</p>;
  }

  return (
    <ul className={cn('space-y-3', className)}>
      {results.map((entry) => {
        // Older records predate the severity field; treat them sensibly.
        const severity = entry.severity ?? (entry.passed ? 'pass' : 'fail');
        const style = STYLES[severity] ?? STYLES.fail;

        return (
          <li key={entry.check} className="flex items-start gap-3">
            <style.Icon className={cn('mt-0.5 size-4 shrink-0', style.tone)} aria-hidden />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                {VALIDATION_CHECK_LABELS[entry.check]}
                {style.chip && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                      style.chipClass,
                    )}
                  >
                    {style.chip}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{entry.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One-line summary used above a queue item or a submission row. */
export function validationSummary(results: ArtworkValidationResult[]): string {
  const blocked = results.filter((entry) => entry.severity === 'fail').length;
  const warnings = results.filter((entry) => entry.severity === 'warning').length;

  if (blocked > 0) return `${blocked} check${blocked === 1 ? '' : 's'} blocked publication`;
  if (warnings > 0) return `${warnings} thing${warnings === 1 ? '' : 's'} for a human to check`;
  return 'All checks passed';
}
