import { type ArtworkWithArtist } from '@artinu/shared';
import { Heart, MapPin } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Photo } from '@/components/ui/photo';
import { Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/utils';
import { ShareButton } from '@/features/public/components/ShareSheet';

const RATIO: Record<string, string> = {
  portrait: 'aspect-[3/4]',
  square: 'aspect-square',
  landscape: 'aspect-[3/2]',
};

/**
 * A gallery tile is a photograph, not a product card.
 *
 * Clicking it opens the image (via `onOpen`); "View details" is the deliberate
 * second step into pricing and framing. When no `onOpen` is supplied the whole
 * tile falls back to a link, so the component still works anywhere a lightbox
 * would not make sense.
 */
export function ArtworkCard({
  artwork,
  onOpen,
  onToggleWishlist,
  onShare,
  wishlisted,
  showPrice = false,
  className,
  priority = false,
  action,
}: {
  artwork: ArtworkWithArtist;
  onOpen?: (artwork: ArtworkWithArtist) => void;
  onToggleWishlist?: (artwork: ArtworkWithArtist) => void;
  /** Opens the fallback share sheet. Omit to hide the share control. */
  onShare?: (artwork: ArtworkWithArtist) => void;
  wishlisted?: boolean;
  showPrice?: boolean;
  className?: string;
  priority?: boolean;
  action?: React.ReactNode;
}) {
  const saved = wishlisted ?? artwork.wishlisted ?? false;

  const media = (
    <Photo
      src={artwork.thumbnailUrl || artwork.imageUrl}
      alt={artwork.title}
      ratio={RATIO[artwork.orientation] ?? RATIO.landscape}
      priority={priority}
      thumbnail
      className="photo-edge"
      imgClassName="transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
    >
      {/*
        The caption wash and the caption itself.

        `[@media(hover:none)]` holds both open permanently on touch devices. A
        phone has no hover state, so every one of these transitions resolved to
        "invisible, forever" — the photographer's name and the place the
        photograph was taken simply did not exist on mobile, which is where most
        of the gallery is actually read.
      */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 p-4 opacity-0 transition-all duration-500 ease-[var(--ease-out-soft)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
        {/* The photograph's own title, in the display face — this is a gallery
            label, and it was the one thing the tile never said. */}
        <p className="truncate font-display text-base leading-snug text-canvas">{artwork.title}</p>
        <p className="mt-1 truncate text-xs text-canvas/75">{artwork.artist?.name}</p>
        {artwork.location && (
          <p className="mt-0.5 text-xs text-canvas/60">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {artwork.location}
            </span>
          </p>
        )}
      </div>
    </Photo>
  );

  return (
    <article className={cn('group relative', className)}>
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(artwork)}
          aria-label={`View ${artwork.title} by ${artwork.artist?.name ?? 'ARTINU artist'}`}
          className="block w-full overflow-hidden rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-2"
        >
          {media}
        </button>
      ) : (
        <Link
          to={`/gallery/${artwork.id}`}
          className="block overflow-hidden rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-2"
          aria-label={`${artwork.title} by ${artwork.artist?.name ?? 'ARTINU artist'}`}
        >
          {media}
        </Link>
      )}

      {/*
        Share, on the tile itself.

        Every photograph is shareable without opening it first — the same place
        a photo app puts it. Sits left of the wishlist heart so the two controls
        never overlap, and is revealed on the same terms: on hover with a
        pointer, always on a touch screen.
      */}
      {onShare && (
        <ShareButton
          artwork={artwork}
          onFallback={onShare}
          className={cn(
            'absolute top-3 flex size-9 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-300',
            'bg-canvas/80 text-ink opacity-0 hover:bg-canvas group-hover:opacity-100',
            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze',
            '[@media(hover:none)]:opacity-100',
            onToggleWishlist ? 'right-14' : 'right-3',
          )}
        />
      )}

      {onToggleWishlist && (
        <button
          type="button"
          onClick={() => onToggleWishlist(artwork)}
          aria-label={saved ? `Remove ${artwork.title} from wishlist` : `Save ${artwork.title} to wishlist`}
          aria-pressed={saved}
          className={cn(
            'absolute right-3 top-3 flex size-9 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-300',
            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze',
            saved
              ? 'bg-canvas text-bronze opacity-100'
              : // Revealed on hover on a pointer device — and always present on a
                // touch one, where there is no hover to reveal it with. Without
                // the `hover:none` case this control was invisible and
                // untappable on every phone: not a styling detail but a feature
                // that did not exist on mobile.
                'bg-canvas/80 text-ink opacity-0 hover:bg-canvas group-hover:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          <Heart className={cn('size-4', saved && 'fill-current')} />
        </button>
      )}

      {action && (
        <div className="mt-3">
          {action}
        </div>
      )}
    </article>
  );
}

/** Matching skeleton so the masonry does not reflow when results arrive. */
export function ArtworkCardSkeleton({ index = 0 }: { index?: number }) {
  const ratios = ['aspect-[3/4]', 'aspect-[3/2]', 'aspect-square'];
  return <Skeleton className={cn('w-full rounded-sm', ratios[index % ratios.length])} />;
}

/** Masonry column layout matching the reference gallery. */
export function ArtworkMasonry({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('masonry columns-1 sm:columns-2 lg:columns-3 xl:columns-4', className)}>
      {children}
    </div>
  );
}

/**
 * Wires a list of artworks to the lightbox. Pages get open/close state and the
 * keyboard handling without repeating it three times.
 */
export function useLightbox(artworks: ArtworkWithArtist[]) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  const index = openId ? artworks.findIndex((artwork) => artwork.id === openId) : -1;

  return {
    isOpen: index >= 0,
    index: Math.max(0, index),
    open: (artwork: ArtworkWithArtist) => setOpenId(artwork.id),
    close: () => setOpenId(null),
    setIndex: (next: number) => setOpenId(artworks[next]?.id ?? null),
  };
}
