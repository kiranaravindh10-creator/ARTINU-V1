import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The wordmark. Playfair at a tight tracking — the one place the display face
 * is used at small sizes, so it carries a touch of negative letterspacing to
 * hold together.
 */
export function Logo({
  className,
  invert,
  size = 'default',
  to = '/',
  asLink = true,
}: {
  className?: string;
  invert?: boolean;
  size?: 'default' | 'small' | 'large';
  to?: string;
  asLink?: boolean;
}) {
  const content = (
    <span
      className={cn(
        'font-display font-bold leading-none tracking-[-0.02em]',
        size === 'small' && 'text-xl',
        size === 'default' && 'text-[1.75rem]',
        size === 'large' && 'text-4xl',
        invert ? 'text-canvas' : 'text-ink',
        className,
      )}
    >
      ARTINU
    </span>
  );

  if (!asLink) return content;

  return (
    <Link to={to} className="rounded-xs transition-opacity hover:opacity-70" aria-label="ARTINU - home">
      {content}
    </Link>
  );
}
