import { formatCurrency, PRICING, type PriceBreakdown } from '@artinu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, ShieldCheck, Frame } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Block, PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Checkbox, RadioGroup, RadioGroupItem } from '@/components/ui/checkbox';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Textarea } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { DataRow } from '@/components/ui/stat';
import { describeFrame } from '@/features/public/components/FrameConfigurator';
import { useCart } from '@/contexts/CartContext';
import { errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';
import { orderService, paymentService, spaceService } from '@/services/space.service';
import { cn } from '@/lib/utils';

export default function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();

  const [spaceId, setSpaceId] = React.useState<string>(cart.spaceId ?? '');
  const [notes, setNotes] = React.useState('');
  const [deposit, setDeposit] = React.useState(false);
  const [quote, setQuote] = React.useState<PriceBreakdown | null>(null);
  /*
    A quote that failed is not a quote of zero.

    Tracked separately because the total shown to the customer must never be
    computed locally on this screen: `cart.pricing` is priced WITHOUT
    `includeSecurityDeposit`, which only exists in the server payload. Falling
    back to it silently removed the deposit from the displayed total while the
    server still charged it.
  */
  const [quoteFailed, setQuoteFailed] = React.useState(false);
  /** Bumped by "Try again" so the quote effect re-runs on an unchanged basket. */
  const [quoteAttempt, setQuoteAttempt] = React.useState(0);
  const [quoting, setQuoting] = React.useState(false);

  const { data: spaces, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.spaces,
    queryFn: () => spaceService.list(),
  });

  React.useEffect(() => {
    /*
      Point at a space this account actually owns.

      This only filled an EMPTY selection, so a spaceId left in localStorage
      that is no longer valid - a different database, a space that was removed,
      an account switch - was kept and sent to the server forever. The quote
      then 404s, `quote` stays null, and "Place order" is disabled with the
      panel stuck on "Confirming prices…": a dead button and no explanation.

      Checking membership rather than emptiness fixes the stale case too.
    */
    if (!spaces?.length) return;
    if (!spaceId || !spaces.some((space) => space.id === spaceId)) {
      setSpaceId(spaces[0]!.id);
      cart.setSpaceId(spaces[0]!.id);
    }
  }, [spaces, spaceId]);

  const payload = React.useMemo(
    () => ({
      spaceId,
      items: cart.lines.map((line) => ({
        artworkId: line.artworkId,
        quantity: line.quantity,
        frame: line.frame as unknown as Record<string, string>,
      })),
      couponCode: cart.couponCode,
      includeSecurityDeposit: deposit,
      notes: notes || null,
    }),
    [spaceId, cart.lines, cart.couponCode, deposit, notes],
  );

  // The server prices the order; the local total is only a placeholder while
  // that round trip is in flight.
  React.useEffect(() => {
    if (!spaceId || cart.lines.length === 0) return;

    let cancelled = false;
    setQuoting(true);
    setQuoteFailed(false);
    const timer = setTimeout(() => {
      orderService
        .quote(payload)
        .then((result) => {
          if (!cancelled) setQuote(result);
        })
        .catch(() => {
          // Drop the stale quote AND record the failure. The order cannot be
          // placed without a price the server has confirmed for this exact
          // basket, so both matter.
          if (!cancelled) {
            setQuote(null);
            setQuoteFailed(true);
          }
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payload, spaceId, cart.lines.length, quoteAttempt]);

  const place = useMutation({
    mutationFn: async () => {
      const order = await orderService.create(payload);
      const payment = await paymentService.create(order.id);
      return { order, payment };
    },
    onSuccess: ({ payment }) => {
      cart.clear();
      navigate(`/space/payment/${payment.id}`, { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (cart.lines.length === 0) {
    return (
      <div>
        <PanelHeader title="Checkout" />
        <EmptyState
          icon={<Frame />}
          title="There's nothing to check out."
          action={
            <Button asChild>
              <Link to="/space/collections">Browse art</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!isLoading && (!spaces || spaces.length === 0)) {
    return (
      <div>
        <PanelHeader title="Checkout" />
        <EmptyState
          icon={<Building2 />}
          title="Where is this going?"
          description="Add the address once and every future order skips this step. Your cart is saved."
          action={
            <Button asChild>
              <Link to="/space/register-space?next=/space/checkout">Add your space</Link>
            </Button>
          }
        />
      </div>
    );
  }

  /*
    The local basket total is a placeholder for the first render only, before any
    quote has come back. Once one has failed, showing it again would show a
    number the server does not agree with.
  */
  const pricing = quote ?? cart.pricing;
  const priceConfirmed = quote !== null;
  const selected = spaces?.find((space) => space.id === spaceId);
  // With one space there is nothing to choose. Say where it's going and move on.
  const oneSpace = (spaces?.length ?? 0) === 1;

  return (
    <div>
      <PanelHeader title="Checkout" description="One last look before payment." />

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,20rem)]">
        <div className="space-y-10">
          <Block
            label="Delivering to"
            aside={
              oneSpace ? (
                <Link
                  to="/space/register-space"
                  className="text-xs text-bronze underline-offset-4 hover:underline"
                >
                  Change
                </Link>
              ) : undefined
            }
          >
            {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : oneSpace && selected ? (
              <div>
                <p className="text-sm font-medium text-ink">{selected.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {[selected.addressLine1, selected.addressLine2, selected.city]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            ) : (
              <RadioGroup
                value={spaceId}
                onValueChange={(value) => {
                  setSpaceId(value);
                  cart.setSpaceId(value);
                }}
                className="space-y-0"
              >
                {spaces?.map((space) => (
                  <label
                    key={space.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 border-b border-line-soft py-4 transition-colors first:pt-0',
                      spaceId === space.id ? 'text-ink' : 'text-muted hover:text-ink',
                    )}
                  >
                    <RadioGroupItem value={space.id} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{space.name}</p>
                      <p className="text-xs capitalize text-muted">
                        {space.type.replace('_', ' ')} · {space.city}
                      </p>
                      {space.addressLine1 && (
                        <p className="mt-1 text-xs text-subtle">
                          {space.addressLine1}
                          {space.addressLine2 ? `, ${space.addressLine2}` : ''}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            )}
          </Block>

          <Block
            label="Your collection"
            hint={`${cart.count} ${cart.count === 1 ? 'frame' : 'frames'}`}
            aside={
              <Link
                to="/space/cart"
                className="text-xs text-bronze underline-offset-4 hover:underline"
              >
                Edit
              </Link>
            }
          >
            <ul className="divide-y divide-line-soft">
              {cart.lines.map((line) => (
                <li key={line.key} className="flex items-center gap-3 py-3 first:pt-0">
                  <Photo
                    src={line.snapshot.imageUrl}
                    alt={line.snapshot.title}
                    className="size-14 shrink-0 rounded-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{line.snapshot.title}</p>
                    <p className="truncate text-xs text-subtle">{describeFrame(line.frame)}</p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-muted">× {line.quantity}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block label="Notes for the install team" hint="Optional">
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Access instructions, preferred install days, wall constraints…"
              aria-label="Order notes"
            />

            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={deposit}
                onCheckedChange={(value) => setDeposit(value === true)}
                className="mt-0.5"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <ShieldCheck className="size-4 text-bronze" aria-hidden />
                  Add a refundable security deposit
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {formatCurrency(PRICING.SECURITY_DEPOSIT_PER_FRAME)} per frame, returned in full
                  when the arrangement ends, less any damage. Not taxable.
                </span>
              </span>
            </label>
          </Block>
        </div>

        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="border-t-2 border-ink pt-5">
            <h2 className="eyebrow eyebrow-muted">Order total</h2>

            {/*
              The same three rows the cart shows, and for the same reasons.

              This was the eight-row internal cost breakdown - licensing, frames,
              printing, subtotal, delivery, installation, GST - which the cart
              stopped showing. Leaving it here meant the price a café owner
              approved in the cart was itemised completely differently one click
              later, including a "GST @ 18%" line reading zero and an
              "Installation" line reading zero. Both are zero because neither is
              charged; a row that exists only to say "nothing" invites the
              question it was meant to answer.

              GST comes back on its own when PRICING.GST_REGISTERED flips - the
              row below is conditional, not deleted.
            */}
            <div className={cn('mt-4 transition-opacity', quoting && 'opacity-60')}>
              <DataRow label="Printing and framing" value={formatCurrency(pricing.subtotal)} />
              {pricing.discount > 0 && (
                <DataRow
                  label={`Discount${pricing.couponCode ? ` (${pricing.couponCode})` : ''}`}
                  value={`- ${formatCurrency(pricing.discount)}`}
                />
              )}
              <DataRow label="Delivery" value="Included" />
              {PRICING.GST_REGISTERED && (
                <DataRow label={`GST @ ${PRICING.GST_RATE * 100}%`} value={formatCurrency(pricing.gst)} />
              )}
              {pricing.securityDeposit > 0 && (
                <DataRow label="Security deposit" value={formatCurrency(pricing.securityDeposit)} />
              )}
              <DataRow label="Total" value={formatCurrency(pricing.total)} emphasis />
            </div>

            {/*
              Three states, not two. "Confirming prices…" was shown for a failed
              quote as well as an in-flight one, so a customer whose quote had
              died sat looking at a reassuring message next to a total the server
              would not honour.
            */}
            {quoteFailed ? (
              <div className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5">
                <p className="text-xs leading-relaxed text-ink-soft">
                  We couldn&rsquo;t confirm the price for this order. Nothing has been charged.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setQuoteAttempt((n) => n + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-subtle">
                {priceConfirmed
                  ? 'Prices confirmed by ARTINU.'
                  : quoteFailed
                    ? 'We could not confirm the price for this basket. Check the space above, then try again.'
                    : 'Confirming prices…'}
              </p>
            )}

            <Button
              className="mt-5 w-full"
              loading={place.isPending}
              /*
                An order cannot be placed against a price the server has not
                confirmed for this exact basket. Previously only the space and
                the minimum were checked, so "Place order" stayed live while the
                panel displayed a locally-computed total that omitted the
                security deposit — and the customer was charged the difference.
              */
              disabled={!spaceId || !cart.meetsMinimum || !priceConfirmed || quoting}
              onClick={() => place.mutate()}
            >
              Place order
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
