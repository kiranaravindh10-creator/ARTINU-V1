import * as AccordionPrimitive from '@radix-ui/react-accordion';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { ChevronDown, RotateCw, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { initials } from '@artinu/shared';
import { cn } from '@/lib/utils';

export const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-line',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden {...props} />;
}

export const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & { name?: string; src?: string | null }
>(({ className, name, src, children, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex size-10 shrink-0 overflow-hidden rounded-full bg-sand ring-1 ring-line',
      className,
    )}
    {...props}
  >
    {src && (
      <AvatarPrimitive.Image
        src={src}
        alt={name ?? ''}
        className="aspect-square size-full object-cover"
      />
    )}
    <AvatarPrimitive.Fallback className="flex size-full items-center justify-center bg-sand font-label text-[0.6875rem] uppercase tracking-wider text-bronze-deep">
      {children ?? (name ? initials(name) : '')}
    </AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>
));
Avatar.displayName = 'Avatar';

export const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { value?: number | null }
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-sand-deep', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="size-full flex-1 rounded-full bg-ink transition-transform duration-500 ease-[var(--ease-out-soft)]"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';

export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn('border-b border-line', className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

export const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between gap-4 py-4 text-left text-sm font-medium text-ink transition-colors',
        'hover:text-bronze focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/30',
        '[&[data-state=open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-subtle transition-transform duration-300 ease-[var(--ease-out-soft)]" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

export const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('pb-4 text-sm text-muted', className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = 'AccordionContent';

/** Empty state used across dashboards, gallery results and lists. */
/**
 * A query that failed, with a way back.
 *
 * Deliberately inline rather than routed: one failed panel should not replace
 * the whole page, and a dashboard with five queries should not lose four
 * working ones because the fifth timed out. Without this a failed query leaves
 * `data` undefined, so the page renders its loading skeleton or its empty
 * state forever — telling the user "nothing here" when the truth is "we could
 * not reach the server", which is the more damaging of the two lies.
 */
export function ErrorState({
  title = 'That did not load.',
  description,
  error,
  onRetry,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  /** Shown verbatim when nothing more specific is supplied. */
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const detail =
    description ??
    (error instanceof Error && error.message
      ? error.message
      : 'The server did not respond. This is usually temporary.');

  return (
    <div
      role="alert"
      className={cn(
        'max-w-md rounded-lg border border-danger/25 bg-danger-soft/40 p-6',
        className,
      )}
    >
      <span className="flex text-danger [&_svg]:size-5 [&_svg]:stroke-[1.4]">
        <TriangleAlert aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-xl leading-tight text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-md border border-line-strong bg-surface px-4 py-2 text-sm text-ink transition-colors hover:bg-sand-soft"
        >
          <RotateCw className="size-3.5" aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('max-w-md py-10', className)}>
      {icon && <span className="flex text-bronze [&_svg]:size-5 [&_svg]:stroke-[1.4]">{icon}</span>}
      <h3 className="mt-5 font-display text-2xl leading-tight text-ink">{title}</h3>
      {description && <p className="mt-2.5 text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
