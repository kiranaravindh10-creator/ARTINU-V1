import {
  formatCurrency,
  MIN_ORDER_QUANTITY,
  PRICING,
  ROTATION_INTERVALS,
  SPACE_TYPE_LABELS,
} from '@artinu/shared';
import {
  ArrowRight,
  Frame,
  Hammer,
  LayoutGrid,
  LifeBuoy,
  MessageSquare,
  RefreshCw,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLink, Container, Section, SectionHeading } from '@/components/layout/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IMAGES, SPACE_TYPE_IMAGES } from '@/lib/images';
import { cn } from '@/lib/utils';

const ROTATION_RANGE = `${ROTATION_INTERVALS[0]}–${ROTATION_INTERVALS[ROTATION_INTERVALS.length - 1]}`;

// ── Section 2 ────────────────────────────────────────────────────────────────

const REASONS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Wallet,
    title: 'Hassle-free access to art',
    body: 'You are not acquiring a collection or committing to a permanent exhibition. You get beautiful prints and frames on your wall, maintained and refreshed on a schedule.',
  },
  {
    icon: Frame,
    title: 'Curation matched to your interiors',
    body: 'We come and look — at your light through the day, your wall colours, your ceiling heights, the way people move through the room. What you get back is a proposal for your space, not a catalogue to scroll.',
  },
  {
    icon: Wrench,
    title: 'Installation and upkeep handled',
    body: 'Our crew measures, drills, levels and cleans up after itself. Straightening, dusting, a cracked pane replaced — that stays ours for as long as the frames are on your wall.',
  },
  {
    icon: RefreshCw,
    title: `Fresh work every ${ROTATION_RANGE} months`,
    body: 'Pick a cadence. We propose the next set, you approve it in a couple of taps, and we swap the walls in one visit — usually before you open. Regulars notice. That is the point.',
  },
];

// ── Section 3 ────────────────────────────────────────────────────────────────

/**
 * Five steps, one line each.
 *
 * These were full paragraphs — accurate, but nobody reads five paragraphs to
 * find out how a service works. Each step now carries one action and one
 * sentence; the detail that was cut lives in the FAQ below, where someone who
 * actually wants it will go looking.
 */
const STEPS: { icon: LucideIcon; title: string; body: string; aside: string }[] = [
  {
    icon: MessageSquare,
    title: 'We come and look',
    aside: 'Week one',
    body: 'Forty minutes in your space — your light, your walls, your room. Nothing to sign.',
  },
  {
    icon: LayoutGrid,
    title: 'You see it first',
    aside: 'Within five days',
    body: 'Specific photographs on your specific walls, to scale. Swap anything you do not love.',
  },
  {
    icon: Hammer,
    title: 'We hang it',
    aside: 'Two weeks from approval',
    body: 'Printed, framed and installed in one visit. We leave with the packaging and the dust.',
  },
  {
    icon: RefreshCw,
    title: 'It changes',
    aside: `Every ${ROTATION_RANGE} months`,
    body: 'A new set, approved from your phone. Same frames, same holes, different room.',
  },
  {
    icon: LifeBuoy,
    title: 'We stay',
    aside: 'For as long as you rotate',
    body: 'One number, one inbox. Cracked glass replaced without an invoice.',
  },
];


// ── Section 5 ────────────────────────────────────────────────────────────────

const SPACE_TYPES_SHOWN = ['cafe', 'restaurant', 'hotel', 'office', 'home_decor'] as const;

type ShownSpace = (typeof SPACE_TYPES_SHOWN)[number];

const SPACE_TYPE_NOTES: Record<ShownSpace, string> = {
  cafe: 'Long walls and long stays. Work that rewards a second look on the fourth visit.',
  restaurant: 'Low light and warm tone. Prints chosen to hold up at candle level, glazed against steam.',
  hotel: 'Lobby, corridor, suite. A sequence that reads as one hand, floor after floor.',
  office: 'Meeting rooms and quiet corners that should not feel like an airport lounge.',
  home_decor: 'High traffic, high turnover of eyes. Rotate often and the room stays interesting.',
};

/**
 * Picking a room rewrites the hero.
 *
 * Choosing "Café" used to send you straight to the booking form; now the page
 * answers first — headline, paragraph and photograph all become about that
 * room, so a café owner reads a page about cafés rather than a generic one and
 * only books once it is talking to them.
 *
 * Images are chosen by what the photograph actually shows, not by the name of
 * the constant: several in the bank are mislabelled (see client/src/lib/images).
 */
