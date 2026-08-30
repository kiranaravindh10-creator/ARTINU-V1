import {
  formatCurrency,
  FRAME_COLOR_MATERIAL,
  FRAME_COLORS,
  FRAME_SIZES,
  MIN_ORDER_QUANTITY,
  type FrameConfiguration,
} from '@artinu/shared';
import { Frame, Tag, Trash2 } from 'lucide-react';
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
import { describeFrame } from '@/features/public/components/FrameConfigurator';

/*
  `describeFrame` used to live here, and three other screens imported it from
  this page. It now sits beside the configurator that produces the configuration
  it describes, so the wording of a frame spec is defined once, next to the only
  code that can create one.
*/

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
          icon={<Frame />}
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
        description={`${cart.count} ${
          cart.count === 1 ? 'photograph' : 'photographs'
        } ready to go.`}
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

                    {/*
                      No quantity stepper.

                      One print per photograph, so the only numbers this control
                      could produce were wrong ones. What is left is the two
                      things an owner actually does to a cart line: change the
                      frame, or take it out.
                    */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
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

              {/*
                Three rows, not eight.

                It listed "Artwork licensing", "Frames", "Printing", a subtotal,
                delivery, installation and GST - seven lines of internal cost
                composition shown to a café owner who wants to know what to pay.
                The composition is still computed and still recorded on the
                order, which is where an accountant needs it.

                Installation and the GST row are gone because neither is charged:
                installation is included, and ARTINU is not registered for GST
                yet. A "GST @ 18% ... 0" row invites exactly one question.
              */}
              <div className="mt-4">
                <DataRow label="Printing and framing" value={formatCurrency(cart.pricing.subtotal)} />
                {cart.pricing.discount > 0 && (
                  <DataRow
                    label={`Discount${cart.couponCode ? ` (${cart.couponCode})` : ''}`}
                    value={`- ${formatCurrency(cart.pricing.discount)}`}
                  />
                )}
                <DataRow label="Delivery" value="Included" />
                <DataRow label="Total" value={formatCurrency(cart.pricing.total)} emphasis />
              </div>

              <p className="mt-3 text-xs text-subtle">
                Inclusive of delivery. One print per photograph.
              </p>

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
                    onSubmit={async (event) => {
                      event.preventDefault();
                      // Awaited now: the code is checked by the server rather
                      // than against a table compiled into the page.
                      const result = await cart.applyCoupon(coupon);
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
                  A collection starts at {MIN_ORDER_QUANTITY} photographs - add {shortfall} more.
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

  /* Colour writes the material with it - the same rule as the configurator. */
  const setColor = (value: string) =>
    setFrame(
      (current) =>
        ({
          ...current,
          color: value,
          material: FRAME_COLOR_MATERIAL[value] ?? current.material,
        }) as FrameConfiguration,
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change frame</DialogTitle>
        </DialogHeader>

        {/*
          Two selects, matching the configurator.

          It offered five - including glass and print finish, which are no longer
          choices, and material, which is decided by the colour. A cart line
          edited here could disagree with the same line configured on the gallery
          page, which is how you end up printing a white wooden frame.
        */}
        <div className="space-y-4">
          <label className="block">
            <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Size
            </span>
            <SimpleSelect
              value={frame.size}
              onValueChange={set('size')}
              options={FRAME_SIZES.map((o) => ({
                value: o.value,
                label: `${o.label} - ${o.description}`,
              }))}
            />
          </label>
          <label className="block">
            <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Colour
            </span>
            <SimpleSelect
              value={frame.color}
              onValueChange={setColor}
              options={FRAME_COLORS.map((o) => ({
                value: o.value,
                label: `${o.label} - ${FRAME_COLOR_MATERIAL[o.value] === 'metal' ? 'metal' : 'wooden'} frame`,
              }))}
            />
          </label>
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
