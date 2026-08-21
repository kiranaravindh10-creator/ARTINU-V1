import { type ArtworkWithArtist } from '@artinu/shared';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, MapPin, X } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { resizedUpload } from '@/lib/imageOptimization';
import { ShareButton, ShareSheet } from '@/features/public/components/ShareSheet';

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

  // Only set when the browser has no native share sheet — see ShareButton.
  const [sharing, setSharing] = React.useState<ArtworkWithArtist | null>(null);

  /** The opening of whatever the photographer wrote, not a generated summary. */
  const blurb = (artwork?.description || artwork?.story || '').trim();

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
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.14em] text-canvas/50">
          {index + 1} / {artworks.length}
        </span>

        <div className="flex items-center gap-1">
          {/* Share sits beside Save, the way it does on every photo app. This
              is the screen people are actually on when they decide to send a
              photograph to someone. */}
          <ShareButton
            artwork={artwork}
            onFallback={setSharing}
            className="flex size-10 items-center justify-center rounded-full text-canvas/70 transition-colors hover:bg-canvas/10 hover:text-canvas"
          />
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
          /* 1600px covers any screen this opens on. The stored original is
             the photographer's full-resolution file and can be 9 MB. */
          src={resizedUpload(artwork.imageUrl, 1600)}
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

      {/*
        The caption.

        Title, photographer, place, and the opening of the story — the four
        things that make a photograph legible. It carried only a title and a
        name before, so the answer to "where is this?" was a click away on a
        page most people never opened. The full story stays on the artwork's own
        page; this is the first paragraph and a way through to the rest.
      */}
      <div
        className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-4 py-5 sm:px-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0 max-w-2xl">
          <h2 className="font-display text-xl text-canvas sm:text-2xl">{artwork.title}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-canvas/60">
            {artwork.artist?.name && <span>{artwork.artist.name}</span>}
            {artwork.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-bronze-light" aria-hidden />
                {artwork.location}
              </span>
            )}
          </p>
          {blurb && (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-canvas/50">{blurb}</p>
          )}
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
          <Link
            to={`/gallery/${artwork.id}`}
            className="group inline-flex items-center gap-2 text-sm text-canvas/80 transition-colors hover:text-canvas"
          >
            <span className="relative">
              Read the story
              <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-x-100" />
            </span>
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* Only ever rendered where the browser has no native share sheet. On a
          phone the OS sheet has already handled it and this stays closed. */}
      <ShareSheet artwork={sharing} onClose={() => setSharing(null)} />
    </div>
  );
}
