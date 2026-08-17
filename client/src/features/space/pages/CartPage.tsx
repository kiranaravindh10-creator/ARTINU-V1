import {
  formatCurrency,
  FRAME_COLORS,
  FRAME_MATERIALS,
  FRAME_SIZES,
  GLASS_TYPES,
  MIN_ORDER_QUANTITY,
  PRICING,
  PRINT_FINISHES,
  type FrameConfiguration,
} from '@artinu/shared';
import { Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { DataRow } from '@/components/ui/stat';
import { useCart, type CartLine } from '@/contexts/CartContext';

const label = <T extends readonly { value: string; label: string }[]>(options: T, value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export function describeFrame(frame: FrameConfiguration): string {
  return [
    label(FRAME_SIZES, frame.size),
    label(FRAME_MATERIALS, frame.material),
    label(FRAME_COLORS, frame.color),
    `${label(GLASS_TYPES, frame.glass)} glass`,
    `${label(PRINT_FINISHES, frame.finish)} print`,
  ].join(' · ');
}

export default function CartPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const [coupon, setCoupon] = React.useState('');
  const [editing, setEditing] = React.useState<CartLine | null>(null);

  if (cart.lines.length === 0) {
    return (
      <div>
        <PanelHeader title="Your cart" />
        <EmptyState
          icon={<ShoppingBag />}
          title="Your cart is empty."
          description="Browse the collection and configure a frame to get started."
          action={
            <Button asChild>
              <Link to="/space/collections">Browse art</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const shortfall = MIN_ORDER_QUANTITY - cart.count;

  return (
    <div>
      <PanelHeader
        title="Your cart"
        description={`${cart.count} ${cart.count === 1 ? 'frame' : 'frames'} ready to go.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ul className="space-y-4">
          {cart.lines.map((line) => (
            <li key={line.key}>
              <div className="flex gap-4 border-b border-line-soft pb-6">
                  <Photo
                    src={line.snapshot.imageUrl}
                    alt={line.snapshot.title}
                    className="size-24 shrink-0 rounded-sm"
                  />

                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg leading-tight text-ink">
                      {line.snapshot.title}
                    </h3>
                    <p className="text-xs text-muted">by {line.snapshot.artistName}</p>
                    <p className="mt-2 text-xs leading-relaxed text-subtle">
                      {describeFrame(line.frame)}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center rounded-md border border-line">
                        <button
                          type="button"
                          onClick={() => cart.updateQuantity(line.key, line.quantity - 1)}
                          className="flex size-8 items-center justify-center text-muted transition-colors hover:text-ink"
                          aria-label={`Decrease quantity of ${line.snapshot.title}`}
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => cart.updateQuantity(line.key, line.quantity + 1)}
                          className="flex size-8 items-center justify-center text-muted transition-colors hover:text-ink"
                          aria-label={`Increase quantity of ${line.snapshot.title}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>

                      <Button variant="ghost" size="sm" onClick={() => setEditing(line)}>
                        Change frame
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cart.remove(line.key)}
                        aria-label={`Remove ${line.snapshot.title}`}
                        className="text-danger hover:bg-danger-soft"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="border-t-2 border-ink pt-6">
              <h2 className="font-display text-lg text-ink">Order summary</h2>

              <div className="mt-4">
                <DataRow label="Artwork licensing" value={formatCurrency(cart.pricing.artworkTotal)} />
                <DataRow label="Frames" value={formatCurrency(cart.pricing.frameTotal)} />
                <DataRow label="Printing" value={formatCurrency(cart.pricing.printingTotal)} />
                <DataRow label="Subtotal" value={formatCurrency(cart.pricing.subtotal)} />
                {cart.pricing.discount > 0 && (
                  <DataRow
                    label={`Discount${cart.couponCode ? ` (${cart.couponCode})` : ''}`}
                    value={`− ${formatCurrency(cart.pricing.discount)}`}
                  />
                )}
                <DataRow
                  label="Delivery"
                  value={cart.pricing.delivery === 0 ? 'Free' : formatCurrency(cart.pricing.delivery)}
                />
                <DataRow label="Installation" value={formatCurrency(cart.pricing.installation)} />
                <DataRow
                  label={`GST @ ${PRICING.GST_RATE * 100}%`}
                  value={formatCurrency(cart.pricing.gst)}
                />
                <DataRow label="Total" value={formatCurrency(cart.pricing.total)} emphasis />
              </div>

              <div className="mt-5">
                {cart.couponCode ? (
                  <div className="flex items-center justify-between gap-3 rounded-md bg-bronze-soft/60 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-bronze-deep">
                      <Tag className="size-3.5" aria-hidden />
                      {cart.couponCode} applied
                    </span>
                    <button
                      type="button"
                      onClick={cart.removeCoupon}
                      className="text-xs text-bronze-deep underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const result = cart.applyCoupon(coupon);
                      if (result.ok) {
                        toast.success(result.message);
                        setCoupon('');
                      } else {
                        toast.error(result.message);
                      }
                    }}
                  >
                    <Input
                      value={coupon}
                      onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      className="h-10"
                    />
                    <Button type="submit" variant="outline" size="sm" disabled={!coupon.trim()}>
                      Apply
                    </Button>
                  </form>
                )}
              </div>

              {shortfall > 0 && (
                <p className="mt-5 rounded-md border border-bronze/30 bg-bronze-soft/50 px-3 py-2.5 text-sm text-bronze-deep">
                  A minimum of {MIN_ORDER_QUANTITY} frames is required — add {shortfall} more.
                </p>
              )}

              <Button
                className="mt-5 w-full"
                disabled={!cart.meetsMinimum}
                onClick={() => navigate('/space/checkout')}
              >
                Continue to checkout
              </Button>

              <Button variant="ghost" className="mt-2 w-full" asChild>
                <Link to="/space/collections">Keep browsing</Link>
              </Button>
          </div>
        </aside>
      </div>

      {editing && (
        <ChangeFrameDialog
          line={editing}
          onClose={() => setEditing(null)}
          onSave={(frame) => {
            cart.updateFrame(editing.key, frame);
            setEditing(null);
            toast.success('Frame updated');
          }}
        />
      )}
    </div>
  );
}

/** Compact frame editor for a line already in the cart. */
function ChangeFrameDialog({
  line,
  onClose,
  onSave,
}: {
  line: CartLine;
  onClose: () => void;
  onSave: (frame: FrameConfiguration) => void;
}) {
  const [frame, setFrame] = React.useState<FrameConfiguration>(line.frame);
  const set = (key: keyof FrameConfiguration) => (value: string) =>
    setFrame((current) => ({ ...current, [key]: value }) as FrameConfiguration);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change frame</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <SimpleSelect
            value={frame.size}
            onValueChange={set('size')}
            options={FRAME_SIZES.map((o) => ({ value: o.value, label: o.label }))}
          />
          <SimpleSelect
            value={frame.material}
            onValueChange={set('material')}
            options={FRAME_MATERIALS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <SimpleSelect
            value={frame.color}
            onValueChange={set('color')}
            options={FRAME_COLORS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <SimpleSelect
            value={frame.glass}
            onValueChange={set('glass')}
            options={GLASS_TYPES.map((o) => ({ value: o.value, label: `${o.label} glass` }))}
          />
          <SimpleSelect
            value={frame.finish}
            onValueChange={set('finish')}
            options={PRINT_FINISHES.map((o) => ({ value: o.value, label: `${o.label} print` }))}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(frame)}>Save frame</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
