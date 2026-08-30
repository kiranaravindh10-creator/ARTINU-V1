import * as React from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

/**
 * The printed sheet: the photograph, and the credit plate underneath it.
 *
 * ── The sheet follows the photograph ────────────────────────────────────────
 *
 * This used to be a fixed `aspect-[1/1.414]` - A-format portrait - for every
 * photograph, which is wrong for more than half of them. A landscape shot was
 * dropped into a tall portrait sheet and letterboxed: a thin strip of
 * photograph with white bands above and below it, and the plate taking up as
 * much of the frame as the picture did. Nobody would hang that.
 *
 * The image band now takes the photograph's OWN aspect ratio, so a landscape
 * photograph produces a landscape sheet and a portrait one a portrait sheet.
 * The band matches the image exactly, so there is no letterboxing to remove
 * and nothing has to be cropped to hide it.
 *
 * ── Why the photograph is never cropped or stretched ────────────────────────
 *
 * `object-contain` inside a band that already matches the image's ratio. The
 * two together mean the photograph is drawn at its own shape, edge to edge,
 * with no crop and no distortion. `cover` would have decided on the
 * photographer's behalf which part of their composition to throw away.
 *
 * ── Why the plate is sized in width, not height ─────────────────────────────
 *
 * The plate holds a name, a place, a note and a QR, and it needs the same room
 * for those whether the photograph above it is tall or wide. Sizing it as a
 * share of the sheet's HEIGHT would give a landscape sheet a cramped plate and
 * a portrait sheet a bloated one. Sized against width it stays constant, and
 * the photograph ends up dominating either way - which is the point.
 */
export interface PrintPlateProps {
  imageUrl: string;
  title: string;
  artistName: string;
  /** "Bangalore Urban, India" - omitted when not recorded. */
  location?: string | null;
  /** The photographer's own words about the photograph. */
  statement?: string | null;
  /** e.g. "KDO001". The plate still renders without one. */
  photoId?: string | null;
  /** Absolute URL the QR should resolve to. */
  qrTarget?: string | null;
  /** Pixel dimensions from the upload. The most reliable shape signal. */
  width?: number | null;
  height?: number | null;
  /** Stored orientation, used when dimensions are missing. */
  orientation?: string | null;
  className?: string;
}

/** Enough of the note to be worth reading, not enough to crowd the plate. */
const STATEMENT_LIMIT = 165;

/**
 * The shape of the image band, as a CSS aspect-ratio.
 *
 * Real pixel dimensions first, because they are exact. `orientation` is the
 * fallback: it is a stored label rather than a measurement, so it can only give
 * a representative ratio. A photograph with neither is assumed landscape, which
 * is the commoner case and the safer failure - a landscape band showing a
 * portrait image letterboxes; a portrait band showing a landscape one is the
 * bug this whole component exists to avoid.
 */
function bandRatio(
  width?: number | null,
  height?: number | null,
  orientation?: string | null,
): string {
  if (width && height && width > 0 && height > 0) return `${width} / ${height}`;
  if (orientation === 'portrait') return '3 / 4';
  if (orientation === 'square') return '1 / 1';
  return '4 / 3';
}

export function PrintPlate({
  imageUrl,
  title,
  artistName,
  location,
  statement,
  photoId,
  qrTarget,
  width,
  height,
  orientation,
  className,
}: PrintPlateProps) {
  const [qr, setQr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!qrTarget) {
      setQr(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(qrTarget, {
      margin: 0,
      // Rendered small but generated large: a QR scaled up from 128px is soft
      // under a phone camera, and this one has to scan off a wall.
      width: 512,
      errorCorrectionLevel: 'M',
      color: { dark: '#14120f', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [qrTarget]);

  const note =
    statement && statement.length > STATEMENT_LIMIT
      ? `${statement.slice(0, STATEMENT_LIMIT).trimEnd()}…`
      : statement;

  return (
    /*
      `container-type` so the type below can size in cqw - percentages of this
      sheet rather than of the viewport - and read correctly at both cart
      thumbnail and full dialog size.
    */
    <div className={cn('flex flex-col bg-white [container-type:inline-size]', className)}>
      {/*
        The photograph, at its own shape, with a white margin on three sides.
        No fixed height: the band is as tall as the image is, so the sheet grows
        to fit the picture rather than the picture being squeezed into a sheet.
      */}
      <div className="px-[5%] pt-[5%]">
        <div
          className="w-full overflow-hidden"
          style={{ aspectRatio: bandRatio(width, height, orientation) }}
        >
          <img
            src={imageUrl}
            alt={title}
            className="size-full object-contain"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>

      <div className="flex items-start justify-between gap-[4%] px-[5%] pb-[4%] pt-[3.5%]">
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[4.2cqw] font-bold uppercase leading-[1.15] tracking-[0.18em] text-ink">
            {artistName}
          </p>

          {location && (
            <p className="mt-[1%] font-display text-[3.6cqw] leading-snug text-ink">{location}</p>
          )}

          {note && <p className="mt-[2%] text-[2.7cqw] leading-[1.4] text-ink-soft">{note}</p>}
        </div>

        {/*
          One centred column: ID, QR, wordmark - so the ID sits squarely above
          the QR and the wordmark squarely below it.
        */}
        <div className="flex shrink-0 flex-col items-center gap-[4%]">
          {photoId && (
            <p className="font-sans text-[3.1cqw] font-semibold tracking-[0.22em] text-ink">
              {photoId}
            </p>
          )}

          {qr ? (
            <img
              src={qr}
              alt={
                photoId
                  ? `QR code for ${title} by ${artistName}, photograph ${photoId}`
                  : `QR code for ${title} by ${artistName}`
              }
              className="aspect-square w-[19cqw]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            // Holds the space so the plate does not reflow when the QR lands.
            <div className="aspect-square w-[19cqw]" aria-hidden />
          )}

          <p className="font-display text-[3.6cqw] leading-none tracking-[0.08em] text-ink">
            ARTINU
          </p>
        </div>
      </div>
    </div>
  );
}
