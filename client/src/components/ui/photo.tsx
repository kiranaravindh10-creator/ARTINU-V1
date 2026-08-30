import { ImageOff } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { buildVariantSrcSet, type ImageVariants } from '@artinu/shared';
import { buildHeroSrcSet, buildThumbnailSrcSet, getBlurPlaceholderSync, resizedUpload } from '@/lib/imageOptimization';

export interface PhotoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'srcSet' | 'sizes'> {
  src: string;
  alt: string;
  /** Tailwind aspect utility, e.g. "aspect-[4/5]". Omit to fill the parent. */
  ratio?: string;
  /** Tone shown while the photograph loads and if it fails. */
  tone?: string;
  /** Disables the fade-in — use for above-the-fold hero art. */
  priority?: boolean;
  /** Use hero-optimized srcset (full-width viewport sizes). */
  hero?: boolean;
  /** Use thumbnail-optimized srcset (smaller sizes). */
  thumbnail?: boolean;
  /** Custom sizes attribute for responsive images. */
  sizes?: string;
  /** Explicit srcSet override (rarely needed). */
  srcSet?: string;
  /**
   * The artwork's stored resized copies, as width -> url.
   *
   * When present this is the BEST source of a srcset and wins over `hero` and
   * `thumbnail`, because it describes files that actually exist at known widths
   * rather than guessing a transform from the url's hostname. Absent or empty
   * for anything uploaded before variants existed, and for seeded stock
   * imagery - both of which fall back to the old behaviour.
   */
  variants?: ImageVariants | null;
  /** Pre-generated blur placeholder data URL. If not provided, a CSS gradient is used. */
  blurPlaceholder?: string;
  className?: string;
  imgClassName?: string;
  /** Overlay content — captions, hover actions. */
  children?: React.ReactNode;
}

/**
 * Every photograph in the app goes through here so loading behaves the same
 * everywhere: a blur placeholder holds the space, the image fades in when it
 * decodes, and a failed load degrades to a labelled placeholder instead of a
 * broken icon.
 */
export function Photo({
  src,
  alt,
  ratio,
  tone = 'bg-sand',
  priority = false,
  hero = false,
  thumbnail = false,
  sizes,
  srcSet,
  variants,
  blurPlaceholder,
  className,
  imgClassName,
  children,
  ...props
}: PhotoProps) {
  const [state, setState] = React.useState<'loading' | 'loaded' | 'error'>('loading');

  const effectiveSrcSet = React.useMemo(() => {
    if (srcSet) return srcSet;
    /*
      Stored variants first.

      buildHeroSrcSet and buildThumbnailSrcSet work by pattern-matching the url
      against unsplash.com and picsum.photos and rewriting their query strings.
      For a real photographer upload on Supabase Storage neither matches, both
      return '', and the browser is left with the bare `src` - which until
      015_image_variants was the untouched original. A variants map is a list of
      files we know exist at widths we chose, so it beats any amount of guessing.
    */
    const fromVariants = buildVariantSrcSet(variants);
    if (fromVariants) return fromVariants;
    if (hero) return buildHeroSrcSet(src);
    if (thumbnail) return buildThumbnailSrcSet(src);
    return undefined;
  }, [src, hero, thumbnail, srcSet, variants]);

  /*
    The plain "src", which is what a browser falls back to and what it uses
    when no "sizes" rule matches. Left as the stored URL it asks for the
    photographer's full-resolution original — several megabytes for a tile a
    few hundred pixels wide. resizedUpload leaves every other kind of image
    exactly as it was.
  */
  const effectiveSrc = React.useMemo(
    () => resizedUpload(src, thumbnail ? 800 : 1600),
    [src, thumbnail],
  );

  const effectiveSizes = React.useMemo(() => {
    // A variants srcset still needs a sizes hint, or the browser assumes 100vw
    // and picks the largest candidate for every tile.
    if (variants && !hero && !sizes) {
      return '(max-width: 640px) 50vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw';
    }
    if (hero) return sizes || '100vw';
    /*
      This must match ArtworkMasonry's breakpoints or the browser fetches the
      wrong size. It claimed 100vw on a phone, which was true of the old
      one-column grid and is a 2x overfetch of every tile in a two-column one;
      and it claimed 33vw above 1024px while the grid goes to four columns at
      xl, so every tile on a wide screen was fetched a third larger than it is
      drawn.
    */
    if (thumbnail)
      return (
        sizes ||
        '(max-width: 640px) 50vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw'
      );
    return sizes;
  }, [hero, thumbnail, sizes, variants]);

  const effectiveBlurPlaceholder = React.useMemo(() => {
    return blurPlaceholder || getBlurPlaceholderSync(src);
  }, [blurPlaceholder, src]);

  const loading = priority ? 'eager' : 'lazy';
  const decoding = priority ? 'sync' : 'async';
  const fetchPriority = priority ? 'high' : 'low';

  return (
    <div className={cn('relative overflow-hidden', tone, ratio, className)}>
      {state !== 'error' ? (
        <>
          <img
            src={effectiveSrc}
            srcSet={effectiveSrcSet}
            sizes={effectiveSizes}
            alt={alt}
            loading={loading}
            decoding={decoding}
            fetchPriority={fetchPriority}
            onLoad={() => setState('loaded')}
            onError={() => setState('error')}
            className={cn(
              // 300ms, not 700. Forty tiles each taking most of a second to
              // become visible is most of a second where the gallery is empty.
              'absolute inset-0 size-full object-cover transition-opacity duration-300 ease-[var(--ease-out-soft)]',
              state === 'loaded' ? 'opacity-100' : 'opacity-0',
              imgClassName,
            )}
            style={{
              backgroundImage: `url(${effectiveBlurPlaceholder})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            } as React.CSSProperties}
            {...props}
          />
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 bg-sand text-subtle">
          <ImageOff className="size-5" aria-hidden />
          <span className="px-4 text-center font-label text-[0.625rem] uppercase tracking-[0.14em]">
            {alt || 'Photograph'}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * A framed print rendered in CSS — mat board, frame profile and a soft cast
 * shadow. Used for the frame preview and anywhere art hangs on a wall.
 */
export function FramedPhoto({
  src,
  alt,
  frameColor = '#141210',
  matWidth = '7%',
  ratio = 'aspect-[4/5]',
  className,
}: {
  src: string;
  alt: string;
  frameColor?: string;
  matWidth?: string;
  ratio?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('shadow-frame', ratio, className)}
      style={{ backgroundColor: frameColor, padding: '2.5%' }}
    >
      <div className="size-full bg-[#f7f4ee]" style={{ padding: matWidth }}>
        <Photo src={src} alt={alt} className="size-full" tone="bg-sand-deep" />
      </div>
    </div>
  );
}