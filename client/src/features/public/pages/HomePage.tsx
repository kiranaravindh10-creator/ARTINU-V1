import { SPACE_TYPE_LABELS, SPACE_TYPES } from '@artinu/shared';
import {
  ArrowRight,
  ArrowLeft,
  BedDouble,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Coffee,
  Frame,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Stethoscope,
  Tag,
  Users,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLink, Container, Section, SectionHeading, StepIcon } from '@/components/layout/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
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
import { contentService } from '@/services/content.service';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { preloadImage, getBlurPlaceholderSync } from '@/lib/imageOptimization';

const ADVANTAGES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Frame,
    title: 'Elevate Ambience',
    body: 'High-quality photography that complements your space and creates a lasting impression.',
  },
  {
    icon: RefreshCw,
    title: 'Rotating, Always Fresh',
    body: 'New perspectives every 1–3 months keep your space dynamic and engaging.',
  },
  {
    icon: Tag,
    title: 'Zero Upfront Cost',
    body: 'Enjoy premium wall art without the cost of buying or owning it.',
  },
  {
    icon: Wrench,
    title: 'We Handle Everything',
    body: 'Curation, framing, installation, rotation and maintenance—all taken care of by us.',
  },
];

const STEPS: { number: string; title: string; body: string; icon: LucideIcon }[] = [
  {
    number: '01',
    title: 'Understand',
    body: 'We learn about your space, style and goals.',
    icon: MessageCircle,
  },
  {
    number: '02',
    title: 'Curate',
    body: 'We curate a collection that fits your space perfectly.',
    icon: ImageIcon,
  },
  {
    number: '03',
    title: 'Install',
    body: 'Our team delivers and installs everything with care.',
    icon: PackageOpen,
  },
  {
    number: '04',
    title: 'Rotate',
    body: 'Every 1–3 months, we refresh your space with new photographs.',
    icon: RefreshCw,
  },
  {
    number: '05',
    title: 'Enjoy',
    body: 'You enjoy the impact. We take care of the rest.',
    icon: Heart,
  },
];

const SPACE_TILES = ['cafe', 'office', 'restaurant', 'hotel', 'home_decor', 'clinic'] as const;

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
  business: string;
  role: string;
  quote: string;
  rating?: number;
  avatar?: string;
}

