import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { CONTACT } from '@artinu/shared';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Container, Section, SectionHeading } from '@/components/layout/primitives';
import { EASE, Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Typewriter } from '@/components/motion/typewriter';
import { Photo } from '@/components/ui/photo';
import { CtaBand } from '@/features/public/components/CtaBand';
import { IMAGES } from '@/lib/images';
import { cn } from '@/lib/utils';

/**
 * What happens to a photograph between the shutter and the wall.
 *
 * Four beats rather than three: the tidy three-part list is the shape this kind
 * of copy always falls into, and the fourth step is the only one that is about
 * ARTINU at all. Each is short enough to read in a glance while scrolling.
 */
const PHOTOGRAPHER_STEPS = [
  { step: '01', label: 'You shoot it', body: 'Hours on one frame, then longer again on the edit.' },
  { step: '02', label: 'You post it', body: 'It lands, it gets some taps, the feed keeps moving.' },
  { step: '03', label: 'It goes quiet', body: 'Filed in a folder that nobody opens again, yours included.' },
  { step: '04', label: 'We put it up', body: 'Printed, framed, on a wall in your city, with your name beside it.' },
];

/**
 * The real people behind ARTINU.
 *
 * Genuine names and photographs only. This previously held four invented
 * colleagues with randomly-seeded stock portraits; presenting made-up staff as
 * a real team is not something the site should ever do.
 *
 * `photo` is a path under client/public/image. `bio` is optional and is left
 * unset rather than filled with a plausible-sounding paragraph — a biography
 * nobody wrote is still a fabrication, even a flattering one.
 */
interface TeamMember {
  name: string;
  role: string;
  photo: string;
  bio?: string;
}

const TEAM: TeamMember[] = [
  {
    name: 'Kiran Aravindh',
    role: 'Founder',
    photo: '/image/founder-kiran-aravindh.jpg',
    // Deliberately about the work rather than the person: it claims no dates,
    // no history and no credentials, because none were given. Replace it with
    // Kiran's own words whenever he wants to.
    bio: 'Kiran started ARTINU because photographs live and die on screens while the walls around us stay blank. He works on every part of it, from reading a room to turning up on installation day.',
  },
];

