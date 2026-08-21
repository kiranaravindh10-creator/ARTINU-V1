import { ImageOff } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
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
  blurPlaceholder,
  className,
  imgClassName,
  children,
  ...props
}: PhotoProps) {
  const [state, setState] = React.useState<'loading' | 'loaded' | 'error'>('loading');

  const effectiveSrcSet = React.useMemo(() => {
    if (srcSet) return srcSet;
    if (hero) return buildHeroSrcSet(src);
    if (thumbnail) return buildThumbnailSrcSet(src);
    return undefined;
  }, [src, hero, thumbnail, srcSet]);

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
    if (hero) return sizes || '100vw';
    if (thumbnail) return sizes || '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
    return sizes;
  }, [hero, thumbnail, sizes]);

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
              'absolute inset-0 size-full object-cover transition-opacity duration-700 ease-[var(--ease-out-soft)]',
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