/** Initials for the avatar disc, derived rather than stored alongside the name. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

function PhotographerShowcaseHero() {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);

  // Fetch active hero slides from the new content manager API
  const { data: heroSlides, isLoading } = useQuery({
    queryKey: ['content-manager', 'hero-slides', 'active'],
    queryFn: () => contentService.getActiveHeroSlides(),
  });

  // Preload first 3 hero images on mount
  React.useEffect(() => {
    if (!heroSlides || heroSlides.length === 0) return;

    const urlsToPreload = heroSlides
      .slice(0, 3)
      .map((slide) => slide.imageUrl)
      .filter((url, idx, arr) => arr.indexOf(url) === idx);

    urlsToPreload.forEach((url) => {
      const link = preloadImage(url);
      if (!document.querySelector(`link[href="${link.href}"]`)) {
        document.head.appendChild(link);
      }
    });

    return () => {
      urlsToPreload.forEach((url) => {
        const existing = document.querySelector(`link[href="${url}"]`);
        if (existing) existing.remove();
      });
    };
  }, [heroSlides]);

  // Auto-advance every 6 seconds (Netflix-style)
  React.useEffect(() => {
    if (!isPlaying || !heroSlides || heroSlides.length === 0 || isHovered) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % heroSlides.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [isPlaying, heroSlides?.length, isHovered]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(false);
  };

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + (heroSlides?.length ?? 0)) % (heroSlides?.length ?? 0));
    setIsPlaying(false);
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % (heroSlides?.length ?? 0));
    setIsPlaying(false);
  };

  // Genuinely still fetching: a quiet dark panel, no words. It is on screen for
  // a moment and "Loading showcase…" in 56px type is a worse first impression
  // than silence.
  if (isLoading) {
    return (
      <section
        className="relative h-[100vh] bg-ink"
        role="status"
        aria-label="Loading the featured collection"
      >
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-ink to-ink-soft/40" />
      </section>
    );
  }

  /*
    No curated slides. This branch used to share the loading branch above, so an
    empty `hero_slides` table rendered "Loading showcase…" forever — the first
    thing every visitor saw was a full-screen black void that never resolved.
    Conflating "empty" with "loading" is the same bug as a list that says "no
    results" when the request failed, except here it is the homepage.

    A real editorial hero instead: it says what ARTINU does and where to go, and
    the carousel takes over the moment a manager adds slides.
  */
  if (!heroSlides || heroSlides.length === 0) {
    return (
      <section className="relative h-[100vh] w-full overflow-hidden bg-ink">
        <Photo
          src={IMAGES.restaurantWarm}
          alt="Warm-lit interior with framed photographs above the seating"
          priority
          // Without this the srcSet is never built, so a 390px phone downloads
          // the same 1600px file a desktop does.
          hero
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
          <h1 className="mt-5 max-w-[18ch] font-display text-[2rem] leading-[1.06] text-canvas sm:text-[3rem] lg:text-[3.75rem]">
            Art that changes with your space.
          </h1>
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

  const currentSlide = heroSlides[currentIndex];
  const total = heroSlides.length;

  const isFirstSlide = currentIndex === 0;
  const heroSrc = currentSlide.imageUrl;
  const heroBlurPlaceholder = getBlurPlaceholderSync(heroSrc);

  return (
    <section
      className="relative h-[100vh] w-full flex flex-col overflow-hidden bg-ink select-none"
      onMouseEnter={() => { setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); setIsPlaying(true); }}
    >
      {/* Top 80%: Main Hero Image */}
      <div className="relative h-[80vh] w-full overflow-hidden bg-ink z-0">
        <AnimatePresence>
          <motion.div
            key={`bg-${currentSlide.id}`}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: 1.05 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{
              opacity: { duration: 1.2, ease: 'easeInOut' },
              scale: { duration: 20, ease: 'linear' },
            }}
            className="absolute inset-0 origin-center"
          >
            <Photo
              src={heroSrc}
              alt={`Hero slide ${currentIndex + 1}`}
              hero
              priority={isFirstSlide}
              blurPlaceholder={heroBlurPlaceholder}
              className="absolute inset-0 w-full h-full"
              imgClassName="w-full h-full object-cover object-center"
            />
          </motion.div>
        </AnimatePresence>
        
        {/* Subtle gradient to anchor the top 80% to the bottom strip */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-black/10 z-10 mix-blend-multiply pointer-events-none" />
      </div>

      {/* Bottom 20%: Control Strip */}
      <div className="relative h-[20vh] min-h-[140px] w-full flex flex-row bg-ink z-20 border-t border-white/10">
        
        {/* Left Half: Navigation & Caption */}
        <div className="w-1/2 h-full flex flex-col justify-center px-6 md:px-12 lg:px-16 border-r border-white/10">
          <div className="flex flex-col justify-center gap-4 w-full max-w-xl mx-auto xl:mx-0">
            
            {/* Upper row: Thumbnails and Nav Arrows aligned on the same horizontal baseline */}
            <div className="flex items-center justify-between">
              {/* Thumbnails */}
              <div className="flex items-center gap-3 overflow-hidden shrink-0">
                {heroSlides.map((slide, i) => {
                  let offset = i - currentIndex;
                  if (offset > total / 2) offset -= total;
                  if (offset < -total / 2) offset += total;
                  
                  // Show current and next few images
                  if (offset < 0 || offset > 4) return null;
                  
                  const isActive = offset === 0;

                  return (
                    <motion.button
                      key={slide.id}
                      onClick={() => goToSlide(i)}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ 
                        opacity: isActive ? 1 : 0.4, 
                        x: 0,
                      }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={cn(
                        "relative rounded-sm overflow-hidden flex-shrink-0 transition-all cursor-pointer w-[72px] h-[48px] sm:w-[90px] sm:h-[60px]",
                        isActive ? "ring-2 ring-white/80 ring-offset-2 ring-offset-ink" : "hover:opacity-80"
                      )}
                    >
                      <Photo
                        src={slide.imageUrl}
                        alt={`Slide ${i + 1}`}
                        thumbnail
                        className="w-full h-full"
                        imgClassName="w-full h-full object-cover"
                      />
                    </motion.button>
                  );
                })}
              </div>

              {/* Nav arrows anchored to the right of the thumbnail block */}
              <div className="flex items-center gap-2 shrink-0 ml-4 hidden sm:flex">
                <button
                  onClick={goPrev}
                  className="flex size-9 items-center justify-center rounded-full bg-white/5 text-white transition-all hover:bg-white/15 focus-visible:outline-none"
                  aria-label="Previous artwork"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <button
                  onClick={goNext}
                  className="flex size-9 items-center justify-center rounded-full bg-white/5 text-white transition-all hover:bg-white/15 focus-visible:outline-none"
                  aria-label="Next artwork"
                >
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>

            {/* Lower row: Caption locked to the left edge of the thumbnails */}
            <div className="flex items-center justify-between">
              <p className="text-white text-xs sm:text-sm tracking-wide flex items-center gap-3">
                <span className="font-semibold text-white/90">Slide {currentIndex + 1} of {total}</span>
                {/* Credit only where there is a real name to credit. This used
                    to print eight characters of the photographer's UUID. */}
                {currentSlide.photographerName ? (
                  <>
                    <span className="text-white/30">|</span>
                    <span className="text-white/60 font-light truncate max-w-[150px] sm:max-w-[300px]">
                      Photograph by {currentSlide.photographerName}
                    </span>
                  </>
                ) : null}
              </p>
              
              {/* Mobile nav arrows (shown below thumbnails if screen is too small) */}
              <div className="flex items-center gap-2 shrink-0 sm:hidden">
                <button onClick={goPrev} className="flex size-8 items-center justify-center rounded-full bg-white/5 text-white"><ArrowLeft className="size-3.5" /></button>
                <button onClick={goNext} className="flex size-8 items-center justify-center rounded-full bg-white/5 text-white"><ArrowRight className="size-3.5" /></button>
              </div>
            </div>

          </div>
        </div>

        {/* Right Half: Etched Text Transition */}
        <div className="w-1/2 h-full flex items-center px-6 md:px-12 lg:px-16 relative overflow-hidden bg-ink">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide.id}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-6 md:left-12 lg:left-16 right-6 md:right-12 lg:right-16 flex items-center"
            >
              <span 
                className="font-display text-[clamp(1.5rem,3.5vw,4rem)] leading-tight text-transparent opacity-80 break-words line-clamp-2 w-full"
                style={{ WebkitTextStroke: '1px rgba(255,255,255,0.3)' }}
              >
                FEATURED COLLECTION
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function SpacesWeTransform() {
  /*
   * Each tile used to carry a `count` — "34 offices transformed", "28
   * restaurants transformed" — revealed on hover. The numbers were written by
   * hand and matched nothing in the database; the office figure was the largest
   * on the page and ARTINU has fewer offices than cafés. Invented traction is
   * the one claim a space owner can check, so the hover now reveals the
   * invitation the tile actually leads to (requirements §50).
   */
  const spaceCategories = [
    { type: 'cafe', icon: Coffee, description: 'Warm corners for conversation' },
    { type: 'office', icon: Briefcase, description: 'Inspiring work environments' },
    { type: 'restaurant', icon: UtensilsCrossed, description: 'Memorable dining experiences' },
    { type: 'hotel', icon: BedDouble, description: 'Welcoming guest spaces' },
    { type: 'home_decor', icon: Users, description: 'Creative community hubs' },
  ] as const;

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

        <motion.div 
           className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-5"
           initial="hidden"
           whileInView="visible"
           viewport={{ once: true, margin: "-100px" }}
           variants={{
             visible: { transition: { staggerChildren: 0.1 } },
             hidden: {}
           }}
        >
{spaceCategories.map((category, index) => (
                <motion.div key={category.type} variants={{
                   hidden: { opacity: 0, y: 40 },
                   visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
                }}>
                  <Link
                    to={`/lets-talk?type=${category.type}`}
                    className="group relative block overflow-hidden rounded-xl bg-ink h-[320px] sm:h-[400px] transition-all duration-700 hover:shadow-lifted will-change-transform"
                  >
                    <div className="absolute inset-0 z-0 overflow-hidden bg-ink">
                      <motion.div 
                         className="w-full h-[120%]"
                         whileHover={{ y: "-10%" }}
                         transition={{ duration: 0.8, ease: "easeOut" }}
                      >
                        <Photo
                          src={SPACE_TYPE_IMAGES[category.type] ?? IMAGES.cafeInterior}
                          alt={SPACE_TYPE_LABELS[category.type]}
                          priority={index < 2}
                          className="w-full h-full"
                          imgClassName="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-[1.03]"
                        />
                      </motion.div>
                    </div>
                
                <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent z-10 pointer-events-none transition-opacity duration-500 group-hover:opacity-80" />

                <div className="absolute inset-0 z-20 flex flex-col justify-end p-6 pointer-events-none">
                   <div className="flex items-center gap-3 mb-2">
                     <div className="flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                       <category.icon className="size-5 text-white" aria-hidden />
                     </div>
                     <h3 className="font-display text-2xl text-white drop-shadow-md">{SPACE_TYPE_LABELS[category.type]}</h3>
                   </div>
                   <p className="text-sm text-white/80 mb-4 drop-shadow-md">{category.description}</p>
                   
                   {/* Reveal on hover */}
                   <div className="overflow-hidden">
                     <div className="translate-y-[120%] opacity-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 group-hover:opacity-100 flex items-center gap-2 text-bronze text-sm font-medium">
                        <span className="w-4 h-[1px] bg-bronze" />
                        Book a consultation
                     </div>
                   </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </Section>
  );
}

function TestimonialsCarousel() {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);

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
    if (!isPlaying || TESTIMONIALS.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isPlaying, TESTIMONIALS.length]);

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
            eyebrow="What Our Clients Say"
            title="Real spaces. Real stories."
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
              <div className="max-w-4xl mx-auto">
                {/* The stored rating, not a decorative five. A quote with no
                    rating shows no stars rather than being awarded them. */}
                {TESTIMONIALS[activeIndex].rating ? (
                  <div
                    className="flex flex-wrap items-center justify-center gap-1.5 mb-8"
                    aria-label={`Rated ${TESTIMONIALS[activeIndex].rating} out of 5`}
                  >
                    {Array.from(
                      { length: Math.round(TESTIMONIALS[activeIndex].rating ?? 0) },
                      (_, i) => (
                        <span key={i} className="text-bronze" aria-hidden>
                          ★
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
                <blockquote className="text-center max-w-3xl mx-auto">
                  <p className="font-display text-[1.5rem] leading-[1.3] text-ink sm:text-[2rem] lg:text-[2.5rem]">
                    &ldquo;{TESTIMONIALS[activeIndex].quote}&rdquo;
                  </p>
                  <footer className="mt-8 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-full bg-bronze-soft text-bronze font-medium text-sm">
                        {TESTIMONIALS[activeIndex].avatar ||
                          initialsOf(TESTIMONIALS[activeIndex].name)}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-ink">{TESTIMONIALS[activeIndex].name}</p>
                        <p className="text-sm text-muted">{TESTIMONIALS[activeIndex].role}, {TESTIMONIALS[activeIndex].business}</p>
                      </div>
                    </div>
                  </footer>
                </blockquote>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-center gap-2 mt-10" role="tablist" aria-label="Testimonial navigation">
            {TESTIMONIALS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  index === activeIndex ? 'w-8 bg-ink' : 'bg-line hover:bg-line-strong'
                )}
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`Go to testimonial ${index + 1}`}
              />
            ))}
          </div>

          <div className="flex justify-center gap-3 mt-6">
            <button
              onClick={() => setCurrentIndex((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
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
        </div>
      </Container>
    </Section>
  );
}

// ── Cafe Section (Manager-controlled) ───────────────────────────────────────

function CafeSection() {
  const { data: cafes, isLoading } = useQuery({
    queryKey: ['content-manager', 'cafes', 'active'],
    queryFn: () => contentService.getActiveCafes(),
  });

  if (isLoading || !cafes || cafes.length === 0) {
    return null;
  }

  return (
    <Section tone="canvas" className="py-24">
      <Container className="mb-10 text-center">
        <Reveal>
          <SectionHeading
            eyebrow="Spaces we curate"
            title="Our Café Collaborations"
            className="mx-auto"
          />
        </Reveal>
      </Container>
      <div className="relative flex w-full overflow-hidden">
        <motion.div
          className="flex gap-6 px-4"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ ease: 'linear', duration: 25, repeat: Infinity }}
        >
          {/* Double the list to loop seamlessly */}
          {[...cafes, ...cafes].map((cafe, i) => (
            <div key={cafe.id} className="group relative w-64 h-80 shrink-0 overflow-hidden rounded-xl">
              <Photo
                src={cafe.photoUrl}
                alt={cafe.name}
                thumbnail
                className="absolute inset-0 h-full w-full"
                imgClassName="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-80" />
              <div className="absolute bottom-6 left-6 right-6">
                <p className="font-display text-lg text-canvas">{cafe.name}</p>
                <p className="mt-1 text-xs text-canvas/70 line-clamp-1">{cafe.description}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </Section>
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
            <SectionHeading
              eyebrow="Featured Collections"
              title="Featured Collections."
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
 * It was a second collaborations rail sitting directly beneath <CafeSection />,
 * hardcoded with six named businesses — Blue Tokai, Third Wave Coffee,
 * Starbucks Reserve among them — over stock Unsplash photographs. None of it
 * came from the database, which meant the homepage claimed partnerships with
 * real, identifiable companies that ARTINU may never have worked with, and no
 * manager could correct it without a deploy.
 *
 * <CafeSection /> above already renders this exact design from the `cafes`
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
                priority
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
              We don&rsquo;t sell artworks. We give them a place to be seen — and, after a while, make
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
                  priority
                  className="-rotate-1 rounded-sm shadow-frame photo-edge"
                />
                <p className="mt-4 text-center font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-subtle">
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
                  back into the room — and gives someone new a chance to be seen.
                </p>
              </StaggerItem>
            </Stagger>

            <div className="mt-10 flex items-center justify-center gap-3 text-bronze">
              <RotateCcw className="size-5" aria-hidden />
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]">
                The cycle continues — back to curate
              </p>
            </div>

            {/* The cycle, complete */}
            <Reveal className="mx-auto mt-12 max-w-2xl text-center">
              <p className="prose-quiet mx-auto max-w-xl">
                An artwork gets its moment on the wall, then the wall makes room for another — and
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

      <CafeSection />

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

const TILE_ICONS: Partial<Record<(typeof SPACE_TYPES)[number], LucideIcon>> = {
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  hotel: BedDouble,
  office: Briefcase,
  home_decor: Users,
  clinic: Stethoscope,
};

function SpaceTileIcon({ type }: { type: (typeof SPACE_TYPES)[number] }) {
  const Icon = TILE_ICONS[type] ?? Frame;
  return <Icon className="size-6 stroke-[1.2] text-white" aria-hidden />;
}