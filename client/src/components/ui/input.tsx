import { CalendarDays, Eye, EyeOff, Phone } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon rendered inside the field, on the left. */
  icon?: React.ReactNode;
  /** Node rendered inside the field, on the right (a unit, a button). */
  suffix?: React.ReactNode;
  invalid?: boolean;
}

export const inputClass =
  'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-subtle transition-colors placeholder:text-subtle hover:border-line-strong focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze/15 disabled:cursor-not-allowed disabled:bg-sand-soft disabled:text-subtle';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, suffix, invalid, type = 'text', ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          inputClass,
          'h-11',
          icon && 'pl-10',
          suffix && 'pr-11',
          invalid && 'border-danger focus:border-danger focus:ring-danger/15',
          className,
        )}
        {...props}
      />
    );

    if (!icon && !suffix) return field;

    return (
      <div className="relative">
        {icon && (
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4"
            aria-hidden
          >
            {icon}
          </span>
        )}
        {field}
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle [&_svg]:size-4">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

/** Password field with the show/hide eye from the sign-in screen. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'suffix'>>(
  ({ ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        autoComplete="current-password"
        suffix={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="rounded-xs p-0.5 text-subtle transition-colors hover:text-ink"
            aria-label={visible ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {visible ? <EyeOff /> : <Eye />}
          </button>
        }
        {...props}
      />
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

/**
 * Telephone field.
 *
 * `type="tel"` brings up the phone keypad on a handset and lets a browser fill
 * a saved number; the shape of what people type (+91 98765 43210, 080 4567
 * 8901) is validated by `phoneSchema` in the shared package rather than being
 * forced by the input, so nobody is fighting an input mask.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  ({ placeholder = '+91 98765 43210', ...props }, ref) => (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      icon={<Phone />}
      placeholder={placeholder}
      {...props}
    />
  ),
);
PhoneInput.displayName = 'PhoneInput';

/** Today as YYYY-MM-DD, in the visitor's own timezone — the ceiling for a birth date. */
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/**
 * Date field, used for date of birth.
 *
 * The native picker rather than a bespoke calendar: it is the control people
 * already know, it works with a keyboard and a screen reader without any help
 * from us, and on a phone it opens the platform's own wheel. `max` stops a
 * future date being picked at all, so the schema's "cannot be in the future"
 * rule is a backstop rather than the first thing a visitor meets. The picker
 * glyph is tinted to the bronze accent so the field does not read as a browser
 * default dropped into an ARTINU form.
 */
export const DateInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  ({ className, max, ...props }, ref) => (
    <Input
      ref={ref}
      type="date"
      icon={<CalendarDays />}
      max={max ?? today()}
      className={cn(
        'pr-3 [color-scheme:light]',
        '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
        '[&::-webkit-calendar-picker-indicator]:opacity-60',
        '[&::-webkit-calendar-picker-indicator]:transition-opacity',
        'hover:[&::-webkit-calendar-picker-indicator]:opacity-100',
        className,
      )}
      {...props}
    />
  ),
);
DateInput.displayName = 'DateInput';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    aria-invalid={invalid || undefined}
    className={cn(
      inputClass,
      'resize-y leading-relaxed',
      invalid && 'border-danger focus:border-danger focus:ring-danger/15',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
