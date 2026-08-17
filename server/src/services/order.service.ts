import {
  calculatePricing,
  priceLine,
  resolveCoupon,
  type Artwork,
  type CartItem,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PriceBreakdown,
  type Space,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
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

export function priceDraft(items: OrderItem[], draft: OrderDraft): PriceBreakdown {
  const coupon = resolveCoupon(draft.couponCode);
  return calculatePricing(
    items.map((item) => ({ frame: item.frame, quantity: item.quantity })),
    {
      discountPercent: coupon?.percent ?? 0,
      couponCode: coupon ? draft.couponCode!.trim().toUpperCase() : null,
      includeSecurityDeposit: draft.includeSecurityDeposit ?? false,
    },
  );
}

export async function assertOwnsSpace(spaceId: string, user: StoredUser): Promise<Space> {
  const space = await db.spaces.byId(spaceId);
  if (!space) throw notFound('That space');
  if (space.ownerId !== user.id) throw forbidden('That space belongs to another account.');
  return space;
}

export async function createOrder(draft: OrderDraft, user: StoredUser): Promise<Order> {
  const space = await assertOwnsSpace(draft.spaceId, user);
  const items = await buildOrderItems(draft.items);
  const pricing = priceDraft(items, draft);

  const sequence = (await db.orders.count()) + 1;
  const placedAt = now();

  return db.orders.insert({
    reference: orderReference(1000 + sequence),
    spaceId: space.id,
    ownerId: user.id,
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
