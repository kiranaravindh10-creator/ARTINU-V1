import * as React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@/components/layout/primitives';
import { Reveal } from '@/components/motion/reveal';
import { Typewriter } from '@/components/motion/typewriter';
import { Button } from '@/components/ui/button';
import { Photo } from '@/components/ui/photo';
import { cn } from '@/lib/utils';

export interface CtaBandAction {
  label: string;
  to: string;
}

export interface CtaBandProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  primary: CtaBandAction;
  secondary?: CtaBandAction;
  /** Faint background photograph. Purely atmospheric — it carries no meaning. */
  image?: string;
  /** Only surfaces if the background photograph fails to load. */
  imageAlt?: string;
  align?: 'center' | 'left';
  className?: string;
}

/**
 * The dark closing band every marketing page ends on. The photograph sits far
 * back behind an ink wash so the heading keeps its contrast at any image; the
 * band works just as well with no photograph at all.
 */
export function CtaBand({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  image,
  imageAlt = 'Framed photography on a wall in a ARTINU space',
  align = 'center',
  className,
}: CtaBandProps) {
  const centered = align === 'center';

  return (
    <section className={cn('relative isolate overflow-hidden bg-ink text-canvas', className)}>
      {image && (
        <div className="absolute inset-0" aria-hidden>
          <div className="size-full opacity-25">
            <Photo
              src={image}
              alt={imageAlt}
              tone="bg-ink"
              className="size-full"
              imgClassName="grayscale-[0.35]"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/70 to-ink" />
        </div>
      )}

      <Container className="relative py-20 sm:py-24 lg:py-28">
        <Reveal className={cn('flex flex-col gap-6', centered && 'items-center text-center')}>
          {eyebrow && <p className="eyebrow text-bronze-light">{eyebrow}</p>}

          <Typewriter
            as="h2"
            className={cn(
              'max-w-3xl font-display text-[2.125rem] leading-[1.08] text-canvas sm:text-[2.75rem] lg:text-5xl',
              centered && 'mx-auto',
            )}
            caretClassName="border-l-bronze-light"
          >
            {title}
          </Typewriter>

          {description && (
            <p className={cn('prose-quiet text-canvas/65', centered && 'mx-auto')}>{description}</p>
          )}

          <div
            className={cn(
              'mt-2 flex flex-col gap-3 sm:flex-row sm:items-center',
              centered && 'sm:justify-center',
            )}
          >
            <Button shape="pill" size="lg" variant="light" asChild>
              <Link to={primary.to}>{primary.label}</Link>
            </Button>

            {secondary && (
              <Button
                shape="pill"
                size="lg"
                variant="outline"
                asChild
                className="border-canvas/25 text-canvas hover:border-canvas/50 hover:bg-canvas/10 hover:text-canvas"
              >
                <Link to={secondary.to}>{secondary.label}</Link>
              </Button>
            )}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
