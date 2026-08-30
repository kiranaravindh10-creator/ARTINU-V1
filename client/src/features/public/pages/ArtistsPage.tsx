import { ART_STYLE_LABELS, ART_STYLES } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Eye, UserSearch } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleArrowLink, Container, Section } from '@/components/layout/primitives';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { FilterChips } from '@/components/ui/tabs';
import { ArtistCard, ArtistCardSkeleton } from '@/features/public/components/ArtistCard';
import { IMAGES } from '@/lib/images';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';

/*
  THE FOUR-ICON VALUES ROW IS GONE.

  It was a lucide glyph, a letterspaced label and a sentence, four across -
  "Seen in Real Spaces", "Fair & Transparent", "Growing Together", "Creative
  Freedom". That layout is the single most recognisable thing a generated
  marketing page produces, which is what the founder was reacting to.

  One of the four was also a promise ARTINU cannot keep yet: "You know what you
  earn on every frame, before it is printed", under a hand-holding-coins icon.
  Nobody is being paid per print today. That is the sentence a photographer
  screenshots and asks about, and it had to go regardless of how the row looked.

  What replaces it says the thing the founder actually wants said - that this is
  not a camera club - and it says it over real photographs by real members
  instead of four abstractions over stock. See ShotOnAnything below.
*/

/**
 * Featured artists stay hidden until the roster is worth featuring.
 *
 * Picking eight "featured" photographers out of nine tells a visitor there are
 * nine. The founder's instruction was to hide the strip "until we reach like 20
 * to 30 photographers" - so it is a threshold rather than a switch someone has
 * to remember to flip, and the section reappears on its own the day the
 * directory passes it.
 *
 * Note it CANNOT be hidden by emptying the curated list in the console: the
 * server falls back to auto-featured artists when that list is empty
 * (server/src/routes/user.routes.ts), so the strip would silently repopulate.
 */
const FEATURED_MIN_ARTISTS = 25;

const GENRE_CHIPS = [
  { value: 'all', label: 'All Artists' },
  ...ART_STYLES.map((style) => ({ value: style, label: ART_STYLE_LABELS[style] })),
];

export default function ArtistsPage() {
  const [params, setParams] = useSearchParams();
  const genre = params.get('genre') ?? 'all';
  const q = params.get('q') ?? '';
  const [searchDraft, setSearchDraft] = React.useState(q);

  React.useEffect(() => setSearchDraft(q), [q]);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const { data: featured, isLoading: loadingFeatured } = useQuery({
    queryKey: qk.artists({ featured: true }),
    queryFn: () => catalogService.artists({ featured: true, pageSize: 8 }),
  });

  const directoryParams = { q: q || undefined, genre: genre === 'all' ? undefined : genre, pageSize: 24 };
  const { data: directory, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.artists(directoryParams),
    queryFn: () => catalogService.artists(directoryParams),
  });

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col justify-center px-5 py-16 sm:px-8 lg:py-24 lg:pl-12 lg:pr-16">
          <Reveal>
            <h1 className="font-display text-[2.5rem] leading-[1.05] text-ink sm:text-[3.25rem]">
              Real people.
              <br />
              Real <em className="italic">perspectives.</em>
            </h1>
            {/*
              Letterspaced capitals, broken across two lines on purpose.

              This was briefly rewritten as one grey sentence on the grounds that
              caps at 0.16em "stop being read". Two lines of four words each do
              not, and the pairing — a 52px Playfair headline over a small wide
              label — is the oldest masthead in print. Set as prose it read like
              a caption apologising for the headline above it.
            */}
            <p className="mt-7 font-label text-[0.6875rem] uppercase leading-relaxed tracking-[0.16em] text-muted">
              Independent photographers.
              <br />
              Stories worth seeing.
            </p>
            {/* #directory, not #featured - the featured strip is gated on the
                roster size, and an anchor to a section that is not rendered
                scrolls nowhere. The directory is always there. */}
            <CircleArrowLink to="#directory" direction="down" className="mt-10">
              Explore artists
            </CircleArrowLink>
          </Reveal>
        </div>

        {/*
          The alt text described the photograph that used to be here - two
          cameras on a desk - and was left behind when the image changed. It
          now describes what is actually shown, which is the only thing a
          screen reader has to go on.
        */}
        <Photo
          src={IMAGES.photographersHero}
          alt="A photographer framing a shot on his phone in a Bengaluru street at dusk"
          priority
          ratio="aspect-[4/3] lg:aspect-[16/10]"
          className="min-h-[260px] lg:min-h-[32rem]"
        />
      </section>

      <ShotOnAnything artists={directory?.items ?? []} />

      {/* ── Featured artists ───────────────────────────────────────────── */}
      {/*
        Two conditions, both needed. The threshold is the founder's ask; the
        `items.length` check is because the heading and its rule used to render
        unconditionally, so a roster that returned nothing produced a labelled
        "Featured Artists" band above an empty scroll box.
      */}
      {(directory?.total ?? 0) >= FEATURED_MIN_ARTISTS && (featured?.items.length ?? 0) > 0 && (
      <Section id="featured" size="compact">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
            <div>
              <p className="eyebrow">Featured Artists</p>
              <span className="rule mt-4" />
            </div>

            <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              {loadingFeatured
                ? Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="w-56 shrink-0">
                      <ArtistCardSkeleton />
                    </div>
                  ))
                : featured?.items.map((artist, index) => (
                    <ArtistCard
                      key={artist.id}
                      artist={artist}
                      priority={index < 3}
                      className="w-56 shrink-0"
                    />
                  ))}
            </div>
          </div>
        </Container>
      </Section>
      )}

      {/* ── Directory ──────────────────────────────────────────────────── */}
      <Section id="directory" tone="soft" size="compact">
        <Container size="wide">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-[2rem] leading-tight text-ink">Every artist on ARTINU</h2>
              <p className="mt-2 text-sm text-muted">
                {directory ? `${directory.total} photographers` : 'Loading…'} across India and beyond.
              </p>
            </div>

            <form
              className="w-full max-w-xs"
              onSubmit={(event) => {
                event.preventDefault();
                update({ q: searchDraft });
              }}
            >
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search artists…"
                icon={<UserSearch />}
                aria-label="Search artists"
              />
            </form>
          </div>

          <FilterChips
            className="mt-6"
            options={GENRE_CHIPS}
            value={genre}
            onChange={(value) => update({ genre: value })}
          />

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
              Array.from({ length: 10 }, (_, index) => <ArtistCardSkeleton key={index} />)
            ) : directory && directory.items.length > 0 ? (
              directory.items.map((artist) => <ArtistCard key={artist.id} artist={artist} />)
            ) : (
              <div className="col-span-full">
                <EmptyState
                  icon={<Eye />}
                  title="No artists match that search."
                  description="Try a different name, city or genre."
                  action={
                    <Button variant="outline" onClick={() => setParams(new URLSearchParams())}>
                      Clear filters
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </Container>
      </Section>

      {/* ── Join band ──────────────────────────────────────────────────── */}
      <Section size="compact" className="pt-0">
        <Container size="wide">
          <div className="grid items-center gap-8 overflow-hidden rounded-xl bg-sand-soft lg:grid-cols-2">
            <div className="px-6 py-12 sm:px-12">
              <h2 className="font-display text-[2rem] leading-tight text-ink">
                Your work.
                <br />
                Real world.
              </h2>
              <p className="prose-quiet mt-5 max-w-sm">
                We bring your photographs to spaces where they are experienced, noticed and
                remembered.
              </p>
              <Button shape="pill" asChild className="mt-8">
                <Link to="/join">Join our artist community</Link>
              </Button>
            </div>
            {/*
              The heading says the work is "experienced, noticed and
              remembered". This is a photograph of exactly that happening:
              four people at a cafe wall, reading the credit plate and pointing
              at the QR that leads back to the photographer.

              It replaces a stock darkroom interior, which illustrated the
              heading not at all and quietly implied film - on a page whose
              whole argument is that a phone is enough.
            */}
            <Photo
              src={IMAGES.spacesLifestyle}
              alt="Four people at a cafe wall reading the credit plate beside a framed ARTINU photograph"
              ratio="aspect-[4/3]"
              className="h-full"
            />
          </div>
        </Container>
      </Section>
    </>
  );
}

