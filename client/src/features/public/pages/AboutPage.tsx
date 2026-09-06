import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { CONTACT } from '@artinu/shared';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { ArrowLink, Container, Section, SectionHeading } from '@/components/layout/primitives';
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
    name: 'SR Kiran Aravindh',
    role: 'Founder',
    photo: '/image/founder-kiran-aravindh.jpg',
    // Deliberately about the work rather than the person: it claims no dates,
    // no history and no credentials, because none were given. Replace it with
    // Kiran's own words whenever he wants to.
    bio: 'Kiran started ARTINU on a simple frustration - photographs live and die on screens while the walls around us stay blank. He works on every part of it, from reading a room to turning up on installation day.',
  },
];

/**
 * THE REST OF THE TEAM.
 *
 * Same rule as the founder above: real people, their own photographs, their own
 * words. Every name, role line and biography here is transcribed from what each
 * person supplied — nothing is written on their behalf, and where somebody gave
 * no job title the team they work in stands in for one rather than a title
 * being invented for them.
 *
 * Photographs are 4:5 WebP at two widths, built from the masters in
 * assets/source/team by scripts/generate-images.mjs. `blur` is the inlined 24px
 * preview that holds the card's shape on first paint.
 *
 * `portfolio` is set for exactly the two people who have one. It is absent, not
 * empty, for everybody else — the card then renders no link at all rather than
 * a dead button.
 */
interface TeamGroupMember extends TeamMember {
  /** Slug under /image/team, used to build the srcSet. */
  slug: string;
  /** Inline 24px WebP preview. */
  blur: string;
  portfolio?: string;
}

interface TeamGroup {
  title: string;
  members: TeamGroupMember[];
}

/** Both widths of a portrait, so a phone does not fetch the desktop file. */
const teamSrcSet = (slug: string) =>
  `/image/team/${slug}-480.webp 480w, /image/team/${slug}-768.webp 768w`;