interface SpaceHero {
  headline: string;
  blurb: string;
  image: string;
  alt: string;
}

const DEFAULT_HERO: SpaceHero = {
  headline: 'Art that changes with your space.',
  blurb:
    'Buy a photograph once and within a season it stops being art and becomes furniture. ARTINU works the other way round: we read the room, print and frame work made for it, then change it for something new every few months.',
  image: IMAGES.cafeInterior,
  alt: 'Café interior with framed photographs on the wall',
};

const SPACE_HEROES: Record<ShownSpace, SpaceHero> = {
  cafe: {
    headline: 'Art that changes with your café.',
    blurb:
      'Long walls, long stays, regulars who notice. We hang work that rewards a second look on the fourth visit, then swap it before it becomes wallpaper.',
    image: IMAGES.cafeInterior,
    alt: 'Café interior with framed photographs above the counter seating',
  },
  restaurant: {
    headline: 'Art that changes with your restaurant.',
    blurb:
      'Low light and warm tone. Prints chosen to hold up at candle level and glazed against steam, so the room looks composed from the door and from the corner table.',
    image: IMAGES.barInterior,
    alt: 'Warm, low-lit restaurant interior with framed work on the wall',
  },
  hotel: {
    headline: 'Art that changes with your hotel.',
    blurb:
      'Lobby, corridor, suite — a sequence that reads as one hand, floor after floor, and changes often enough that a returning guest notices.',
    image: IMAGES.poolDeck,
    alt: 'Hotel terrace and loungers in the late afternoon',
  },
  office: {
    headline: "Let's bring your space to your office.",
    blurb:
      'Meeting rooms and quiet corners that should not feel like an airport lounge. Work that holds a room without shouting in it, refreshed before anyone stops seeing it.',
    image: IMAGES.officeCorridor,
    alt: 'Open-plan office interior with framed photography along the wall',
  },
  home_decor: {
    headline: "Let's bring Artinu into your home.",
    blurb:
      'Photography chosen for the room you actually live in — your light, your wall colours, your ceiling heights. Printed, framed and hung by us, and changed whenever the room starts to feel settled.',
    image: IMAGES.home_decor,
    alt: 'A bright living room with seating and soft daylight',
  },
};

// ── Section 6 ────────────────────────────────────────────────────────────────

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What if I don't like a photograph?",
    answer:
      'Say so — nothing is final until you approve it. During curation you can swap any frame for another from the gallery, or send us back to look again with what you did not like written down. After installation, if a photograph is not working in the room, we change it at your next rotation at no cost. If it is genuinely wrong for the wall — wrong scale, wrong tone, wrong light — tell us within fourteen days and we will change it sooner than that.',
  },
  {
    question: 'Who owns the art?',
    answer: `The photographer owns the copyright, always; that never transfers to us or to you. The photographs inside the frames are licensed to you for display while they hang, which is why they come back to us at each swap. Nobody may reproduce, resell or merchandise the image beyond that display licence — not you, not us. We ensure artists are fairly compensated for every photograph displayed.`,
  },
  {
    question: 'What happens on rotation day?',
    answer:
      'We confirm a two-hour window with you first, usually before service or before the office fills. Two people arrive with the next set already printed and mounted, lift each photograph out of its frame, set the new one in and take the old prints away for archiving. Frames, hangers and wall fixings stay exactly where they are — no new holes, no repainting, no dust sheet over your furniture for a day. Most spaces are finished in ninety minutes and nothing has to close.',
  },
  {
    question: 'Do you work outside Bengaluru?',
    answer:
      'Bengaluru is where our crew, our print lab and our framers are, so installation and rotation there are entirely in-house and that is where we are fastest. We also install in Mysuru, Chennai, Hyderabad and Pune through partner crews we have trained and work alongside, with a longer lead time on the first order — about three weeks rather than two. Anywhere else, tell us about the space and we will be straight with you about whether we can serve it properly yet rather than take the order and hope.',
  },
  {
    question: 'How long is the commitment?',
    answer:
      'Rotation runs as a rolling subscription with a three-month minimum, which is one full cycle — long enough to actually see a refresh before you decide anything. After that, thirty days of notice ends it. The last set of photographs comes back to us, and the frames stay yours to fill with whatever you like.',
  },
  {
    question: 'What does installation involve?',
    answer:
      'A short site survey comes first, because drywall, brick, glass partitions and exposed concrete each need a different anchor and we would rather know before we arrive with a drill. On the day: two people, drop cloths, a laser level and a vacuum. We drill, mount, level, wipe the glass down and take the packaging away with us. Three to twelve frames takes two to three hours. We work around your service hours — early mornings, Sundays, between lunch and dinner — at no extra charge.',
  },
];

