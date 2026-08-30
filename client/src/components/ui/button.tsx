import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Two button languages live in the design:
 *   · marketing pages use pill CTAs in letterspaced uppercase
 *   · product surfaces (auth, dashboards, detail pages) use soft rectangles
 *     in sentence case
 * `shape="pill"` switches between them; everything else is shared.
 */
const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 ease-[var(--ease-out-soft)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-canvas hover:bg-ink-soft active:scale-[0.99] shadow-subtle',
        secondary: 'bg-sand text-ink hover:bg-sand-deep',
        outline: 'border border-line-strong bg-transparent text-ink hover:bg-sand-soft',
        ghost: 'text-ink hover:bg-sand-soft',
        light: 'bg-canvas text-ink hover:bg-white',
        bronze: 'bg-bronze text-white hover:bg-bronze-deep',
        danger: 'bg-danger text-white hover:brightness-110',
        link: 'text-ink underline underline-offset-4 decoration-line-strong hover:decoration-bronze hover:text-bronze',
      },
      shape: {
        rect: 'rounded-md',
        pill: 'rounded-full uppercase tracking-[0.12em] font-label text-[0.6875rem] font-medium',
      },
      size: {
        sm: 'h-9 px-3.5 text-[0.8125rem] [&_svg]:size-4',
        md: 'h-11 px-5 text-sm [&_svg]:size-4',
        lg: 'h-[3.25rem] px-7 text-[0.9375rem] [&_svg]:size-[1.125rem]',
        icon: 'size-10 [&_svg]:size-[1.125rem]',
      },
    },
    compoundVariants: [
      { shape: 'pill', size: 'sm', class: 'h-9 px-5' },
      { shape: 'pill', size: 'md', class: 'h-11 px-7' },
      { shape: 'pill', size: 'lg', class: 'h-[3.25rem] px-9 text-xs' },
      { shape: 'pill', size: 'icon', class: 'rounded-full' },
      { variant: 'link', class: 'h-auto p-0' },
    ],
    defaultVariants: { variant: 'primary', shape: 'rect', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    // `asChild` renders someone else's element (usually a Link); a spinner
    // would break Slot's single-child rule, so only decorate real buttons.
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, shape }), className)}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, shape }), className)}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        <span className={cn('contents', loading && 'opacity-90')}>{children}</span>
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
