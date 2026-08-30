import {
  formatCurrency,
  formatDate,
  ORDER_STATUS_LABELS,
  type Order,
  type SpaceOwnerAnalytics,
} from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Building2, Frame } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CircleArrow,
  Figure,
  FigureRow,
  SectionHead,
  Status,
  Timeline,
  TimelineItem,
  ViewAll,
  type StatusTone,
} from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { useAuth } from '@/contexts/AuthContext';
import { IMAGES } from '@/lib/images';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { analyticsService, spaceService } from '@/services/space.service';

/**
 * Status is a tint on the words, not a filled pill — see {@link Status}. The map
 * lives here because the order list, the tracking page and this screen all have
 * to agree on what colour "Installation Scheduled" is.
 */
export const ORDER_TONE: Record<string, StatusTone> = {
  pending_payment: 'warning',
  payment_failed: 'danger',
  confirmed: 'info',
  printing: 'info',
  framing: 'info',
  dispatched: 'info',
  out_for_delivery: 'bronze',
  installation_scheduled: 'bronze',
  completed: 'success',
  cancelled: 'neutral',
};

/** Same map, under the name the pages that still render a badge import. */
export const ORDER_BADGE: Record<
  string,
  'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'bronze'
> = ORDER_TONE;

export default function SpaceDashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.fullName?.split(' ')[0] ?? 'there';

  const {
    data: spaces,
    isLoading: loadingSpaces,
    // `isError` was never taken off this query, which is what made a failed
    // request indistinguishable from a brand-new account. See below.
    isError: spacesFailed,
    error: spacesError,
    refetch: refetchSpaces,
  } = useQuery({
    queryKey: qk.spaces,
    queryFn: () => spaceService.list(),
  });

  const { data: analytics, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.analytics('space'),
    queryFn: () => analyticsService.me<SpaceOwnerAnalytics>(),
  });

  const primarySpace = spaces?.[0];

  const { data: recommendations = [], isPending: loadingPicks } = useQuery({
    queryKey: ['recommendations', primarySpace?.id],
    queryFn: () => spaceService.recommendations(primarySpace!.id, 8),
    enabled: Boolean(primarySpace),
  });

  if (loadingSpaces) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  /*
    A failed request is not an empty account.

    `isError` was not read, so when /spaces failed — which on a sleeping free
    dyno meant every request after an idle period — `spaces` was undefined and
    the check below fired. An owner whose café has been on the wall for months
    was shown "Welcome to ARTINU / Hello, Kiran" with their orders, rotation and
    spend gone, and the only button on screen was "Add your space", which would
    have created a SECOND space for a room they had already registered.

    Checked before the empty case, so the welcome screen is only ever reached
    when the request genuinely succeeded and genuinely returned nothing.
  */
  if (spacesFailed) {
    return <ErrorState error={spacesError} onRetry={() => void refetchSpaces()} />;
  }

  /*
    A brand-new account.

    This was one column: a greeting, three lines and a button, on an otherwise
    empty screen - which is what the founder was looking at when he said the
    page was "entirely blank". Registering a space is still the one thing that
    matters, so it keeps the whole left side and the only filled button.

    What it now also does is show the product. A space owner who has just signed
    up has no orders, no rotation and no collection, so every number on this
    screen would be zero; real photographs from the live gallery are the one
    thing that is genuinely there on day one, and they answer the question the
    owner actually has, which is what they are going to get.
  */
  if (!spaces || spaces.length === 0) {
    return <SpaceWelcome firstName={firstName} />;
  }

  const name = primarySpace?.name ?? '';
  const city = primarySpace?.city ?? '';
  const spaceLabel =
    city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name} - ${city}` : name;

  return (
    <div>
      {/* ── Opening ──────────────────────────────────────────────────────── */}
      <section className="bleed-top grid lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="relative hidden lg:block">
          <Photo
            src={primarySpace?.imageUrls?.[0] || IMAGES.street}
            alt={primarySpace?.name ?? 'Your space'}
            priority
            className="h-full min-h-[22rem]"
          />
          <figure className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-5 pt-14">
            <blockquote className="border-l border-canvas/40 pl-3 font-display text-sm italic leading-snug text-canvas">
              Every wall tells a story.
            </blockquote>
            <figcaption className="mt-1.5 pl-3 text-xs text-canvas/60">
              Curated with intention.
            </figcaption>
          </figure>
        </div>

        <div className="px-5 pb-10 pt-16 sm:px-8 lg:pb-14 lg:pl-12 lg:pr-12 lg:pt-16">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <p className="eyebrow">{formatDate(new Date(), 'long')}</p>
              <h1 className="mt-5 font-display text-[2.5rem] leading-none text-ink lg:text-[3rem]">
                Hello, {firstName}.
              </h1>
              <p className="mt-4 text-sm text-muted">
                Here&rsquo;s what&rsquo;s happening at{' '}
                <Link
                  to="/space/register-space"
                  className="text-bronze underline-offset-4 hover:underline"
                >
                  {spaceLabel}
                </Link>
                .
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm text-ink">Discover art</span>
              <CircleArrow to="/space/collections" label="Browse art for your space" />
            </div>
          </div>

          <div className="mt-11">
            {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
              <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-24" />
                ))}
              </div>
            ) : (
              <FigureRow className="lg:gap-x-14">
                <Figure
                  value={String(analytics?.activeInstallations ?? 0).padStart(2, '0')}
                  label="Active installations"
                  hint="Collections up or scheduled"
                  to="/space/orders"
                />
                <Figure
                  value={String(analytics?.currentCollectionSize ?? 0).padStart(2, '0')}
                  label="Current collection"
                  hint="Frames on your walls"
                  to="/space/rotation"
                />
                <Figure
                  value={analytics?.nextRotationAt ? formatDate(analytics.nextRotationAt) : 'Not set'}
                  label="Next rotation"
                  hint={
                    analytics?.daysToRotation == null
                      ? 'Scheduled after your first install'
                      : analytics.daysToRotation >= 0
                        ? `in ${analytics.daysToRotation} days`
                        : `${Math.abs(analytics.daysToRotation)} days overdue`
                  }
                  to="/space/rotation"
                />
                <Figure
                  value={formatCurrency(analytics?.totalSpend ?? 0, { compact: true })}
                  label="Total invested"
                  hint={`${analytics?.orderCount ?? 0} orders placed`}
                  to="/space/invoices"
                />
              </FigureRow>
            )}
          </div>
        </div>
      </section>

      {/* ── Curated for you, and what's moving ───────────────────────────── */}
      <div className="grid gap-x-14 gap-y-12 border-t border-line pt-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:pt-12">
        <section className="min-w-0">
          <SectionHead
            title={<span className="italic">Curated for {primarySpace?.name}</span>}
            description="Refined by your space type, interior theme, wall colour and light."
            aside={<CircleArrow to="/space/collections" label="Browse the full collection" />}
          />

          <div className="mt-7">
            {loadingPicks ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="aspect-[3/4]" />
                ))}
              </div>
            ) : recommendations.length === 0 ? (
              <p className="text-sm text-subtle">
                We&rsquo;ll have picks for you once your space profile is complete.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {recommendations.slice(0, 5).map((artwork) => (
                  <Link key={artwork.id} to={`/gallery/${artwork.id}`} className="group">
                    <Photo
                      src={artwork.thumbnailUrl || artwork.imageUrl}
                      alt={artwork.title}
                      ratio="aspect-[3/4]"
                      className="photo-edge"
                      imgClassName="transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
                    />
                    <p className="mt-2.5 truncate text-xs text-ink-soft">{artwork.title}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 lg:border-l lg:border-line lg:pl-14">
          <SectionHead title="Recent activity" aside={<ViewAll to="/space/orders" />} />

          <div className="mt-7">
            {analytics?.recentOrders?.length ? (
              <Timeline>
                {analytics.recentOrders.slice(0, 4).map((order: Order, index, all) => (
                  <TimelineItem
                    key={order.id}
                    current={index === 0}
                    done
                    last={index === all.length - 1}
                  >
                    <Link
                      to={`/space/orders/${order.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 transition-opacity hover:opacity-70"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-ink">{order.reference}</p>
                        <p className="mt-0.5 text-xs text-subtle">{formatDate(order.placedAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-baseline gap-4">
                        <Status tone={ORDER_TONE[order.status] ?? 'neutral'}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Status>
                        <span className="text-sm tabular-nums text-ink">
                          {formatCurrency(order.pricing.total)}
                        </span>
                      </div>
                    </Link>
                  </TimelineItem>
                ))}
              </Timeline>
            ) : (
              <EmptyState
                icon={<Frame />}
                title="No orders yet"
                description="Your first collection starts in the gallery."
                action={
                  <Button size="sm" asChild>
                    <Link to="/space/collections">Browse art</Link>
                  </Button>
                }
              />
            )}
          </div>
        </section>
      </div>

      {/* ── More than one room ───────────────────────────────────────────── */}
      {spaces.length > 1 && (
        <section className="mt-12 border-t border-line pt-10 lg:pt-12">
          <SectionHead
            title="Your spaces"
            aside={<ViewAll to="/space/register-space">Manage</ViewAll>}
          />
          <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {spaces.map((space) => (
              <div key={space.id}>
                <Photo
                  src={space.imageUrls[0] ?? ''}
                  alt={space.name}
                  ratio="aspect-[4/3]"
                  tone="bg-sand"
                  className="photo-edge"
                />
                <p className="mt-3 font-display text-base text-ink">{space.name}</p>
                <p className="text-xs text-subtle">
                  {space.city} · every {space.rotationIntervalMonths}{' '}
                  {space.rotationIntervalMonths === 1 ? 'month' : 'months'}
                </p>
                {/* The ID ARTINU issued (requirements §1). Shown because it is
                    what support asks for, and the owner has nowhere else to
                    look it up once the registration screen is gone. */}
                {space.code && (
                  <p className="mt-1 font-label text-[0.625rem] uppercase tracking-[0.12em] text-bronze">
                    {space.code}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The first screen a space owner sees, before they have registered a room.
 *
 * The photographs are the newest approved uploads, straight from the public
 * gallery - real work by real members, not a placeholder grid. If that request
 * fails or the gallery is empty, the strip is dropped and the page is exactly
 * what it was before: a greeting and one clear next step. Nothing here invents
 * content to fill space.
 */
function SpaceWelcome({ firstName }: { firstName: string }) {
  const { data: latest } = useQuery({
    queryKey: qk.gallery({ sort: 'latest', pageSize: 6 }),
    queryFn: () => catalogService.gallery({ sort: 'latest', pageSize: 6 }),
    staleTime: 5 * 60 * 1000,
  });

  const photographs = latest?.items ?? [];

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div className="max-w-xl">
        <p className="eyebrow">Welcome to ARTINU</p>
        <h1 className="mt-5 font-display text-[2.75rem] leading-[1.05] text-ink">
          Hello, {firstName}.
        </h1>
        <span className="rule mt-7" />
        <p className="mt-7 text-sm leading-relaxed text-muted">
          Tell us about the room - its type, its light, the colour of the walls - and we&rsquo;ll
          curate a collection that belongs in it. It takes about two minutes.
        </p>
        <Button asChild shape="pill" size="lg" className="mt-9">
          <Link to="/space/register-space">
            <Building2 />
            Add your space
          </Link>
        </Button>

        <div className="mt-10 border-t border-line pt-6">
          <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
            Or have a look around first
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                to="/space/collections"
                className="text-ink underline-offset-4 transition-opacity hover:opacity-70 hover:underline"
              >
                Browse the collection
              </Link>
              <span className="ml-2 text-muted">- everything we can print and frame</span>
            </li>
            <li>
              <Link
                to="/artists"
                className="text-ink underline-offset-4 transition-opacity hover:opacity-70 hover:underline"
              >
                Meet the photographers
              </Link>
              <span className="ml-2 text-muted">- whose work hangs in these spaces</span>
            </li>
            <li>
              <Link
                to="/space/wishlist"
                className="text-ink underline-offset-4 transition-opacity hover:opacity-70 hover:underline"
              >
                Start a wishlist
              </Link>
              <span className="ml-2 text-muted">- save anything you like as you go</span>
            </li>
          </ul>
        </div>
      </div>

      {photographs.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
              Just uploaded
            </p>
            <Link
              to="/space/collections"
              className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              See all
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {photographs.slice(0, 6).map((artwork, index) => (
              <Link key={artwork.id} to="/space/collections" className="group block">
                <Photo
                  src={artwork.thumbnailUrl || artwork.imageUrl}
                  alt={artwork.title}
                  ratio="aspect-[3/4]"
                  thumbnail
                  priority={index < 3}
                  className="rounded-sm"
                  imgClassName="transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
                />
                {/* The photographer's name, in the markup rather than on hover. */}
                <p className="mt-1.5 truncate text-[0.6875rem] text-subtle">
                  {artwork.artist?.name ?? 'ARTINU artist'}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
