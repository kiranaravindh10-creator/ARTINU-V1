import type { ArtworkWithArtist } from '@artinu/shared';
import { Check, Copy, Download, Link2, Mail, Share2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Sharing a photograph.
 *
 * ── How this behaves, and why ───────────────────────────────────────────────
 *
 * On a phone, `navigator.share` opens the operating system's own sheet — the
 * one with Instagram, WhatsApp, Messages and everything else the person has
 * installed. That is precisely what the Instagram app itself does, and no
 * hand-built list can match it, so it is tried first and nothing is rendered
 * over the top of it.
 *
 * The dialog below is the desktop and fallback path, where `navigator.share`
 * does not exist. It lists the destinations that genuinely accept a link from
 * a browser.
 *
 * ── The honest position on Instagram ────────────────────────────────────────
 *
 * Instagram has no public web intent for posting a link to a feed or a story.
 * A button labelled "Share on Instagram" that opened instagram.com would do
 * nothing useful, so this does the thing that actually works: it downloads the
 * photograph and opens Instagram, because posting the image is how a
 * photograph reaches Instagram. The label says so rather than implying a
 * one-click post that the platform does not offer.
 *
 * ── Why the link is worth sharing ───────────────────────────────────────────
 *
 * `ArtworkDetailPage` already renders `EntityMeta` with the artwork's own
 * image, title and description, so a shared URL unfurls as a card with the
 * photograph in it. Without that, all of this would be sending people a bare
 * link.
 */

interface ShareTarget {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  href?: string;
  onSelect?: () => void | Promise<void>;
}

/** WhatsApp's own brand glyph — lucide has no WhatsApp icon. */
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.944c0 2.096.549 4.14 1.593 5.945L0 24l6.305-1.654a11.9 11.9 0 0 0 5.734 1.459h.005c6.585 0 11.946-5.359 11.949-11.945a11.9 11.9 0 0 0-3.473-8.411" />
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0m0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073" />
  </svg>
);

/** Blob MIME type to file extension, for naming a saved photograph. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/**
 * Saves the photograph so it can be posted to Instagram, or kept.
 *
 * Fetched as a blob rather than linked with `download`, because the images are
 * served from another origin and the `download` attribute is ignored
 * cross-origin — the browser navigates to the file instead of saving it.
 */
