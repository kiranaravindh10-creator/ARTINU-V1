import {
  formatNumber,
  type ArtworkWithArtist,
  type Paginated,
  MIN_ORDER_QUANTITY,
} from '@artinu/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, ChevronRight, Filter, Heart, ImageOff, RotateCw, Search, Frame } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Container, Section } from '@/components/layout/primitives';
import { PageHeader } from '@/components/layout/DashboardShell';
import { GalleryCommunityHero } from '@/features/public/components/GalleryCommunityHero';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import {
  ArtworkCard,
  ArtworkCardSkeleton,
  ArtworkMasonry,
  useLightbox,
} from '@/features/public/components/ArtworkCard';
import { FrameConfigurator } from '@/features/public/components/FrameConfigurator';
import { Lightbox } from '@/features/public/components/Lightbox';
import { ShareSheet } from '@/features/public/components/ShareSheet';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { qk } from '@/lib/query';
import { readCached, writeCached } from '@/lib/persistedCache';
import { errorMessage } from '@/lib/api';
import { catalogService } from '@/services/catalog.service';
import { spaceService } from '@/services/space.service';
import { contentService } from '@/services/content.service';
import { cn } from '@/lib/utils';

/*
  The gallery's first screen, kept across reloads.

  The API runs on a free Render dyno that sleeps after fifteen minutes of
  quiet, and a cold start measured from here took 44 seconds. Until it answers
  this page has nothing to draw but skeletons, which is precisely the report
  that came back about it - "every single time this is getting loading up very
  slowly". The photographs were never the slow part; waking the dyno was.

  So the first page of the default view is stored under a versioned key and
  handed back as `initialData` on the next visit. The grid paints on the first
  frame from the previous visit, and React Query refetches in the background
  and swaps in whatever changed.

  Deliberately narrow:

    - Nothing is cached while a search term is set. A day-old answer to
      somebody's search is not a placeholder, it is a wrong answer.
    - The key carries the sort, so "newest" never paints from "popular".
    - The grid renders `showPrice={false}` at both of its call sites, which is
      what makes the catalogue safe to persist at all - see the note in
      persistedCache about never storing anything with a price in it.
*/
const GALLERY_FIRST_PAGE_CACHE = 'gallery.firstPage';

/**
 * The public view of a page of results - per-user state removed.
 *
 * `wishlisted` is set only for a signed-in space owner, so it is exactly the
 * kind of field persistedCache warns against keeping: localStorage outlives the
 * session, and a heart restored from it would be somebody's saved item drawn
 * from a stale copy. Stripping it means hearts are only ever rendered from a
 * live answer; the cached paint shows the photograph and nothing about who
 * saved it.
 */
function withoutUserState(page: Paginated<ArtworkWithArtist>): Paginated<ArtworkWithArtist> {
  return {
    ...page,
    items: page.items.map((item) => {
      const copy = { ...item };
      delete copy.wishlisted;
      return copy;
    }),
  };
}

/**
 * One gallery, mounted twice.
 *
 * There used to be two ways to browse the same photographs — this page and a
 * separate "Browse Collections" screen inside the space dashboard — each with
 * its own filters, its own sort control and its own idea of what a result looks
 * like. Same catalogue, two behaviours to learn. Now the dashboard mounts this
 * component with `variant="space"`, which swaps the editorial hero for the
 * dashboard header and adds the one thing a space owner needs that a visitor
 * does not: a way into the cart without leaving the grid. Photographs matched to
 * their space live on the dashboard itself, so they are not shown twice.
 */