const TEAM_GROUPS: TeamGroup[] = [
  {
    title: 'Social media',
    members: [
      {
        slug: 'karthik',
        name: 'Karthik',
        // No job title was supplied, so the team stands in for one.
        role: 'Social Media Team',
        photo: '/image/team/karthik-768.webp',
        blur: 'data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAADwBACdASoYAB4APt1kp0+opSMiKAqpEBuJZwDBzDTxCWuwmQI9fQ741OJjS3fqJBQA/uE2qkb8tbCmPKixIi9XfM7TfoUbLiSaq09+soRNfbk0dNrdB8ZXbZP5nIdyOioZY9vLlQnSl/rgtEu453DY2/07+U9g75RB7BVkMTzhJ5zaTw5dA4ppFMgKNWwQWP9FO/mlZ2Yh5EPJ/abdLfBJDgbr4TvQD4JXC2ETTYUAAA==',
        // His words, verbatim but for one obvious misspelling ("contatcs").
        bio: 'Building reliable contacts - no extra noise.',
      },
      {
        slug: 'sanskrithi',
        name: 'Sanskrithi Raikote',
        role: 'Social Media Team',
        photo: '/image/team/sanskrithi-768.webp',
        blur: 'data:image/webp;base64,UklGRhIBAABXRUJQVlA4IAYBAABQBgCdASoYAB4APt1cpUyopSOiMAgBEBuJZgC7BbRlGxr4g79rmLxOIQ51pnAwAvWLSn4uLTiPcMCeAAD+22pdKFf62bgYkW+w/3glqidM5i6rXtgD4DZxz3WZ2kSeXnlF5BO1yzKWqJAY0aVLKNmBkAQfD2G3MuSA/Nq1/wy9bSq0L2/4Pn+JENH3SrLjfljkCi0a5t8PQWYfaj/LyBUlDE4PuQBuEgbGhDyDTadYlmwrexAw4mXchsZG9hb5Dp7An9gElbHlQxR0+rAgeXOd2U2oqIuKIxF2AkRmNwJBLZF9XIq185zJP+2rCXUc82V1b6IyJfXiYB2QlauX+D87lClHhpAA',
        bio: 'Working with the Social Media & Digital team at ARTINU, contributing to content creation, website updates, digital presence, and creative brand communication. I focus on presenting ARTINU’s vision and work effectively across digital platforms while helping build a strong and engaging online presence.',
        // Verified: the page is headed "Meet Sanskrithi — Business Developer,
        // Bengaluru". Supplied by her after the first two portfolios went up.
        portfolio: 'https://sanskrithiraikote.framer.website/',
      },
    ],
  },
  {
    title: 'Technology',
    members: [
      {
        slug: 'mithilesh',
        name: 'Mithilesh BM',
        role: 'IT Team',
        photo: '/image/team/mithilesh-768.webp',
        blur: 'data:image/webp;base64,UklGRggBAABXRUJQVlA4IPwAAAAQBgCdASoYAB4APt1ep0yopSOiMAgBEBuJQBhWW03r5ooVzL2/NqX2YUdXx3BCVrBRE2Ii4u9qCMAA/p7o6HqDaXuwNC9FpWiI+9SVw+eD79PZ91hqphKa9CK4V2E/HbCJglFIvoY6rWBVKrMnG6I8p0wK1dclN6L7UbMb38uGCs0xD8pPdVYev7EHyjIiQgHH2u4cshk4TqyN7f8nBK7T+SA3g69hMr5BNM3qoiZC/izVZDco6sM8s9VX6xo2MEMv2eRBg9b5riDlBF6KXbXISwBENoKtIxNCtHAxb/4hTrvCytbSzTXZmP1y/AsaTWjuSyujZLl84zSoAAA=',
        // Opens "Mithilesh BM, a technology-driven builder…" in the source; the
        // name is dropped here because the card prints it directly above.
        bio: 'A technology-driven builder and entrepreneur focused on turning ideas into meaningful digital products. At Artinu, I work across technology, innovation, and product development, with a passion for solving real-world problems through practical and scalable solutions. I’m driven by curiosity, continuous learning, and a vision to build technology that creates lasting impact.',
      },
      {
        slug: 'poosan',
        name: 'Poosan Kumar S',
        role: 'Head of Technical Operations',
        photo: '/image/team/poosan-768.webp',
        blur: 'data:image/webp;base64,UklGRiQBAABXRUJQVlA4IBgBAADwBQCdASoYAB4APtFWpUyoJKOiMAwBABoJZACdMySw2mqAeQlZdKoCnrjJP/4cnqAb6yLV/J29AAD+x+JIgZpbTSYnNSHQfJhWCZNHmLUhQ2mbmB7sdCuJ0etTdQSJPgLR4dK8gPaFQrYUyrWbwna5zVC31G82afQyUdiKm4LTmLMkJMLy/t8IyR458mYwcmkvBU3aGYbDAJdPNKs6SUyxPqB6UfXI+xjh2OhnNH76cXtxte41UYWFmRvtX6dCV7yhOqrzFdMrVXAx+nbaDtWIJMHki0UWmy+JjnFhAUgLJZhrptP9o7OMtkrEFEzDLTc6+/6/83hxQWpIsMGEFL6utnYPTbxj7JFSZjBGglWGfHdxC3HnXVgA',
        bio: 'Poosan works as web developer at Artinu, working closely with the team on project execution, technical coordination, and turning ideas into practical digital solutions. He is involved in planning and managing technical workflows, solving challenges, and making sure projects move smoothly from concept to implementation.',
      },
      {
        slug: 'thakarshi',
        name: 'A. Thakarshi Anand',
        role: 'Technical & Development Lead',
        photo: '/image/team/thakarshi-768.webp',
        blur: 'data:image/webp;base64,UklGRjABAABXRUJQVlA4ICQBAACQBgCdASoYAB4APt1cp06opKMiMBgIARAbiWwAnTMKaQGtFYaKOovfi5U6SEZJ1lEY2QzRg+L0WCiibFSwAP5krH+bGM9O+cPJb6qXMbO7q7NMjvWAp+sXXwgkfEYZ4mqgoU3bP7tLhREVBVWgUU6GO2H9jk+kKQXeaiC6as4VLwO9O6TeTJ/focP8uZ0FI5YMGyY3SWFKA3ARkOYMTprwL71G7IpTmGgpPtKL8ydV0V22PpaQTocM4XN8Te7KmrCLWBZ7Sbq4SeK2vNCYvQuDx0WomwGPtPm3vO7WgyEVOR4dYtPnqTJ6Q3G9QAfAwNjIGuxamrWZBapyEQ2j3QHSNL2e5Tp3OoAY6BdVzUmzE6tWHhz4DocX3IJtULyfNArYAAAA',
        bio: 'Where crazy ideas meet clean execution. I don’t just think outside the box. I redesign the box.',
        // Verified: the page at zeta-black.github.io is headed
        // "Thakarshi Anand A — Computer Vision and Backend Engineering".
        portfolio: 'https://zeta-black.github.io/',
      },
      {
        slug: 'vibhu',
        name: 'Vibhu Krishna S',
        role: 'Head of Technical Operations',
        photo: '/image/team/vibhu-768.webp',
        blur: 'data:image/webp;base64,UklGRjgBAABXRUJQVlA4ICwBAABwBgCdASoYAB4APt1eqE0opSQiKA1REBuJZgCdBXuF9kG+aBC9P7dU7gPQHBjJvyBOdstC8eiMKhvclgAA/vQrQJxbBqUxVtEL2RxzxaObYIcTBIgjkZoFQCId11OGpcvuSJPjzk4c4kG+co4/FOpHeSrE0AkYwk4nUUKucgfVRVJvFECnjZQufahkEXybyjVB1kN3VF4jsXtoPWI6z0f2PCJCwenQPVhRWMrJL/S+N5IO3AUJzZTUlIagzMSbr0RKM1nj+Wyl4Hop8sE/NMrPnmlZRsVbRoPlOaop2SKxIBxkh78W6lng8Zsz4eKgr7vYsXvvzunn683TF3PjfgcOK4BKCTy7gCp3XK8l/SFnFzg+CEElKLuumIyZ41GgVQ2p4G3Bez5QQ6VhgAA=',
        bio: 'Vibhu leads technical operations at Artinu, working closely with the team on project execution, technical coordination, and turning ideas into practical digital solutions. He is involved in planning and managing technical workflows, solving challenges, and making sure projects move smoothly from concept to implementation.',
        // Verified: vktechfolio.vercel.app is headed "Vibhu Krishna S |
        // Full-Stack Developer" — "vk" in the domain is his initials.
        portfolio: 'https://vktechfolio.vercel.app',
      },
    ],
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
  /*
    THE THIRD STAGE IS A REAL PHOTOGRAPH OF A REAL WALL NOW.

    `beginning-space-image.webp` was AI-generated, and looked it: a café that
    exists nowhere, lit perfectly, with a "COFFEE" menu board and shelves of
    bottles whose labels dissolve into noise when you look at them. It was
    standing in for the one thing this whole page is arguing is real — that an
    ARTINU photograph ends up on an actual wall, in an actual room, where actual
    people sit.

    Nib & Nosh in Rajajinagar is that room, and photographs of it were already
    in this repository, shot for the homepage collaboration section:
    `/image/partners/nib-and-nosh-interior-1-*.webp`. The frames on that wall are
    ARTINU frames holding ARTINU photographers' work. Nothing needed generating;
    the honest picture was already here.

    The synthetic frame that used to be composited over this slot has gone with
    it — see the note where stage 03 renders.
  */
  const IMG = {
    'beginning-screen-image': '/image/beginning-screen-image.webp',
    'beginning-wall-image': '/image/beginning-wall-image.webp',
    'beginning-space-image': '/image/partners/nib-and-nosh-interior-1-1024.webp',
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
                  className="mt-7 font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl lg:text-[4.5rem]">
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
                    {/*
                      No composited frame over this one any more.

                      The old image was an invented café, so a frame had to be
                      pasted onto its blank wall to make the point. This is a
                      photograph of Nib & Nosh in Rajajinagar and the frames on
                      that wall are real ARTINU frames holding real
                      photographers' work — adding a synthetic fourth one on top
                      would be both redundant and, on a page arguing that this
                      actually happens, faintly dishonest.

                      The source is 4:5 and this slot is 4:3, so `object-cover`
                      crops to the middle band: the wall, the light and the
                      hung photographs. The layout is untouched.
                    */}
                    <Photo
                      src={IMG['beginning-space-image']}
                      alt="ARTINU photographs framed on the wall at Nib &amp; Nosh café in Rajajinagar, Bengaluru"
                      ratio="aspect-[4/3]"
                      className="size-full"
                      imgClassName="object-cover"
                    />
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
                {/*
                  A REAL ROOM WITH REAL ARTINU WORK ON THE WALL.

                  This was `IMAGES.installing`, and it was wrong twice over. The
                  photograph is a staged American living room — a fireplace, a
                  bay window, cushions squared off by an estate agent — which is
                  nobody's café and nothing to do with ARTINU. And its alt text
                  claimed "a member of the ARTINU team hanging a framed
                  photograph", describing a person who is not in the picture;
                  the note at the top of lib/images.ts warns that the names in
                  that map are not to be trusted, and this was one of them.

                  The copy beside it says walls should start doing something and
                  that people notice the room they are sitting in. Nib & Nosh in
                  Rajajinagar is a room where that is literally true, and the
                  photograph was already in the repository. `interior-2` rather
                  than `interior-1` because the hero at the top of this same page
                  already uses `interior-1`.

                  The master is 1024×1280 — exactly the 4:5 this slot reserves —
                  so nothing is cropped, and generated-images.ts already carries
                  its blur placeholder and srcSet, which `Photo` resolves from
                  the filename on its own.
                */}
                <Photo
                  src="/image/partners/nib-and-nosh-interior-2-1024.webp"
                  alt="ARTINU photographs framed on the wall at Nib &amp; Nosh café in Rajajinagar, Bengaluru"
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
              {/*
                A PHONE, NOT A FULL-FRAME BODY.

                This slot held `IMAGES.prints` — prints spread on a brown table
                beside a DSLR. A real photograph, and the wrong argument: the
                section beside it is addressed to anyone who takes pictures, and
                the picture said "you need this equipment". A photographer
                reading it on the phone they actually shoot with was being shown
                the gear they do not own.

                `photographersHero` is an ARTINU asset already in the repository
                (used on the Artists page): somebody photographing an evening
                street in India, an auto-rickshaw in the frame, holding up a
                phone. Same message the copy makes — the eye is the equipment.

                Reused rather than sourced anew, deliberately. The alternative
                was generating one, and an invented photograph of "authentic
                photographers" on a page about real people would defeat itself.
              */}
              <Photo
                src={IMAGES.photographersHero}
                alt="A photographer shooting an evening street in India on a phone"
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

/**
 * The teams behind the founder.
 *
 * Sits below the existing "Small team" section and deliberately does not touch
 * it: the founder keeps his own frame, his own paragraph and his position on
 * the page. This is the rest of the people, grouped by the team they work in.
 *
 * Everything here is borrowed from what the page already uses — `Section`,
 * `Container`, `SectionHeading`, `Stagger`, `Photo`, `ArrowLink` and the same
 * type scale as the founder card — so it reads as another passage of the same
 * page rather than a component that arrived from somewhere else.
 */
function TeamSection() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Our team"
          title={
            <>
              The people behind the <em className="editorial-italic">walls</em>.
            </>
          }
          className="max-w-2xl"
        />

        <div className="mt-14 space-y-14">
          {TEAM_GROUPS.map((group) => (
            <section key={group.title}>
              {/* Same hairline-and-eyebrow rhythm the rest of the site uses. */}
              <div className="flex flex-wrap items-baseline gap-x-4 border-b border-line pb-2.5">
                <h3 className="eyebrow eyebrow-muted">{group.title}</h3>
              </div>

              <Stagger className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {group.members.map((member) => (
                  <StaggerItem key={member.slug}>
                    <Photo
                      src={member.photo}
                      srcSet={teamSrcSet(member.slug)}
                      /* Four across on a desktop, two on a tablet, one on a
                         phone — the widths the srcSet above actually ships. */
                      sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
                      blurPlaceholder={member.blur}
                      alt={`${member.name}, ${member.role} at ARTINU`}
                      ratio="aspect-[4/5]"
                      className="rounded-sm photo-edge"
                      imgClassName="object-cover object-top"
                    />

                    <h4 className="mt-3 text-base font-medium text-ink">{member.name}</h4>
                    <p className="font-label text-[0.625rem] uppercase tracking-[0.14em] text-bronze">
                      {member.role}
                    </p>
                    {member.bio && (
                      <p className="mt-2 text-xs leading-relaxed text-muted">{member.bio}</p>
                    )}

                    {/*
                      Only rendered for the two people who supplied one, so
                      nobody else gets an empty control. External, so it opens
                      in its own tab and does not navigate the visitor off
                      ARTINU mid-read.
                    */}
                    {member.portfolio && (
                      <ArrowLink
                        href={member.portfolio}
                        external
                        className="mt-3 text-[0.8125rem]"
                      >
                        {/* Names the destination rather than saying "click
                            here", so it still makes sense read out of context
                            by a screen reader's link list. */}
                        <span className="sr-only">{member.name}&rsquo;s </span>
                        Portfolio
                      </ArrowLink>
                    )}
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ))}
        </div>
      </Container>
    </Section>
  );
}

export default function AboutPage() {
  const whatsapp = `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(
    "Hi ARTINU - I'd like to know more about art for my space.",
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

      {/* ── The rest of the team ───────────────────────────────────────── */}
      {/* Directly below the founder, before the contact band, so the page
          still reads founder → team → how to reach us. */}
      <TeamSection />

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
        primary={{ label: 'Book a wall visit', to: '/lets-talk' }}
        secondary={{ label: 'Meet our artists', to: '/artists' }}
        image={IMAGES.cafeWindow}
      />
    </>
  );
}
