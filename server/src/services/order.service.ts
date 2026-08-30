import {
  calculatePricing,
  tariffBookFor,
  priceLine,
  type Artwork,
  type CartItem,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PriceBreakdown,
  type Space,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { validateCoupon } from '@/services/coupon.service';
import { badRequest, forbidden, notFound } from '@/utils/errors';
import { now, orderReference } from '@/utils/ids';

/**
 * Order pricing is recomputed here from the artwork and frame catalogue every
 * time. Nothing monetary is ever read from the request body — a client can ask
 * for a configuration, but not for a price.
 */

export interface OrderDraft {
  spaceId: string;
  items: CartItem[];
  couponCode?: string | null;
  includeSecurityDeposit?: boolean;
  notes?: string | null;
}

export async function loadOrderableArtworks(items: CartItem[]): Promise<Map<string, Artwork>> {
  const artworks = new Map<string, Artwork>();

  for (const item of items) {
    if (artworks.has(item.artworkId)) continue;

    const artwork = await db.artworks.byId(item.artworkId);
    if (!artwork) throw badRequest('One of the photographs in your order is no longer available.');
    if (artwork.status !== 'approved') {
      throw badRequest(`“${artwork.title}” is not available for order right now.`);
    }
    artworks.set(artwork.id, artwork);
  }

  return artworks;
}

export async function buildOrderItems(items: CartItem[]): Promise<OrderItem[]> {
  const artworks = await loadOrderableArtworks(items);
  const profiles = await db.profiles.find();
  const nameByUser = new Map(
    profiles.map((profile) => [profile.userId, profile.displayName || profile.fullName]),
  );

  return items.map((item) => {
    const artwork = artworks.get(item.artworkId)!;
    const priced = priceLine(item.frame, item.quantity);

    return {
      id: `${artwork.id}-${item.frame.size}-${item.frame.material}-${item.frame.color}`,
      artworkId: artwork.id,
      quantity: item.quantity,
      frame: item.frame,
      artworkTitle: artwork.title,
      artworkImageUrl: artwork.thumbnailUrl,
      artistId: artwork.artistId,
      artistName: nameByUser.get(artwork.artistId) ?? 'ARTINU artist',
      unitPrice: priced.unitPrice,
      framePrice: priced.framePrice,
      printPrice: priced.printPrice,
      licensePrice: priced.licensePrice,
      lineTotal: priced.lineTotal,
      artistCommission: priced.artistCommission,
    };
  });
}

/**
 * Price a draft order.
 *
 * `spaceType` decides which tariff book applies - a home is billed from the
 * cheaper home-decor table, everything else from the standard one. It is
 * passed in rather than looked up here so this stays synchronous and the cart
 * preview and the server total keep coming from the same function.
 */
export async function priceDraft(
  items: OrderItem[],
  draft: OrderDraft,
  spaceType?: string | null,
): Promise<PriceBreakdown> {
  const base = items.map((item) => ({ frame: item.frame, quantity: item.quantity }));
  const options = {
    includeSecurityDeposit: draft.includeSecurityDeposit ?? false,
    book: tariffBookFor(spaceType),
  };

  if (!draft.couponCode?.trim()) return calculatePricing(base, options);

  /*
    The coupon is validated against THIS basket, not just looked up.

    It has to be priced once without the discount first, because half the rules
    that can refuse a code - a minimum order value, a percentage cap - are
    judged against the subtotal. Resolving it any earlier would be guessing at
    a number that does not exist yet.

    An invalid code is silently ignored rather than throwing: the customer sees
    the undiscounted total, which is the correct price, and the cart tells them
    separately why the code did not take. Failing the whole quote would leave
    them unable to check out at all because of a typo.
  */
  const undiscounted = calculatePricing(base, options);
  const verdict = await validateCoupon(draft.couponCode, undiscounted.subtotal, spaceType);
  if (!verdict.ok || !verdict.coupon) return calculatePricing(base, options);

  return calculatePricing(base, {
    ...options,
    couponCode: verdict.coupon.code,
    ...(verdict.coupon.type === 'flat'
      ? { discountAmount: verdict.discount ?? 0 }
      : { discountPercent: verdict.coupon.value }),
    // A percentage coupon with a cap cannot be expressed as a percentage, so
    // the already-capped rupee figure is passed instead.
    ...(verdict.coupon.type === 'percent' && verdict.coupon.maxDiscount != null
      ? { discountPercent: 0, discountAmount: verdict.discount ?? 0 }
      : {}),
  });
}

export async function assertOwnsSpace(spaceId: string, user: StoredUser): Promise<Space> {
  const space = await db.spaces.byId(spaceId);
  if (!space) throw notFound('That space');
  if (space.ownerId !== user.id) throw forbidden('That space belongs to another account.');
  return space;
}

/**
 * Place an order on a space, attributed to whoever owns that space.
 *
 * `createOrder` below is the space owner placing their own order and is the
 * only path a browser session can take. This one exists for the case the
 * founder described: a cafe owner who will never log in and says "you do it".
 * Staff build the order in the console and it belongs to the owner's account,
 * so from that moment it behaves like any other order - it appears on their
 * dashboard, it invoices to them, and it rotates on their schedule.
 *
 * The caller is responsible for deciding whether the actor is allowed to do
 * this. There is deliberately no session check inside here, which is exactly
 * why it is not exported to any route that a customer can reach.
 */
export async function createOrderForSpace(draft: OrderDraft, space: Space): Promise<Order> {
  const items = await buildOrderItems(draft.items);
  const pricing = await priceDraft(items, draft, space.type);

  /*
    ── An order reference must be unique, and count()+1 is not ───────────────

    This read the row count and added one. Two problems, and both are live:

    1. It is read-then-write with nothing in between, so two orders placed in
       the same moment take the same number.

    2. Worse, and what actually broke checkout: the count goes DOWN when an
       order is deleted. Remove three test orders and the next three real
       customers are handed references that already exist. Postgres rejects
       them on `orders_reference_key` and the customer sees "duplicate key
       value violates unique constraint" after pressing Place order.

    Counting rows was never a sequence. This takes the highest reference
    actually issued and goes past it, so deleting rows cannot walk the number
    backwards, and it retries on collision to close the concurrent case.
  */
  const existing = await db.orders.find({});
  let sequence = existing.reduce((highest, order) => {
    const digits = /(\d+)$/.exec(order.reference ?? '');
    const value = digits ? Number(digits[1]) : 0;
    return value > highest ? value : highest;
  }, 1000);

  let reference = orderReference(sequence + 1);
  const taken = new Set(existing.map((order) => order.reference));
  for (let attempt = 0; attempt < 1000 && taken.has(reference); attempt += 1) {
    sequence += 1;
    reference = orderReference(sequence + 1);
  }

  const placedAt = now();

  return db.orders.insert({
    reference,
    spaceId: space.id,
    // The SPACE's owner, never the actor. A staff member creating this on
    // someone's behalf must not end up owning their order.
    ownerId: space.ownerId,
    items,
    pricing,
    status: 'pending_payment',
    timeline: [
      { status: 'pending_payment', at: placedAt, note: 'Order created, awaiting payment.', by: null },
    ],
    paymentId: null,
    invoiceId: null,
    installationId: null,
    notes: draft.notes ?? null,
    placedAt,
    updatedAt: placedAt,
    completedAt: null,
  });
}

/** The space owner placing their own order. */
export async function createOrder(draft: OrderDraft, user: StoredUser): Promise<Order> {
  const space = await assertOwnsSpace(draft.spaceId, user);
  return createOrderForSpace(draft, space);
}

/** Order progression. Anything can be cancelled; nothing else moves backwards. */
const SEQUENCE: OrderStatus[] = [
  'pending_payment',
  'confirmed',
  'printing',
  'framing',
  'dispatched',
  'out_for_delivery',
  'installation_scheduled',
  'completed',
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === 'cancelled') return from !== 'completed';
  if (from === 'payment_failed') return to === 'confirmed' || to === 'pending_payment';
  if (to === 'payment_failed') return from === 'pending_payment';

  const fromIndex = SEQUENCE.indexOf(from);
  const toIndex = SEQUENCE.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  return toIndex > fromIndex;
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return [...SEQUENCE, 'cancelled' as OrderStatus].filter((status) => canTransition(from, status));
}

export async function advanceOrder(
  order: Order,
  status: OrderStatus,
  options: { note?: string | null; by?: string | null } = {},
): Promise<Order> {
  const at = now();

  return db.orders.update(order.id, {
    status,
    timeline: [...order.timeline, { status, at, note: options.note ?? null, by: options.by ?? null }],
    updatedAt: at,
    completedAt: status === 'completed' ? at : order.completedAt,
  });
}
