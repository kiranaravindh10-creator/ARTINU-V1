import { ART_STYLE_LABELS, ART_STYLES } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Eye, HandCoins, Scan, Sun, Users, UserSearch } from 'lucide-react';
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

const VALUES = [
  {
    icon: Scan,
    label: 'Seen in Real Spaces',
    body: 'Your photographs hang in cafés, hotels and studios — not in a feed.',
  },
  {
    icon: HandCoins,
    label: 'Fair & Transparent',
    body: 'You know what you earn on every frame, before it is printed.',
  },
  {
    icon: Users,
    label: 'Growing Together',
    body: 'A community of photographers who share work, not just links.',
  },
  {
    icon: Sun,
    label: 'Creative Freedom',
    body: 'Shoot what you shoot. We curate around you, not the other way round.',
  },
];

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
            <p className="mt-7 font-mono text-[0.6875rem] uppercase leading-relaxed tracking-[0.16em] text-muted">
              Independent photographers.
              <br />
              Stories worth seeing.
            </p>
            <CircleArrowLink to="#featured" direction="down" className="mt-10">
              Explore artists
            </CircleArrowLink>
          </Reveal>
        </div>

        <Photo
          src={IMAGES.camerasAndPrints}
          alt="Two cameras beside printed photographs on a desk"
          priority
          className="min-h-[260px] lg:min-h-[32rem]"
        />
      </section>

      {/* ── Values band ────────────────────────────────────────────────── */}
      <section className="grid bg-ink text-canvas lg:grid-cols-[minmax(0,0.65fr)_minmax(0,2fr)]">
        <Photo
          src={IMAGES.cameraLenses}
          alt="Camera lenses laid out on a dark surface"
          className="min-h-[180px] lg:min-h-[13rem]"
          imgClassName="brightness-75"
        />
        {/* items-start, not centre: with 2- and 3-line bodies, centring each
            cell independently pushed the icons and labels to different heights
            and the row read as misaligned. Aligning to the top lines the icons
            and labels up and lets only the body text differ in length. */}
        <Stagger className="grid grid-cols-2 items-start gap-y-8 px-6 py-10 sm:px-10 lg:grid-cols-4 lg:gap-6 lg:py-12">
          {VALUES.map((value, index) => (
            <StaggerItem
              key={value.label}
              className={`flex flex-col items-center gap-3 px-2 text-center lg:px-6 ${
                index > 0 ? 'lg:border-l lg:border-canvas/15' : ''
              }`}
            >
              <value.icon className="size-6 stroke-[1.2] text-canvas/80" aria-hidden />
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-canvas">
                {value.label}
              </p>
              <p className="max-w-[13rem] text-xs leading-relaxed text-canvas/50">{value.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── Featured artists ───────────────────────────────────────────── */}
      <Section id="featured" size="compact">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
            <div className="flex flex-col justify-between">
              <div>
                <p className="eyebrow">Featured Artists</p>
                <span className="rule mt-4" />
              </div>
              <CircleArrowLink to="#directory" direction="down" className="mt-8 hidden lg:inline-flex">
                View all artists
              </CircleArrowLink>
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
            <Photo
              src={IMAGES.prints}
              alt="Printed photographs and a camera on a wooden table"
              ratio="aspect-[4/3]"
              className="h-full"
            />
          </div>
        </Container>
      </Section>
    </>
  );
}
