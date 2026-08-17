import {
  PRICING,
  type ArtistAnalytics,
  type ConsoleAnalytics,
  type Order,
  type SpaceOwnerAnalytics,
  type TrendPoint,
} from '@artinu/shared';
import { db } from '@/database/db';
import { recentAudit } from '@/services/audit.service';

/**
 * Every figure here is derived from the tables — nothing is a constant and
 * nothing is invented. Revenue counts only orders whose payment actually
 * succeeded, so the CEO dashboard and the accounts ledger can never disagree.
 */

const REVENUE_STATUSES = new Set([
  'confirmed',
  'printing',
  'framing',
  'dispatched',
  'out_for_delivery',
  'installation_scheduled',
  'completed',
]);

const isRevenue = (order: Order) => REVENUE_STATUSES.has(order.status);

const monthKey = (iso: string) => iso.slice(0, 7);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The last N calendar months, oldest first, with zero-filled gaps. */
function monthBuckets(months = 12): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  const cursor = new Date();
  cursor.setDate(1);

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(cursor);
    date.setMonth(cursor.getMonth() - index);
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH_LABELS[date.getMonth()]!,
    });
  }
  return buckets;
}

function trend(orders: Order[], months: number, value: (order: Order) => number): TrendPoint[] {
  const totals = new Map<string, number>();
  for (const order of orders) {
    const key = monthKey(order.placedAt);
    totals.set(key, (totals.get(key) ?? 0) + value(order));
  }
  return monthBuckets(months).map((bucket) => ({
    label: bucket.label,
    value: Math.round(totals.get(bucket.key) ?? 0),
  }));
}

const safeDivide = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

// ── Console ──────────────────────────────────────────────────────────────────

