import { ArrowRight, ArrowUpRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function Container({
  className,
  size = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { size?: 'default' | 'wide' | 'narrow' | 'prose' }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 sm:px-8 lg:px-12',
        size === 'default' && 'max-w-[84rem]',
        size === 'wide' && 'max-w-[104rem]',
        size === 'narrow' && 'max-w-5xl',
        size === 'prose' && 'max-w-3xl',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Vertical rhythm for marketing sections. `tone` swaps the paper: canvas is the
 * default page, sand is the recessed band, ink is a full-bleed dark block.
 */
export function Section({
  className,
  tone = 'canvas',
  size = 'default',
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  tone?: 'canvas' | 'soft' | 'sand' | 'ink' | 'transparent';
  size?: 'default' | 'compact' | 'roomy';
}) {
  return (
    <section
      className={cn(
        tone === 'canvas' && 'bg-canvas',
        tone === 'soft' && 'bg-canvas-soft',
        tone === 'sand' && 'bg-sand',
        tone === 'ink' && 'bg-ink text-canvas',
        size === 'compact' && 'py-14 sm:py-16',
        size === 'default' && 'py-20 sm:py-24 lg:py-28',
        size === 'roomy' && 'py-24 sm:py-32 lg:py-40',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

/** Eyebrow + display heading + optional lead paragraph. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  rule = false,
  invert = false,
  className,
  size = 'default',
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: 'left' | 'center';
  rule?: boolean;
  invert?: boolean;
  className?: string;
  size?: 'default' | 'large' | 'small';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      {eyebrow && <p className={cn('eyebrow', invert && 'text-bronze-light')}>{eyebrow}</p>}
      <h2
        className={cn(
          'font-display',
          size === 'small' && 'text-2xl sm:text-3xl',
          size === 'default' && 'text-[2rem] leading-[1.1] sm:text-[2.75rem]',
          size === 'large' && 'text-[2.5rem] leading-[1.05] sm:text-5xl lg:text-6xl',
          invert ? 'text-canvas' : 'text-ink',
        )}
      >
        {title}
      </h2>
      {rule && <span className={cn('rule', align === 'center' && 'mx-auto')} />}
      {description && (
        <p className={cn('prose-quiet', invert && 'text-canvas/70', align === 'center' && 'mx-auto')}>
          {description}
        </p>
      )}
    </div>
  );
}

/** "See transformations →" — an underline that draws on hover. */
export function ArrowLink({
  to,
  href,
  children,
  className,
  external,
  invert,
}: {
  to?: string;
  href?: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
  invert?: boolean;
}) {
  const content = (
    <>
      <span className="relative">
        {children}
        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-x-100" />
      </span>
      {external ? (
        <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      ) : (
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
      )}
    </>
  );

  const classes = cn(
    'group inline-flex items-center gap-2 text-sm font-medium',
    invert ? 'text-canvas' : 'text-ink',
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to ?? '#'} className={classes}>
      {content}
    </Link>
  );
}

/** Circle-arrow link — "DISCOVER ARTISTS", "EXPLORE ARTISTS", "VIEW ALL ARTISTS". */
export function CircleArrowLink({
  to,
  children,
  direction = 'right',
  className,
}: {
  to: string;
  children: React.ReactNode;
  direction?: 'right' | 'down';
  className?: string;
}) {
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-4', className)}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition-all duration-300 ease-[var(--ease-out-soft)] group-hover:border-ink group-hover:bg-ink group-hover:text-canvas">
        <ArrowRight
          className={cn(
            'size-[1.125rem] transition-transform duration-300',
            direction === 'down' && 'rotate-90',
            direction === 'right' && 'group-hover:translate-x-0.5',
          )}
        />
      </span>
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ink">
        {children}
      </span>
    </Link>
  );
}

/** A numbered/iconed step in a "How it works" row. */
export function StepIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-14 items-center justify-center rounded-full bg-sand text-bronze [&_svg]:size-5 [&_svg]:stroke-[1.4]',
        className,
      )}
    >
      {children}
    </span>
  );
}
