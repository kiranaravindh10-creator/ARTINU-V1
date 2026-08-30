import { formatDate, formatRelative, type ArtistAnalytics } from '@artinu/shared';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Heart, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CircleArrow,
  Figure,
  FigureRow,
  Rows,
  SectionHead,
  ViewAll,
} from '@/components/layout/panel';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { useAuth } from '@/contexts/AuthContext';
import { IMAGES } from '@/lib/images';
import { qk } from '@/lib/query';
import { cn } from '@/lib/utils';
import { contentService } from '@/services/content.service';
import { catalogService } from '@/services/catalog.service';
import { analyticsService, installationService } from '@/services/space.service';
import { AnimatePresence, motion } from 'framer-motion';
import { useContentSync } from '@/hooks/useContentSync';

/**
 * The collaborated spaces, shown to signed-in artists and art philes.
 *
 * This reads the same `cafes` records the homepage carousel does, so a café the
 * manager adds, renames, reorders or hides appears identically in both places.
 * It previously read `collaboration-slides` — a separate table nobody was
 * populating — which is why it always fell through to one hardcoded stock
 * photograph and looked static.
 */
function CollaborationCarousel() {
  const { data: cafes, isLoading } = useQuery({
    queryKey: ['content-manager', 'cafes', 'active'],
    queryFn: () => contentService.getActiveCafes(),
  });

  const slides = cafes ?? [];
  const [currentIndex, setCurrentIndex] = React.useState(0);

  React.useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length]);

  // A café removed by the manager must not leave the index past the end.
  React.useEffect(() => {
    setCurrentIndex((previous) => (previous < slides.length ? previous : 0));
  }, [slides.length]);

  // The manager's edits land here without a reload.
  useContentSync({ onCafesUpdate: () => undefined });

  if (isLoading) {
    return (
      <div className="relative min-h-[15rem] w-full overflow-hidden bg-ink lg:min-h-[24rem]">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  // Nothing collaborated yet — a quiet branded panel rather than a stock photo
  // pretending to be a partner venue.
  if (slides.length === 0) {
    return (
      <div className="relative flex min-h-[15rem] w-full items-center justify-center overflow-hidden bg-ink px-8 lg:min-h-[24rem]">
        <div className="max-w-sm text-center">
          <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze-light">
            Collaborations
          </p>
          <p className="mt-3 font-display text-xl leading-snug text-canvas">
            Your work belongs on these walls.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-canvas/60">
            The spaces we work with appear here as they come on board.
          </p>
        </div>
      </div>
    );
  }

  const current = slides[currentIndex]!;

  return (
    <div className="relative min-h-[15rem] w-full overflow-hidden bg-ink lg:min-h-[24rem]">
      <AnimatePresence>
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <Photo
            src={current.photoUrl}
            alt={`${current.name} - an ARTINU collaboration`}
            priority
            className="h-full w-full"
            imgClassName="h-full w-full object-cover object-center"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
            <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze-light">
              Now collaborating
            </p>
            <p className="mt-2 font-display text-2xl text-canvas">{current.name}</p>
            {current.description && (
              <p className="mt-1 max-w-md text-sm leading-relaxed text-canvas/70 line-clamp-2">
                {current.description}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <div className="absolute bottom-4 right-6 flex items-center gap-1.5">
          {slides.map((cafe, index) => (
            <button
              key={cafe.id}
              type="button"
              onClick={() => setCurrentIndex(index)}
              aria-label={`Show ${cafe.name}`}
              aria-current={index === currentIndex}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === currentIndex ? 'w-6 bg-canvas' : 'w-1.5 bg-canvas/40 hover:bg-canvas/70',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ArtistWorkspacePage() {
  const { profile } = useAuth();
  const firstName = profile?.fullName?.split(' ')[0] ?? 'there';

  const {
    data: analytics,
    isLoading,
    isError: analyticsFailed,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: qk.analytics('artist'),
    queryFn: () => analyticsService.me<ArtistAnalytics>(),
  });

  // There is no review queue any more (§26): uploads publish immediately, so
  // this panel shows the most recent live work rather than a perpetual empty
  // "waiting on review" list.
  const { data: recentUploads } = useQuery({
    queryKey: qk.myArtworks({ status: 'approved', recent: true }),
    queryFn: () => catalogService.myArtworks({ status: 'approved', pageSize: 5 }),
  });

  const { data: approved } = useQuery({
    queryKey: qk.myArtworks({ status: 'approved' }),
    queryFn: () => catalogService.myArtworks({ status: 'approved', pageSize: 12 }),
  });

  const { data: installations = [] } = useQuery({
    queryKey: qk.installations,
    queryFn: () => installationService.mine(),
  });

  const selected = (approved?.items ?? []).filter((artwork) => artwork.selections > 0).slice(0, 4);

  return (
    <div>
      {/* ── Opening ──────────────────────────────────────────────────────── */}
      <section className="bleed-top grid items-stretch lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col justify-center px-5 pb-10 pt-14 sm:px-8 lg:py-12 lg:pl-11 lg:pr-12 relative">
          {/* Cover photo backdrop */}
          {profile?.coverUrl && (
            <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
              <Photo
                src={profile.coverUrl}
                alt=""
                className="w-full h-full"
                imgClassName="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/30 to-transparent" />
            </div>
          )}
          <p className="eyebrow">{formatDate(new Date(), 'long')}</p>
          <h1 className="mt-6 font-display text-[2.75rem] leading-[1.02] text-ink lg:text-[3.25rem]">
            Hello,
            <br />
            {firstName}.
          </h1>
          <span className="rule mt-7" />
          <p className="mt-7 max-w-xs text-sm leading-relaxed text-muted">
            Your work, where it is, and how it's performing.
          </p>
          <div className="mt-9">
            <Button shape="pill" asChild>
              <Link to="/studio/upload">
                <Upload /> Upload work
              </Link>
            </Button>
          </div>
        </div>

        <CollaborationCarousel />
      </section>

      {/* ── The three numbers that matter ─────────────────────────────────── */}
      <section className="border-b border-line py-10 lg:py-12">
        {/*
          A FAILED REQUEST IS NOT AN EMPTY PORTFOLIO.

          `isError` was not read on any of the four queries behind this page, so
          one failed call rendered a photographer with forty published works the
          same screen as somebody who signed up a minute ago: three zeroes, "You
          haven't uploaded anything yet", and a nudge telling them their
          portfolio is thin. On a sleeping free dyno that is what they saw after
          any idle period, and there was nothing on screen to suggest a retry
          would help.
        */}
        {analyticsFailed ? (
          <ErrorState error={analyticsError} onRetry={() => void refetchAnalytics()} />
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : (
          <FigureRow>
            <Figure
              value={analytics?.selectedWorks ?? 0}
              label="Selected works"
              hint="Chosen by a space"
              to="/studio/portfolio"
            />
            <Figure
              value={analytics?.activeInstallations ?? 0}
              label="Active installations"
              hint="Up or scheduled"
              to="/studio/installations"
            />
            {/*
              "Pending reviews" was a permanently dead tile.

              Uploads publish immediately - there is no review queue any more,
              which this file already says at the comment above `recentUploads`
              - so the server's count of `status === 'pending_review'` is
              structurally always zero. One of only three headline numbers on a
              photographer's home page read "0 / Nothing in queue" forever.

              Replaced with the number they actually want, which is how many of
              their photographs are live and can be chosen.
            */}
            <Figure
              value={analytics?.approvedWorks ?? approved?.total ?? 0}
              label="Published"
              hint="Live in the gallery"
              to="/studio/portfolio"
            />
          </FigureRow>
        )}
      </section>

      {/* ── Nudge: a thin portfolio gets picked less often ───────────────── */}
      {(analytics?.approvedWorks ?? 0) < 6 && (
        <section className="border-b border-line py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted">
              <span className="text-ink">Spaces browse whole collections.</span> Artists with six or
              more published photographs get selected far more often - you have{' '}
              {analytics?.approvedWorks ?? 0}.
            </p>
            <ViewAll to="/studio/upload">Add another</ViewAll>
          </div>
        </section>
      )}

      {/* ── Selected work ────────────────────────────────────────────────── */}
      <section className="py-10 lg:py-12">
        <SectionHead
          title="Recently selected"
          description="Photographs a space chose to put on its walls."
          aside={<ViewAll to="/studio/portfolio">Portfolio</ViewAll>}
        />

        <div className="mt-7">
          {selected.length > 0 ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              {selected.map((artwork) => (
                <Link key={artwork.id} to={`/gallery/${artwork.id}`} className="group">
                  <Photo
                    src={artwork.thumbnailUrl}
                    alt={artwork.title}
                    ratio="aspect-[4/5]"
                    className="photo-edge"
                    imgClassName="transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
                  />
                  <p className="mt-3 truncate font-display text-[0.9375rem] text-ink">
                    {artwork.title}
                  </p>
                  <p className="text-xs text-subtle">
                    Chosen {artwork.selections} {artwork.selections === 1 ? 'time' : 'times'}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            /* Was Sparkles - the "magic AI" glyph - on an empty state about
               work being chosen by a real person. A comment can sit HERE,
               between the JSX expression's braces and the element, but never
               inside an attribute list. */
            <EmptyState
              icon={<Heart />}
              title="Nothing selected yet."
              description="When a space chooses one of your photographs, it shows up here."
            />
          )}
        </div>
      </section>

      {/* ── Where the work is + review queue ─────────────────────────────── */}
      <div className="grid gap-x-14 gap-y-12 border-t border-line pt-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:pt-12">
        <section>
          <SectionHead
            title="Your work in the world"
            icon={MapPin}
            aside={<ViewAll to="/studio/installations">All</ViewAll>}
          />
          <div className="mt-5">
            {installations.length > 0 ? (
              <Rows>
                {installations.slice(0, 5).map((installation) => (
                  <li
                    key={installation.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <span className="min-w-0 truncate text-sm text-ink-soft">
                      {installation.installationWindow ?? 'Installation'}
                    </span>
                    <span className="shrink-0 text-xs text-subtle">
                      {formatDate(installation.scheduledFor)}
                    </span>
                  </li>
                ))}
              </Rows>
            ) : (
              <p className="text-sm text-subtle">
                No installations yet. They appear once a space chooses your work.
              </p>
            )}
          </div>
        </section>

        <div className="space-y-12">
          <section>
            <SectionHead
              title="Recently uploaded"
              aside={<ViewAll to="/studio/submissions">All</ViewAll>}
            />
            <div className="mt-5">
              {recentUploads?.items.length ? (
                <Rows>
                  {recentUploads.items.map((artwork) => (
                    <li key={artwork.id} className="flex items-center gap-3 py-3 first:pt-0">
                      <Photo
                        src={artwork.thumbnailUrl}
                        alt={artwork.title}
                        className="size-11 shrink-0 rounded-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{artwork.title}</p>
                        <p className="text-xs text-subtle">
                          {artwork.photoId ? `${artwork.photoId} · ` : ''}Uploaded{' '}
                          {formatRelative(artwork.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </Rows>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-subtle">You haven&rsquo;t uploaded anything yet.</p>
                  <CircleArrow to="/studio/upload" label="Upload work" />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}