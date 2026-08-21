import { DEFAULT_SLIDESHOW_SETTINGS, SPACE_TYPE_LABELS, type Cafe } from '@artinu/shared';
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLink, Container, Section, SectionHeading } from '@/components/layout/primitives';
import { EASE, Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Typewriter } from '@/components/motion/typewriter';
import { Button } from '@/components/ui/button';
import { Photo } from '@/components/ui/photo';
import { CtaBand } from '@/features/public/components/CtaBand';
import {
  ArtworkCard,
  ArtworkCardSkeleton,
  ArtworkMasonry,
  useLightbox,
} from '@/features/public/components/ArtworkCard';
import { Lightbox } from '@/features/public/components/Lightbox';
import { IMAGES, SPACE_TYPE_IMAGES } from '@/lib/images';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { SLIDESHOW_CONTENT_ID, contentService } from '@/services/content.service';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { preloadImage, getBlurPlaceholderSync } from '@/lib/imageOptimization';

/**
 * Customer quotes come from the database, and only from the database.
 *
 * Four invented testimonials used to live here as a "fallback" — named
 * businesses ("The Test Kitchen", "Lalit Boutique Hotel") with five-star
 * ratings that nobody had confirmed were ever said. Attributing a quote to a
 * real-sounding company is a claim that has to be true, and a fallback made it
 * ship by default. A manager PUTs the real list to
 * /api/content/homepage_testimonials; until then the section hides itself.
 */
interface Testimonial {
  name: string;
  /** Optional — a visitor speaking for themselves has no business to name. */
  business?: string;
  role?: string;
  quote: string;
  rating?: number;
  /** Short text for the disc — initials, or an emoji. Not an image URL. */
  avatar?: string;
  /** A photograph of the person, ideally with the work they are talking about. */
  photo?: string;
  /** Alt text for `photo`. Falls back to a description built from the name. */
  photoAlt?: string;
}

/** Initials for the avatar disc, derived rather than stored alongside the name. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/**
 * The homepage hero photograph.
 *
 * Local WebP at four widths instead of a remote 1600px JPEG. The old hero was
 * an Unsplash URL, which put a third-party DNS lookup, TLS handshake and CDN
 * fetch in front of the largest element on the page, and served every phone the
 * same 1600px file. A 390px viewport now downloads 35 KB instead.
 *
 * `blur` is a 24px inline WebP, so the space is filled on the first frame and
 * the hero never flashes empty.
 */
const HOME_HERO = {
  src: '/image/home-hero-cafe-1440.webp',
  srcSet: [
    '/image/home-hero-cafe-640.webp 640w',
    '/image/home-hero-cafe-1024.webp 1024w',
    '/image/home-hero-cafe-1440.webp 1440w',
    '/image/home-hero-cafe-1920.webp 1672w',
  ].join(', '),
  blur: 'data:image/webp;base64,UklGRrYAAABXRUJQVlA4IKoAAABQBACdASoYAA4APu1iqU2ppaOiMAgBMB2JQBWAMYORXFwZZzT8/KvuSzOAAPaI60mPNbnw5qEMAoTTRua/dGdXlmov457eP3fOp6uvVzCkqMLtWTXoyqb1rxq48uGpjMz/ivgAgltNJ29lFxhBRbYhMaxteqHxiY1/3iiieGIXNTc7imLir9uU4Wq7fCRrtmu4Xn/19phQ/RKbzmgfcSbSe2aQ7kD7PfeAAA==',
} as const;

/**
 * The homepage slideshow.
 *
 * The photographs are rows in `hero_slides`, which Console → Homepage has
 * always been able to add to, reorder, credit and hide. How they *played* was
 * not editable at all — the dwell was a `6000` here, the cross-fade a `1.2`
 * beside it, the slow zoom a hardcoded twenty seconds — so "can it hold each
 * photograph a little longer" was a developer task. All of that now comes from
 * `ui_content.homepage_slideshow`, which the same screen writes.
 *
 * The autoplay also used to end permanently the first time anyone touched it:
 * every control called `setIsPlaying(false)` and nothing ever set it back, so
 * one click on the next arrow turned the slideshow into a static image for the
 * rest of the visit. The dwell timer below is keyed on the current index
 * instead, which is what a slideshow should do — stepping through by hand
 * restarts the clock rather than stopping it — and there is now an explicit
 * pause control, which auto-advancing content is required to have and never had.
 */
