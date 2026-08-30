import type { PublicArtist } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLink } from '@/components/layout/primitives';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Avatar, Skeleton } from '@/components/ui/display';
import { Photo } from '@/components/ui/photo';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { cn } from '@/lib/utils';

/**
 * The gallery opening: the people behind the photographs, not a collage of
 * stock imagery.
 *
 * What it replaced was four fixed Unsplash pictures under `aria-hidden` beside
 * the words "Photography that speaks." Nothing in it came from ARTINU, and a
 * visitor could read the whole thing without learning that anyone in particular
 * had taken any of it.
 *
 * Everything here is the real roster, read from /users/artists — names, cities,
 * their own cover images and avatars, and their real published counts. It grows
 * on its own as photographers join, and it degrades to the text block alone if
 * the request fails.
 *
 * WHY AN ART WALL RATHER THAN A NETWORK DIAGRAM
 *
 * The tiles sit in a grid whose one-pixel gaps are the connective tissue: the
 * container is the line colour and the cells sit on top of it, so the hairlines
 * between creators are the grid itself. That reads as an editorial wall of work
 * — which is what ARTINU physically builds — where drawn connector lines would
 * have read as an org chart. It also means no absolute positioning, so nothing
 * can overflow and there is no layout shift as images arrive.
 */

/**
 * The composition. Each entry is one tile's span and what it shows.
 *
 * Deliberately irregular and deliberately fixed: a stable pattern means the wall
 * looks composed rather than randomly generated, and the same artist keeps the
 * same tile between renders. `cover` tiles are wide and carry the photographer's
 * own backdrop; `portrait` tiles are tall and lead with their face.
 */
const TILES = [
  { span: 'col-span-2 row-span-2', kind: 'cover' },
  { span: 'col-span-2 row-span-1', kind: 'cover' },
  { span: 'col-span-1 row-span-1', kind: 'portrait' },
  { span: 'col-span-1 row-span-1', kind: 'portrait' },
  { span: 'col-span-1 row-span-2', kind: 'portrait' },
  { span: 'col-span-2 row-span-1', kind: 'cover' },
  { span: 'col-span-1 row-span-1', kind: 'portrait' },
  // The ARTINU cell is placed by the markup between this tile and the next, so
  // the pattern deliberately leaves exactly one unit for it here.
  { span: 'col-span-2 row-span-1', kind: 'cover' },
] as const;

/**
 * The wall only works at its full size.
 *
 * The eight spans above plus the ARTINU cell cover 4x4 exactly — verified by
 * walking the row-major placement, not by eye. That matters because the grid
 * container is the line colour with one-pixel gaps: any cell the tiles fail to
 * cover is not empty space, it is a grey rectangle.
 *
 * An earlier pattern covered 14 of the 16 and would have shipped two of them.
 * Below eight creators the wall cannot tile at all, so the roster falls back to
 * an evenly spaced grid where every tile is one unit and a short last row is
 * simply paper.
 */
const WALL_MINIMUM = TILES.length;

/**
 * What a tile needs to render: the classes that size it, and which of the
 * artist's two images to lead with. Kept structural rather than a union of the
 * literal spans above, so the smaller fallback layout can pass its own sizing
 * without being cast into a shape it does not have.
 */
interface TileShape {
  span: string;
  kind: 'cover' | 'portrait';
}

