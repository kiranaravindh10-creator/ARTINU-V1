import type { Cafe, FeaturedCollection, HeroSlide, SlideshowSettings } from '@artinu/shared';
import { DEFAULT_SLIDESHOW_SETTINGS } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { api } from '@/lib/api';

/**
 * THE HOMEPAGE'S CONTENT, FETCHED ONCE AND REMEMBERED BETWEEN VISITS.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 *
 * The homepage asked for its furniture in five separate requests and kept the
 * answers only in memory, with a five-minute `gcTime`. So every arrival — a new
 * visitor, a reload, a return an hour later — began with an empty page and five
 * round trips to an API in Singapore that runs on a free Render instance and
 * spins down when idle. Warm, that is about six seconds of sequential waiting
 * for four kilobytes. Cold, the first request alone was measured at 31.7
 * seconds.
 *
 * And the sections do not wait politely. Collaborations and testimonials both
 * `return null` when their data has not arrived, so a slow or failed fetch did
 * not show a spinner or a gap — the sections were simply NOT THERE, and then
 * were there on the next visit once the dyno had woken. That is the whole of
 * "sometimes it comes, sometimes it doesn't".
 *
 * ── What this does ──────────────────────────────────────────────────────────
 *
 * One request, and the last good answer kept in localStorage as `initialData`.
 * A returning visitor therefore paints the complete homepage — hero, cafés,
 * quotes — on the FIRST FRAME, from disk, with no network at all, while a
 * background refetch quietly brings it up to date. The API being asleep stops
 * being something the visitor experiences.
 *
 * The trade is deliberate and small: for up to a minute after a manager edits
 * the homepage, a returning visitor may see the previous version before the
 * refetch lands. Stale-for-a-moment beats absent, on the page that is the first
 * thing anyone sees.
 */

export interface HomepageContent {
  heroSlides: (HeroSlide & { photographerName: string | null; photographerLocation: string | null })[];
  cafes: Cafe[];
  featuredCollections: FeaturedCollection[];
  testimonials: { quote: string; name: string; role?: string; location?: string }[];
  slideshow: SlideshowSettings;
}

const STORAGE_KEY = 'artinu.homepage.v1';

/** Everything empty — what a genuine first-time visitor renders before the fetch. */
const EMPTY: HomepageContent = {
  heroSlides: [],
  cafes: [],
  featuredCollections: [],
  testimonials: [],
  slideshow: { ...DEFAULT_SLIDESHOW_SETTINGS },
};

/**
 * Read the remembered copy.
 *
 * Every access is wrapped, and not merely out of caution: a browser in private
 * mode, or one told to block site data, THROWS on localStorage rather than
 * returning null. An exception here would take the homepage down completely,
 * which is a far worse outcome than the cache miss it is reporting.
 */
function readCache(): HomepageContent | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as Partial<HomepageContent>;
    // A payload written by an older build could be missing a key the page now
    // reads. Merging over EMPTY means a shape change degrades to "that section
    // is empty until the refetch lands" rather than a crash on `.map`.
    return {
      ...EMPTY,
      ...parsed,
      slideshow: { ...EMPTY.slideshow, ...(parsed.slideshow ?? {}) },
    };
  } catch {
    return undefined;
  }
}

function writeCache(content: HomepageContent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  } catch {
    /* quota, private mode, or storage disabled — the page just refetches next time */
  }
}

async function fetchHomepage(): Promise<HomepageContent> {
  const { data } = await api.get<HomepageContent>('/homepage');
  writeCache(data);
  return data;
}

export function useHomepage() {
  /*
    Read once, at mount, rather than on every render: `initialData` is only
    consulted the first time a query key is seen, and re-reading localStorage on
    each render would be wasted work on a page that re-renders as the hero
    advances.
  */
  const [cached] = React.useState(readCache);

  const query = useQuery({
    queryKey: ['homepage'],
    queryFn: fetchHomepage,
    initialData: cached,
    /*
      `initialDataUpdatedAt: 0` marks the remembered copy as INFINITELY STALE.

      Without it React Query treats initialData as fresh and, with a staleTime
      above zero, would not refetch at all — the homepage would show whatever
      was cached and never update. Zero means "paint this immediately, then go
      and check", which is the whole intent.
    */
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    /*
      Keep the remembered copy on screen if the refetch fails. React Query
      leaves `data` in place on error, so a sleeping API means the visitor keeps
      the last good homepage instead of watching sections disappear.
    */
    retry: 2,
    refetchOnWindowFocus: false,
  });

  return {
    content: query.data ?? EMPTY,
    /*
      Loading is TRUE only for somebody with nothing remembered at all. A
      returning visitor is never "loading" — they already have a homepage on
      screen, and telling the sections otherwise would hide the content this
      hook exists to show them.
    */
    isLoading: query.isLoading && !cached,
    isError: query.isError,
  };
}

