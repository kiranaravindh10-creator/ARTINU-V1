import {
  DEFAULT_FRAME,
  formatCurrency,
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GLASS_TYPES,
  MIN_ORDER_QUANTITY,
  priceLine,
  PRINT_FINISHES,
  type ArtworkWithArtist,
  type FrameConfiguration,
} from '@artinu/shared';
import { Check, Minus, Plus } from 'lucide-react';
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
import { FramedPhoto } from '@/components/ui/photo';
import { DataRow } from '@/components/ui/stat';
import { cn } from '@/lib/utils';

/** Reads the mat/frame colour for the live preview. */
export function frameHex(color: string): string {
  return FRAME_COLORS.find((option) => option.value === color)?.hex ?? '#141210';
}

function OptionRow<T extends readonly { value: string; label: string; description?: string }[]>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: T;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-subtle">{title}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cn(
                'rounded-md border px-3 py-2 text-left text-[0.8125rem] transition-all duration-200',
                active
                  ? 'border-ink bg-sand text-ink'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <span className="block font-medium">{option.label}</span>
              {option.description && (
                <span className="block text-[0.6875rem] text-subtle">{option.description}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface FrameConfiguratorProps {
  artwork: ArtworkWithArtist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen configuration. Return false to keep the dialog open. */
  onConfirm: (frame: FrameConfiguration, quantity: number) => void;
  initialFrame?: FrameConfiguration;
  initialQuantity?: number;
  confirmLabel?: string;
  /** Shown instead of the confirm button for signed-out visitors. */
  signedOutAction?: React.ReactNode;
}

/**
 * The frame configurator. Price updates live from the same `priceLine` the
 * server uses, so what the owner sees here is what they are charged.
 */
export function FrameConfigurator({
  artwork,
  open,
  onOpenChange,
  onConfirm,
  initialFrame = DEFAULT_FRAME,
  initialQuantity = MIN_ORDER_QUANTITY,
  confirmLabel = 'Add to cart',
  signedOutAction,
}: FrameConfiguratorProps) {
  const [frame, setFrame] = React.useState<FrameConfiguration>(initialFrame);
  const [quantity, setQuantity] = React.useState(initialQuantity);

  // Reopening for a different artwork should start from a clean configuration.
  React.useEffect(() => {
    if (open) {
      setFrame(initialFrame);
      setQuantity(initialQuantity);
    }
  }, [open, initialFrame, initialQuantity]);

  const priced = priceLine(frame, quantity);
  const set = (key: keyof FrameConfiguration) => (value: string) =>
    setFrame((current) => ({ ...current, [key]: value }) as FrameConfiguration);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Customize this frame</DialogTitle>
          <DialogDescription>
            {artwork.title} · {artwork.artist?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <FramedPhoto
              src={artwork.thumbnailUrl || artwork.imageUrl}
              alt={artwork.title}
              frameColor={frameHex(frame.color)}
              ratio={
                artwork.orientation === 'portrait'
                  ? 'aspect-[3/4]'
                  : artwork.orientation === 'square'
                    ? 'aspect-square'
                    : 'aspect-[4/3]'
              }
            />

            <div className="rounded-md border border-line bg-canvas-soft p-4">
              <DataRow label="Frame + print" value={formatCurrency(priced.framePrice + priced.printPrice)} />
              <DataRow label="Artwork licence" value={formatCurrency(priced.licensePrice)} />
              <DataRow label={`Per frame × ${quantity}`} value={formatCurrency(priced.unitPrice)} />
              <DataRow label="Subtotal" value={formatCurrency(priced.lineTotal)} emphasis />
              <p className="mt-2 text-xs text-subtle">Excludes GST, delivery and installation.</p>
            </div>
          </div>

          <div className="space-y-5">
            <OptionRow title="Size" options={FRAME_SIZES} value={frame.size} onChange={set('size')} />
            <OptionRow
              title="Material"
              options={FRAME_MATERIALS}
              value={frame.material}
              onChange={set('material')}
            />

            <div>
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-subtle">Colour</p>
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                {FRAME_COLORS.map((color) => {
                  const active = color.value === frame.color;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => set('color')(color.value)}
                      aria-pressed={active}
                      aria-label={color.label}
                      title={color.label}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full transition-all duration-200',
                        active
                          ? 'ring-2 ring-bronze ring-offset-2 ring-offset-surface'
                          : 'ring-1 ring-line-strong hover:ring-subtle',
                      )}
                      style={{ backgroundColor: color.hex }}
                    >
                      {active && (
                        <Check
                          className={cn(
                            'size-3.5',
                            color.value === 'white' ? 'text-ink' : 'text-white',
                          )}
                          strokeWidth={3}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <OptionRow title="Glass" options={GLASS_TYPES} value={frame.glass} onChange={set('glass')} />
            <OptionRow
              title="Print finish"
              options={PRINT_FINISHES}
              value={frame.finish}
              onChange={set('finish')}
            />

            <div>
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Quantity
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                <div className="flex items-center rounded-md border border-line">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    className="flex size-10 items-center justify-center text-muted transition-colors hover:text-ink"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-10 text-center tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.min(50, value + 1))}
                    className="flex size-10 items-center justify-center text-muted transition-colors hover:text-ink"
                    aria-label="Increase quantity"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <p className="text-xs text-subtle">
                  Orders start at {MIN_ORDER_QUANTITY} frames — mix and match across photographs.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {signedOutAction ?? (
            <Button onClick={() => onConfirm(frame, quantity)}>
              {confirmLabel} · {formatCurrency(priced.lineTotal)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