async function downloadImage(url: string, basename: string): Promise<void> {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error('Could not fetch the photograph');

  const blob = await response.blob();

  // Name the file after what it actually is. Uploads are converted to WebP,
  // so hard-coding .jpg would hand people a file their photo app refuses to
  // open on the strength of its extension.
  const fromUrl = url.match(/\.(jpe?g|png|webp|avif|gif)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const extension = EXTENSIONS[blob.type] ?? (fromUrl === 'jpeg' ? 'jpg' : fromUrl) ?? 'jpg';
  const filename = `${basename}.${extension}`;
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoked on the next tick — immediately would cancel the save in Safari.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photograph';

export function useShare() {
  const [artwork, setArtwork] = React.useState<ArtworkWithArtist | null>(null);
  return {
    artwork,
    open: (next: ArtworkWithArtist) => setArtwork(next),
    close: () => setArtwork(null),
  };
}

export function ShareSheet({
  artwork,
  onClose,
}: {
  artwork: ArtworkWithArtist | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [savingFor, setSavingFor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!artwork) return null;

  const url = `${window.location.origin}/gallery/${artwork.id}`;
  const artist = artwork.artist?.name ?? 'an ARTINU photographer';
  const text = `“${artwork.title}” by ${artist} on ARTINU`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy the link.');
    }
  };

  const save = async (source: string) => {
    setSavingFor(source);
    try {
      await downloadImage(artwork.imageUrl, `artinu-${slug(artwork.title)}`);
      toast.success('Photograph saved.');
      return true;
    } catch {
      toast.error('Could not save the photograph. Try opening it and saving it directly.');
      return false;
    } finally {
      setSavingFor(null);
    }
  };

  const targets: ShareTarget[] = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <WhatsAppIcon />,
      href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    },
    {
      id: 'instagram',
      label: 'Instagram',
      // Said plainly. Instagram accepts an image, not a link, from a browser.
      hint: 'Saves the photo, then opens Instagram',
      icon: <InstagramIcon />,
      onSelect: async () => {
        if (!(await save('instagram'))) return;
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      },
    },
    {
      id: 'x',
      label: 'X',
      icon: <XIcon />,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    },
    {
      id: 'facebook',
      label: 'Facebook',
      icon: <FacebookIcon />,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      id: 'email',
      label: 'Email',
      icon: <Mail className="size-5" />,
      href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
    },
    {
      id: 'download',
      label: 'Save photo',
      icon: <Download className="size-5" />,
      onSelect: async () => {
        await save('download');
      },
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md"
        /*
          Radix hands focus to the first button in the grid, which here is
          Instagram — so opening the sheet and pressing Enter would download a
          file and leave for another site, neither of which anyone asked for.
          Focus goes to the dialog itself instead: the title and description are
          announced, and Tab walks the destinations in order.
        */
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Share this photograph</DialogTitle>
          <DialogDescription>
            &ldquo;{artwork.title}&rdquo; by {artist}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {targets.map((target) => {
            const content = (
              <>
                <span className="flex size-11 items-center justify-center rounded-full bg-sand text-ink transition-colors group-hover:bg-ink group-hover:text-canvas">
                  {savingFor === target.id ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
                  ) : (
                    target.icon
                  )}
                </span>
                <span className="mt-2 text-center text-xs text-ink">{target.label}</span>
                {target.hint && (
                  <span className="mt-0.5 text-center text-[0.625rem] leading-tight text-subtle">
                    {target.hint}
                  </span>
                )}
              </>
            );

            const className =
              'group flex flex-col items-center rounded-md p-3 transition-colors hover:bg-sand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze';

            return target.href ? (
              <a
                key={target.id}
                href={target.href}
                target="_blank"
                rel="noreferrer noopener"
                className={className}
              >
                {content}
              </a>
            ) : (
              <button
                key={target.id}
                type="button"
                disabled={savingFor !== null}
                onClick={() => void target.onSelect?.()}
                className={cn(className, savingFor !== null && 'opacity-50')}
              >
                {content}
              </button>
            );
          })}
        </div>

        {/* The link itself, visible and copyable — the one action people reach
            for most, so it is not hidden behind an icon. */}
        <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-canvas-soft p-2">
          <Link2 className="ml-1 size-4 shrink-0 text-subtle" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-muted">{url}</span>
          <button
            type="button"
            onClick={() => void copy()}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-1.5 font-label text-[0.6875rem] uppercase tracking-[0.14em] transition-colors',
              copied ? 'text-success' : 'text-ink hover:bg-sand',
            )}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The button that starts a share.
 *
 * Tries the native sheet first — on a phone that is the whole feature, and it
 * includes every app the person actually has. `onFallback` is called only when
 * the browser has no native sharing, or when the person dismissed it.
 */
export function ShareButton({
  artwork,
  onFallback,
  className,
  label,
}: {
  artwork: ArtworkWithArtist;
  onFallback: (artwork: ArtworkWithArtist) => void;
  className?: string;
  label?: string;
}) {
  const share = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const url = `${window.location.origin}/gallery/${artwork.id}`;
    const artist = artwork.artist?.name ?? 'an ARTINU photographer';

    if (navigator.share) {
      try {
        await navigator.share({
          title: artwork.title,
          text: `“${artwork.title}” by ${artist} on ARTINU`,
          url,
        });
        return;
      } catch (error) {
        // AbortError means they closed the sheet on purpose — opening our own
        // dialog on top of that would be arguing with them.
        if ((error as Error)?.name === 'AbortError') return;
      }
    }

    onFallback(artwork);
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label={`Share ${artwork.title}`}
      className={className}
    >
      <Share2 className="size-4" aria-hidden />
      {label}
    </button>
  );
}