export async function consoleAnalytics(): Promise<ConsoleAnalytics> {
  const [orders, spaces, artworks, installations, users, consultations, profiles, payouts] =
    await Promise.all([
      db.orders.find(),
      db.spaces.find(),
      db.artworks.find(),
      db.installations.find(),
      db.users.find(),
      db.consultations.find(),
      db.profiles.find(),
      db.payouts.find(),
    ]);

  const paidOrders = orders.filter(isRevenue);
  const revenue = paidOrders.reduce((sum, order) => sum + order.pricing.total, 0);

  const thisMonth = monthKey(new Date().toISOString());
  const revenueThisMonth = paidOrders
    .filter((order) => monthKey(order.placedAt) === thisMonth)
    .reduce((sum, order) => sum + order.pricing.total, 0);

  const nameByUser = new Map(
    profiles.map((profile) => [profile.userId, profile.displayName || profile.fullName]),
  );
  const spaceById = new Map(spaces.map((space) => [space.id, space]));

  // Top spaces by the revenue they have actually generated.
  const spaceTotals = new Map<string, { orders: number; revenue: number }>();
  for (const order of paidOrders) {
    const entry = spaceTotals.get(order.spaceId) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += order.pricing.total;
    spaceTotals.set(order.spaceId, entry);
  }

  const topSpaces = [...spaceTotals.entries()]
    .map(([id, totals]) => ({ id, name: spaceById.get(id)?.name ?? 'Unknown space', ...totals }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // Top artists by what they have earned, straight from the order items.
  const artistTotals = new Map<string, { selections: number; earnings: number }>();
  for (const order of paidOrders) {
    for (const item of order.items) {
      const entry = artistTotals.get(item.artistId) ?? { selections: 0, earnings: 0 };
      entry.selections += item.quantity;
      entry.earnings += item.artistCommission;
      artistTotals.set(item.artistId, entry);
    }
  }

  const topArtists = [...artistTotals.entries()]
    .map(([id, totals]) => ({ id, name: nameByUser.get(id) ?? 'ARTINU artist', ...totals }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 6);

  const popularArtworks = [...artworks]
    .filter((artwork) => artwork.status === 'approved')
    .sort((a, b) => b.selections - a.selections || b.views - a.views)
    .slice(0, 6)
    .map((artwork) => ({
      id: artwork.id,
      title: artwork.title,
      selections: artwork.selections,
      views: artwork.views,
    }));

  const artists = users.filter((user) => user.role === 'artist');
  const owners = users.filter((user) => user.role === 'space_owner');
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  // Repeat customers: owners with more than one paid order.
  const ordersByOwner = new Map<string, number>();
  for (const order of paidOrders) {
    ordersByOwner.set(order.ownerId, (ordersByOwner.get(order.ownerId) ?? 0) + 1);
  }
  const repeatCustomers = [...ordersByOwner.values()].filter((count) => count > 1).length;

  return {
    revenue: Math.round(revenue),
    revenueThisMonth: Math.round(revenueThisMonth),
    orders: orders.length,
    pendingOrders: orders.filter((order) => order.status === 'pending_payment').length,
    installations: installations.length,
    artistGrowth: artists.filter((user) => user.createdAt >= ninetyDaysAgo).length,
    spaceGrowth: owners.filter((user) => user.createdAt >= ninetyDaysAgo).length,
    averageOrderValue: Math.round(safeDivide(revenue, paidOrders.length)),
    // Enquiries that turned into a paying space.
    conversionRate: Number(
      (safeDivide(ordersByOwner.size, consultations.length + owners.length) * 100).toFixed(1),
    ),
    repeatCustomerRate: Number((safeDivide(repeatCustomers, ordersByOwner.size) * 100).toFixed(1)),
    revenueTrend: trend(paidOrders, 12, (order) => order.pricing.total),
    ordersTrend: trend(orders, 12, () => 1),
    topSpaces,
    topArtists,
    popularArtworks,
    recentActivity: await recentAudit(12),
  };
}

// ── Space owner ──────────────────────────────────────────────────────────────

export async function spaceOwnerAnalytics(userId: string): Promise<SpaceOwnerAnalytics> {
  const spaces = await db.spaces.find({ where: { ownerId: userId } });
  const spaceIds = new Set(spaces.map((space) => space.id));

  const orders = (
    await db.orders.find({
      where: { ownerId: userId },
      orderBy: { field: 'placedAt', direction: 'desc' },
    })
  ).filter((order) => spaceIds.size === 0 || spaceIds.has(order.spaceId));

  const paidOrders = orders.filter(isRevenue);

  const installations = (await db.installations.find()).filter((entry) => spaceIds.has(entry.spaceId));
  const activeInstallations = installations.filter(
    (entry) => entry.status === 'completed' || entry.status === 'scheduled',
  ).length;

  // What is actually on the walls: frames from orders that reached completion.
  const currentCollectionSize = orders
    .filter((order) => order.status === 'completed' || order.status === 'installation_scheduled')
    .reduce((sum, order) => sum + order.pricing.quantity, 0);

  const cycles = (await db.rotations.find()).filter((cycle) => spaceIds.has(cycle.spaceId));
  const upcoming = cycles
    .filter((cycle) => cycle.status !== 'installed')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  const nextRotationAt = upcoming?.dueAt ?? null;
  const daysToRotation = nextRotationAt
    ? Math.ceil((new Date(nextRotationAt).getTime() - Date.now()) / 86400000)
    : null;

  return {
    activeInstallations,
    currentCollectionSize,
    nextRotationAt,
    daysToRotation,
    orderCount: orders.length,
    totalSpend: Math.round(paidOrders.reduce((sum, order) => sum + order.pricing.total, 0)),
    recentOrders: orders.slice(0, 5),
  };
}

// ── Artist ───────────────────────────────────────────────────────────────────

export async function artistAnalytics(artistId: string): Promise<ArtistAnalytics> {
  const artworks = await db.artworks.find({ where: { artistId } });
  const payouts = await db.payouts.find({ where: { artistId } });
  const orders = await db.orders.find();

  const theirOrders = orders.filter(
    (order) => isRevenue(order) && order.items.some((item) => item.artistId === artistId),
  );

  const spaceIds = new Set(theirOrders.map((order) => order.spaceId));
  const installations = (await db.installations.find()).filter(
    (entry) => spaceIds.has(entry.spaceId) && entry.status !== 'cancelled',
  );

  const totalEarnings = payouts
    .filter((payout) => payout.status === 'paid')
    .reduce((sum, payout) => sum + payout.amount, 0);
  const pendingEarnings = payouts
    .filter((payout) => payout.status !== 'paid')
    .reduce((sum, payout) => sum + payout.amount, 0);

  // Earnings by month, from the payouts themselves.
  const byMonth = new Map<string, number>();
  for (const payout of payouts) {
    const key = monthKey(payout.createdAt);
    byMonth.set(key, (byMonth.get(key) ?? 0) + payout.amount);
  }
  const monthlyEarnings = monthBuckets(12).map((bucket) => ({
    label: bucket.label,
    value: Math.round(byMonth.get(bucket.key) ?? 0),
  }));

  return {
    selectedWorks: artworks.reduce((sum, artwork) => sum + artwork.selections, 0),
    activeInstallations: installations.length,
    pendingReviews: artworks.filter((artwork) => artwork.status === 'pending_review').length,
    approvedWorks: artworks.filter((artwork) => artwork.status === 'approved').length,
    totalEarnings: Math.round(totalEarnings),
    pendingEarnings: Math.round(pendingEarnings),
    unreadNotifications: await db.notifications.count({ userId: artistId, read: false, archived: false }),
    monthlyEarnings,
  };
}

// ── Reports ──────────────────────────────────────────────────────────────────

export async function reportBundle() {
  const analytics = await consoleAnalytics();
  const orders = (await db.orders.find()).filter(isRevenue);

  const gstByMonth = new Map<string, number>();
  for (const order of orders) {
    const key = monthKey(order.placedAt);
    gstByMonth.set(key, (gstByMonth.get(key) ?? 0) + order.pricing.gst);
  }

  const gst = monthBuckets(12).map((bucket) => ({
    period: bucket.key,
    collected: Math.round(gstByMonth.get(bucket.key) ?? 0),
  }));

  return {
    revenueTrend: analytics.revenueTrend,
    ordersTrend: analytics.ordersTrend,
    topSpaces: analytics.topSpaces,
    topArtists: analytics.topArtists,
    popularArtworks: analytics.popularArtworks,
    gst,
    gstRate: PRICING.GST_RATE,
  };
}
