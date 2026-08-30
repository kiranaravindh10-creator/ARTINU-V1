import {
  formatCurrency,
  MIN_ORDER_QUANTITY,
  PRICING,
  ROTATION_INTERVALS,
  SPACE_TYPE_LABELS,
} from '@artinu/shared';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLink, Container, Section, SectionHeading } from '@/components/layout/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Typewriter } from '@/components/motion/typewriter';
import { Button } from '@/components/ui/button';
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

/**
 * "month", or "1-3 months" - the cadence phrase, derived from what is sold.
 *
 * This was `${first}-${last}`, always followed by the literal word "months" at
 * each call site. That read correctly while three cadences were offered and
 * produced "Fresh work every 1-1 months" the moment the list collapsed to
 * monthly only. The noun is part of the phrase now, so a single cadence can be
 * singular and the copy stays grammatical whatever constants.ts says.
 */
const ROTATION_PHRASE =
  ROTATION_INTERVALS.length === 1
    ? ROTATION_INTERVALS[0] === 1
      ? 'month'
      : `${ROTATION_INTERVALS[0]} months`
    : `${ROTATION_INTERVALS[0]}-${ROTATION_INTERVALS[ROTATION_INTERVALS.length - 1]} months`;

// ── Section 2 ────────────────────────────────────────────────────────────────

