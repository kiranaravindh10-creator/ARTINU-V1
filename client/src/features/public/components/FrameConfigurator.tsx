import {
  ALL_FRAME_COLORS,
  ALL_FRAME_MATERIALS,
  ALL_FRAME_SIZES,
  DEFAULT_FRAME,
  formatCurrency,
  FRAME_COLOR_MATERIAL,
  FRAME_COLORS,
  FRAME_SIZES,
  MIN_ORDER_QUANTITY,
  monthlyRatePerFrame,
  SUBSCRIPTION_TERMS,
  tariffBookFor,
  type SubscriptionTerm,
  QUANTITY_PER_PHOTOGRAPH,
  type ArtworkWithArtist,
  type FrameConfiguration,
} from '@artinu/shared';
import { Check } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PrintPlate } from '@/components/ui/print-plate';
import { useCart } from '@/contexts/CartContext';
import { cn } from '@/lib/utils';

/** Reads the frame colour for the live preview. Falls back to the old black. */
export function frameHex(color: string): string {
  return ALL_FRAME_COLORS.find((option) => option.value === color)?.hex ?? '#141210';
}

const labelOf = <T extends readonly { value: string; label: string }[]>(
  options: T,
  value: string,
) => options.find((option) => option.value === value)?.label ?? value;

/**
 * A configured frame in one line: "A3 297 × 420 mm · Brown, wood".
 *
 * Glass and print finish are no longer listed. Every frame is glazed with the
 * same glass and printed with the same finish, so naming them said nothing about
 * this frame in particular - and the old version rendered "Glass glass" once the
 * glass option collapsed to a single entry.
 */
export function describeFrame(frame: FrameConfiguration): string {
  const size = ALL_FRAME_SIZES.find((option) => option.value === frame.size);
  const material = labelOf(ALL_FRAME_MATERIALS, frame.material).toLowerCase();
  return [
    size ? `${size.label} ${size.description}` : frame.size,
    `${labelOf(ALL_FRAME_COLORS, frame.color)}, ${material}`,
  ].join(' · ');
}

export interface FrameConfiguratorProps {
  artwork: ArtworkWithArtist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen configuration. Return false to keep the dialog open. */
  onConfirm: (frame: FrameConfiguration, quantity: number) => void;
  initialFrame?: FrameConfiguration;
  /**
   * Ignored. Kept so existing call sites still compile - every photograph is
   * printed once, so there is no quantity to seed.
   */
  initialQuantity?: number;
  confirmLabel?: string;
  /** Shown instead of the confirm button for signed-out visitors. */
  signedOutAction?: React.ReactNode;
  /** The space this is being framed for - decides the tariff book. */
  spaceType?: string | null;
}

/**
 * The frame configurator.
 *
 * WHAT THIS USED TO ASK, AND WHY IT NO LONGER DOES
 *
 * There were six questions: size (five options, three of which encoded an aspect
 * ratio), material, colour, glass, print finish and quantity. A café owner
 * choosing art for their wall had to hold opinions about anti-reflective glazing
 * and aluminium profiles before they could see a price.
 *
 * Two questions remain - how big, and what colour - because those are the only
 * two ARTINU actually offers a choice on:
 *
 *   size          A4 / A3 / A2, with the millimetres printed, because "A3" means
 *                 nothing to someone holding a tape measure against a wall.
 *   colour        white or brown, and the colour DECIDES the material through
 *                 FRAME_COLOR_MATERIAL - white comes in metal, brown in wood.
 *                 Asking twice let a cart line say "white, wood", which is not a
 *                 thing that can be manufactured.
 *   orientation   not asked. It follows the photograph. A portrait photograph
 *                 gets a portrait frame; that was decided when it was taken.
 *   glass         not asked. Always the same clear glass.
 *   print finish  not asked. Always the same finish.
 *   quantity      not asked. One print per photograph - see
 *                 QUANTITY_PER_PHOTOGRAPH. A stepper here asked how many copies
 *                 of one picture you want on one wall.
 *
 * Price still comes from the same `priceLine` the server charges from, so what
 * is shown here is what is billed.
 */
