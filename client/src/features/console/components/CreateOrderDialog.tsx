import {
  DEFAULT_FRAME,
  FRAME_COLOR_MATERIAL,
  FRAME_COLORS,
  FRAME_SIZES,
  MIN_ORDER_QUANTITY,
  formatCurrency,
  priceLine,
  QUANTITY_PER_PHOTOGRAPH,
  type ArtworkWithArtist,
  type FrameConfiguration,
  type Space,
} from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { SimpleSelect } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { adminService } from '@/services/admin.service';
import { cn } from '@/lib/utils';

/**
 * PLACING AN ORDER FOR SOMEONE WHO WILL NEVER LOG IN.
 *
 * A good share of café owners are not going to use the site. They will say "you
 * know what we want, just do it" on the phone or across the counter, and until
 * this existed there was nothing staff could do with that: order creation was
 * space-owner-only and asserted the caller owned the space.
 *
 * Three decisions worth knowing about:
 *
 * 1. NO PRICE FIELD. Staff choose what is being bought, never what it costs.
 *    The total shown here is computed by the same `priceLine` the customer
 *    would have seen, and the server recomputes it again from `items` alone -
 *    nothing monetary is sent in the request. A discount is a coupon code,
 *    which is auditable, rather than a number someone typed.
 *
 * 2. ONE FRAME SPEC FOR THE WHOLE ORDER. The configurator lets a customer set a
 *    size and colour per photograph; here that would be a dozen dropdowns to
 *    fill in over the phone. A collection is normally framed the same way
 *    throughout, so it is asked once and applied to every line. Any individual
 *    line can still be changed afterwards on the order.
 *
 * 3. PAID IS A DELIBERATE CHOICE, NOT A DEFAULT. Ticking it settles the order
 *    immediately - invoice, artist notifications, payout accrual, production
 *    queue - so it must be an explicit action by whoever actually took the
 *    money. Left unticked, the owner can still pay online exactly as normal.
 */
