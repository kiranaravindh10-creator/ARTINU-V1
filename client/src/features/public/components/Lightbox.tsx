import { type ArtworkWithArtist } from '@artinu/shared';
import { ChevronLeft, ChevronRight, Heart, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Looking at a photograph should cost one click and commit you to nothing.
 *
 * Tapping a thumbnail used to navigate to the full product page — pricing,
 * frame configurator, artist rail — for someone who only wanted a closer look.
 * That is a lot of page for a browsing decision, and it made stepping through a
 * gallery expensive. Now the image opens over the gallery, arrow keys move
 * through it, and the product page is one deliberate click away.
 */
export function Lightbox({
  artworks,
  index,
  onIndexChange,
  onClose,
  onToggleWishlist,
}: {
  artworks: ArtworkWithArtist[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onToggleWishlist?: (artwork: ArtworkWithArtist) => void;
}) {
  const artwork = artworks[index];

  const go = React.useCallback(
    (delta: number) => {
      const next = (index + delta + artworks.length) % artworks.length;
      onIndexChange(next);
    },
    [index, artworks.length, onIndexChange],
  );

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);

    // The gallery behind must not scroll while the image is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [go, onClose]);

  if (!artwork) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${artwork.title} by ${artwork.artist?.name ?? 'ARTINU artist'}`}
      className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-canvas/50">
          {index + 1} / {artworks.length}
        </span>

        <div className="flex items-center gap-1">
          {onToggleWishlist && (
            <button
              type="button"
              onClick={() => onToggleWishlist(artwork)}
              aria-label={artwork.wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={artwork.wishlisted}
              className="flex size-10 items-center justify-center rounded-full text-canvas/70 transition-colors hover:bg-canvas/10 hover:text-canvas"
            >
              <Heart className={cn('size-5', artwork.wishlisted && 'fill-bronze text-bronze')} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full text-canvas/70 transition-colors hover:bg-canvas/10 hover:text-canvas"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* The photograph */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16">
        {artworks.length > 1 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              go(-1);
            }}
            aria-label="Previous photograph"
            className="absolute left-1 z-10 flex size-11 items-center justify-center rounded-full text-canvas/60 transition-colors hover:bg-canvas/10 hover:text-canvas sm:left-4"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}

        <img
          src={artwork.imageUrl}
          alt={artwork.title}
          onClick={(event) => event.stopPropagation()}
          className="max-h-full max-w-full object-contain"
        />

        {artworks.length > 1 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              go(1);
            }}
            aria-label="Next photograph"
            className="absolute right-1 z-10 flex size-11 items-center justify-center rounded-full text-canvas/60 transition-colors hover:bg-canvas/10 hover:text-canvas sm:right-4"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {/* Caption — only artist name and title, no pricing */}
      <div
        className="flex flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0">
          <h2 className="font-display text-xl text-canvas sm:text-2xl">{artwork.title}</h2>
          <p className="mt-1 text-sm text-canvas/60">
            {artwork.artist?.name}
            {artwork.location ? ` · ${artwork.location}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {onToggleWishlist && (
            <button
              type="button"
              onClick={() => onToggleWishlist(artwork)}
              aria-label={artwork.wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={artwork.wishlisted}
              className="flex size-10 items-center justify-center rounded-full text-canvas/70 transition-colors hover:bg-canvas/10 hover:text-canvas"
            >
              <Heart className={cn('size-5', artwork.wishlisted && 'fill-bronze text-bronze')} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
