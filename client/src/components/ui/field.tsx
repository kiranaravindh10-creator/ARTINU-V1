import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-[0.8125rem] font-medium text-ink-soft peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
      className,
    )}
    {...props}
  >
    {children}
    {required && (
      <span className="ml-0.5 text-bronze" aria-hidden>
        *
      </span>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = 'Label';

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  /** Right-aligned node on the label row — a character counter, a link. */
  aside?: React.ReactNode;
}

/**
 * One field wrapper for every form in the app: label row, control, then either
 * the hint or the error. Errors replace hints so the row never grows twice.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  aside,
  className,
  children,
  ...props
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <Label htmlFor={htmlFor} required={required}>
              {label}
            </Label>
          )}
          {aside && <span className="text-xs text-subtle">{aside}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/** Live character counter used by the bio and story fields. */
export function CharCount({ value, max }: { value: string | null | undefined; max: number }) {
  const length = value?.length ?? 0;
  return (
    <span className={cn('font-mono text-[0.6875rem]', length > max ? 'text-danger' : 'text-subtle')}>
      {length}/{max}
    </span>
  );
}