export default function GalleryPage({ variant = 'public' }: { variant?: 'public' | 'space' }) {
  const isSpace = variant === 'space';
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const cart = useCart();

  const [configuring, setConfiguring] = React.useState<ArtworkWithArtist | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<'latest' | 'popular'>('latest');
  /** Set only where the browser has no native share sheet. */
  const [sharing, setSharing] = React.useState<ArtworkWithArtist | null>(null);
  /*
   * Infinite scroll, driven by the sentinel itself.
   *
   * The previous implementation created the observer in a mount-only effect and
   * called `observer.observe(loadMoreRef.current)` — but on mount the query is
   * still loading, so the branch that renders the sentinel (it is gated on
   * `hasNextPage`) has not run and the ref is null. Nothing was ever observed,
   * so scrolling to the bottom loaded nothing at all. The state it set,
   * `inView`, was also never set back to false, so had the observer attached it
   * would have latched on and walked every remaining page in a loop the moment
   * each fetch settled — the whole gallery pulled down without a scroll.
   *
   * A callback ref fixes both: it fires whenever the sentinel enters or leaves
   * the tree, and the fetch is triggered from the intersection callback through
   * a ref holding the current query state, so no stale closure and nothing to
   * reset.
   */
  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const pagingRef = React.useRef({ hasNextPage: false, isFetching: false, fetch: () => {} });

  const loadMoreRef = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const { hasNextPage: more, isFetching, fetch } = pagingRef.current;
        if (entries.some((entry) => entry.isIntersecting) && more && !isFetching) fetch();
      },
      // 200px of lead time so the next page is usually in before the visitor
      // reaches the bottom, without prefetching pages they may never see.
      { threshold: 0, rootMargin: '200px' },
    );
    observerRef.current.observe(node);
  }, []);

  React.useEffect(() => () => observerRef.current?.disconnect(), []);

  const wishlist = useMutation({
    mutationFn: (artworkId: string) => catalogService.toggleWishlist(artworkId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['gallery'] });
      void queryClient.invalidateQueries({ queryKey: qk.wishlist });
      toast.success(result.wishlisted ? 'Saved to your wishlist' : 'Removed from your wishlist');
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  });

  const onToggleWishlist = (artworkId: string) => {
    if (!isAuthenticated) {
      toast('Sign in to save photographs', {
        description: 'Your wishlist travels with your space account.',
        action: { label: 'Sign in', onClick: () => window.location.assign('/signin?as=space') },
      });
      return;
    }
    wishlist.mutate(artworkId);
  };

  /*
    Read once per sort, not on every render: `readCached` touches localStorage
    and parses JSON, and this sits directly in the render path of the grid.
  */
  const cacheKey = `${GALLERY_FIRST_PAGE_CACHE}.${sortBy}`;
  const cachedFirstPage = React.useMemo(
    () => (searchQuery ? null : readCached<Paginated<ArtworkWithArtist>>(cacheKey)),
    [cacheKey, searchQuery],
  );

  const {
    data,
    dataUpdatedAt,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: qk.galleryInfinite({ sort: sortBy, search: searchQuery || undefined }),
    queryFn: async ({ pageParam = 1 }) => {
      const result = await catalogService.gallery({
        sort: sortBy,
        q: searchQuery || undefined,
        page: pageParam,
        pageSize: 24,
      });
      return result;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    /*
      `initialDataUpdatedAt` carries the cache's OWN timestamp, not "now".
      Without it React Query would treat a day-old grid as freshly fetched and
      sit on it for the full 60s staleTime before checking. With it, anything
      older than that revalidates on mount - paint immediately, correct quietly.
    */
    ...(cachedFirstPage
      ? {
          initialData: { pages: [cachedFirstPage.data], pageParams: [1] },
          initialDataUpdatedAt: cachedFirstPage.at,
        }
      : {}),
  });

  /*
    Persist the first page, but only when it came off the network.

    While the grid is still painting from localStorage React Query reports the
    cache's own timestamp as `dataUpdatedAt`. Writing then would stamp a fresh
    `at` onto data that never came back from the API, and the entry could never
    age out - a gallery frozen at whatever it looked like the day the dyno last
    answered. Comparing the two timestamps is what tells the two apart.
  */
  const firstPage = data?.pages[0];
  React.useEffect(() => {
    if (searchQuery || !firstPage) return;
    if (cachedFirstPage && dataUpdatedAt === cachedFirstPage.at) return;
    writeCached(cacheKey, withoutUserState(firstPage));
  }, [cacheKey, searchQuery, firstPage, dataUpdatedAt, cachedFirstPage]);

  // Captured here rather than called inside the JSX: within the
  // `isFetchNextPageError` branch React Query v5 narrows the result union and
  // `fetchNextPage` resolves to `never`, so the call site has to sit outside it.
  const loadMore = React.useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const { data: top20Content } = useQuery({
    queryKey: ['content', 'gallery_top_20'],
    queryFn: () => contentService.getContent('gallery_top_20'),
  });

  const top20Ids = Array.isArray(top20Content?.data) && top20Content.data.length > 0 ? top20Content.data : undefined;

  const { data: top20Data } = useQuery({
    queryKey: qk.gallery({ ids: top20Ids, pageSize: 20 }),
    queryFn: () => catalogService.gallery({ ids: top20Ids, pageSize: 20 }),
    enabled: !!top20Ids && !searchQuery, // Only show Top 20 when not searching
  });

  const top20Artworks = top20Data?.items ?? [];

  /*
    Is the Curator's Top Picks strip on screen? The condition is written once
    here because two separate things depend on it: whether the strip renders, and
    whether the main grid below has to leave those photographs out.
  */
  /*
    The curated strip shows for space owners too.

    It was gated on `!isSpace`, so the one audience who is actually choosing
    photographs for a wall never saw the curated selection - the picks were
    folded silently into the grid instead, and the space below the search box
    on Browse Art sat empty. Same list, same manager control; it is simply
    shown to both audiences now, under a heading that suits each.
  */
  const showTopPicks = top20Artworks.length > 0 && !searchQuery;

  /*
    A space owner is picking a handful for a wall, not browsing an editorial
    feature, so their strip is deliberately short. The manager's list can hold
    as many as they like; this only limits how many are surfaced here.
  */
  const SUGGESTED_FOR_SPACE = 5;
  const strip = isSpace ? top20Artworks.slice(0, SUGGESTED_FOR_SPACE) : top20Artworks;

  /*
   * One pass, one Set, both kinds of duplicate.
   *
   * Pagination is offset-based, so a photograph published while someone is
   * scrolling shifts every later row down by one and the item at the old
   * boundary comes back on the next page. React then renders two cards with the
   * same `key`. Deduping only against the Top 20 (which is all this did) left
   * that case open — §18 asks for no duplicate images, not no overlap with one
   * curated strip.
   */
  const allArtworks = React.useMemo(() => {
    const seen = new Set<string>();
    const unique = [];
    const paged = data?.pages.flatMap((page) => page.items) ?? [];

    /*
      When the strip is showing, its twenty photographs are ALREADY on the page,
      so seeding `seen` with their ids keeps them out of the grid below.

      They used to be prepended into this list as well as rendered in the strip,
      so the twenty curated photographs appeared twice on every gallery load -
      two DOM subtrees, two decodes, twice the bytes - and the founder's "the
      gallery loads slowly every single time" was partly just the page doing the
      most expensive fifth of its work over again.

      When the strip is hidden (a space owner, or an active search) they are
      folded into the grid instead, so nothing curated disappears.
    */
    const source = showTopPicks ? paged : [...top20Artworks, ...paged];
    if (showTopPicks) for (const artwork of top20Artworks) seen.add(artwork.id);

    for (const artwork of source) {
      if (seen.has(artwork.id)) continue;
      seen.add(artwork.id);
      unique.push(artwork);
    }
    return unique;
  }, [top20Data, data, showTopPicks]);
  const lightbox = useLightbox(allArtworks);

  /*
    The four photographs in the editorial opening, taken from the collection.

    Spread across the list rather than the first four in a row, so the collage
    reads as a sample of the whole gallery instead of a duplicate of the top of
    the grid the visitor is about to scroll into.
  */
  const opener = React.useMemo(() => {
    if (allArtworks.length < 4) return [];
    const step = Math.max(1, Math.floor(allArtworks.length / 4));
    return [0, 1, 2, 3].map(
      (i) => allArtworks[(i * step) % allArtworks.length]?.thumbnailUrl ?? allArtworks[i].imageUrl,
    );
  }, [allArtworks]);

  const shareNode = <ShareSheet artwork={sharing} onClose={() => setSharing(null)} />;

  const lightboxNode = lightbox.isOpen && (
    <Lightbox
      artworks={allArtworks}
      index={lightbox.index}
      onIndexChange={lightbox.setIndex}
      onClose={lightbox.close}
      onToggleWishlist={(entry) => onToggleWishlist(entry.id)}
    />
  );

  /*
   * The load-more sentinel, defined once and mounted by both layouts.
   *
   * What it says depends on the actual state: it used to read "Loading more
   * photographs…" permanently, including while sitting idle at the bottom
   * having loaded nothing.
   */
  const loadMoreSentinel = (
    <>
      {hasNextPage && (
        <div ref={loadMoreRef} className="mt-12 flex items-center justify-center gap-3">
          {isFetchNextPageError ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted">We couldn&rsquo;t load any more photographs.</p>
              <Button variant="outline" size="sm" onClick={loadMore}>
                <RotateCw className="size-3.5" /> Try again
              </Button>
            </div>
          ) : isFetchingNextPage ? (
            <>
              <div className="h-2 w-24 animate-pulse rounded-full bg-bronze/30" />
              <span className="text-sm text-muted">Loading more photographs…</span>
            </>
          ) : (
            // Idle at the sentinel: the observer is about to fire, so stay
            // quiet rather than claim work that isn't happening.
            <span className="sr-only">Scroll for more photographs</span>
          )}
        </div>
      )}

      {/*
        The end of the gallery used to announce itself — "That's all 27
        photographs." Removed on request. It was doing two things and only one of
        them was wanted: marking the end, which the layout already does, and
        publishing the size of the catalogue, which reads as small while the
        collection is still growing.
      */}
    </>
  );

  const configurator = configuring && (
    <FrameConfigurator
      artwork={configuring}
      open
      onOpenChange={(open) => !open && setConfiguring(null)}
      onConfirm={(frame, quantity) => {
        cart.add(configuring, frame);
        setConfiguring(null);
        lightbox.close();
        toast.success(`${configuring.title} added to your cart`, {
          action: { label: 'View cart', onClick: () => window.location.assign('/space/cart') },
        });
      }}
    />
  );

  /*
   * The observer reads this rather than closing over the values, so it always
   * sees the current page state without being torn down and rebuilt on every
   * fetch. `isFetchNextPageError` is folded into the guard: after a failed page
   * the sentinel is still on screen and still intersecting, and without this a
   * server that is down would be retried on a tight loop. The visitor gets the
   * "Try again" button instead.
   */
  pagingRef.current = {
    hasNextPage: Boolean(hasNextPage),
    isFetching: isFetchingNextPage || isFetchNextPageError,
    fetch: loadMore,
  };

  /* ── Inside the space dashboard ───────────────────────────────────────── */
  if (isSpace) {
    return (
      <div>
        <PageHeader
          title="Browse art"
          description="Click any image to see it full size, then add the ones you want."
          actions={
            <Button variant={cart.count > 0 ? 'primary' : 'outline'} asChild>
              <Link to="/space/cart">
                <Frame />
                Cart{cart.count > 0 ? ` (${cart.count})` : ''}
              </Link>
            </Button>
          }
        />

        {cart.count > 0 && !cart.meetsMinimum && (
          <p className="mb-6 border-l-2 border-bronze bg-bronze-soft/40 px-4 py-3 text-sm text-bronze-deep">
            Orders start at {MIN_ORDER_QUANTITY} frames - add {MIN_ORDER_QUANTITY - cart.count} more
            to check out.
          </p>
        )}

        <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-6 max-h-[calc(100dvh-4rem)] overflow-y-auto pr-2">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search photographs…"
                  icon={<Search />}
                  aria-label="Search photographs"
                />
              </form>
            </div>
          </aside>
          {/*
            The grid used to drop to opacity-60 while the NEXT page was loading,
            so scrolling greyed out the photographs the visitor was looking at.
            The sentinel at the bottom already says more is coming.
          */}
          <div className="mt-8">
            {isLoading ? (
              <ArtworkMasonry>
                {/* 24, the page size - twelve left the grid half-height, so it
                    jumped when the results landed. */}
                {Array.from({ length: 24 }, (_, index) => (
                  <ArtworkCardSkeleton key={index} index={index} />
                ))}
              </ArtworkMasonry>
            ) : allArtworks.length > 0 ? (
              <>
                <ArtworkMasonry>
                  {allArtworks.map((artwork, index) => (
                    <ArtworkCard
                      key={artwork.id}
                      artwork={artwork}
                      priority={index < 4}
                      showPrice={false}
                      onOpen={lightbox.open}
                      onToggleWishlist={(entry) => onToggleWishlist(entry.id)}
                      /*
                        The way a space owner puts a photograph in their cart.

                        The header above has always said "click any image …
                        then add the ones you want", but no card carried an Add
                        button: the only route into the cart was the public
                        artwork page, which is now an editorial page about the
                        photograph rather than a checkout. Ordering belongs in
                        the space dashboard, so it lives here.
                      */
                      action={
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => setConfiguring(artwork)}
                        >
                          <Frame className="size-4" /> Add to frame
                        </Button>
                      }
                    />
                  ))}
                </ArtworkMasonry>
                {/* The dashboard grid had no sentinel at all, so a space owner
                    browsing art was capped at the first 24 photographs with no
                    way to reach the rest of the catalogue. */}
                {loadMoreSentinel}
              </>
            ) : isError ? (
              /*
                Broken is not the same as empty.

                The public variant below has always had this branch; the space
                owner one did not, so a failed request fell through to "No
                photographs found." — telling a paying customer, on the only
                screen they order from, that ARTINU has no photographs at all.
                The API sleeps on a free dyno and a cold start was measured at 43
                seconds, so this was not a rare path.
              */
              <EmptyState
                icon={<ImageOff />}
                title="We couldn't load the gallery."
                description={errorMessage(error)}
                action={
                  <Button
                    variant="outline"
                    onClick={() =>
                      queryClient.invalidateQueries({
                        queryKey: qk.galleryInfinite({
                          sort: sortBy,
                          search: searchQuery || undefined,
                        }),
                      })
                    }
                  >
                    Try again
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<ImageOff />}
                title="No photographs match that."
                description="Try a different search, or clear the filters."
              />
            )}
          </div>
        </div>

        {lightboxNode}
        {shareNode}
        {configurator}
      </div>
    );
  }

  /* ── The public gallery ───────────────────────────────────────────────── */
  return (
    <>
      {/*
        The gallery now opens on the people, not on a collage.

        What was here was four fixed Unsplash photographs marked aria-hidden
        beside the words "Photography that speaks." — nothing in it came from
        ARTINU, and a visitor could read the whole thing without learning that
        anyone in particular had taken any of it. The replacement is the real
        roster and grows on its own as photographers join.

        Everything below this point — top picks, the search box, the sort
        control and the gallery itself — is untouched.
      */}
      <GalleryCommunityHero />

      {/* ── Working gallery ────────────────────────────────────────────── */}

      {showTopPicks && (
        <Section tone="soft" className="pt-0 pb-12">
          <Container>
            {/*
              A sparkle is the "magic AI feature" glyph, and it was standing next
              to a heading about human curation - the opposite of what the
              section means. Every other section on this site introduces itself
              with an eyebrow and a hairline rule, so this one does too.
            */}
            <div className="mb-6">
              <p className="eyebrow">Chosen this month</p>
              <h2 className="mt-3 font-display text-2xl text-ink">
                {isSpace ? 'Suggested artwork' : <>Curator&rsquo;s top picks</>}
              </h2>
              <span className="rule mt-4" />
            </div>
            <ArtworkMasonry>
              {strip.map((artwork, index) => (
                // The first six are eager. These are the first photographs below
                // the hero, and every one of them used to be lazy +
                // fetchPriority=low while four eager fetches were spent further
                // down the main grid, below the fold.
                <ArtworkCard
                  key={artwork.id}
                  artwork={artwork}
                  priority={index < 6}
                  onOpen={lightbox.open}
                  action={
                    isSpace ? (
                      <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setConfiguring(artwork)}>
                        <Frame className="size-4" /> Add
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="w-full" onClick={() => onToggleWishlist(artwork.id)}>
                        <Heart className="size-4 mr-2" /> Save
                      </Button>
                    )
                  }
                />
              ))}
            </ArtworkMasonry>
          </Container>
        </Section>
      )}

      <Section tone={isSpace ? 'canvas' : 'soft'} className="pt-0">
        <Container size="wide">
          <div className="mb-8 flex flex-wrap items-center gap-4">
            <form
              className="relative min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search photographs…"
                icon={<Search />}
                aria-label="Search photographs"
              />
            </form>
            <div className="flex items-center gap-2">
              <span className="text-xs text-subtle">Sort by</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as 'latest' | 'popular')}
                className="h-9 w-44 rounded-md border border-line bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-bronze"
              >
                <option value="latest">Newest</option>
                <option value="popular">Most popular</option>
              </select>
            </div>
          </div>

          {/*
            The grid used to drop to opacity-60 while the NEXT page was loading,
            so scrolling greyed out the photographs the visitor was looking at.
            The sentinel at the bottom already says more is coming.
          */}
          <div className="mt-8">
            {isLoading ? (
              <ArtworkMasonry>
                {/* 24, the page size - twelve left the grid half-height, so it
                    jumped when the results landed. */}
                {Array.from({ length: 24 }, (_, index) => (
                  <ArtworkCardSkeleton key={index} index={index} />
                ))}
              </ArtworkMasonry>
            ) : isError ? (
              <EmptyState
                icon={<ImageOff />}
                title="We couldn't load the gallery."
                description={errorMessage(error)}
                action={
                  <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: qk.galleryInfinite({ sort: sortBy, search: searchQuery || undefined }) })}>
                    Try again
                  </Button>
                }
              />
            ) : allArtworks.length > 0 ? (
              <>
                <ArtworkMasonry>
                  {allArtworks.map((artwork, index) => (
                    <ArtworkCard
                      key={artwork.id}
                      artwork={artwork}
                      priority={index < 4}
                      showPrice={false}
                      onOpen={lightbox.open}
                      onToggleWishlist={(entry) => onToggleWishlist(entry.id)}
                      onShare={setSharing}
                    />
                  ))}
                </ArtworkMasonry>
                {loadMoreSentinel}
              </>
            ) : (
              <EmptyState
                icon={<Search />}
                title="No photographs found."
                description="Try a different search term or browse all photographs."
              />
            )}
          </div>
        </Container>
      </Section>

      {lightboxNode}
      {shareNode}

      {/* ── ARTINU band ───────────────────────────────────────────────── */}
      <Section size="compact" className="pt-0">
        <Container size="wide">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-ink px-6 py-8 text-canvas sm:flex-row sm:items-center sm:px-10">
            {/*
              Four generated-marketing tells in three lines: a sparkle, "Can't
              find what you're looking for?", "our team", and "the perfect art for
              your space". Replaced with what actually happens when someone gets
              in touch, and a rule instead of a glyph.
            */}
            <div className="flex items-start gap-4">
              <span className="mt-2 hidden h-px w-8 shrink-0 bg-bronze-light/60 sm:block" aria-hidden />
              <div>
                <h2 className="font-display text-xl text-canvas sm:text-2xl">
                  Not sure what would work on your wall?
                </h2>
                <p className="mt-1 text-sm text-canvas/60">
                  We will come and look at the room, then bring a few prints to hold up against it.
                </p>
              </div>
            </div>
            <Button variant="light" asChild className="shrink-0">
              <Link to="/lets-talk">Book a wall visit</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}

/** ‹ 1 2 3 … 52 › - a real pager, not an infinite scroll. */
function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const pages = React.useMemo(() => {
    const items: (number | 'gap')[] = [];
    const push = (value: number | 'gap') => items.push(value);

    push(1);
    if (page > 3) push('gap');
    for (let index = Math.max(2, page - 1); index <= Math.min(totalPages - 1, page + 1); index += 1) {
      push(index);
    }
    if (page < totalPages - 2) push('gap');
    if (totalPages > 1) push(totalPages);
    return items;
  }, [page, totalPages]);

  return (
    <nav className="mt-12 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <Button
        variant="ghost"
        size="icon"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft />
      </Button>

      {pages.map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-subtle">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={cn(
              'size-9 rounded-full text-sm transition-colors',
              entry === page ? 'bg-ink text-canvas' : 'text-muted hover:bg-sand',
            )}
          >
            {entry}
          </button>
        ),
      )}

      <Button
        variant="ghost"
        size="icon"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
