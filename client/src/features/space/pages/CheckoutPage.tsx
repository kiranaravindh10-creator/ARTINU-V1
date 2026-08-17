import { formatCurrency, PRICING, type PriceBreakdown } from '@artinu/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, ShieldCheck, ShoppingBag } from 'lucide-react';
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
import { describeFrame } from '@/features/space/pages/CartPage';
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
  const [quoting, setQuoting] = React.useState(false);

  const { data: spaces, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.spaces,
    queryFn: () => spaceService.list(),
  });

  React.useEffect(() => {
    if (!spaceId && spaces?.length) setSpaceId(spaces[0]!.id);
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
    const timer = setTimeout(() => {
      orderService
        .quote(payload)
        .then((result) => {
          if (!cancelled) setQuote(result);
        })
        .catch(() => {
          if (!cancelled) setQuote(null);
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payload, spaceId, cart.lines.length]);

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
          icon={<ShoppingBag />}
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

  const pricing = quote ?? cart.pricing;
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

            <div className={cn('mt-4 transition-opacity', quoting && 'opacity-60')}>
              <DataRow label="Artwork licensing" value={formatCurrency(pricing.artworkTotal)} />
              <DataRow label="Frames" value={formatCurrency(pricing.frameTotal)} />
              <DataRow label="Printing" value={formatCurrency(pricing.printingTotal)} />
              <DataRow label="Subtotal" value={formatCurrency(pricing.subtotal)} />
              {pricing.discount > 0 && (
                <DataRow
                  label={`Discount${pricing.couponCode ? ` (${pricing.couponCode})` : ''}`}
                  value={`− ${formatCurrency(pricing.discount)}`}
                />
              )}
              <DataRow
                label="Delivery"
                value={pricing.delivery === 0 ? 'Free' : formatCurrency(pricing.delivery)}
              />
              <DataRow label="Installation" value={formatCurrency(pricing.installation)} />
              <DataRow label={`GST @ ${PRICING.GST_RATE * 100}%`} value={formatCurrency(pricing.gst)} />
              {pricing.securityDeposit > 0 && (
                <DataRow label="Security deposit" value={formatCurrency(pricing.securityDeposit)} />
              )}
              <DataRow label="Total" value={formatCurrency(pricing.total)} emphasis />
            </div>

            <p className="mt-3 text-xs text-subtle">
              {quote ? 'Prices confirmed by ARTINU.' : 'Confirming prices…'}
            </p>

            <Button
              className="mt-5 w-full"
              loading={place.isPending}
              disabled={!spaceId || !cart.meetsMinimum}
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
