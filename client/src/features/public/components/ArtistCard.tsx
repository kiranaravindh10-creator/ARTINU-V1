import type { PublicArtist } from '@artinu/shared';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Photo } from '@/components/ui/photo';
import { Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/utils';

/**
 * Tall portrait tile from the Artists page — the photograph fills the card and
 * the name sits over a gradient at the foot, with a circled arrow affordance.
 */
export function ArtistCard({
  artist,
  className,
  priority = false,
}: {
  artist: PublicArtist;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link
      to={`/artists/${artist.slug}`}
      className={cn(
        'group relative block overflow-hidden rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-2',
        className,
      )}
    >
      <Photo
        src={artist.coverUrl || artist.avatarUrl || ''}
        alt={artist.name}
        ratio="aspect-[3/5]"
        priority={priority}
        imgClassName="transition-transform duration-[900ms] ease-[var(--ease-out-soft)] group-hover:scale-105"
      >
        <div
          className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 font-label text-[0.6875rem] uppercase tracking-[0.14em] text-canvas">
              <span className="truncate">{artist.name}</span>
              {artist.verified && <BadgeCheck className="size-3.5 shrink-0 text-bronze-light" aria-label="Verified" />}
            </h3>
            <p className="mt-1 font-label text-[0.625rem] uppercase tracking-[0.14em] text-canvas/60">
              {artist.city}
            </p>
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-canvas/40 text-canvas transition-colors duration-300 group-hover:border-canvas group-hover:bg-canvas group-hover:text-ink">
            <ArrowRight className="size-4" />
          </span>
        </div>
      </Photo>
    </Link>
  );
}

export function ArtistCardSkeleton() {
  return <Skeleton className="aspect-[3/5] w-full rounded-sm" />;
}