export function FrameConfigurator({
  artwork,
  open,
  onOpenChange,
  onConfirm,
  initialFrame = DEFAULT_FRAME,
  confirmLabel = 'Add to frame',
  signedOutAction,
  spaceType,
}: FrameConfiguratorProps) {
  const [frame, setFrame] = React.useState<FrameConfiguration>(initialFrame);
  const [term, setTerm] = React.useState<SubscriptionTerm>('monthly');
  const cart = useCart();

  // Reopening for a different artwork should start from a clean configuration.
  React.useEffect(() => {
    if (open) setFrame(initialFrame);
  }, [open, initialFrame]);

  /*
    ── The price is a MONTHLY RATE, from the tariff ──────────────────────────

    This read `priceLine(frame, 1)` and showed ₹3,299 - the old one-off sale
    price, built from a frame cost, a print cost and an artwork licence. None
    of those describe what is being bought. ARTINU rents a framed photograph by
    the month; the tariff publishes the rate, and the rate depends on three
    things this dialog now has to know:

      how many frames  the tier applies to the whole collection, so adding a
                       fourth frame lowers the rate on all four. The count is
                       the cart plus the one being configured.
      which book       a home is billed from a cheaper table than a café.
      which term       a longer commitment buys a lower monthly rate.
  */
  /*
    The tier is never below the order minimum.

    A collection cannot be fewer than MIN_ORDER_QUANTITY photographs, so the
    one- and two-frame rates in the tariff can never actually be charged
    through this checkout. Quoting ₹429 to somebody framing their first
    photograph shows them a price that does not exist and then appears to drop
    when they add the third. This shows what they will really pay.
  */
  const frameCount = Math.max(cart.count + 1, MIN_ORDER_QUANTITY);
  const book = tariffBookFor(spaceType);
  const rate = monthlyRatePerFrame(frame.size, frameCount, book, term);

  /* Terms that are actually sold. Only month-to-month today. */
  const offeredTerms = SUBSCRIPTION_TERMS.filter((option) => option.offered);

  /*
    Choosing a colour writes the material too.

    The material is not a separate field the owner can contradict - it is a
    consequence. Writing it here rather than deriving it at read time means the
    cart line, the order row and the printing docket all carry the material
    explicitly, so the workshop never has to re-derive which profile to cut.
  */
  const chooseColor = (value: string) =>
    setFrame(
      (current) =>
        ({
          ...current,
          color: value,
          material: FRAME_COLOR_MATERIAL[value] ?? current.material,
        }) as FrameConfiguration,
    );

  const chooseSize = (value: string) =>
    setFrame((current) => ({ ...current, size: value }) as FrameConfiguration);

  /*
    The frame follows the photograph.

    `artwork.orientation` is metadata from the upload, so a portrait photograph
    previews in a portrait frame without anyone choosing one.
  */
  const previewRatio =
    artwork.orientation === 'portrait'
      ? 'aspect-[3/4]'
      : artwork.orientation === 'square'
        ? 'aspect-square'
        : 'aspect-[4/3]';

  const activeColor = FRAME_COLORS.find((option) => option.value === frame.color);
  const material = FRAME_COLOR_MATERIAL[frame.color];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Landscape, not portrait.

        With four of the six questions gone the old two-column portrait dialog
        was mostly empty space stacked under a small preview. This is wider than
        it is tall, and the photograph gets the larger half - the owner is
        choosing how their wall will look, so the wall should be the biggest
        thing in the dialog.
      */}
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Frame this photograph</DialogTitle>
          <DialogDescription>
            {artwork.title} · {artwork.artist?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
          {/*
            The frame holds the SHEET, not a bare photograph.

            What is printed and hung is the image plus the credit plate below
            it - photographer, place, note, Photo ID and the QR that leads back
            to them. Previewing only the image meant the owner approved one
            thing and a different one arrived on their wall, and the part that
            was missing is the part the photographer is paid in.
          */}
          <div
            className="shadow-frame"
            style={{ backgroundColor: frameHex(frame.color), padding: '2.5%' }}
          >
            <PrintPlate
              imageUrl={artwork.thumbnailUrl || artwork.imageUrl}
              title={artwork.title}
              artistName={artwork.artist?.name ?? 'ARTINU artist'}
              location={[artwork.artist?.city, artwork.artist?.country].filter(Boolean).join(', ') || null}
              statement={artwork.story ?? artwork.description ?? null}
              photoId={artwork.photoId ?? null}
              width={artwork.width}
              height={artwork.height}
              orientation={artwork.orientation}
              qrTarget={`${window.location.origin}/gallery/${artwork.id}`}
            />
          </div>

          <div className="space-y-7">
            <fieldset>
              <legend className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Size
              </legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {FRAME_SIZES.map((option) => {
                  const active = option.value === frame.size;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => chooseSize(option.value)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-md border px-3 py-2.5 text-left transition-all duration-200',
                        active
                          ? 'border-ink bg-sand text-ink'
                          : 'border-line text-muted hover:border-line-strong hover:text-ink',
                      )}
                    >
                      <span className="block font-display text-lg leading-none">{option.label}</span>
                      {/* The millimetres are the useful half of this label. */}
                      <span className="mt-1.5 block text-[0.6875rem] tabular-nums text-subtle">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Colour
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {FRAME_COLORS.map((option) => {
                  const active = option.value === frame.color;
                  const becomes = FRAME_COLOR_MATERIAL[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => chooseColor(option.value)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-1 items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-all duration-200',
                        active
                          ? 'border-ink bg-sand text-ink'
                          : 'border-line text-muted hover:border-line-strong hover:text-ink',
                      )}
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-line-strong"
                        style={{ backgroundColor: option.hex }}
                        aria-hidden
                      >
                        {active && (
                          <Check
                            className={cn(
                              'size-3.5',
                              option.value === 'white' ? 'text-ink' : 'text-white',
                            )}
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{option.label}</span>
                        {/* Say what they are actually getting, not just a swatch. */}
                        <span className="block text-[0.6875rem] text-subtle">
                          {becomes === 'metal' ? 'Metal frame' : 'Wooden frame'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/*
              How long they are committing for.

              Only month-to-month is sold today, so this renders a single
              non-interactive row rather than a choice of one - a radio group
              with one option asks a question that has no alternative answer.
              The moment a term is marked `offered` in SUBSCRIPTION_TERMS it
              becomes a real selector here with no further change.
            */}
            <fieldset>
              <legend className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Term
              </legend>
              {offeredTerms.length > 1 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {offeredTerms.map((option) => {
                    const active = option.value === term;
                    const optionRate = monthlyRatePerFrame(
                      frame.size,
                      frameCount,
                      book,
                      option.value as SubscriptionTerm,
                    );
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTerm(option.value as SubscriptionTerm)}
                        aria-pressed={active}
                        className={cn(
                          'rounded-md border px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'border-ink bg-sand'
                            : 'border-line hover:border-line-strong',
                        )}
                      >
                        <span className="block text-sm font-medium text-ink">{option.label}</span>
                        <span className="block text-[0.6875rem] text-subtle">
                          {optionRate === null ? '—' : `${formatCurrency(optionRate)}/mo`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink">
                  {offeredTerms[0]?.label ?? 'Month to month'}
                  <span className="ml-2 text-[0.6875rem] text-subtle">
                    Rotates every month. Cancel any time and we collect the frames.
                  </span>
                </p>
              )}
            </fieldset>

            {/*
              One price, and what it covers.

              This was four rows - "Frame + print", "Artwork licence", "Per frame
              × 3", "Subtotal" - and then a line saying the number excluded GST,
              delivery and installation. Five pieces of arithmetic to answer "what
              does this cost". The composition still exists in the order and on
              the invoice, where an accountant needs it. Here it is one number.
            */}
            <div className="border-t border-line pt-5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                  Per frame, per month
                </span>
                <span className="font-display text-3xl leading-none text-ink">
                  {rate === null ? '—' : formatCurrency(rate)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                Printed, framed, delivered and installed. Inclusive of delivery.
              </p>
              {/*
                The tier is the thing most worth saying out loud: the rate is
                not fixed per photograph, it falls as the collection grows, and
                an owner who does not know that will not add the fourth frame.
              */}
              <p className="mt-1 text-xs text-muted">
                Rate for a collection of {frameCount}
                {frameCount === 1 ? ' frame' : ' frames'}. It falls as you add more.
              </p>
              <p className="mt-3 text-xs text-subtle">
                One print per photograph. A collection starts at {MIN_ORDER_QUANTITY} photographs.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {signedOutAction ?? (
            <Button onClick={() => onConfirm(frame, QUANTITY_PER_PHOTOGRAPH)}>
              {confirmLabel}
              {rate === null ? '' : ` · ${formatCurrency(rate)}/mo`}
            </Button>
          )}
        </DialogFooter>

        {/* Announced for screen readers so the spec is available without the swatch. */}
        <p className="sr-only">
          {`Selected: ${labelOf(FRAME_SIZES, frame.size)}, ${
            activeColor?.label ?? frame.color
          }, ${material === 'metal' ? 'metal' : 'wooden'} frame.`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