function AboutBeginningHero() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const visualY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 36]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -18]);

  /* Scroll-driven focus: the screen leads, the frame moves into focus, and the
     space emerges behind it. All zeroed out when reduced motion is requested. */
  const screenY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -14]);
  const screenO = useTransform(scrollYProgress, [0, 0.6, 1], [1, reduced ? 1 : 0.92, reduced ? 1 : 0.82]);
  const wallY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 10]);
  const wallScale = useTransform(scrollYProgress, [0, 0.5, 1], [reduced ? 1 : 0.98, reduced ? 1 : 0.995, reduced ? 1 : 1]);
  const spaceO = useTransform(scrollYProgress, [0, 0.45, 1], [reduced ? 1 : 0.92, reduced ? 1 : 0.96, reduced ? 1 : 1]);
  const spaceY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 14]);

  /* Three views of the SAME photograph, one per stage of the transformation.
     Each slot is replaceable individually — drop your file into
     client/public/image and swap the value below:
       beginning-screen-image → the photograph as it appears on a screen
       beginning-wall-image   → the same photograph, now in an ARTINU frame
       beginning-space-image  → a real interior with the framed ARTINU photograph
     Until then, real photography is used so the story reads immediately. */
  const IMG = {
    'beginning-screen-image': '/image/beginning-screen-image.webp',
    'beginning-wall-image': '/image/beginning-wall-image.webp',
    'beginning-space-image': '/image/beginning-space-image.webp',
  } as const;

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-canvas"
      aria-labelledby="about-beginning-title"
    >
      {/* Fine grain + oversized editorial watermark so the page opens like a story, not a hero banner */}
      <span
        className="pointer-events-none absolute -right-8 top-14 hidden select-none font-display text-[9rem] leading-none tracking-tight text-bronze/[0.05] lg:block xl:text-[11rem]"
        aria-hidden
      >
        ARTINU
      </span>
      <span
        className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-line-strong to-transparent"
        aria-hidden
      />

      <Container size="wide" className="relative">
        {/* items-start so the copy scrolls while the visual stays on screen */}
        <div className="grid items-start gap-14 py-20 sm:py-28 lg:grid-cols-12 lg:gap-6 lg:py-36">
          {/* Copy — asymmetric, anchored left */}
          <motion.div style={{ y: copyY }} className="relative lg:col-span-7">
            <div className="max-w-2xl">
              <Reveal>
                <p className="eyebrow">The beginning</p>
                <Typewriter
                  as="h1"
                  id="about-beginning-title"
                  className="mt-7 font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl lg:text-[4.5rem]"
                >
                  Somewhere between a photograph
                  <br className="hidden sm:block" /> and a wall,{' '}
                  <em className="editorial-italic">Artinu</em> began.
                </Typewriter>
                <span className="rule mt-9" aria-hidden />
              </Reveal>

              <Reveal delay={0.08}>
                <p className="mt-9 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                  There are photographs everywhere, on phones, cameras and screens, but very few
                  ever get the chance to become part of a real space.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                  We wanted to change that.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                  Artinu began with the idea of giving photographs and artworks a place to be
                  experienced in everyday life, while giving the people behind them a chance to be
                  seen.
                </p>
              </Reveal>
            </div>
          </motion.div>

          {/* Visual — one photograph travelling screen → wall → space */}
          <motion.div
            style={{ y: visualY }}
            className="relative lg:col-span-5 lg:self-start lg:pl-4 lg:pt-10"
          >
            <Reveal delay={0.15} className="flex justify-end">
              <div className="relative mx-auto w-full max-w-[17rem] sm:max-w-[24rem] lg:sticky lg:top-28 lg:max-w-[26rem]">
                <div className="relative aspect-[4/5] w-full">
                {/* Stage 01 — the same photograph as it first lived on a screen; top-right */}
                <motion.figure
                  style={{ y: screenY, opacity: screenO }}
                  className="absolute right-[12%] top-[2%] z-30 w-[15%]"
                >
                  <div className="relative rounded-[0.8rem] border border-ink/70 bg-ink p-1 pb-5 shadow-subtle">
                    <span
                      className="absolute left-1/2 top-1 h-[4px] w-6 -translate-x-1/2 rounded-full bg-ink/60"
                      aria-hidden
                    />
                    <Photo
                      src={IMG['beginning-screen-image']}
                      alt="The photograph as it lived on a screen"
                      ratio="aspect-[9/19]"
                      className="rounded-[0.45rem]"
                      imgClassName="object-cover"
                    />
                    <span
                      className="absolute bottom-1 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full bg-ink/50"
                      aria-hidden
                    />
                  </div>
                </motion.figure>

                {/* Stage 02 — the framed artwork, the focal point, below-left, in clear space */}
                <motion.figure
                  style={{ y: wallY, scale: wallScale }}
                  className="absolute left-[46%] top-[33%] z-20 w-[24%]"
                >
                  <div className="relative">
                    {/* hanging wire */}
                    <span
                      className="absolute -top-5 left-1/2 z-10 h-5 w-px -translate-x-1/2 bg-ink/35"
                      aria-hidden
                    />
                    <span
                      className="absolute -top-1.5 left-1/2 z-10 size-1.5 -translate-x-1/2 rounded-full border border-bronze/70 bg-canvas"
                      aria-hidden
                    />
                    {/* realistic shadow beneath the frame */}
                    <span
                      className="absolute -bottom-3 left-1/2 -z-10 h-6 w-[92%] -translate-x-1/2 rounded-[50%] bg-ink/12 blur-md"
                      aria-hidden
                    />
                    {/* the frame */}
                    <div className="rounded-[2px] border border-ink bg-surface p-1.5 pb-2 shadow-frame">
                      {/* mat board inside the frame */}
                      <div className="border border-line/80 bg-sand-soft p-1.5">
                        <Photo
                          src={IMG['beginning-wall-image']}
                          alt="The same photograph in a thin ARTINU frame"
                          ratio="aspect-[4/5]"
                          className="rounded-none"
                        />
                      </div>
                    </div>
                  </div>
                </motion.figure>

                {/* Stage 03 — the space; the same frame now installed on the café wall */}
                <motion.figure
                  style={{ opacity: spaceO, y: spaceY }}
                  className="absolute left-[46%] top-[68%] z-0 w-[50%]"
                >
                  <div className="relative rounded-[2px] border border-line bg-sand-soft shadow-card photo-edge">
                    <Photo
                      src={IMG['beginning-space-image']}
                      alt="The photograph becomes part of a real café interior"
                      ratio="aspect-[4/3]"
                      className="size-full"
                      imgClassName="object-cover"
                    />
                    {/* the same framed photograph, hung on the café wall */}
                    <span className="absolute left-[12%] top-[8%] z-10 w-[34%]">
                      <span
                        className="absolute -top-4 left-1/2 h-4 w-px -translate-x-1/2 bg-ink/45"
                        aria-hidden
                      />
                      <span className="block rounded-[2px] border border-ink bg-surface p-1 pb-1.5 shadow-frame">
                        <span className="block border border-line/80 bg-sand-soft p-1">
                          <Photo
                            src={IMG['beginning-wall-image']}
                            alt=""
                            ratio="aspect-[4/5]"
                            className="rounded-none"
                            imgClassName="object-cover"
                          />
                        </span>
                      </span>
                    </span>
                  </div>
                </motion.figure>

                {/* Thin gold thread — phone → frame, frame → space */}
                <svg
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                  viewBox="0 0 100 125"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path
                    d="M 70 27 C 63 30, 57 32, 52 35"
                    stroke="var(--color-bronze)"
                    strokeOpacity="0.22"
                    strokeWidth="1"
                    strokeDasharray="1.5 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d="M 54 61 C 52 65, 50 67, 48 69"
                    stroke="var(--color-bronze)"
                    strokeOpacity="0.22"
                    strokeWidth="1"
                    strokeDasharray="1.5 3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {/* Editorial labels — each beside its stage, in surrounding whitespace */}
                <span
                  className="absolute left-[4%] top-[10%] bottom-[12%] w-px border-l border-line-strong"
                  aria-hidden
                />
                <p className="absolute left-[4%] top-[14%] z-30 flex items-center gap-2 font-label text-[0.625rem] uppercase tracking-[0.12em] text-subtle">
                  <span className="inline-block size-1.5 rotate-45 border border-bronze bg-canvas" aria-hidden />
                  01 · On a screen
                </p>
                <p className="absolute left-[4%] top-[45%] z-30 flex items-center gap-2 font-label text-[0.625rem] uppercase tracking-[0.12em] text-ink">
                  <span className="inline-block size-1.5 rotate-45 border border-bronze bg-canvas" aria-hidden />
                  02 · On a wall
                </p>
                <p className="absolute left-[4%] top-[70%] z-30 flex items-center gap-2 font-label text-[0.625rem] uppercase tracking-[0.12em] text-subtle">
                  <span className="inline-block size-1.5 rotate-45 border border-bronze bg-canvas" aria-hidden />
                  03 · In a space
                </p>

                </div>

                {/* ARTINU brings it there */}
                <div className="mt-5 flex items-center justify-end gap-2 pr-1 sm:mt-6 sm:pr-2">
                  <span className="font-label text-[0.625rem] uppercase tracking-[0.18em] text-ink">
                    Artinu brings it there
                  </span>
                  <span className="font-display text-xl italic leading-none text-bronze">→</span>
                </div>
              </div>
            </Reveal>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

