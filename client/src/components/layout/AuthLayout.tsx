import { Heart } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { Photo } from '@/components/ui/photo';
import { cn } from '@/lib/utils';

/**
 * The split screen behind every auth route: copy on warm paper at the left,
 * a full-bleed photograph at the right. On small screens the photograph drops
 * away entirely rather than shrinking into a decorative strip.
 */
export function AuthSplit({
  image,
  imageAlt,
  side = 'right',
  children,
  footnote,
  className,
}: {
  image: string;
  imageAlt: string;
  side?: 'left' | 'right';
  children: React.ReactNode;
  footnote?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid min-h-dvh bg-canvas lg:grid-cols-2', className)}>
      <div
        className={cn(
          'flex flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-12',
          side === 'left' && 'lg:order-2',
        )}
      >
        <Logo />
        <div className="flex flex-1 flex-col justify-center py-10">{children}</div>
        {footnote ?? (
          <p className="flex items-center gap-2.5 text-sm text-muted">
            <Heart className="size-4 text-bronze" aria-hidden />
            <span>
              Spaces, stories, and souls.
              <br />
              Curated by ARTINU.
            </span>
          </p>
        )}
      </div>

      <Photo
        src={image}
        alt={imageAlt}
        priority
        className={cn('hidden lg:block', side === 'left' && 'lg:order-1')}
      />
    </div>
  );
}

/**
 * The centred card used for sign-in, OTP and each registration step.
 * `step` renders the "Step 2 of 4" marker from the registration flow.
 */
export function AuthCard({
  title,
  description,
  children,
  onBack,
  step,
  footer,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  onBack?: () => void;
  step?: { current: number; total: number };
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-md rounded-lg border border-line bg-surface p-7 shadow-card sm:p-8',
        className,
      )}
    >
      {(onBack || step) && (
        <div className="mb-6 flex items-center justify-between gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-ink"
            >
              <span aria-hidden>←</span> Back
            </button>
          ) : (
            <span />
          )}
          {step && (
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-subtle">
              Step {step.current} of {step.total}
            </span>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] leading-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>

      <div className="mt-6">{children}</div>

      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

/** Progress rail shown above the registration wizard. */
export function StepRail({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-6 flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-0.5 flex-1 rounded-full transition-colors duration-500',
            index < current ? 'bg-ink' : 'bg-line',
          )}
        />
      ))}
    </div>
  );
}

/** Small print under an auth card — "New to ARTINU? Register as Artist". */
export function AuthFootnote({
  question,
  action,
  to,
}: {
  question: string;
  action: string;
  to: string;
}) {
  return (
    <>
      {question}{' '}
      <Link to={to} className="font-medium text-bronze underline-offset-4 hover:underline">
        {action}
      </Link>
    </>
  );
}