export function CreateOrderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [spaceId, setSpaceId] = React.useState('');
  const [chosen, setChosen] = React.useState<ArtworkWithArtist[]>([]);
  const [frame, setFrame] = React.useState<FrameConfiguration>(DEFAULT_FRAME);
  const [markPaid, setMarkPaid] = React.useState(false);
  type PaymentMethod = 'cash' | 'bank_transfer' | 'upi' | 'other';
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('cash');
  const [paymentReference, setPaymentReference] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [query, setQuery] = React.useState('');

  // Start clean every time it opens - a half-built order left over from last
  // time is how the wrong photographs end up on someone's wall.
  React.useEffect(() => {
    if (!open) return;
    setSpaceId('');
    setChosen([]);
    setFrame(DEFAULT_FRAME);
    setMarkPaid(false);
    setPaymentMethod('cash');
    setPaymentReference('');
    setNotes('');
    setSearch('');
    setQuery('');
  }, [open]);

  const { data: spaces } = useQuery({
    queryKey: qk.admin.spaces({ pageSize: 200 }),
    queryFn: () => adminService.spaces({ pageSize: 200 }),
    enabled: open,
  });

  const { data: results, isFetching } = useQuery({
    queryKey: qk.gallery({ q: query || undefined, pageSize: 24 }),
    queryFn: () => catalogService.gallery({ q: query || undefined, pageSize: 24 }),
    enabled: open,
  });

  const space = (spaces?.items ?? []).find((entry: Space) => entry.id === spaceId);

  const toggle = (artwork: ArtworkWithArtist) =>
    setChosen((current) =>
      current.some((entry) => entry.id === artwork.id)
        ? current.filter((entry) => entry.id !== artwork.id)
        : [...current, artwork],
    );

  // The same arithmetic the customer would have seen.
  const unit = priceLine(frame, QUANTITY_PER_PHOTOGRAPH).unitPrice;
  const total = unit * chosen.length;
  const shortfall = MIN_ORDER_QUANTITY - chosen.length;

  const create = useMutation({
    mutationFn: () =>
      adminService.createOrder({
        spaceId,
        items: chosen.map((artwork) => ({
          artworkId: artwork.id,
          quantity: QUANTITY_PER_PHOTOGRAPH,
          frame,
        })),
        includeSecurityDeposit: false,
        notes: notes.trim() || null,
        markPaid,
        paymentMethod,
        paymentReference: paymentReference.trim() || null,
      }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      toast.success(
        markPaid
          ? `${order.reference} created and marked paid.`
          : `${order.reference} created, awaiting payment.`,
      );
      onOpenChange(false);
      navigate(`/console/orders/${order.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const ready = Boolean(spaceId) && chosen.length >= MIN_ORDER_QUANTITY;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add an order</DialogTitle>
          <DialogDescription>
            For a space that is not placing it themselves. The order belongs to the space owner and
            behaves like any other from the moment it exists.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* ── Choosing the photographs ─────────────────────────────── */}
          <div className="min-w-0">
            <label className="block">
              <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Which space
              </span>
              <SimpleSelect
                value={spaceId}
                onValueChange={setSpaceId}
                placeholder="Choose a space…"
                options={(spaces?.items ?? []).map((entry: Space) => ({
                  value: entry.id,
                  label: `${entry.name}${entry.city ? ` - ${entry.city}` : ''}`,
                }))}
              />
            </label>

            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(search);
              }}
            >
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search photographs by title, artist or place…"
                icon={<Search />}
                aria-label="Search photographs"
              />
            </form>

            <div className="mt-4 grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {isFetching && !results
                ? Array.from({ length: 8 }, (_, index) => (
                    <div key={index} className="aspect-[3/4] animate-pulse rounded-sm bg-sand" />
                  ))
                : (results?.items ?? []).map((artwork) => {
                    const picked = chosen.some((entry) => entry.id === artwork.id);
                    return (
                      <button
                        key={artwork.id}
                        type="button"
                        onClick={() => toggle(artwork)}
                        aria-pressed={picked}
                        title={`${artwork.title} - ${artwork.artist?.name ?? 'ARTINU artist'}`}
                        className={cn(
                          'group relative overflow-hidden rounded-sm ring-offset-2 ring-offset-surface transition-all',
                          picked ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-line-strong',
                        )}
                      >
                        <Photo
                          src={artwork.thumbnailUrl || artwork.imageUrl}
                          alt={artwork.title}
                          ratio="aspect-[3/4]"
                          thumbnail
                          variants={artwork.imageVariants}
                          className="w-full"
                        />
                        {picked && (
                          <span
                            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-ink text-canvas"
                            aria-hidden
                          >
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
            </div>
            {results && results.items.length === 0 && (
              <p className="mt-3 text-sm text-muted">Nothing matched that search.</p>
            )}
          </div>

          {/* ── The order being built ────────────────────────────────── */}
          <div className="min-w-0 space-y-6">
            <div>
              <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Chosen ({chosen.length})
              </p>
              {chosen.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  Pick at least {MIN_ORDER_QUANTITY} photographs from the left.
                </p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {chosen.map((artwork) => (
                    <li key={artwork.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-ink">{artwork.title}</span>
                      <span className="shrink-0 text-xs text-subtle">
                        {artwork.artist?.name ?? 'ARTINU artist'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggle(artwork)}
                        aria-label={`Remove ${artwork.title}`}
                        className="shrink-0 text-subtle transition-colors hover:text-danger"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* One spec for the whole collection - see the note at the top. */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                  Size
                </span>
                <SimpleSelect
                  value={frame.size}
                  onValueChange={(value) =>
                    setFrame((current) => ({ ...current, size: value }) as FrameConfiguration)
                  }
                  options={FRAME_SIZES.map((option) => ({
                    value: option.value,
                    label: `${option.label} - ${option.description}`,
                  }))}
                />
              </label>
              <label className="block">
                <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                  Colour
                </span>
                <SimpleSelect
                  value={frame.color}
                  onValueChange={(value) =>
                    setFrame(
                      (current) =>
                        ({
                          ...current,
                          color: value,
                          material: FRAME_COLOR_MATERIAL[value] ?? current.material,
                        }) as FrameConfiguration,
                    )
                  }
                  options={FRAME_COLORS.map((option) => ({
                    value: option.value,
                    label: `${option.label} - ${FRAME_COLOR_MATERIAL[option.value] === 'metal' ? 'metal' : 'wooden'}`,
                  }))}
                />
              </label>
            </div>

            <div className="rounded-md border border-line bg-canvas-soft p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">
                  {chosen.length} × {formatCurrency(unit)}
                </span>
                <span className="font-display text-2xl text-ink">{formatCurrency(total)}</span>
              </div>
              <p className="mt-1.5 text-xs text-subtle">
                Inclusive of delivery. The server recalculates this before charging anything.
              </p>
            </div>

            {/* ── Money ────────────────────────────────────────────── */}
            <div className="rounded-md border border-line p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={markPaid}
                  onChange={(event) => setMarkPaid(event.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-ink)]"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">
                    We have already been paid
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Issues the invoice, tells the photographers, records what they are owed and puts
                    it in the print queue. Leave unticked and the owner can pay online.
                  </span>
                </span>
              </label>

              {markPaid && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                      How
                    </span>
                    <SimpleSelect
                      value={paymentMethod}
                      onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                      options={[
                        { value: 'cash', label: 'Cash' },
                        { value: 'bank_transfer', label: 'Bank transfer' },
                        { value: 'upi', label: 'UPI' },
                        { value: 'other', label: 'Other' },
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                      Reference
                    </span>
                    <Input
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      placeholder="UPI ref, cheque no…"
                      aria-label="Payment reference"
                    />
                  </label>
                </div>
              )}
            </div>

            <label className="block">
              <span className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                Notes
              </span>
              <Textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Taken over the phone by…"
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <span className="mr-auto text-xs text-subtle">
            {!spaceId
              ? 'Choose a space to continue.'
              : shortfall > 0
                ? `Add ${shortfall} more photograph${shortfall === 1 ? '' : 's'}.`
                : space
                  ? `For ${space.name}. One print per photograph.`
                  : null}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!ready} loading={create.isPending} onClick={() => create.mutate()}>
            {markPaid ? 'Create and mark paid' : 'Create order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