export default function SpacesPage() {
  // null = the general pitch; a type = the page speaks to that room.
  const [selected, setSelected] = React.useState<ShownSpace | null>(null);
  const hero = selected ? SPACE_HEROES[selected] : DEFAULT_HERO;
  const heroRef = React.useRef<HTMLDivElement>(null);

  const choose = (type: ShownSpace) => {
    setSelected(type);
    // The tiles sit well below the fold, so without this the hero would change
    // where nobody can see it.
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="scroll-mt-24 overflow-hidden bg-canvas">
        <Container className="grid items-center gap-12 pb-16 pt-10 sm:pb-20 sm:pt-14 lg:grid-cols-[1.02fr_1fr] lg:gap-16 lg:pb-28 lg:pt-16">
          <Reveal>
            <p className="eyebrow">
              {selected ? SPACE_TYPE_LABELS[selected] : 'Our Collaborations'}
            </p>
            <h1 className="mt-5 max-w-[15ch] font-display text-[2.5rem] leading-[1.05] text-ink sm:text-5xl lg:text-6xl">
              {hero.headline}
            </h1>
            <span className="rule mt-6" />
            <p className="prose-quiet mt-6">{hero.blurb}</p>

            <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Button shape="pill" size="lg" asChild>
                {/* Carries the chosen room through, so the booking form opens
                    already set to it rather than asking again. */}
                <Link to={selected ? `/lets-talk?type=${selected}` : '/lets-talk'}>
                  Book a consultation
                  <ArrowRight />
                </Link>
              </Button>
              {selected ? (
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
                >
                  Show every space
                </button>
              ) : (
                <ArrowLink to="/signin?as=space">Already with us? Sign in</ArrowLink>
              )}
            </div>

            <p className="mt-8 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-subtle">
              {CONSULTATION_NOTE}
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            {/* Keyed on the image so React swaps the element instead of mutating
                src — that is what lets the fade actually run on each change. */}
            <Photo
              key={hero.image}
              src={hero.image}
              alt={hero.alt}
              ratio="aspect-[4/5] sm:aspect-[16/11] lg:aspect-[4/5]"
              priority
              hero
              className="photo-edge animate-fade-in rounded-sm"
            />
          </Reveal>
        </Container>
      </section>

      {/* ── Why spaces choose ARTINU ───────────────────────────────────────── */}
      <Section tone="sand">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Why spaces choose ARTINU"
              title="Everything about the wall, handled."
              description="Four things owners tell us made the difference — none of them about art, all of them about how little it asked of them."
              rule
            />
          </Reveal>

          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
            {REASONS.map(({ icon: Icon, title, body }) => (
              <StaggerItem key={title}>
                <Card flat className="h-full border-line-soft p-7">
                  <span className="flex size-11 items-center justify-center rounded-full border border-bronze/35 text-bronze">
                    <Icon className="size-5 stroke-[1.4]" aria-hidden />
                  </span>
                  <h3 className="mt-6 font-display text-xl leading-snug text-ink">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        </Container>
      </Section>

      {/* ── How it works, from the owner's side ────────────────────────────── */}
      <Section id="how-it-works">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="Five steps, and four of them are ours."
              description="The only one that lands on your desk is saying yes to a proposal."
              rule
            />
          </Reveal>

          <ol className="relative mt-14 lg:mt-20">
            <span
              aria-hidden
              className="absolute bottom-8 left-6 top-8 w-px bg-bronze/30"
            />
            {STEPS.map(({ icon: Icon, title, body, aside }, index) => (
              <li key={title}>
                <Reveal>
                  <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 pb-12 last:pb-0 lg:grid-cols-[3rem_15rem_minmax(0,1fr)] lg:gap-x-10 lg:pb-16">
                    <span className="relative z-10 flex size-12 items-center justify-center rounded-full border border-bronze/35 bg-canvas text-bronze">
                      <Icon className="size-5 stroke-[1.4]" aria-hidden />
                    </span>

                    <div className="lg:pt-1.5">
                      <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                        Step {String(index + 1).padStart(2, '0')} · {aside}
                      </p>
                      <h3 className="mt-2 font-display text-2xl leading-tight text-ink">{title}</h3>
                    </div>

                    <p className="col-start-2 mt-3 max-w-2xl text-sm leading-relaxed text-muted lg:col-start-3 lg:mt-0 lg:pt-2 lg:text-[0.9375rem]">
                      {body}
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </Container>
      </Section>



      {/* ── Spaces we work with ────────────────────────────────────────────── */}
      <Section>
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Spaces we work with"
              title="Made for rooms people spend time in."
              description="Every kind of room asks something different of a photograph. Tell us which one is yours and we will start there."
              rule
            />
          </Reveal>

          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
            {SPACE_TYPES_SHOWN.map((type) => (
              <StaggerItem key={type}>
                {/*
                  A button, not a link: choosing a room now re-writes the hero
                  above rather than throwing the visitor at a booking form. The
                  form is still one click away, and arrives pre-set to whatever
                  they picked.
                */}
                <button
                  type="button"
                  onClick={() => choose(type)}
                  aria-pressed={selected === type}
                  className={cn(
                    'group block w-full overflow-hidden rounded-sm text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-2',
                    selected === type && 'ring-2 ring-bronze ring-offset-2',
                  )}
                >
                  <Photo
                    src={SPACE_TYPE_IMAGES[type] ?? IMAGES.cafeInterior}
                    alt={`${SPACE_TYPE_LABELS[type]} interior with framed photography on the wall`}
                    ratio="aspect-[4/3]"
                    thumbnail
                    imgClassName="transition-transform duration-[900ms] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
                  >
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent"
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
                      <div className="min-w-0">
                        <h3 className="font-display text-xl text-canvas">
                          {SPACE_TYPE_LABELS[type]}
                        </h3>
                        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-canvas/70">
                          {SPACE_TYPE_NOTES[type]}
                        </p>
                      </div>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-canvas/40 text-canvas transition-colors duration-300 group-hover:border-canvas group-hover:bg-canvas group-hover:text-ink">
                        <ArrowRight className="size-4" aria-hidden />
                      </span>
                    </div>
                  </Photo>
                </button>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal delay={0.1}>
            <p className="mt-8 text-sm text-muted">
              Clinic, gym, showroom, school, something we have not listed —{' '}
              <Link
                to="/lets-talk?type=other"
                className="font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-bronze hover:decoration-bronze"
              >
                tell us about it
              </Link>
              . We have hung photographs in stranger rooms than yours.
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <Section tone="sand">
        <Container className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal>
            <SectionHeading
              eyebrow="Questions, answered"
              title="The things owners ask us first."
              description="If your question is not here, ask it on the call — we would rather answer it before you sign anything."
              rule
            />
            <div className="mt-8">
              <ArrowLink to="/lets-talk">Ask us directly</ArrowLink>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <Accordion type="single" collapsible className="w-full border-t border-line">
              {FAQS.map((faq, index) => (
                <AccordionItem key={faq.question} value={`faq-${index}`}>
                  <AccordionTrigger className="py-5 text-left font-display text-lg font-normal leading-snug text-ink">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="max-w-2xl pb-6 pr-8 leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </Container>
      </Section>

      {/* ── Closing CTA ────────────────────────────────────────────────────── */}
      <Section tone="ink" size="compact">
        <Container>
          <Reveal>
            <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="eyebrow text-bronze-light">Let&rsquo;s talk</p>
                <h2 className="mt-5 font-display text-[2.25rem] leading-[1.08] text-canvas sm:text-[2.75rem]">
                  Show us the wall. We&rsquo;ll show you what belongs on it.
                </h2>
                <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-canvas/65">
                  Pick a time that suits your service hours. We come and look, measure and listen,
                  and send a proposal within five days. There is nothing to sign until you like what you see.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-4">
                <Button shape="pill" size="lg" variant="light" asChild>
                  <Link to="/lets-talk">
                    Book a consultation
                    <ArrowRight />
                  </Link>
                </Button>
                <ArrowLink to="/gallery" invert>
                  Browse the gallery first
                </ArrowLink>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}

const CONSULTATION_NOTE = `Bengaluru and around · About forty minutes · No obligation`;
