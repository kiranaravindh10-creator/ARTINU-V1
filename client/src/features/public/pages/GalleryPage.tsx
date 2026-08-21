import { formatNumber, type ArtworkWithArtist, MIN_ORDER_QUANTITY } from '@artinu/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, ChevronRight, Filter, Heart, ImageOff, RotateCw, Search, ShoppingBag } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CircleArrowLink, Container, Section } from '@/components/layout/primitives';
import { PageHeader } from '@/components/layout/DashboardShell';
import { Reveal } from '@/components/motion/reveal';
import { Typewriter } from '@/components/motion/typewriter';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
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
import { IMAGES } from '@/lib/images';
import { qk } from '@/lib/query';
import { errorMessage } from '@/lib/api';
import { catalogService } from '@/services/catalog.service';
import { spaceService } from '@/services/space.service';
import { contentService } from '@/services/content.service';
import { cn } from '@/lib/utils';

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

  const {
    data,
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
  });

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
    for (const artwork of [...top20Artworks, ...(data?.pages.flatMap((page) => page.items) ?? [])]) {
      if (seen.has(artwork.id)) continue;
      seen.add(artwork.id);
      unique.push(artwork);
    }
    return unique;
  }, [top20Data, data]);
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
        Nothing is printed at the end of the grid.

        First it was "That's all 33 photographs", then "You've reached the end
        of the collection". Both were the page narrating itself. A gallery wall
        does not put a sign at the end telling you it has finished; you can see
        that it has. The photographs stop, and that is the whole message.
      */}
    </>
  );

  const configurator = configuring && (
    <FrameConfigurator
      artwork={configuring}
      open
      onOpenChange={(open) => !open && setConfiguring(null)}
      onConfirm={(frame, quantity) => {
        cart.add(configuring, frame, quantity);
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
                <ShoppingBag />
                Cart{cart.count > 0 ? ` (${cart.count})` : ''}
              </Link>
            </Button>
          }
        />

        {cart.count > 0 && !cart.meetsMinimum && (
          <p className="mb-6 border-l-2 border-bronze bg-bronze-soft/40 px-4 py-3 text-sm text-bronze-deep">
            Orders start at {MIN_ORDER_QUANTITY} frames. Add {MIN_ORDER_QUANTITY - cart.count} more
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
          <div className={cn('mt-8', isFetchingNextPage && !isLoading && 'opacity-60 transition-opacity')}>
            {isLoading ? (
              <ArtworkMasonry>
                {Array.from({ length: 12 }, (_, index) => (
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
                      onShare={setSharing}
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
                          <ShoppingBag className="size-4" /> Add to cart
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
            ) : (
              <EmptyState title="No photographs found." />
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
      {/* ── Editorial opening ──────────────────────────────────────────── */}
      <section className="grid items-center gap-10 px-5 pb-14 pt-10 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:px-12 lg:pb-20">
        <Reveal>
          <p className="eyebrow">Curated moments. Real stories.</p>
          <Typewriter as="h1" className="mt-5 font-display text-[2.75rem] leading-[1.05] text-ink sm:text-[3.5rem]">
            Photography
            <br />
            that speaks.
          </Typewriter>
          <span className="rule mt-7" />
          <p className="prose-quiet mt-7 max-w-sm">
            A collection of real stories captured by independent photographers from around the world.
          </p>
          <CircleArrowLink to="/artists" className="mt-9">
            Discover artists
          </CircleArrowLink>
        </Reveal>

        {/*
          Four photographs from the collection below, not four stock pictures.

          These were fixed Unsplash frames — a boat, a street, a valley — sitting
          at the top of a page whose entire subject is the work ARTINU's
          photographers actually made. The opening image of the gallery is the
          one place that should be least generic, and it was the only place on
          the page showing nothing real.

          They now come from the same query the grid uses, so the collage is
          different as the collection grows and every frame is a real credit.
          Falls back to the stock set only while the first page is in flight,
          so the layout never collapses.
        */}
        <Reveal delay={0.1} className="grid grid-cols-3 gap-3 lg:gap-4" aria-hidden>
          <Photo
            src={opener[0] ?? IMAGES.boatLake}
            alt=""
            ratio="aspect-[3/5]"
            thumbnail
            className="photo-edge col-span-1 self-end"
          />
          <Photo
            src={opener[1] ?? IMAGES.street}
            alt=""
            ratio="aspect-[3/5]"
            thumbnail
            className="photo-edge col-span-1"
          />
          <div className="col-span-1 grid gap-3 lg:gap-4">
            <Photo
              src={opener[2] ?? IMAGES.photographer}
              alt=""
              ratio="aspect-[4/3]"
              thumbnail
              className="photo-edge"
            />
            <Photo
              src={opener[3] ?? IMAGES.valley}
              alt=""
              ratio="aspect-[4/3]"
              thumbnail
              className="photo-edge"
            />
          </div>
        </Reveal>
      </section>

      {/* ── Working gallery ────────────────────────────────────────────── */}

      {!isSpace && top20Artworks.length > 0 && !searchQuery && (
        <Section tone="soft" className="pt-0 pb-12">
          <Container>
            {/* No sparkle beside the heading. "Curator's Top Picks" already
                says what it is, and a decorative glyph pinned to a title is the
                most recognisable tell of a generated layout. It was also not
                aria-hidden, so screen readers announced it as content. */}
            <div className="mb-6">
              <p className="eyebrow">Curated</p>
              <h2 className="mt-2 font-display text-2xl text-ink">This month&rsquo;s picks</h2>
            </div>
            <ArtworkMasonry>
              {top20Artworks.map((artwork) => (
                <ArtworkCard
                  key={artwork.id}
                  artwork={artwork}
                  onOpen={lightbox.open}
                  action={
                    isSpace ? (
                      <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setConfiguring(artwork)}>
                        <ShoppingBag className="size-4" /> Add
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

          <div className={cn('mt-8', isFetchingNextPage && !isLoading && 'opacity-60 transition-opacity')}>
            {isLoading ? (
              <ArtworkMasonry>
                {Array.from({ length: 12 }, (_, index) => (
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
            <div className="flex items-start gap-4">
              {/* The sparkle that sat here decorated a help prompt, which is
                  not something a glyph can clarify. The line under it said our
                  team would find "the perfect art for your space" — a promise
                  with nothing behind it. This says what actually happens. */}
              <div>
                <h2 className="font-display text-xl text-canvas sm:text-2xl">
                  Can&rsquo;t find what you&rsquo;re looking for?
                </h2>
                <p className="mt-1 text-sm text-canvas/60">
                  Tell us about the room and we&rsquo;ll put a selection together for it.
                </p>
              </div>
            </div>
            <Button variant="light" asChild className="shrink-0">
              <Link to="/lets-talk">Book a Consultation</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}

/** ‹ 1 2 3 … 52 › — a real pager, not an infinite scroll. */
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
