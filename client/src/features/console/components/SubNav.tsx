import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The two or three views that make up one Console section.
 *
 * These used to be separate sidebar rows, which made "Spaces" and
 * "Consultations" look like unrelated departments rather than the same subject
 * before and after it becomes a customer. Sitting them together under the
 * section heading also puts the counts side by side, which is the comparison
 * anyone opening the section is actually making.
 */
export function SubNav({
  items,
  className,
}: {
  items: { to: string; label: string; count?: number; end?: boolean }[];
  className?: string;
}) {
  if (items.length < 2) return null;

  return (
    <nav className={cn('-mt-4 mb-8 flex flex-wrap items-center gap-x-7 border-b border-line', className)}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'group -mb-px flex items-baseline gap-2 border-b-2 pb-3 text-sm transition-colors',
              isActive
                ? 'border-bronze text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )
          }
        >
          {item.label}
          {typeof item.count === 'number' && (
            <span className="font-mono text-[0.625rem] tabular-nums text-subtle">{item.count}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