function CreatorTile({
  artist,
  tile,
  index,
  dimmed,
  onEnter,
  onLeave,
}: {
  artist: PublicArtist;
  tile: TileShape;
  index: number;
  dimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const isCover = tile.kind === 'cover';
  const image = isCover ? artist.coverUrl : artist.avatarUrl;

  return (
    <Link
      to={`/artists/${artist.slug}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={cn(
        'group relative isolate overflow-hidden bg-sand transition-opacity duration-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bronze',
        tile.span,
        dimmed ? 'opacity-45' : 'opacity-100',
      )}
    >
      {image ? (
        <Photo
          src={image}
          alt={`Work by ${artist.name}`}
          // Only the largest opening tile is eager: it is the one likely to be
          // the largest element painted, and the rest are below or beside it.
          priority={index === 0}
          className="absolute inset-0 size-full"
          imgClassName="size-full object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
        />
      ) : (
        // No cover on file — the initials disc rather than an empty rectangle.
        <div className="absolute inset-0 flex items-center justify-center bg-sand">
          <Avatar name={artist.name} className="size-14" />
        </div>
      )}

      {/* Enough wash for the name to hold at any exposure. */}
      <div
        className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent"
        aria-hidden
      />

      {/*
        The caption is always rendered, never revealed on hover: who took a
        photograph is information, and information that only exists during a
        pointer gesture is unavailable to a keyboard, a screen reader or a
        touchscreen.
      */}
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <p className="truncate text-sm font-medium text-canvas">{artist.name}</p>
        <p className="mt-0.5 truncate font-label text-[0.5625rem] uppercase tracking-[0.16em] text-canvas/65">
          Photographer{artist.city ? ` · ${artist.city}` : ''}
        </p>
      </div>
    </Link>
  );
}

/** Reserves the wall's exact footprint, so nothing moves when the roster lands. */
function WallSkeleton() {
  return (
    <div className="hidden aspect-[4/3] grid-cols-4 grid-rows-4 gap-px bg-line sm:grid">
      {TILES.map((tile, index) => (
        <Skeleton key={index} className={cn('rounded-none', tile.span)} />
      ))}
      <Skeleton className="col-span-1 row-span-1 rounded-none" />
    </div>
  );
}

export function GalleryCommunityHero() {
  const [active, setActive] = React.useState<string | null>(null);

  /*
    Its own query, not the gallery's.

    The page already loads artworks, but that list is filtered by the search box
    and the sort control — reusing it would rebuild the wall every time somebody
    typed a letter. This one is keyed independently and held for five minutes, so
    the opening is stable while the gallery below it changes.
  */
  const { data, isLoading } = useQuery({
    queryKey: qk.artists({ galleryHero: true }),
    queryFn: () => catalogService.artists({ pageSize: 12 }),
    staleTime: 5 * 60 * 1000,
  });

  const roster = data?.items ?? [];
  const canTile = roster.length >= WALL_MINIMUM;
  const wall = roster.slice(0, WALL_MINIMUM);

  return (
    <section
      className="grid items-center gap-10 px-5 pb-14 pt-10 sm:px-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:gap-14 lg:px-12 lg:pb-20"
      aria-labelledby="gallery-hero-title"
    >
      {/* ── What this page is ──────────────────────────────────────────── */}
      <Reveal>
        {/*
          THIS USED TO SAY NOTHING ABOUT THE GALLERY.

          It read "More than a gallery / Where creators become part of something
          BIGGER" over a sentence about community, then a four-step arrow
          pipeline - Your work -> Discovered -> Shared -> Experienced. The
          founder's objection was exact: it does not explain what the gallery is.
          A visitor who had just clicked "Gallery" was told the page was more
          than the thing they came for, and then shown a process diagram.

          The eyebrow-headline-rule-paragraph stack with the last word in italics
          is also the most reproduced shape a generated page has, and the arrow
          row is a flowchart with the boxes removed. Both are gone.

          What replaces them answers three questions a first-time visitor
          actually has - what am I looking at, can I get one, and who took these -
          in three lines, set as a definition list because that is what they are.
        */}
        <p className="eyebrow">The gallery</p>

        <h1
          id="gallery-hero-title"
          className="mt-5 font-display text-[2.5rem] leading-[1.05] text-ink sm:text-[3.25rem]"
        >
          Every photograph here is looking for a wall.
        </h1>

        <p className="prose-quiet mt-6 max-w-md">
          This is the working collection - everything independent photographers have uploaded to
          ARTINU and everything we can print for a space. Browse it the way you would a gallery,
          or search it the way you would a catalogue.
        </p>

        <dl className="mt-8 max-w-md space-y-4 border-t border-line pt-6">
          <div>
            <dt className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-ink">
              Everything is printable
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">
              Nothing here is stock. Any photograph on this page can be printed, framed and hung
              in a café, a hotel, an office or a home.
            </dd>
          </div>
          <div>
            <dt className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-ink">
              Every photograph is credited
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">
              The photographer's name sits under their work here, on the gallery page, and on the
              wall it ends up on.
            </dd>
          </div>
          <div>
            <dt className="font-label text-[0.625rem] uppercase tracking-[0.16em] text-ink">
              It keeps changing
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">
              New work arrives every week, and collections rotate every month - so the wall you
              saw last month is not the wall you will see next.
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* The existing artist intake, not a new route. */}
          <Button shape="pill" size="lg" asChild>
            <Link to="/join">
              Add your photographs <ArrowRight />
            </Link>
          </Button>
          <ArrowLink to="/artists">Meet the photographers</ArrowLink>
        </div>
      </Reveal>

      {/* ── The people ─────────────────────────────────────────────────── */}
      <Reveal delay={0.1}>
        {isLoading ? (
          <WallSkeleton />
        ) : wall.length > 0 ? (
          <>
            {/*
              Desktop and tablet: the wall.

              `gap-px` over a `bg-line` container makes the hairlines between
              creators the grid itself — the connective tissue, without drawing a
              single connector.
            */}
            {canTile ? (
              <div
                className="hidden aspect-[4/3] grid-cols-4 grid-rows-4 gap-px overflow-hidden bg-line sm:grid"
                onMouseLeave={() => setActive(null)}
              >
                {/*
                  Order matters here and is not cosmetic. The spans are placed
                  row-major, and the ARTINU cell sits between the seventh and
                  eighth tiles because that is the single unit the pattern leaves
                  open on the last row. Reordering these children re-tiles the
                  whole wall and will open holes.
                */}
                {wall.slice(0, 7).map((artist, index) => (
                  <CreatorTile
                    key={artist.id}
                    artist={artist}
                    tile={TILES[index]}
                    index={index}
                    dimmed={Boolean(active) && active !== artist.id}
                    onEnter={() => setActive(artist.id)}
                    onLeave={() => setActive(null)}
                  />
                ))}

                {/*
                  The mark, in the wall rather than over it — one more panel
                  among the photographers, not a badge stamped on their work.
                */}
                <div className="col-span-1 row-span-1 flex items-center justify-center bg-canvas p-2">
                  <span className="font-display text-sm font-bold tracking-[-0.02em] text-ink lg:text-base">
                    ARTINU
                  </span>
                </div>

                {wall.slice(7).map((artist, index) => (
                  <CreatorTile
                    key={artist.id}
                    artist={artist}
                    tile={TILES[7 + index]}
                    index={7 + index}
                    dimmed={Boolean(active) && active !== artist.id}
                    onEnter={() => setActive(artist.id)}
                    onLeave={() => setActive(null)}
                  />
                ))}
              </div>
            ) : (
              /*
                Too few creators to tile the wall.

                Evenly spaced squares on paper rather than the hairline grid, so
                a short last row reads as composition rather than as a gap. This
                is the layout a new ARTINU sees, and it should look deliberate.
              */
              <div
                className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3"
                onMouseLeave={() => setActive(null)}
              >
                {roster.map((artist, index) => (
                  <CreatorTile
                    key={artist.id}
                    artist={artist}
                    tile={{ span: 'aspect-[4/5]', kind: 'cover' }}
                    index={index}
                    dimmed={Boolean(active) && active !== artist.id}
                    onEnter={() => setActive(artist.id)}
                    onLeave={() => setActive(null)}
                  />
                ))}
                <div className="flex aspect-[4/5] items-center justify-center border border-line bg-canvas p-2">
                  <span className="font-display text-sm font-bold tracking-[-0.02em] text-ink">
                    ARTINU
                  </span>
                </div>
              </div>
            )}

            {/* Mobile: a strip, not a shrunken wall. */}
            <ul className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 sm:hidden">
              {roster.slice(0, 10).map((artist) => (
                <li key={artist.id} className="w-40 shrink-0">
                  <Link
                    to={`/artists/${artist.slug}`}
                    className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
                  >
                    <div className="relative overflow-hidden bg-sand">
                      {artist.coverUrl || artist.avatarUrl ? (
                        <Photo
                          src={(artist.coverUrl ?? artist.avatarUrl) as string}
                          alt={`Work by ${artist.name}`}
                          ratio="aspect-[4/5]"
                          className="w-full"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center">
                          <Avatar name={artist.name} className="size-12" />
                        </div>
                      )}
                      <div
                        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/90 to-transparent"
                        aria-hidden
                      />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="truncate text-sm font-medium text-canvas">{artist.name}</p>
                        <p className="mt-0.5 truncate font-label text-[0.5625rem] uppercase tracking-[0.16em] text-canvas/65">
                          Photographer{artist.city ? ` · ${artist.city}` : ''}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/*
              An editorial line, not a metric.

              The count is real — it is the roster total the artists directory
              reports — and it is set in prose rather than as a statistic tile so
              that nine reads as a community rather than as a small number.
            */}
            {typeof data?.total === 'number' && data.total > 0 && (
              <p className="mt-4 text-xs text-subtle">
                {data.total} independent {data.total === 1 ? 'photographer' : 'photographers'}{' '}
                showing with ARTINU.{' '}
                <Link to="/artists" className="text-ink underline-offset-4 hover:underline">
                  Meet them
                </Link>
              </p>
            )}
          </>
        ) : null}
      </Reveal>
    </section>
  );
}