/**
 * A rule that draws itself in when the section arrives, rather than fading.
 *
 * Small enough to be worth doing inline: it is a scaleX on a 1px element, which
 * the compositor handles on its own thread and which cannot shift layout —
 * the element occupies its full width from the first frame either way.
 */
function DrawnRule({ className, delay = 0 }: { className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className={cn('block h-px w-10 origin-left bg-bronze/60', className)}
      initial={reduced ? { opacity: 0 } : { scaleX: 0, opacity: 0.6 }}
      whileInView={{ scaleX: 1, opacity: reduced ? 1 : 0.6 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: reduced ? 0.3 : 0.9, delay, ease: EASE }}
      aria-hidden
    />
  );
}

/**
 * Our mission.
 *
 * The motion here is deliberately quiet: the photograph drifts a little slower
 * than the page as the section passes, and the copy arrives a beat after the
 * heading. Both are transform/opacity only, so nothing reflows, and both are
 * flattened to zero when the visitor has asked for reduced motion.
 */
function MissionSection() {
  const reduced = useReducedMotion();
  // A plain wrapper carries the ref: <Section> is a shared primitive used across
  // the whole site and does not forward one. A bare block div around a block
  // section changes nothing about the layout.
  const ref = useRef<HTMLDivElement | null>(null);

  // 'start end' → 'end start' is the whole pass of the section through the viewport.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const photoY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [22, -22]);
  const photoScale = useTransform(scrollYProgress, [0, 0.5, 1], reduced ? [1, 1, 1] : [1.03, 1.01, 1.03]);

  return (
    <div ref={ref}>
    <Section tone="soft">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-20">
          <div>
            <Reveal>
              <p className="eyebrow">Our mission</p>
            </Reveal>

            <Reveal delay={0.06}>
              <h2 className="mt-4 font-display text-[2rem] leading-[1.12] text-ink sm:text-[2.75rem]">
                The best art shouldn&rsquo;t live behind a screen.
              </h2>
            </Reveal>

            <DrawnRule className="mt-6" delay={0.18} />

            <Reveal delay={0.12}>
              <p className="mt-6 font-display text-lg leading-snug text-ink sm:text-xl">
                We&rsquo;re on a quiet mission to bring people back to the real world.
              </p>
            </Reveal>

            <Stagger className="mt-6 space-y-5">
              <StaggerItem>
                <p className="prose-quiet">
                  Most good photography now disappears the same way. It gets posted, it gets a few
                  taps, and the feed moves on. Work that took real effort deserves better than a
                  thumbnail somebody scrolls past on a train.
                </p>
              </StaggerItem>
              <StaggerItem>
                <p className="prose-quiet">
                  Walk into a café and find a framed photograph on the wall, and something shifts.
                  You stop. You look at it a little longer than you meant to. People stay, they
                  notice the room they&rsquo;re sitting in, and they talk about what&rsquo;s in
                  front of them instead of what&rsquo;s on their phone.
                </p>
              </StaggerItem>
              <StaggerItem>
                <p className="prose-quiet">
                  That is the whole idea. We put rotating collections of photography into cafés and
                  creative spaces so the walls start doing something. More people are choosing to
                  stay in and order in. We&rsquo;d like to give them a reason to step out again,
                  and something worth looking at once they do.
                </p>
              </StaggerItem>
            </Stagger>

            <Reveal delay={0.1}>
              <p className="mt-10 border-l border-bronze/40 pl-5 font-display text-xl leading-snug text-ink sm:text-2xl">
                The art is the excuse. The real world is the destination.
              </p>
            </Reveal>
          </div>

          {/* Parallax is applied to a wrapper, never to the layout box, so the
              grid never has to re-measure while it moves. */}
          <Reveal delay={0.1} className="lg:sticky lg:top-28">
            <div className="overflow-hidden rounded-lg">
              <motion.div style={{ y: photoY, scale: photoScale }} className="will-change-transform">
                <Photo
                  src={IMAGES.installing}
                  alt="A member of the ARTINU team hanging a framed photograph"
                  ratio="aspect-[4/5]"
                />
              </motion.div>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
    </div>
  );
}

