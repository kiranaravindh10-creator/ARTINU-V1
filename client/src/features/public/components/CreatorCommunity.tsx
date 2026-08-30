import type { PublicArtist } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Container, Section, SectionHeading } from '@/components/layout/primitives';
import { EASE, Reveal, Stagger, StaggerItem } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Avatar, Skeleton } from '@/components/ui/display';
import { qk } from '@/lib/query';
import { catalogService } from '@/services/catalog.service';
import { cn } from '@/lib/utils';

/**
 * The ARTINU creator community.
 *
 * The section exists to answer one question a photographer arrives with: is this
 * a place where my work gets seen, or a shelf it gets filed on. So it is built
 * out of the actual roster rather than illustrations of one — every face, name
 * and city below is a real artist read from /users/artists, and the two figures
 * at the end are real totals. Nothing here is a placeholder that would have to
 * be swapped for the truth later, and nothing is invented to look larger.
 *
 * The pillars deliberately carry no icons. The brief suggested them, but this
 * site removed outlined-glyph feature grids from five other sections precisely
 * because they read as generated — a hairline and a serif title is the pattern
 * the rest of the page already uses for a set of non-sequential propositions.
 * The journey below them IS a sequence, so it is numbered, and it is an <ol>.
 */

/** How many creators the constellation shows before it becomes a crowd. */
const CONSTELLATION_SIZE = 7;

const PILLARS = [
  {
    title: 'Showcase',
    body: 'A page that belongs to you - your photographs, your story, your name on the wall beside them.',
  },
  {
    title: 'Get discovered',
    body: 'Your work is put in front of people looking to fill a room, not only in front of the people who already follow you.',
  },
  {
    title: 'Beyond the screen',
    body: 'Chosen photographs are printed, framed and hung in cafés, studios and hotels - seen by people who will never open the app.',
  },
  {
    title: 'Grow together',
    body: 'A roster of photographers whose work travels alongside yours, and a team that credits every one of them by name.',
  },
];

const JOURNEY = [
  { title: 'Join', detail: 'Apply with a handful of photographs.' },
  { title: 'Upload', detail: 'Add the work you want seen.' },
  { title: 'Reviewed', detail: 'A person looks at every submission.' },
  { title: 'Discovered', detail: 'Your work enters the gallery.' },
  { title: 'Printed', detail: 'Chosen pieces are framed and hung.' },
  { title: 'On the wall', detail: 'Credited, in a room, for months.' },
];

/**
 * Where each creator sits around the mark.
 *
 * Angles are spread evenly and then nudged by a fixed per-index offset, and the
 * radius alternates between two rings. Both are deterministic — the same artist
 * lands in the same place on every render, so nothing jumps on a re-render — but
 * the irregularity is what keeps it from reading as a corporate hub-and-spoke.
 */
function orbit(index: number, total: number) {
  const NUDGE = [0, 7, -5, 11, -9, 4, -12];
  const angle = (index / total) * 360 + (NUDGE[index % NUDGE.length] ?? 0) - 90;
  const radius = index % 2 === 0 ? 42 : 33;
  const radians = (angle * Math.PI) / 180;
  return {
    angle,
    x: 50 + radius * Math.cos(radians),
    y: 50 + radius * Math.sin(radians),
  };
}

function CreatorNode({
  artist,
  index,
  total,
  active,
  dimmed,
  onFocus,
  onBlur,
  reduced,
}: {
  artist: PublicArtist;
  index: number;
  total: number;
  active: boolean;
  dimmed: boolean;
  onFocus: () => void;
  onBlur: () => void;
  reduced: boolean;
}) {
  const { x, y } = orbit(index, total);

  return (
    <motion.li
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
      // Each node drifts on its own clock, so the group breathes rather than
      // pulsing in unison. Off entirely under reduced motion.
      animate={reduced ? undefined : { y: [0, index % 2 === 0 ? -6 : 5, 0] }}
      transition={
        reduced
          ? undefined
          : { duration: 7 + (index % 3), repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 }
      }
    >
      <Link
        to={`/artists/${artist.slug}`}
        onMouseEnter={onFocus}
        onMouseLeave={onBlur}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn(
          'group flex flex-col items-center gap-1.5 rounded-md p-1 transition-opacity duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40',
          dimmed ? 'opacity-40' : 'opacity-100',
        )}
      >
        <Avatar
          name={artist.name}
          src={artist.avatarUrl}
          className={cn(
            'size-14 shrink-0 ring-1 transition-all duration-300 sm:size-16',
            active ? 'ring-2 ring-bronze' : 'ring-line',
          )}
        />
        <span className="max-w-[7rem] truncate text-center text-xs font-medium text-ink">
          {artist.name}
        </span>
        {artist.city && (
          <span className="font-label text-[0.5625rem] uppercase tracking-[0.14em] text-subtle">
            {artist.city}
          </span>
        )}
      </Link>
    </motion.li>
  );
}

