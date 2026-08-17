import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

/** Underlined tab row — Portfolio / Collections / About / Achievements. */
export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'no-scrollbar flex items-center gap-7 overflow-x-auto border-b border-line',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative -mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent px-0.5 pb-3 pt-2 text-sm text-muted transition-colors',
      'hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/30',
      'data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('focus-visible:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

/** Segmented control — the Email / Phone switch on the sign-in card. */
export const SegmentedList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex items-center gap-1 rounded-md bg-sand p-1', className)}
    {...props}
  />
));
SegmentedList.displayName = 'SegmentedList';

export const SegmentedTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'rounded-sm px-4 py-1.5 text-[0.8125rem] text-muted transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/30',
      'data-[state=active]:bg-surface data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-subtle',
      className,
    )}
    {...props}
  />
));
SegmentedTrigger.displayName = 'SegmentedTrigger';

/**
 * Chip filter row — "All Works · Architecture · Minimal · Nature".
 * Not a Radix tab set: these are multi-purpose filters, so they stay plain
 * buttons with an aria-pressed state.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('no-scrollbar flex items-center gap-2 overflow-x-auto', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-[0.8125rem] transition-all duration-200',
              active
                ? 'border-ink bg-ink text-canvas'
                : 'border-line-strong bg-transparent text-muted hover:border-ink hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