function PhotographerShowcaseHero() {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  /** Which way the last move went, so a sliding transition leaves the right way. */
  const [direction, setDirection] = React.useState(1);
  const [hovered, setHovered] = React.useState(false);

  const reduced = useReducedMotion();

  const { data: heroSlides, isLoading } = useQuery({
    queryKey: ['content-manager', 'hero-slides', 'active'],
    queryFn: () => contentService.getActiveHeroSlides(),
    // Curated by hand in Console → Homepage, so it changes a few times a month.
    // The default 60s meant a refetch on nearly every navigation back to the
    // homepage; five minutes matches how often the answer can actually differ,
    // and the SSE channel already pushes an invalidation when a manager saves.
    staleTime: 5 * 60 * 1000,
  });

  // Settings resolve to a complete object even when nothing has been saved — the
  // API answers an unset record with the schema defaults — so the hero never
  // waits on this query before it can play.
  const { data: saved } = useQuery({
    queryKey: ['content', SLIDESHOW_CONTENT_ID],
    queryFn: () => contentService.getSlideshowSettings(),
    staleTime: 5 * 60 * 1000,
  });
  const settings = saved ?? DEFAULT_SLIDESHOW_SETTINGS;

  const total = heroSlides?.length ?? 0;
  // The list can shrink under us when a manager hides a slide, and the index is
  // held in state — without this the render would reach past the end of it.
  const index = total > 0 ? Math.min(currentIndex, total - 1) : 0;

  // Preload the next few photographs so an advance does not wait on the network.
  React.useEffect(() => {
    if (!heroSlides || heroSlides.length === 0) return;

    const urls = [...new Set(heroSlides.slice(0, 3).map((slide) => slide.imageUrl))];

    // Hold the nodes we created and remove those exact nodes on cleanup. The
    // previous version looked them up again by the un-resolved `url`, while the
    // dedupe check above it compared against the browser-resolved `link.href` —
    // so the two never agreed and the hints were left behind on unmount.
    const added: HTMLLinkElement[] = [];
    for (const url of urls) {
      const link = preloadImage(url);
      if (document.querySelector(`link[rel="preload"][href="${link.href}"]`)) continue;
      document.head.appendChild(link);
      added.push(link);
    }

    return () => added.forEach((link) => link.remove());
  }, [heroSlides]);

  const advance = React.useCallback(
    (step: number) => {
      if (total === 0) return;
      setDirection(step >= 0 ? 1 : -1);
      setCurrentIndex((prev) => (Math.min(prev, total - 1) + step + total) % total);
    },
    [total],
  );

  const goTo = (next: number) => {
    setDirection(next >= index ? 1 : -1);
    setCurrentIndex(next);
  };

  const autoPlaying =
    settings.autoPlay && total > 1 && !(settings.pauseOnHover && hovered);

  /*
    One timeout per slide rather than one repeating interval.

    Because `index` is a dependency, any move — the timer's own, an arrow, a
    thumbnail — tears this down and starts a fresh full dwell. That is the
    behaviour you want from a slideshow, and it is why stepping through by hand no
    longer has to disable autoplay to avoid an immediate jump.
  */
  React.useEffect(() => {
    if (!autoPlaying) return;
    const timer = setTimeout(() => advance(1), settings.intervalMs);
    return () => clearTimeout(timer);
  }, [autoPlaying, index, settings.intervalMs, advance]);

  /*
    Nothing to show from the database yet — either because the request is still
    in flight, or because no slides are curated.

    ── Why these two cases now share a branch ──────────────────────────────────

    They used to be separate, and the loading case rendered a full-bleed dark
    panel with a pulsing gradient and no words. That is defensible when a
    request takes 200ms. It is not what actually happens here: the API runs on a
    host that sleeps when idle, so the first visitor after a quiet spell waits
    tens of seconds — and for all of it the largest element on the site was a
    black rectangle. That is the "this is really slow" screen.

    The editorial hero below needs nothing from the network. Its photograph is a
    local WebP that the browser has already been told to preload, so it paints
    on the first frame, says what ARTINU does and offers somewhere to go. If
    curated slides then arrive, the slideshow takes over.

    Showing real content immediately and upgrading it beats showing a void and
    waiting: the visitor can read, decide and click during the seconds the
    database is still thinking, and on a cold start those are the only seconds
    most of them will give us.
  */
  if (isLoading || !heroSlides || heroSlides.length === 0) {
    return (
      <section className="relative h-[calc(100dvh-4.5rem)] min-h-[34rem] w-full overflow-hidden bg-ink">
        <Photo
          src={HOME_HERO.src}
          alt="Friends in a Bengaluru cafe looking up at a framed ARTINU photograph"
          priority
          // Served from our own /image folder as WebP rather than a 1600px
          // remote JPEG. The hero is the LCP element, and it was waiting on a
          // third-party DNS lookup, TLS handshake and CDN round trip before a
          // single pixel could paint. `hero` cannot build a srcSet for a local
          // file, so the widths are listed explicitly.
          srcSet={HOME_HERO.srcSet}
          sizes="100vw"
          blurPlaceholder={HOME_HERO.blur}
          className="absolute inset-0 h-full w-full"
          imgClassName="h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30"
          aria-hidden
        />

        <Container className="relative flex h-full flex-col justify-end pb-20 sm:pb-28">
          <p className="eyebrow text-bronze-light">Photography on rotation</p>
          {/* Sized down for narrow screens — at 2.75rem the old heading ran off
              a 390px viewport. */}
          <Typewriter
            as="h1"
            className="mt-5 max-w-[18ch] font-display text-[2rem] leading-[1.06] text-canvas sm:text-[3rem] lg:text-[3.75rem]"
            caretClassName="border-l-bronze-light"
          >
            Art that changes with your space.
          </Typewriter>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-canvas/70 sm:text-base">
            We read the room, print and frame photography made for it, and swap it for new
            work every few months.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button shape="pill" size="lg" variant="light" asChild>
              <Link to="/lets-talk">
                Book a consultation <ArrowRight />
              </Link>
            </Button>
            <Link
              to="/gallery"
              className="text-sm text-canvas/80 underline decoration-canvas/30 underline-offset-4 transition-colors hover:text-canvas"
            >
              Browse the gallery
            </Link>
          </div>
        </Container>
      </section>
    );
  }

  const currentSlide = heroSlides[index];
  const isFirstSlide = index === 0;
  const heroSrc = currentSlide.imageUrl;
  const heroBlurPlaceholder = getBlurPlaceholderSync(heroSrc);

  const single = total < 2;

  /*
    The photograph fills the frame, and everything else sits on top of it.

    It used to be split: the image took 78% of the height and a solid strip
    underneath held thumbnails, a pause button, two arrows, a slide counter and
    a caption. On a photography site that meant the photograph — the only thing
    anyone came for — was permanently boxed into three-quarters of the screen so
    a row of widgets could have the rest.

    What is left is the credit, bottom left, and the queue of upcoming
    photographs, bottom right, both floating over the image. The arrows, the
    pause control, the counter and the caption are gone: the thumbnails already
    navigate, and autoplay pauses on hover.
  */
  const showThumbnails = settings.showThumbnails && !single;

  // Sliding is a motion effect, so a reader who asked for less motion gets the
  // plain swap. Ken Burns goes for the same reason.
  const sliding = settings.transition === 'slide' && !reduced;
  const kenBurns = settings.kenBurns && !reduced;
  const transitionSeconds = reduced ? 0.01 : settings.transitionMs / 1000;

  return (
    <section
      className="relative h-[calc(100dvh-4.5rem)] min-h-[34rem] w-full select-none overflow-hidden bg-ink"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-roledescription="carousel"
      aria-label="Featured photographs"
    >
      <AnimatePresence>
        <motion.div
          key={`bg-${currentSlide.id}`}
          initial={{ opacity: 0, x: sliding ? direction * 64 : 0, scale: 1 }}
          animate={{ opacity: 1, x: 0, scale: kenBurns ? 1.06 : 1 }}
          exit={{ opacity: 0, x: sliding ? direction * -64 : 0 }}
          transition={{
            opacity: { duration: transitionSeconds, ease: 'easeInOut' },
            x: { duration: transitionSeconds, ease: EASE },
            // The slow push-in runs for far longer than the dwell on purpose:
            // it never arrives, so it never looks like it stopped.
            scale: { duration: kenBurns ? 20 : 0, ease: 'linear' },
          }}
          className="absolute inset-0 origin-center"
        >
          <Photo
            src={heroSrc}
            alt={
              currentSlide.photographerName
                ? `Photograph by ${currentSlide.photographerName}`
                : 'A photograph from the ARTINU collection'
            }
            hero
            priority={isFirstSlide}
            blurPlaceholder={heroBlurPlaceholder}
            className="absolute inset-0 h-full w-full"
            imgClassName="h-full w-full object-cover object-center"
          />
        </motion.div>
      </AnimatePresence>

      {/* Just enough shadow along the bottom edge to hold white text over an
          unpredictable photograph. No wash across the middle of the image. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2/5 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent"
        aria-hidden
      />

      {/*
        Which photograph is showing, announced once rather than on every frame.
      */}
      <p className="sr-only" aria-live="polite" aria-atomic>
        {`Photograph ${index + 1} of ${total}`}
        {currentSlide.photographerName ? ` by ${currentSlide.photographerName}` : ''}
      </p>

      <Container className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-8 sm:pb-10">
        <div className="flex items-end justify-between gap-6">
          {/* Bottom left — who took it, and where they work. */}
          <div className="min-w-0">
            {currentSlide.photographerName ? (
              <>
                <p className="truncate font-display text-xl leading-tight text-canvas sm:text-2xl">
                  {currentSlide.photographerName}
                </p>
                {currentSlide.photographerLocation ? (
                  <p className="mt-1 truncate font-label text-[0.6875rem] uppercase tracking-[0.16em] text-canvas/60">
                    {currentSlide.photographerLocation}
                  </p>
                ) : null}
              </>
            ) : (
              <span />
            )}
          </div>

          {/*
            Bottom right — the next few photographs, small and mostly out of the
            way. These are the only control: clicking one goes to it, and
            autoplay already pauses while the pointer is over the hero.
          */}
          {showThumbnails && (
            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
              {heroSlides.map((slide, i) => {
                let offset = i - index;
                if (offset > total / 2) offset -= total;
                if (offset < -total / 2) offset += total;

                // The current photograph and the next three, so the strip reads
                // as a queue rather than as a full contact sheet.
                if (offset < 0 || offset > 3) return null;

                const isActive = offset === 0;

                return (
                  <button
                    key={slide.id}
                    onClick={() => goTo(i)}
                    aria-label={`Show photograph ${i + 1} of ${total}`}
                    aria-current={isActive}
                    className={cn(
                      'h-9 w-12 shrink-0 overflow-hidden rounded-[3px] transition-all duration-300 sm:h-11 sm:w-16',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas/70',
                      isActive
                        ? 'opacity-100 ring-1 ring-canvas/70'
                        : 'opacity-40 hover:opacity-75',
                    )}
                  >
                    <Photo
                      src={slide.imageUrl}
                      alt=""
                      aria-hidden
                      thumbnail
                      tone="bg-transparent"
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

function SpacesWeTransform() {
  /*
   * Each tile used to carry a `count` — "34 offices transformed", "28
   * restaurants transformed" — revealed on hover. The numbers were written by
   * hand and matched nothing in the database; the office figure was the largest
   * on the page and ARTINU has fewer offices than cafés. Invented traction is
   * the one claim a space owner can check.
   *
   * The tiles have since been stripped back to the photograph and its name.
   * Each one had accumulated a frosted-glass disc around a lucide glyph, a
   * serif label, a line of copy explaining what a café is, and a "Book a
   * consultation" row that slid up on hover — four pieces of furniture stacked
   * on a photograph that already said all of it. A coffee-cup icon beside the
   * word Café is decoration explaining a label, and "Warm corners for
   * conversation" is a caption for a picture of warm corners. The hover CTA was
   * the least useful of the four: the whole tile has always been that link.
   *
   * The hand-rolled stagger variants went with them. Reveal/Stagger already
   * carry this site's motion, including its reduced-motion behaviour, which the
   * bespoke copy here did not.
   */
  const spaceTypes = ['cafe', 'office', 'restaurant', 'hotel', 'home_decor'] as const;

  return (
    <Section tone="soft" size="compact" className="pt-0">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Spaces We Transform"
            title={<>Where photography finds its <em className="editorial-italic">space</em>.</>}
            className="max-w-3xl"
          />
        </Reveal>

        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {spaceTypes.map((type) => (
            <StaggerItem key={type}>
              <Link
                to={`/lets-talk?type=${type}`}
                className="group block overflow-hidden rounded-md bg-ink"
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Photo
                    src={SPACE_TYPE_IMAGES[type] ?? IMAGES.cafeInterior}
                    alt={SPACE_TYPE_LABELS[type]}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
                  />
                  {/* Only as much wash as the label needs to stay legible over a
                      bright photograph. */}
                  <div
                    className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ink/85 to-transparent"
                    aria-hidden
                  />
                  <p className="absolute inset-x-4 bottom-4 font-label text-[0.6875rem] uppercase tracking-[0.16em] text-canvas">
                    {SPACE_TYPE_LABELS[type]}
                  </p>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

/**
 * One quote, laid out around whether there is a photograph to show.
 *
 * With a photograph it is an editorial spread: the picture on the left at the
 * scale a photograph deserves on a photography company's homepage, the quote
 * set against it. Without one it stays the centred column it has always been,
 * so a quote typed into the console with no picture still looks deliberate.
 *
 * The attribution line is assembled rather than interpolated. It used to be
 * `{role}, {business}` in one expression, which reads correctly only when both
 * exist — the first real testimonial ARTINU received is from a visitor who is
 * neither a company nor a job title ("Siya's dad"), and that template renders
 * it as "Siya's dad, " with a comma dangling off the end.
 */
function TestimonialPanel({ entry }: { entry: Testimonial }) {
  const attribution = [entry.role, entry.business].map((part) => part?.trim()).filter(Boolean);

  const stars = entry.rating ? (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-label={`Rated ${entry.rating} out of 5`}
    >
      {Array.from({ length: Math.round(entry.rating) }, (_, i) => (
        <span key={i} className="text-bronze" aria-hidden>
          ★
        </span>
      ))}
    </div>
  ) : null;

  const credit = (
    <div className="flex items-center gap-3">
      {!entry.photo && (
        <div className="flex size-12 items-center justify-center rounded-full bg-bronze-soft text-sm font-medium text-bronze">
          {entry.avatar || initialsOf(entry.name)}
        </div>
      )}
      <div className="text-left">
        <p className="font-medium text-ink">{entry.name}</p>
        {attribution.length > 0 && (
          <p className="text-sm text-muted">{attribution.join(' · ')}</p>
        )}
      </div>
    </div>
  );

  if (!entry.photo) {
    return (
      <div className="mx-auto max-w-4xl">
        {stars && <div className="mb-8 flex justify-center">{stars}</div>}
        <blockquote className="mx-auto max-w-3xl text-center">
          {/* Matched to the sizes in the photograph variant above — a quote
              should not grow just because there is no portrait beside it. */}
          <p
            className={cn(
              'font-display text-ink',
              entry.quote.length > 280
                ? 'text-[1rem] leading-[1.6] sm:text-[1.125rem] lg:text-[1.3125rem]'
                : 'text-[1.1875rem] leading-[1.45] sm:text-[1.5rem] lg:text-[1.75rem]',
            )}
          >
            &ldquo;{entry.quote}&rdquo;
          </p>
          <footer className="mt-8 flex flex-col items-center gap-2">{credit}</footer>
        </blockquote>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-14">
      <Photo
        src={entry.photo}
        alt={entry.photoAlt || `${entry.name}, photographed with the ARTINU work they are describing`}
        ratio="aspect-[3/4]"
        thumbnail
        sizes="(max-width: 1024px) 80vw, 360px"
        className="photo-edge mx-auto w-full max-w-[19rem] rounded-lg shadow-frame lg:max-w-none"
      />

      <blockquote>
        {stars && <div className="mb-6">{stars}</div>}
        {/*
          Display type sized to the quote, not one size for every quote.

          These run from about 150 characters to about 500. Set at a single
          large size, the short one looks like a pull quote and the long one
          becomes a wall of serif that overruns the photograph beside it.

          Both steps sit smaller than display type normally would: a long,
          reflective quote read at 24px is a paragraph pretending to be a
          headline, and it stops being something you actually read. Looser
          leading carries the smaller size.
        */}
        <p
          className={cn(
            'font-display text-ink',
            // Never below 16px on a phone: that is the point where a browser
            // starts treating text as something to zoom rather than read.
            entry.quote.length > 280
              ? 'text-base leading-[1.6] sm:text-[1.0625rem] lg:text-[1.1875rem]'
              : 'text-[1.125rem] leading-[1.45] sm:text-[1.375rem] lg:text-[1.5rem]',
          )}
        >
          &ldquo;{entry.quote}&rdquo;
        </p>
        <footer className="mt-8">{credit}</footer>
      </blockquote>
    </div>
  );
}

function TestimonialsCarousel() {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);
  /*
    Three seconds is brisk for a rail that auto-advances, so somebody who asked
    their system for less motion gets the first quote and the dots to move
    through it themselves rather than a paragraph replaced under them mid-read.
  */
  const reduced = useReducedMotion();

  // The only source. Nothing is shown until a manager has entered real quotes.
  const { data: curated } = useQuery({
    queryKey: ['content', 'homepage_testimonials'],
    queryFn: () => contentService.getContent('homepage_testimonials'),
    staleTime: 5 * 60 * 1000,
  });

  const stored = curated?.data as Testimonial[] | null | undefined;
  const TESTIMONIALS = React.useMemo(
    () => (Array.isArray(stored) ? stored.filter((entry) => entry?.quote && entry?.name) : []),
    [stored],
  );

  React.useEffect(() => {
    // A timer that advances a one-item list re-renders the same quote forever.
    // `=== 0` let that through; `<= 1` is the real condition.
    if (!isPlaying || reduced || TESTIMONIALS.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isPlaying, reduced, TESTIMONIALS.length]);

  // Nothing curated yet — the section stays off the page rather than inventing
  // praise. An empty testimonials rail is not a bug, it is an honest homepage.
  if (TESTIMONIALS.length === 0) return null;

  // A shorter curated list must not leave the index past the end.
  const activeIndex = currentIndex % TESTIMONIALS.length;

  return (
    <Section tone="sand" size="compact" className="pt-0">
      <Container>
        <Reveal>
          <SectionHeading
            /* Not "What Our Clients Say" — the people this section quotes are
               not all clients. The first is a father who found his daughter's
               photograph framed on a café wall. */
            eyebrow="In their words"
            title={
              <>
                Real walls. Real <em className="editorial-italic">people</em>.
              </>
            }
            className="max-w-3xl"
          />
        </Reveal>

        <div
          className="relative mt-14"
          onMouseEnter={() => setIsPlaying(false)}
          onMouseLeave={() => setIsPlaying(true)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <TestimonialPanel entry={TESTIMONIALS[activeIndex]} />
            </motion.div>
          </AnimatePresence>

          {/*
            Navigation only when there is somewhere to navigate to.

            ARTINU has one real testimonial. A row of dots with a single dot,
            above a pair of arrows that both lead back to the quote already on
            screen, is three controls advertising that there is only one of
            something — which is the opposite of what the section is for.
          */}
          {TESTIMONIALS.length > 1 && (
            <>
              <div
                className="mt-10 flex justify-center gap-2"
                role="tablist"
                aria-label="Testimonial navigation"
              >
                {TESTIMONIALS.map((entry, index) => (
                  <button
                    key={entry.name + index}
                    onClick={() => setCurrentIndex(index)}
                    className={cn(
                      'h-2 w-2 rounded-full transition-all',
                      index === activeIndex ? 'w-8 bg-ink' : 'bg-line hover:bg-line-strong',
                    )}
                    role="tab"
                    aria-selected={index === activeIndex}
                    aria-label={`Go to testimonial ${index + 1}`}
                  />
                ))}
              </div>

              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() =>
                    setCurrentIndex((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)
                  }
                  className="flex size-10 items-center justify-center rounded-full border border-line bg-canvas text-ink transition-all hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40"
                  aria-label="Previous testimonial"
                >
                  <ArrowLeft className="size-5" />
                </button>
                <button
                  onClick={() => setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length)}
                  className="flex size-10 items-center justify-center rounded-full border border-line bg-canvas text-ink transition-all hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40"
                  aria-label="Next testimonial"
                >
                  <ArrowRight className="size-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </Container>
    </Section>
  );
}

// ── Collaborations (manager-controlled) ─────────────────────────────────────

/**
 * The cafés, restaurants and studios ARTINU works with.
 *
 * This was a marquee: the list doubled and animated from 0% to -50% forever.
 * Three problems, all visible on the homepage. The two copies shared their
 * React keys, so every card was rendered twice under the same id. The -50%
 * assumes the row is exactly twice the width of the original list, which the
 * `gap-6` between cards and the `px-4` on the track make untrue, so the loop
 * jumped. And a moving target cannot be clicked, which mattered the moment a
 * collaboration had somewhere to link to.
 *
 * A grid instead: fixed card proportions, one baseline for every name, one for
 * every line of description, and a card that reads as a card whether there are
 * eight collaborations or one.
 */
function CollaborationsSection() {
  const { data: cafes, isLoading } = useQuery({
    queryKey: ['content-manager', 'cafes', 'active'],
    queryFn: () => contentService.getActiveCafes(),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !cafes || cafes.length === 0) {
    return null;
  }

  return (
    <Section tone="soft">
      <Container>
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <SectionHeading
              eyebrow="Collaborations"
              title={
                <>
                  The places our work <em className="editorial-italic">lives</em>.
                </>
              }
              className="max-w-2xl"
            />
            <ArrowLink to="/spaces">Bring ARTINU to your space</ArrowLink>
          </div>
        </Reveal>

        {/*
          One collaboration is a spread; several are a grid.

          ARTINU works with one café today, and a lone card in a three-column
          grid left two thirds of the row empty — which reads as a grid waiting
          to be filled rather than as a partner being shown off. A single
          partner gets the photographs at a size worth looking at, with the
          details set beside them. The grid returns on its own at two.
        */}
        {cafes.length === 1 ? (
          <Reveal className="mt-14">
            <CollaborationCard cafe={cafes[0]} featured />
          </Reveal>
        ) : (
          <Stagger className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {cafes.map((cafe) => (
              <StaggerItem key={cafe.id}>
                <CollaborationCard cafe={cafe} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </Container>
    </Section>
  );
}

/**
 * Extra photographs for a partner, in the order they should be shown.
 *
 * The `cafes` table holds a single `photoUrl`, so a partner with three
 * photographs has nowhere to put the other two. Until it can, they ship with
 * the site and are matched by name here.
 *
 * Deliberately a short, obvious list rather than something clever: adding a
 * partner means dropping files into assets/source/partners, running
 * `npm run images`, and adding one line. The first entry is what the card shows
 * on load.
 */
const PARTNER_GALLERIES: { match: RegExp; images: string[]; website?: string }[] = [
  {
    match: /nib\s*(&|and)\s*nosh/i,
    /*
      The branded card first, because that is the one that says whose wall this
      is. Then the six individual prints hanging there — each is one
      photographer's work with their credit plate, which is the whole point of
      the collaboration — and finally the two wider shots that put those frames
      in the room.
    */
    images: [
      '/image/partners/nib-and-nosh-card-1024.webp',
      '/image/partners/nib-and-nosh-frame-1-1024.webp',
      '/image/partners/nib-and-nosh-frame-2-1024.webp',
      '/image/partners/nib-and-nosh-frame-3-1024.webp',
      '/image/partners/nib-and-nosh-frame-4-1024.webp',
      '/image/partners/nib-and-nosh-frame-5-1024.webp',
      '/image/partners/nib-and-nosh-frame-6-1024.webp',
      '/image/partners/nib-and-nosh-interior-1-1024.webp',
      '/image/partners/nib-and-nosh-interior-2-1024.webp',
    ],
    website: 'https://nibandnoshcafe.com',
  },
];

const partnerFor = (name: string) => PARTNER_GALLERIES.find((entry) => entry.match.test(name));

const galleryFor = (name: string): string[] => partnerFor(name)?.images ?? [];

/**
 * Where a partner card links, with the database winning.
 *
 * `cafes.website_url` is the real home for this and is what a manager edits.
 * The fallback exists because that column does not exist on every deployment
 * yet — migration 009 adds it — and until it does, `websiteUrl` comes back
 * undefined and the card renders as a dead tile with no way to reach the
 * partner at all.
 *
 * Only ever consulted when the row has nothing, so the moment the column is
 * there and a manager sets a URL, theirs is used and this is ignored. It is a
 * bridge, not a source of truth: a partner added through the console that is
 * not in the list above still behaves exactly as before.
 */
const websiteFor = (cafe: Cafe): string | null =>
  cafe.websiteUrl?.trim() || partnerFor(cafe.name)?.website || null;

/**
 * One collaboration.
 *
 * The card links out only when a manager has entered the partner's URL in
 * Console → Homepage → Collaborations. Without one it is a card and nothing
 * more: a plausible-looking URL assembled from the name would send visitors to
 * a stranger's website, and it is not the kind of mistake anyone would catch
 * from the homepage. (The comment that used to sit here guessed at
 * "nibbannosh.com" as its example. The real address is nibandnoshcafe.com —
 * which is exactly the point.)
 *
 * The description line under the name carries the partner's own address. That
 * is a collaborator's address, not ARTINU's — the requirement to publish no
 * address is about this company, and telling someone where the café that hangs
 * our work actually is helps them go and see it.
 *
 * ── The photographs ─────────────────────────────────────────────────────────
 *
 * `cafe.photoUrl` is one image, which is all the `cafes` table stores. Where a
 * partner has more photographs shipped with the site, the card cycles through
 * them in place — same frame, same size, no controls. `PARTNER_GALLERIES` below
 * is the map; it is a stopgap until the table can hold a gallery of its own.
 */
function CollaborationCard({ cafe, featured = false }: { cafe: Cafe; featured?: boolean }) {
  const href = websiteFor(cafe);

  const gallery = galleryFor(cafe.name);
  const [shot, setShot] = React.useState(0);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (gallery.length < 2 || reduced) return;
    const timer = setInterval(() => setShot((prev) => (prev + 1) % gallery.length), 4200);
    return () => clearInterval(timer);
  }, [gallery.length, reduced]);

  // Fall back to whatever the console has stored when there is no local set.
  const currentSrc = gallery.length > 0 ? gallery[shot % gallery.length] : cafe.photoUrl;

  // Shown rather than the raw URL: "nibandnoshcafe.com" reads as a destination,
  // "https://www.nibandnoshcafe.com/?utm=…" reads as a database field.
  const domain = React.useMemo(() => {
    if (!href) return null;
    try {
      return new URL(href).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }, [href]);

  const body = (
    <div
      className={cn(
        featured &&
          'grid items-center gap-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-14',
      )}
    >
      <div className="relative overflow-hidden rounded-lg">
        {/* One frame, one size. The photographs change inside it rather than the
            card resizing around them, which is why they are all generated at
            the same ratio. */}
        <Photo
          key={currentSrc}
          src={currentSrc}
          alt={`Framed ARTINU photographs on the wall at ${cafe.name}`}
          ratio="aspect-[4/5]"
          thumbnail
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="photo-edge rounded-lg animate-fade-in"
          imgClassName="transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
        />

        {/* Which of the partner's photographs is showing. Marks only, no
            controls — the card is a link, and a nested button inside it would
            be both a hit-target conflict and one more thing to explain. */}
        {gallery.length > 1 && (
          <div className="pointer-events-none absolute bottom-3 right-3 flex gap-1.5" aria-hidden>
            {gallery.map((src, i) => (
              <span
                key={src}
                className={cn(
                  'h-1 rounded-full transition-all duration-500',
                  i === shot % gallery.length ? 'w-4 bg-canvas' : 'w-1 bg-canvas/50',
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className={featured ? 'mt-2 md:mt-0' : 'mt-5'}>
        {featured && <p className="eyebrow mb-3">Where you can see the work</p>}
        {/*
          The arrow sits against the name, not off in the far corner.

          It used to be a bordered disc pushed to the right-hand edge of the
          card, far enough from the title that it read as decoration rather than
          as "this goes somewhere". Tucked in beside the name it does what an
          outbound arrow is for, and it slides on hover so the card says where
          it is going before you click it.
        */}
        <h3 className={cn(
          "flex items-baseline gap-1.5 font-display leading-snug text-ink",
          featured ? "text-2xl sm:text-3xl" : "text-xl",
        )}>
          <span className="min-w-0 truncate">{cafe.name}</span>
          {href && (
            <ArrowUpRight
              className="size-4 shrink-0 translate-y-px text-bronze transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          )}
        </h3>

        {cafe.description && <p className="prose-quiet mt-1.5 text-sm">{cafe.description}</p>}

        {domain && (
          <span className="mt-2 block font-label text-[0.6875rem] uppercase tracking-[0.14em] text-bronze underline decoration-bronze/30 underline-offset-4 transition-colors group-hover:decoration-bronze">
            {domain}
          </span>
        )}
      </div>
    </div>
  );

  if (!href) {
    return <article className="group">{body}</article>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-4 focus-visible:ring-offset-canvas-soft"
    >
      {body}
      <span className="sr-only">(opens {cafe.name} in a new tab)</span>
    </a>
  );
}

// ── Featured Collections Section (Manager-controlled) ─────────────────────────

/**
 * The photographs a manager has pinned to the homepage.
 *
 * A `featured_collections` row holds only a `collectionId` — a pointer at an
 * artwork. The section used to fetch those pointers and then render an
 * `ArtworkCardSkeleton` for each one, so a manager who featured six
 * photographs got six shimmering grey rectangles that never resolved into
 * anything: the loading state was the final state. The pointers are now
 * resolved into the real artworks and rendered as real cards, with the
 * lightbox the rest of the site uses.
 */
function FeaturedCollectionsSection() {
  const { data: collections, isLoading: loadingPointers } = useQuery({
    queryKey: ['content-manager', 'featured-collections', 'active'],
    queryFn: () => contentService.getActiveFeaturedCollections(),
    staleTime: 5 * 60 * 1000,
  });

  // `order` is what the console drag-and-drop writes; honour it here.
  const ids = React.useMemo(
    () =>
      (collections ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.collectionId)
        .filter(Boolean),
    [collections],
  );

  const { data: artworks, isLoading: loadingArtworks } = useQuery({
    queryKey: qk.gallery({ ids, pageSize: 24 }),
    queryFn: () => catalogService.gallery({ ids, pageSize: 24 }),
    enabled: ids.length > 0,
  });

  // Restore the manager's order — the gallery endpoint sorts by its own rules.
  const shown = React.useMemo(() => {
    const byId = new Map((artworks?.items ?? []).map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => !!item);
  }, [artworks, ids]);

  const lightbox = useLightbox(shown);

  if (loadingPointers || ids.length === 0) return null;

  return (
    <Section tone="soft">
      <Container>
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            {/* The eyebrow and the heading both read "Featured Collections",
                one directly above the other. */}
            <SectionHeading
              eyebrow="Featured"
              title="Photographs we are showing this month."
              className="max-w-2xl"
            />
            <ArrowLink to="/gallery">Browse the full gallery</ArrowLink>
          </div>
        </Reveal>

        <div className="mt-12">
          <ArtworkMasonry>
            {loadingArtworks
              ? ids.map((id, index) => <ArtworkCardSkeleton key={id} index={index} />)
              : shown.map((artwork, index) => (
                  <ArtworkCard
                    key={artwork.id}
                    artwork={artwork}
                    priority={index < 2}
                    showPrice={false}
                    onOpen={lightbox.open}
                  />
                ))}
          </ArtworkMasonry>
        </div>
      </Container>

      {lightbox.isOpen ? (
        <Lightbox
          artworks={shown}
          index={lightbox.index}
          onIndexChange={lightbox.setIndex}
          onClose={lightbox.close}
        />
      ) : null}
    </Section>
  );
}

/*
 * `CollaboratedSpacesCarousel` was removed.
 *
 * It was a second collaborations rail sitting directly beneath the grid above,
 * hardcoded with six named businesses — Blue Tokai, Third Wave Coffee,
 * Starbucks Reserve among them — over stock Unsplash photographs. None of it
 * came from the database, which meant the homepage claimed partnerships with
 * real, identifiable companies that ARTINU may never have worked with, and no
 * manager could correct it without a deploy.
 *
 * <CollaborationsSection /> above already renders this from the `cafes`
 * table, which the console can add to, edit, reorder and hide, and which the
 * artist workspace reads from too (requirements §7, §24, §40).
 */

export default function HomePage() {
  const { data: featured, isLoading } = useQuery({
    queryKey: qk.gallery({ sort: 'popular', pageSize: 8 }),
    queryFn: () => catalogService.gallery({ sort: 'popular', pageSize: 8 }),
  });

  const shown = featured?.items ?? [];
  const lightbox = useLightbox(shown);

  return (
    <>
      <PhotographerShowcaseHero />

      <Section tone="soft" size="compact">
        <Container size="prose" className="text-center">
          <blockquote className="mb-6">
            <p className="font-display text-xl md:text-2xl text-ink leading-relaxed">
              "Art is not what you see, but what you make others see."
            </p>
            <footer className="mt-3 text-sm font-medium tracking-wide text-subtle">
              — Edgar Degas
            </footer>
          </blockquote>
        </Container>
      </Section>

      {/* ── What is Artinu? ───────────────────────────────────────────── */}
      <Section tone="canvas" size="compact">
        <Container>
          <Reveal>
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
              <div>
                <p className="eyebrow">WHAT IS ARTINU</p>
                <h2 className="mt-4 font-display text-[2rem] leading-[1.1] text-ink sm:text-[2.75rem]">
                  Purely an art of exhibit.
                </h2>
                <p className="prose-quiet mt-5">
                  Over 95% of artworks purchased for curation are displayed without us knowing who the
                  artist behind them is. Hardly do we find the artist&rsquo;s name, signature, or story
                  alongside the artwork.
                </p>
                <p className="prose-quiet mt-4">
                  Artinu is a platform where artworks are curated with proper recognition of the artists
                  behind them. Every artwork can carry the artist&rsquo;s details, allowing you to discover
                  their work, learn about them, and connect with them.
                </p>
                <p className="mt-8 font-display text-2xl italic text-ink sm:text-3xl">
                  We turn walls into stories.
                </p>
              </div>
              <Photo
                src="/image/what-is-artinu.webp"
                alt="A framed artwork curated by Artinu"
                ratio="aspect-square"
                className="rounded-xl photo-edge"
              />
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ── The Artinu cycle ──────────────────────────────────────────── */}
      <Section tone="canvas" size="compact">
        <Container>
          <Reveal>
            <p className="eyebrow text-center">THE ARTINU MODEL</p>
            <h2 className="mt-5 text-center text-[2rem] leading-[1.08] text-ink sm:text-[2.75rem]">
              Art doesn&rsquo;t have to stay in one place.
            </h2>
            <p className="prose-quiet mx-auto mt-6 max-w-2xl text-center">
              We don&rsquo;t sell artworks. We give them a place to be seen, and after a while make
              room for another story.
            </p>
          </Reveal>

          <div className="relative mt-12 lg:mt-16">
            {/* One continuous line — flows through the cycle, then curves back to CURATE (desktop) */}
            <svg
              className="pointer-events-none absolute inset-x-0 -top-7 hidden h-11 w-full lg:block"
              viewBox="0 0 1200 48"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d="M 80 26
                   C 140 10, 200 42, 260 28
                   C 320 14, 380 42, 440 28
                   C 500 14, 560 42, 620 28
                   C 680 14, 740 42, 800 28
                   C 860 14, 920 42, 980 28
                   C 1020 20, 1100 26, 1100 38
                   C 1100 44, 1088 44, 1078 42
                   C 1040 34, 1000 20, 900 12
                   C 700 2, 400 2, 200 10
                   C 140 12, 90 16, 80 22
                   C 76 24, 78 26, 80 26
                   Z"
                stroke="var(--color-line-strong)"
                strokeWidth="1"
              />
              <path
                d="M 84 22 l 6 -9 m -6 9 l 9 2"
                stroke="var(--color-bronze)"
                strokeWidth="1.3"
              />
            </svg>

            <Stagger className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_2rem_1fr_2rem_0.9fr_2rem_1fr_2rem_1fr] lg:items-start lg:gap-0">
              <StaggerItem className="text-center">
                <p className="font-display text-5xl leading-none text-bronze/50">01</p>
                <p className="eyebrow mt-4">Curate</p>
                <p className="prose-quiet mt-2">An artwork is chosen for the space.</p>
              </StaggerItem>
              <StaggerItem className="relative mx-auto h-8 w-px bg-line-strong lg:h-px lg:w-10">
                <ChevronDown className="absolute -bottom-3 left-1/2 -translate-x-1/2 size-4 text-bronze lg:hidden" aria-hidden />
                <ChevronRight className="absolute -right-3 top-1/2 hidden -translate-y-1/2 size-4 text-bronze lg:block" aria-hidden />
              </StaggerItem>
              <StaggerItem className="text-center">
                <p className="font-display text-5xl leading-none text-bronze/50">02</p>
                <p className="eyebrow mt-4">Exhibit</p>
                <p className="prose-quiet mt-2">
                  It moves from a photographer&rsquo;s screen to a real wall.
                </p>
              </StaggerItem>
              <StaggerItem className="relative mx-auto h-8 w-px bg-line-strong lg:h-px lg:w-10">
                <ChevronDown className="absolute -bottom-3 left-1/2 -translate-x-1/2 size-4 text-bronze lg:hidden" aria-hidden />
                <ChevronRight className="absolute -right-3 top-1/2 hidden -translate-y-1/2 size-4 text-bronze lg:block" aria-hidden />
              </StaggerItem>
              <StaggerItem className="relative mx-auto w-full max-w-[13rem] sm:max-w-[14rem] lg:max-w-[15rem]">
                <Photo
                  src="/image/artinu-model.webp"
                  alt="An artwork on display in a real space"
                  ratio="aspect-[4/5]"
                  className="-rotate-1 rounded-sm shadow-frame photo-edge"
                />
                <p className="mt-4 text-center font-label text-[0.6875rem] uppercase tracking-[0.16em] text-subtle">
                  A collection in rotation
                </p>
              </StaggerItem>
              <StaggerItem className="relative mx-auto h-8 w-px bg-line-strong lg:h-px lg:w-10">
                <ChevronDown className="absolute -bottom-3 left-1/2 -translate-x-1/2 size-4 text-bronze lg:hidden" aria-hidden />
                <ChevronRight className="absolute -right-3 top-1/2 hidden -translate-y-1/2 size-4 text-bronze lg:block" aria-hidden />
              </StaggerItem>
              <StaggerItem className="text-center">
                <p className="font-display text-5xl leading-none text-bronze/50">03</p>
                <p className="eyebrow mt-4">Experience</p>
                <p className="prose-quiet mt-2">
                  People live around it, notice it, photograph it, and connect with the story behind it.
                </p>
              </StaggerItem>
              <StaggerItem className="relative mx-auto h-8 w-px bg-line-strong lg:h-px lg:w-10">
                <ChevronDown className="absolute -bottom-3 left-1/2 -translate-x-1/2 size-4 text-bronze lg:hidden" aria-hidden />
                <ChevronRight className="absolute -right-3 top-1/2 hidden -translate-y-1/2 size-4 text-bronze lg:block" aria-hidden />
              </StaggerItem>
              <StaggerItem className="text-center">
                <p className="font-display text-5xl leading-none text-bronze/50">04</p>
                <p className="eyebrow mt-4">Rotate</p>
                <p className="prose-quiet mt-2">
                  After 1–3 months, it makes room for another artwork.
                </p>
                <p className="eyebrow mt-7 text-bronze">Why rotate?</p>
                <p className="prose-quiet mx-auto mt-2 max-w-[16rem]">
                  A wall people see every day fades into the background. Rotation brings the artwork
                  back into the room, and gives someone new a chance to be seen.
                </p>
              </StaggerItem>
            </Stagger>

            <div className="mt-10 flex items-center justify-center gap-3 text-bronze">
              <RotateCcw className="size-5" aria-hidden />
              <p className="font-label text-[0.6875rem] uppercase tracking-[0.16em]">
                The cycle continues, back to curate
              </p>
            </div>

            {/* The cycle, complete */}
            <Reveal className="mx-auto mt-12 max-w-2xl text-center">
              <p className="prose-quiet mx-auto max-w-xl">
                An artwork gets its moment on the wall, then the wall makes room for another, and
                someone new gets seen.
              </p>
              <p className="mt-6 font-display text-2xl italic text-ink sm:text-3xl">
                More artists get a moment. More spaces get a new atmosphere.
              </p>
            </Reveal>
          </div>
        </Container>
      </Section>

      <SpacesWeTransform />

      <CollaborationsSection />

      <div
        className="py-16 sm:py-24"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(20, 18, 15, 0.55) 0%, rgba(20, 18, 15, 0.25) 50%, rgba(20, 18, 15, 0) 100%), url(/image/quote-section-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Container className="text-left">
          <blockquote className="max-w-2xl">
            <p className="font-display text-2xl md:text-4xl text-white leading-relaxed">
              "In every friendship group, there is always one friend chasing sunsets, climbing rooftops, and capturing moments.{" "}
              <span className="text-[#f2c14e]">Artinu was built for that friend.</span>"
            </p>
          </blockquote>
        </Container>
      </div>

      <FeaturedCollectionsSection />

      <TestimonialsCarousel />

      {lightbox.isOpen ? (
        <Lightbox
          artworks={shown}
          index={lightbox.index}
          onIndexChange={lightbox.setIndex}
          onClose={lightbox.close}
        />
      ) : null}

      <CtaBand
        eyebrow="Let's talk"
        title={
          <>
            Let&rsquo;s bring your space
            <br className="hidden sm:block" /> to life.
          </>
        }
        description="Tell us about your walls. We'll curate a collection, frame it, hang it, and keep it fresh."
        primary={{ label: 'Book a consultation', to: '/lets-talk' }}
        secondary={{ label: 'Explore the gallery', to: '/gallery' }}
        image={IMAGES.gallerywall}
      />
    </>
  );
}