/**
 * The constellation: real creators around the ARTINU mark.
 *
 * Absolute positioning inside a square, so it stays circular at every width.
 * Below `sm` it is replaced entirely by a scrolling row — a seven-point orbit on
 * a 360px screen is a pile, not a diagram.
 */
function Constellation({ artists }: { artists: PublicArtist[] }) {
  const reduced = useReducedMotion();
  const [active, setActive] = React.useState<string | null>(null);
  const shown = artists.slice(0, CONSTELLATION_SIZE);

  return (
    <>
      {/* ── Desktop and tablet ─────────────────────────────────────────── */}
      <div className="relative mx-auto hidden aspect-square w-full max-w-[34rem] sm:block">
        {/*
          The connectors, behind everything.

          Drawn once as a single SVG rather than as a positioned div per line:
          a line between two points is what SVG is for, and one element beats
          seven absolutely-positioned rotated rectangles.
        */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          aria-hidden
          focusable="false"
        >
          <circle cx="50" cy="50" r="42" className="fill-none stroke-line" strokeWidth="0.15" />
          <circle cx="50" cy="50" r="33" className="fill-none stroke-line" strokeWidth="0.15" />
          {shown.map((artist, index) => {
            const { x, y } = orbit(index, shown.length);
            const lit = active === artist.id;
            return (
              <line
                key={artist.id}
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                className={cn(
                  'transition-all duration-300',
                  lit ? 'stroke-bronze' : 'stroke-line-strong',
                )}
                strokeWidth={lit ? 0.4 : 0.2}
                opacity={active && !lit ? 0.3 : 1}
              />
            );
          })}
        </svg>

        {/* The centre: what every line connects to. */}
        <div className="absolute left-1/2 top-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-canvas sm:size-28">
          <span className="font-display text-lg font-bold tracking-[-0.02em] text-ink sm:text-xl">
            ARTINU
          </span>
        </div>

        <ul className="absolute inset-0">
          {shown.map((artist, index) => (
            <CreatorNode
              key={artist.id}
              artist={artist}
              index={index}
              total={shown.length}
              active={active === artist.id}
              dimmed={Boolean(active) && active !== artist.id}
              onFocus={() => setActive(artist.id)}
              onBlur={() => setActive(null)}
              reduced={Boolean(reduced)}
            />
          ))}
        </ul>
      </div>

      {/* ── Mobile: a row, not an orbit ────────────────────────────────── */}
      <ul className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-2 sm:hidden">
        {artists.slice(0, 10).map((artist) => (
          <li key={artist.id} className="shrink-0">
            <Link
              to={`/artists/${artist.slug}`}
              className="flex w-24 flex-col items-center gap-2 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40"
            >
              <Avatar
                name={artist.name}
                src={artist.avatarUrl}
                className="size-16 ring-1 ring-line"
              />
              <span className="w-full truncate text-center text-xs font-medium text-ink">
                {artist.name}
              </span>
              {artist.city && (
                <span className="w-full truncate text-center font-label text-[0.5625rem] uppercase tracking-[0.14em] text-subtle">
                  {artist.city}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function ConstellationSkeleton() {
  return (
    <>
      <div className="relative mx-auto hidden aspect-square w-full max-w-[34rem] sm:block">
        <div className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line-soft" />
        {Array.from({ length: CONSTELLATION_SIZE }, (_, index) => {
          const { x, y } = orbit(index, CONSTELLATION_SIZE);
          return (
            <Skeleton
              key={index}
              className="absolute size-16 rounded-full"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
            />
          );
        })}
      </div>
      <div className="flex gap-3 sm:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="size-16 shrink-0 rounded-full" />
        ))}
      </div>
    </>
  );
}

export function CreatorCommunity() {
  const reduced = useReducedMotion();

  /*
    One request serves both the faces and the count.

    `total` is the real number of artists with published work — the same figure
    the artists directory reports — so the strip at the end quotes the roster
    rather than the handful drawn above it.
  */
  const { data: artists, isLoading } = useQuery({
    queryKey: qk.artists({ community: true }),
    queryFn: () => catalogService.artists({ pageSize: 12 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: works } = useQuery({
    queryKey: qk.gallery({ community: true }),
    queryFn: () => catalogService.gallery({ pageSize: 1 }),
    staleTime: 5 * 60 * 1000,
  });

  const roster = artists?.items ?? [];

  /*
    Only ever real figures.

    Both come straight off a paginated response's `total`, so they cannot drift
    from what the gallery and the directory actually hold. A stat renders only
    once its number has arrived and is above zero — an unreachable API shows the
    rest of the section rather than "0 photographers", which would be worse than
    saying nothing.
  */
  const stats = [
    { value: artists?.total, label: 'Photographers and artists' },
    { value: works?.total, label: 'Works showcased' },
  ].filter((stat): stat is { value: number; label: string } => typeof stat.value === 'number' && stat.value > 0);

  return (
    <Section tone="sand" size="default" aria-labelledby="community-title">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="The ARTINU community"
            title={
              <>
                Building a community around <em className="editorial-italic">creators</em>.
              </>
            }
            description="Photographers and artists, brought together to show their work, reach people beyond their own following, and see it printed and hung in rooms across the city."
            className="max-w-3xl"
            rule
          />
        </Reveal>

        {/* ── The community itself ───────────────────────────────────────── */}
        <div className="mt-14 lg:mt-16">
          {isLoading ? (
            <ConstellationSkeleton />
          ) : roster.length > 0 ? (
            <Reveal>
              <Constellation artists={roster} />
              <p className="mt-6 text-center text-xs text-subtle sm:mt-8">
                Photographers already showing with ARTINU.{' '}
                <Link to="/artists" className="text-ink underline-offset-4 hover:underline">
                  Meet them all
                </Link>
              </p>
            </Reveal>
          ) : null}
        </div>

        {/* ── What a creator actually gets ───────────────────────────────── */}
        <Stagger className="mt-16 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
          {PILLARS.map((pillar) => (
            <StaggerItem key={pillar.title} className="border-t border-line-strong pt-5">
              <h3 className="font-display text-xl leading-snug text-ink">{pillar.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{pillar.body}</p>
            </StaggerItem>
          ))}
        </Stagger>

        {/* ── The journey, which is genuinely a sequence ─────────────────── */}
        <div className="mt-16 lg:mt-20">
          <p className="eyebrow eyebrow-muted">From joining to the wall</p>
          <ol className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line-strong sm:grid-cols-2 lg:grid-cols-6">
            {JOURNEY.map((step, index) => (
              <li key={step.title} className="bg-sand-soft p-5">
                <p className="font-label text-[0.6875rem] uppercase tabular-nums tracking-[0.16em] text-bronze">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-2.5 font-display text-lg leading-tight text-ink">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* ── Real numbers, or none ──────────────────────────────────────── */}
        {stats.length > 0 && (
          <Reveal>
            <dl className="mt-14 flex flex-wrap items-baseline justify-center gap-x-16 gap-y-6 border-t border-line-strong pt-10 lg:mt-16">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <dd className="font-display text-[2.5rem] leading-none tabular-nums text-ink">
                    {stat.value.toLocaleString('en-IN')}
                  </dd>
                  <dt className="mt-2 font-label text-[0.625rem] uppercase tracking-[0.16em] text-muted">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </Reveal>
        )}

        {/* ── The ask ────────────────────────────────────────────────────── */}
        <motion.div
          className="mt-14 flex flex-col items-center gap-5 text-center lg:mt-16"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <h3
            id="community-title"
            className="max-w-xl font-display text-[1.75rem] leading-tight text-ink sm:text-[2.25rem]"
          >
            Become part of the community.
          </h3>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            Share your perspective. Let your work be discovered - on screens, and on walls.
          </p>
          <Button shape="pill" size="lg" asChild className="mt-1">
            {/* The existing artist intake, not a new route. */}
            <Link to="/join">Join ARTINU</Link>
          </Button>
        </motion.div>
      </Container>
    </Section>
  );
}