/**
 * "It does not have to be a camera."
 *
 * The founder's point, in his words: "photography in art doesn't limit only
 * with respect to camera, even with respect to mobile people can shoot and they
 * can upload - that part we need to focus upon". Photographers were signing up
 * and then not uploading, and one reason a page can cause that is by looking
 * like it is addressed to someone with better equipment than you.
 *
 * So this says it plainly, and it says it over REAL WORK BY REAL MEMBERS. Every
 * other photograph on this page is Unsplash stock; a page about ARTINU's
 * photographers that contains none of their photographs is going to read as
 * generic no matter how the words are set.
 *
 * The covers come from the directory query that is already on the page, so this
 * costs no extra request. With fewer than three of them the strip is dropped and
 * the statement stands on its own rather than rendering a lopsided row.
 */
function ShotOnAnything({ artists }: { artists: { id: string; slug: string; name: string; coverUrl?: string | null }[] }) {
  const withCovers = artists.filter((artist) => Boolean(artist.coverUrl)).slice(0, 3);

  return (
    <section className="border-y border-line bg-surface">
      <Container size="wide" className="py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
          <Reveal>
            <p className="eyebrow">No camera required</p>
            <h2 className="mt-5 font-display text-[2rem] leading-[1.1] text-ink sm:text-[2.5rem]">
              If you can see it, you can <em className="editorial-italic">shoot</em> it.
            </h2>
            <p className="prose-quiet mt-5">
              A phone in your pocket is a camera. Some of the photographs ARTINU has printed and
              hung were taken on one, and nobody standing in front of a framed print on a wall has
              ever asked what it was shot on.
            </p>
            <p className="prose-quiet mt-4">
              There is no equipment list, no portfolio review and no minimum following. Upload a
              photograph you are proud of. If it works on a wall, we will print it, frame it and
              put your name beside it.
            </p>
            <Button shape="pill" asChild className="mt-8">
              <Link to="/join">Upload your first photograph</Link>
            </Button>
          </Reveal>

          {withCovers.length >= 3 && (
            <Stagger className="grid grid-cols-3 gap-3">
              {withCovers.map((artist) => (
                <StaggerItem key={artist.id}>
                  <Link to={`/artists/${artist.slug}`} className="group block">
                    <Photo
                      src={artist.coverUrl as string}
                      alt={`Work by ${artist.name}`}
                      ratio="aspect-[3/4]"
                      thumbnail
                      className="rounded-sm"
                      imgClassName="transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
                    />
                    {/* The credit is in the markup, not on hover - who took a
                        photograph is not a decoration. */}
                    <p className="mt-2 truncate font-label text-[0.625rem] uppercase tracking-[0.16em] text-muted">
                      {artist.name}
                    </p>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </Container>
    </section>
  );
}
