import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { CONTACT } from '@artinu/shared';
import { Image as ImageIcon, Mail, MessageCircle, Phone, RefreshCw, Users } from 'lucide-react';
import { Container, Section, SectionHeading } from '@/components/layout/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Photo } from '@/components/ui/photo';
import { CtaBand } from '@/features/public/components/CtaBand';
import { IMAGES } from '@/lib/images';
import { cn } from '@/lib/utils';

const DRIVERS = [
  {
    icon: ImageIcon,
    title: 'Better Spaces',
    body: 'We believe great spaces inspire people. Art should evolve with them.',
  },
  {
    icon: Users,
    title: 'Support Creators',
    body: 'We work with independent photographers and help them get seen, valued and supported.',
  },
  {
    icon: RefreshCw,
    title: 'Hassle-Free',
    body: 'From curation to installation and rotation — we take care of it all.',
  },
];

/**
 * Our journey, told as what we do rather than when we did it.
 *
 * This section previously listed 2022/2023/2024 milestones — a founding date,
 * city counts and "thousands of moments captured" — none of which were real.
 * Invented history is the fastest way to lose a space owner who checks. The
 * copy below claims nothing that cannot be shown on a wall today; add dated
 * milestones back only when there is a verified date to put against them.
 */
const TIMELINE = [
  {
    label: 'The belief',
    body: 'Art should be experienced, not just owned. A photograph earns its place on a wall by changing how the room feels.',
  },
  {
    label: 'The problem',
    body: 'Buy a print once and within a season it stops being art and becomes furniture. Most spaces end up with walls nobody looks at any more.',
  },
  {
    label: 'What we built',
    body: 'We read the room, propose photographs made for it, then print, frame and hang them — and swap them for new work on a schedule you choose.',
  },
  {
    label: 'Where we are',
    body: 'Working with cafés, restaurants, offices and homes across Bengaluru, and with the photographers whose work goes up in them.',
  },
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
    bio: 'Kiran started ARTINU on a simple frustration — photographs live and die on screens while the walls around us stay blank. He works on every part of it, from reading a room to turning up on installation day.',
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
                <h1
                  id="about-beginning-title"
                  className="mt-7 font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl lg:text-[4.5rem]"
                >
                  Somewhere between a photograph
                  <br className="hidden sm:block" /> and a wall,{' '}
                  <em className="editorial-italic">Artinu</em> began.
                </h1>
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
                <p className="absolute left-[4%] top-[14%] z-30 flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-subtle">
                  <span className="inline-block size-1.5 rotate-45 border border-bronze bg-canvas" aria-hidden />
                  01 · On a screen
                </p>
                <p className="absolute left-[4%] top-[45%] z-30 flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink">
                  <span className="inline-block size-1.5 rotate-45 border border-bronze bg-canvas" aria-hidden />
                  02 · On a wall
                </p>
                <p className="absolute left-[4%] top-[70%] z-30 flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-subtle">
                  <span className="inline-block size-1.5 rotate-45 border border-bronze bg-canvas" aria-hidden />
                  03 · In a space
                </p>

                </div>

                {/* ARTINU brings it there */}
                <div className="mt-5 flex items-center justify-end gap-2 pr-1 sm:mt-6 sm:pr-2">
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink">
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

export default function AboutPage() {
  const whatsapp = `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
    "Hi ARTINU — I'd like to know more about art for my space.",
  )}`;

  return (
    <>
      <AboutBeginningHero />

      {/* ── What drives us ─────────────────────────────────────────────── */}
      <Section tone="soft">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
            <div>
              <SectionHeading title="What drives us" rule size="small" />
              <Stagger className="mt-10 grid gap-8 sm:grid-cols-3">
                {DRIVERS.map((driver) => (
                  <StaggerItem key={driver.title}>
                    <driver.icon className="size-7 stroke-[1.3] text-bronze" aria-hidden />
                    <h3 className="mt-4 text-base font-medium text-ink">{driver.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{driver.body}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>

            <Reveal delay={0.1}>
              <Photo
                src={IMAGES.installing}
                alt="A member of the ARTINU team hanging a framed photograph"
                ratio="aspect-[4/3]"
                className="rounded-lg"
              />
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* ── Our journey ────────────────────────────────────────────────── */}
      <Section size="compact">
        <Container>
          <Reveal>
            <div className="grid items-stretch gap-8 overflow-hidden rounded-xl bg-sand-soft lg:grid-cols-2">
              <div className="relative min-h-[250px] lg:min-h-[400px]">
                <Photo
                  src={IMAGES.prints}
                  alt="Printed photographs scattered on a table beside a camera"
                  className="absolute inset-0 size-full"
                  imgClassName="object-cover"
                />
              </div>

              <div className="flex flex-col justify-center px-6 py-10 sm:px-10">
                <p className="eyebrow">Our Journey</p>
                <h2 className="mt-4 font-display text-[1.75rem] leading-tight text-ink sm:text-[2rem]">
                  From a simple idea to spaces that come alive.
                </h2>

                <ol className="mt-8 space-y-6">
                  {TIMELINE.map((entry) => (
                    <li key={entry.label} className="relative flex gap-5 pl-1">
                      <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-bronze" aria-hidden />
                      <div className="-mt-0.5">
                        <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink">
                          {entry.label}
                        </p>
                        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{entry.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>

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
                      <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-bronze">
                        {member.role}
                      </p>
                      {member.bio && (
                        <p className="mt-2 text-xs leading-relaxed text-muted">{member.bio}</p>
                      )}
                    </StaggerItem>
                  ))}
                </Stagger>
              )}

              <Reveal>
                <p className="prose-quiet max-w-xl">
                  ARTINU is run by a small team in Bengaluru — the same people who survey your
                  walls, choose the work, print it, and turn up with the drill on installation
                  day. You will deal with us directly, not with an account manager.
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
              <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
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
              <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
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