/*
  Four reasons, no glyphs.

  Each of these opened with a bronze-ringed icon that restated its own heading —
  a wallet for "Hassle-free access to art", a wrench for "Installation and upkeep
  handled", a refresh arrow for "Fresh work every N months". A reader who has
  read the heading learns nothing from the picture of the heading.
*/
const REASONS: { title: string; body: string }[] = [
  {
    title: 'Hassle-free access to art',
    body: 'You are not acquiring a collection or committing to a permanent exhibition. You get beautiful prints and frames on your wall, maintained and refreshed on a schedule.',
  },
  {
    title: 'Curation matched to your interiors',
    body: 'We come and look - at your light through the day, your wall colours, your ceiling heights, the way people move through the room. What you get back is a proposal for your space, not a catalogue to scroll.',
  },
  {
    title: 'Installation and upkeep handled',
    body: 'Our crew measures, drills, levels and cleans up after itself. Straightening, dusting, a cracked pane replaced - that stays ours for as long as the frames are on your wall.',
  },
  {
    title: `Fresh work every ${ROTATION_PHRASE}`,
    body: 'We propose the next set, you approve it in a couple of taps, and we swap the walls in one visit - usually before you open. Regulars notice. That is the point.',
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
/*
  Five steps, and the number is the only marker they need — see the list below
  for why the timeline that used to run down this section went.
*/
const STEPS: { title: string; body: string; aside: string }[] = [
  {
    title: 'We come and look',
    aside: 'Week one',
    body: 'Forty minutes in your space - your light, your walls, your room. Nothing to sign.',
  },
  {
    title: 'You see it first',
    aside: 'Within five days',
    body: 'Specific photographs on your specific walls, to scale. Swap anything you do not love.',
  },
  {
    title: 'We hang it',
    aside: 'Two weeks from approval',
    body: 'Printed, framed and installed in one visit. We leave with the packaging and the dust.',
  },
  {
    title: 'It changes',
    aside: `Every ${ROTATION_PHRASE}`,
    body: 'A new set, approved from your phone. Same frames, same holes, different room.',
  },
  {
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


/*
  WHAT ARTINU DOES FOR EACH KIND OF ROOM.

  This is the founder's material in full - all eight points per room, nine for
  hotels, plus the room-by-room lists he supplied for offices, restaurants,
  homes and hotels. An earlier version carried four of the eight; he sent the
  whole thing twice, so the whole thing is here.

  Two decisions about how it is presented, both of which matter given how often
  he has objected to pages that "look AI":

  It is NOT forty icon cards. Eight lucide glyphs over eight Title Case nouns,
  five times over, would be the largest instance on the site of exactly the
  shape he keeps rejecting. It is a definition list: a bold line and a sentence,
  two columns, no glyphs.

  It shows one room at a time, driven by the selector above. A cafe owner does
  not need to read the case for hotels, and forty-one points on screen at once
  is a brochure nobody finishes.

  Propositions are his words, with the em dashes turned into single hyphens per
  his note about double dashes.
*/
interface SpaceValue {
  proposition: string;
  points: { title: string; body: string }[];
  /** The rooms within the space, where he listed them. */
  areasLabel?: string;
  areas?: string[];
}

const SPACE_VALUE: Record<ShownSpace, SpaceValue> = {
  cafe: {
    proposition:
      'ARTINU helps cafés turn empty walls into experiences - making the space more attractive, more memorable, more Instagrammable, and constantly evolving.',
    points: [
      {
        title: 'Makes the café visually distinctive',
        body: 'Empty walls become curated photography, giving the café a stronger identity instead of generic wall décor.',
      },
      {
        title: 'Creates a reason for customers to look around',
        body: 'Rotating photography gives people something new to discover on every visit, so the space feels fresh and continuously changing.',
      },
      {
        title: 'Improves the Instagram appeal',
        body: 'Good photography, professionally framed and arranged, creates photo-worthy corners - and customers post the café themselves.',
      },
      {
        title: 'Supports local photographers',
        body: 'The café gets professionally curated artwork; local photographers get visibility and recognition for the work on the wall.',
      },
      {
        title: 'Gives the café a story',
        body: "Not decorative paintings. Each photograph carries the photographer's name, the location and the story behind the image, which makes the wall mean something.",
      },
      {
        title: 'Keeps the interiors fresh without redesigning',
        body: 'Refresh the walls periodically instead of changing furniture or paying for an interior renovation.',
      },
      {
        title: "Strengthens the café's brand",
        body: 'Photographs chosen to match the personality of the room - coffee culture, Bengaluru, travel, food, people, local life - so the art is part of the brand rather than beside it.',
      },
      {
        title: 'Potential customer engagement',
        body: 'People can discover the photographers and their stories from the information beside the work: an interaction beyond food and coffee.',
      },
    ],
  },

  office: {
    proposition:
      'ARTINU transforms ordinary office walls into spaces that inspire employees, impress clients, and reflect the identity of the company.',
    points: [
      {
        title: 'Makes the office look premium',
        body: 'Curated photography in properly designed frames turns plain walls into a modern, considered workspace.',
      },
      {
        title: 'Strengthens company culture',
        body: "Photographs of the company's journey, its people, its achievements, its industry or its city make the workplace feel connected to the organisation.",
      },
      {
        title: 'Creates a better environment for employees',
        body: 'A visually engaging workspace is less monotonous - especially in common areas, meeting rooms and the places people actually sit.',
      },
      {
        title: 'Impresses clients and visitors',
        body: 'Reception and meeting rooms are the first things a visitor sees. A stronger first impression without a major interiors project.',
      },
      {
        title: 'Keeps the office fresh',
        body: 'Artwork installed once and left for years stops being seen. Rotation lets the environment change periodically.',
      },
      {
        title: 'Supports employee engagement',
        body: 'Photography taken by your own employees can go up alongside the rest - participation and recognition, at no extra cost.',
      },
      {
        title: 'Connects the company with local art',
        body: 'Local photographers and regional stories brought into a corporate space give the office a more authentic identity.',
      },
      {
        title: 'Flexible for different spaces',
        body: 'Different photography curated for each part of the building rather than one set repeated everywhere.',
      },
    ],
    areasLabel: 'Curated separately for',
    areas: [
      'Reception',
      'Meeting rooms',
      'Cafeteria',
      'Corridors',
      'Waiting areas',
      'Employee lounges',
      'Executive cabins',
    ],
  },

  restaurant: {
    proposition:
      'ARTINU turns restaurant walls into part of the dining experience - creating ambience, stories, photo-worthy spaces, and a constantly evolving identity.',
    points: [
      {
        title: 'Creates a memorable ambience',
        body: "Photography curated around the cuisine, the culture, the location or the concept, so the interior is immersive rather than decorated.",
      },
      {
        title: 'Makes the restaurant more Instagram-worthy',
        body: 'A well-curated wall becomes a photo spot, and customers share the restaurant themselves.',
      },
      {
        title: 'Gives the restaurant a unique identity',
        body: 'Original photography with a story behind each piece, instead of generic paintings or mass-produced décor.',
      },
      {
        title: 'Encourages customers to explore the space',
        body: 'Photographs with the photographer and the story beside them give a table something to look at and discover while they eat.',
      },
      {
        title: 'Regularly refreshes the interiors',
        body: 'Change the visual atmosphere periodically without an expensive interior renovation.',
      },
      {
        title: 'Connects food with storytelling',
        body: 'South Indian restaurant to South Indian culture and tradition. Coastal to ocean and coastal life. Café-style to urban lifestyle and street photography. Fine dining to fine-art photography.',
      },
      {
        title: 'Supports local photographers',
        body: 'The restaurant becomes a platform for local photographers, and gets authentic artwork for its space in return.',
      },
      {
        title: 'Creates another reason to revisit',
        body: 'When the artwork changes, regulars have something new to find - another layer to the experience.',
      },
    ],
  },

  home_decor: {
    proposition:
      'ARTINU turns your walls into stories - bringing beautiful photography, personal memories and unique art into your everyday space.',
    points: [
      {
        title: 'Makes empty walls meaningful',
        body: 'Photographs with a story behind them, rather than generic décor chosen to fill a gap.',
      },
      {
        title: 'Personalises the home',
        body: "Artwork curated around the family's personality, interests, travel memories, city, culture or aesthetic.",
      },
      {
        title: 'Makes the home feel premium',
        body: 'A collection of professionally curated photographs in one consistent frame style gives living rooms, bedrooms and hallways a more refined look.',
      },
      {
        title: 'Turns memories into artwork',
        body: 'Family photographs, travel moments and the shots that matter become display-worthy pieces - the wall becomes emotionally valuable.',
      },
      {
        title: 'Keeps the décor fresh',
        body: 'Change the artwork periodically through rotation without replacing the décor around it.',
      },
      {
        title: 'Gives local photographers a place in people’s homes',
        body: 'Discover and live with original photography from local artists instead of the same mass-produced print everyone else has.',
      },
      {
        title: 'Works across different rooms',
        body: 'A different style curated for each room rather than one look repeated through the house.',
      },
      {
        title: 'Becomes a conversation starter',
        body: "A photograph with the photographer's name, the location and the story gives guests something to discover.",
      },
    ],
    areasLabel: 'Curated separately for',
    areas: [
      'Living rooms',
      'Bedrooms',
      'Dining areas',
      'Hallways',
      'Home offices',
      'Entryways',
    ],
  },

  hotel: {
    proposition:
      'ARTINU transforms hotel walls into experiences - bringing local stories, premium photography and a constantly evolving visual identity to every guest.',
    points: [
      {
        title: 'Creates a premium guest experience',
        body: 'Curated photography makes lobbies, corridors, rooms and lounges feel sophisticated and deliberately designed.',
      },
      {
        title: "Strengthens the hotel's identity",
        body: 'Work selected around the location, the culture, the architecture and the surroundings. A hotel in Bengaluru can show Bengaluru - its people, its streets, its heritage and its modern character.',
      },
      {
        title: 'Makes common areas memorable',
        body: 'Plain corridors and blank walls become a visual journey through the property.',
      },
      {
        title: 'Gives guests something to discover',
        body: "The photographer's name, the location and the story encourage a guest to stop, look and engage with the work.",
      },
      {
        title: 'Creates Instagram-worthy spaces',
        body: 'Distinctive artwork in the lobby, restaurant, lounge or corridors becomes a photography point - and organic social exposure.',
      },
      {
        title: 'Keeps the property visually fresh',
        body: 'Periodic rotation refreshes the interiors without repeatedly redesigning or renovating.',
      },
      {
        title: 'Connects the hotel with local culture',
        body: 'Local photographers and regional stories give guests a sense of the destination they are actually in.',
      },
      {
        title: 'Works across the entire property',
        body: 'Different collections curated for each kind of space rather than one set repeated floor after floor.',
      },
      {
        title: 'Adds value without major renovation',
        body: 'Transform the feel of a space through curated artwork instead of structural interior changes.',
      },
    ],
    areasLabel: 'Curated separately for',
    areas: [
      'Lobby & reception',
      'Guest corridors',
      'Hotel rooms',
      'Restaurants',
      'Cafés',
      'Conference rooms',
      'Lounges',
      'Waiting areas',
    ],
  },
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
    'Buy a photograph once and within a season it stops being art and becomes furniture. ARTINU works the other way round: we read the room, print and frame work made for it, then change it for something new every month.',
  image: IMAGES.spacesHero,
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
      'Lobby, corridor, suite - a sequence that reads as one hand, floor after floor, and changes often enough that a returning guest notices.',
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
      'Photography chosen for the room you actually live in - your light, your wall colours, your ceiling heights. Printed, framed and hung by us, and changed whenever the room starts to feel settled.',
    image: IMAGES.home_decor,
    alt: 'A bright living room with seating and soft daylight',
  },
};

// ── Section 6 ────────────────────────────────────────────────────────────────

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What if I don't like a photograph?",
    answer:
      'Say so - nothing is final until you approve it. During curation you can swap any frame for another from the gallery, or send us back to look again with what you did not like written down. After installation, if a photograph is not working in the room, we change it at your next rotation at no cost. If it is genuinely wrong for the wall - wrong scale, wrong tone, wrong light - tell us within fourteen days and we will change it sooner than that.',
  },
  {
    question: 'Who owns the art?',
    answer: `The photographer owns the copyright, always; that never transfers to us or to you. The photographs inside the frames are licensed to you for display while they hang, which is why they come back to us at each swap. Nobody may reproduce, resell or merchandise the image beyond that display licence - not you, not us. We ensure artists are fairly compensated for every photograph displayed.`,
  },
  {
    question: 'What happens on rotation day?',
    answer:
      'We confirm a two-hour window with you first, usually before service or before the office fills. Two people arrive with the next set already printed and mounted, lift each photograph out of its frame, set the new one in and take the old prints away for archiving. Frames, hangers and wall fixings stay exactly where they are - no new holes, no repainting, no dust sheet over your furniture for a day. Most spaces are finished in ninety minutes and nothing has to close.',
  },
  {
    question: 'Do you work outside Bengaluru?',
    answer:
      'Bengaluru is where our crew, our print lab and our framers are, so installation and rotation there are entirely in-house and that is where we are fastest. We also install in Mysuru, Chennai, Hyderabad and Pune through partner crews we have trained and work alongside, with a longer lead time on the first order - about three weeks rather than two. Anywhere else, tell us about the space and we will be straight with you about whether we can serve it properly yet rather than take the order and hope.',
  },
  {
    question: 'How long is the commitment?',
    answer:
      'Rotation runs as a rolling subscription with a three-month minimum, which is one full cycle - long enough to actually see a refresh before you decide anything. After that, thirty days of notice ends it. The last set of photographs comes back to us, and the frames stay yours to fill with whatever you like.',
  },
  {
    question: 'What does installation involve?',
    answer:
      'A short site survey comes first, because drywall, brick, glass partitions and exposed concrete each need a different anchor and we would rather know before we arrive with a drill. On the day: two people, drop cloths, a laser level and a vacuum. We drill, mount, level, wipe the glass down and take the packaging away with us. Three to twelve frames takes two to three hours. We work around your service hours - early mornings, Sundays, between lunch and dinner - at no extra charge.',
  },
];

export default function SpacesPage() {
  // null = the general pitch; a type = the page speaks to that room.
  const [selected, setSelected] = React.useState<ShownSpace | null>(null);
  const hero = selected ? SPACE_HEROES[selected] : DEFAULT_HERO;
  const heroRef = React.useRef<HTMLDivElement>(null);

  const valueRef = React.useRef<HTMLDivElement>(null);

  const choose = (type: ShownSpace) => {
    setSelected(type);
    /*
      Scroll to the case for that room, not back up to the hero.

      This used to jump to the hero, on the reasoning that the hero rewrites
      itself and the tiles sit below the fold. That was right when the hero was
      the only thing that changed. It is now wrong: the detailed case for the
      room - the proposition and its four points - sits directly beneath the
      tiles, so jumping to the hero threw the visitor PAST the thing they had
      just asked to see.

      The hero still rewrites. It is simply no longer what we scroll to.
    */
    valueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            <Typewriter
              as="h1"
              className="mt-5 max-w-[15ch] font-display text-[2.5rem] leading-[1.05] text-ink sm:text-5xl lg:text-6xl">
              {hero.headline}
            </Typewriter>
            <span className="rule mt-6" />
            <p className="prose-quiet mt-6">{hero.blurb}</p>

            <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Button shape="pill" size="lg" asChild>
                {/* Carries the chosen room through, so the booking form opens
                    already set to it rather than asking again. */}
                <Link to={selected ? `/lets-talk?type=${selected}` : '/lets-talk'}>
                  Book a wall visit
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

            <p className="mt-8 font-label text-[0.6875rem] uppercase tracking-[0.14em] text-subtle">
              {WALL_VISIT_NOTE}
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            {/* Keyed on the image so React swaps the element instead of mutating
                src — that is what lets the fade actually run on each change. */}
            <Photo
              key={hero.image}
              src={hero.image}
              alt={hero.alt}
              /*
                A landscape ratio, because the photograph is landscape.

                This box was `aspect-[4/5]` - portrait - and the photograph is
                1024x576. `object-cover` filled the tall box by cutting the
                sides off, which removed the one thing the picture is for: the
                framed ARTINU print on the right-hand wall. The subject was
                literally cropped out of the shot selling the product.

                16:10 keeps the full width and trims a little top and bottom,
                where there is only ceiling and floor.
              */
              ratio="aspect-[4/3] sm:aspect-[16/10]"
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
              description="Four things owners tell us made the difference - none of them about art, all of them about how little it asked of them."
              rule
            />
          </Reveal>

          {/*
            Four rows, not four columns.

            The icons and the card borders came out of this section already and it
            still read as a generated feature grid, because the grid was the thing
            doing it — four equal cells holding four equal paragraphs is that
            shape whatever you put inside them. Swapping a glyph for a hairline
            changed the decoration and left the form alone.

            As rows the prose also gets a measure it can be read at. Across four
            columns each body was set about 30 characters wide, which is a column
            for a caption, not for three sentences; and the second title —
            "Curation matched to your interiors" — wrapped to two lines while its
            neighbours stayed on one, so the four bodies all began at different
            heights and the row sat crooked.

            A description list, because that is what these are: a term and its
            explanation, four times.
          */}
          <Stagger className="mt-14 lg:mt-16">
            <dl>
              {REASONS.map(({ title, body }) => (
                <StaggerItem
                  key={title}
                  className="grid gap-y-2 border-t border-line-strong py-7 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-x-12 lg:py-8"
                >
                  <dt className="font-display text-xl leading-snug text-ink">{title}</dt>
                  <dd className="max-w-2xl text-sm leading-relaxed text-muted lg:text-[0.9375rem]">
                    {body}
                  </dd>
                </StaggerItem>
              ))}
            </dl>
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

          {/*
            This was a timeline: a bronze rule running down the page with a
            circled glyph sitting on it for every row. The rule and the circles
            were doing the job the numbers in the label were already doing, and
            because the number was buried mid-sentence the label had to announce
            itself as "Step 01 · Week one" to be found at all.

            The number now has its own column, each row is separated by a rule
            rather than threaded onto one, and the label is free to say only when
            the step happens.
          */}
          <ol className="mt-14 lg:mt-20">
            {STEPS.map(({ title, body, aside }, index) => (
              <li key={title} className="border-t border-line py-7 lg:py-9">
                <Reveal>
                  <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-5 lg:grid-cols-[2.5rem_15rem_minmax(0,1fr)] lg:gap-x-10">
                    <p className="font-label text-[0.6875rem] uppercase tabular-nums tracking-[0.16em] text-bronze lg:pt-1">
                      {String(index + 1).padStart(2, '0')}
                    </p>

                    <div>
                      <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                        {aside}
                      </p>
                      <h3 className="mt-2 font-display text-2xl leading-tight text-ink">{title}</h3>
                    </div>

                    <p className="col-start-2 mt-3 max-w-2xl text-sm leading-relaxed text-muted lg:col-start-3 lg:mt-0 lg:pt-1 lg:text-[0.9375rem]">
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

          {/*
            The case for whichever room is selected. Defaults to cafés because
            that is who arrives here most, and because an empty panel would make
            the selector above look broken.
          */}
          <Reveal delay={0.1}>
            <div ref={valueRef} className="mt-12 scroll-mt-24 border-t border-line pt-10 lg:mt-16">
              <p className="eyebrow">
                What it does for {SPACE_TYPE_LABELS[selected ?? 'cafe'].toLowerCase()}s
              </p>
              <p className="mt-5 max-w-3xl font-display text-[1.375rem] leading-[1.4] text-ink sm:text-[1.625rem]">
                {SPACE_VALUE[selected ?? 'cafe'].proposition}
              </p>

              <dl className="mt-9 grid gap-x-12 gap-y-7 sm:grid-cols-2">
                {SPACE_VALUE[selected ?? 'cafe'].points.map((point) => (
                  <div key={point.title}>
                    <dt className="text-[0.9375rem] font-medium text-ink">{point.title}</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-muted">{point.body}</dd>
                  </div>
                ))}
              </dl>

              {/*
                The rooms within the space, where there are any - offices,
                hotels and homes each got a list. Set as a plain run of labels
                rather than another grid: it is an inventory, and eight more
                cards under eight cards is a wall of boxes.
              */}
              {SPACE_VALUE[selected ?? 'cafe'].areas && (
                <div className="mt-10 border-t border-line-soft pt-6">
                  <p className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-subtle">
                    {SPACE_VALUE[selected ?? 'cafe'].areasLabel}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
                    {SPACE_VALUE[selected ?? 'cafe'].areas?.map((area) => (
                      <li
                        key={area}
                        className="rounded-full border border-line bg-canvas px-3 py-1 text-[0.8125rem] text-muted"
                      >
                        {area}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mt-8 text-sm text-muted">
              Clinic, gym, showroom, school, something we have not listed -{' '}
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
              description="If your question is not here, ask it on the call - we would rather answer it before you sign anything."
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
                    Book a wall visit
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

const WALL_VISIT_NOTE = `Bengaluru and around · About forty minutes · No obligation`;