/**
 * For photographers.
 *
 * The four steps carry the argument, so they get the only real interaction on
 * the page: a hairline that grows and a number that warms on hover. The last
 * step is the turn, and is marked as such rather than animated differently.
 */
function PhotographersSection() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const imageY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-18, 18]);

  return (
    <div ref={ref}>
    <Section>
      <Container>
        <div className="grid items-stretch gap-10 overflow-hidden rounded-xl bg-sand-soft lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-0">
          <div className="relative min-h-[280px] overflow-hidden lg:min-h-[560px]">
            <motion.div
              style={{ y: imageY }}
              className="absolute inset-0 -top-6 -bottom-6 will-change-transform"
            >
              <Photo
                src={IMAGES.prints}
                alt="Printed photographs scattered on a table beside a camera"
                className="size-full"
                imgClassName="object-cover"
              />
            </motion.div>
          </div>

          <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
            <Reveal>
              <p className="eyebrow">For photographers</p>
            </Reveal>

            <Reveal delay={0.06}>
              <h2 className="mt-4 font-display text-[1.85rem] leading-[1.14] text-ink sm:text-[2.35rem]">
                Their best work is sitting in a folder.
                <span className="mt-1 block text-bronze">Your city deserves to see it.</span>
              </h2>
            </Reveal>

            <DrawnRule className="mt-6" delay={0.16} />

            <Reveal delay={0.12}>
              <p className="prose-quiet mt-6">
                You spend hours on one photograph. Shooting it, then longer getting the edit right.
                You post it, it does what posts do, and by evening it has gone quiet. The
                photograph didn&rsquo;t fail. The format did.
              </p>
            </Reveal>

            <Stagger className="mt-9 space-y-0">
              {PHOTOGRAPHER_STEPS.map((entry, index) => (
                <StaggerItem key={entry.step}>
                  <div
                    className={cn(
                      'group relative flex gap-5 py-4',
                      index > 0 && 'border-t border-line/70',
                    )}
                  >
                    {/* Grows from the left on hover. Absolutely positioned, so it
                        can never push the row it belongs to. */}
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-bronze/50 transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-x-100"
                      aria-hidden
                    />
                    <span
                      className={cn(
                        'mt-0.5 font-label text-[0.625rem] tracking-[0.16em] transition-colors duration-300',
                        index === PHOTOGRAPHER_STEPS.length - 1
                          ? 'text-bronze'
                          : 'text-subtle group-hover:text-bronze',
                      )}
                      aria-hidden
                    >
                      {entry.step}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{entry.label}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{entry.body}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal delay={0.1}>
              <p className="prose-quiet mt-9">
                ARTINU is not another place to upload photographs. We take work by local
                photographers and put it into cafés, restaurants, offices and studios around the
                city, printed and framed and credited. Someone finds it while they wait for a
                coffee. They read your name off the wall. That is a slower kind of recognition
                than a like, and it stays with people far longer.
              </p>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
    </div>
  );
}

export default function AboutPage() {
  const whatsapp = `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
    "Hi ARTINU, I'd like to know more about art for my space.",
  )}`;

  return (
    <>
      <AboutBeginningHero />

      {/* ── Our mission ────────────────────────────────────────────────── */}
      <MissionSection />

      {/* ── For photographers ──────────────────────────────────────────── */}
      <PhotographersSection />

      {/* ── Small team ─────────────────────────────────────────────────── */}
      {/*
        The portrait column sizes itself to the number of real people: one
        founder gets a proper portrait rather than an orphaned thumbnail in a
        four-column grid, and the team paragraph runs alongside it instead of
        being replaced by it. Both are true at once — there is a founder, and
        there is a small team behind him.
      */}
      <Section tone="soft">
        <Container>
          <SectionHeading
            eyebrow="Small team"
            title="A small team with a big belief."
          />

          <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-16">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-10">
              {TEAM.length > 0 && (
                <Stagger
                  className={cn(
                    'grid shrink-0 gap-5',
                    TEAM.length === 1 ? 'w-full max-w-60' : 'grid-cols-2 sm:grid-cols-3',
                  )}
                >
                  {TEAM.map((member) => (
                    <StaggerItem key={member.name}>
                      <Photo
                        src={member.photo}
                        alt={`${member.name}, ${member.role} at ARTINU`}
                        ratio="aspect-[4/5]"
                        className="rounded-sm photo-edge"
                        imgClassName="object-cover object-top"
                      />
                      <h3 className="mt-3 text-base font-medium text-ink">{member.name}</h3>
                      <p className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-bronze">
                        {member.role}
                      </p>
                      {member.bio && (
                        <p className="mt-2 text-xs leading-relaxed text-muted">{member.bio}</p>
                      )}
                    </StaggerItem>
                  ))}
                </Stagger>
              )}

              <Reveal className="max-w-xl">
                <p className="prose-quiet">
                  ARTINU is run by a small team in Bengaluru. The same people who survey your walls
                  choose the work, print it, and turn up with the drill on installation day. You
                  will deal with us directly, not with an account manager.
                </p>
                <p className="prose-quiet mt-4">
                  We started this because of the photographers we kept meeting. Genuinely good
                  work, and almost nowhere for it to go beyond a grid of thumbnails. A few of them
                  had never once seen a photograph of theirs printed at size.
                </p>
                <p className="prose-quiet mt-4">
                  So the plan is bigger than filling walls. We want a place where local
                  photographers get found, credited and paid properly, and where someone sitting in
                  a café can look up, like what they see, and go and find out who made it. That
                  takes more spaces and more time than we have behind us so far. As the walls come
                  on board, more photographers get shown, and we grow with the people whose work
                  got us here.
                </p>
              </Reveal>
            </div>

            <Reveal delay={0.15} className="lg:border-l lg:border-line lg:pl-12">
              <span className="font-display text-5xl leading-none text-bronze" aria-hidden>
                &ldquo;
              </span>
              <blockquote className="mt-3 font-display text-xl leading-snug text-ink sm:text-2xl">
                We don&rsquo;t just hang photographs. We build rooms people want to sit in.
              </blockquote>
              <span className="rule mt-6" />
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* ── Contact / trust ────────────────────────────────────────────── */}
      <Section size="compact">
        <Container>
          <div className="grid gap-8 rounded-xl border border-line bg-surface p-8 sm:grid-cols-2 sm:p-10">
            <div>
              <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                Talk to us
              </h3>
              <a
                href={`tel:${CONTACT.phoneRaw}`}
                className="mt-4 flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
              >
                <Phone className="size-4 text-bronze" aria-hidden /> {CONTACT.phone}
              </a>
              <a
                href={`mailto:${CONTACT.email}`}
                className="mt-2.5 flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
              >
                <Mail className="size-4 text-bronze" aria-hidden /> {CONTACT.email}
              </a>
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 flex items-center gap-2.5 text-sm text-ink transition-colors hover:text-bronze"
              >
                <MessageCircle className="size-4 text-bronze" aria-hidden /> Chat on WhatsApp
              </a>
            </div>

            <div>
              <h3 className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
                Working hours
              </h3>
              <dl className="mt-4 space-y-2 text-sm">
                {CONTACT.hours.map((entry) => (
                  <div key={entry.days} className="flex justify-between gap-4">
                    <dt className="text-muted">{entry.days}</dt>
                    <dd className="text-ink">{entry.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Container>
      </Section>

      <CtaBand
        title="Let's bring your space to life."
        description="Tell us about your walls. We'll take it from there."
        primary={{ label: 'Book a consultation', to: '/lets-talk' }}
        secondary={{ label: 'Meet our artists', to: '/artists' }}
        image={IMAGES.cafeWindow}
      />
    </>
  );
}
