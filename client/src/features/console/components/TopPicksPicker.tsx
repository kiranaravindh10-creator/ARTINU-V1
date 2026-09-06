import type { ArtworkWithArtist } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, GripVertical, Loader2, Save, Search, Star, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Photo } from '@/components/ui/photo';
import { errorMessage } from '@/lib/api';
import { catalogService } from '@/services/catalog.service';
import { contentService } from '@/services/content.service';

/**
 * CHOOSING THE GALLERY'S TOP PICKS BY LOOKING AT THE PHOTOGRAPHS.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * The same list was edited through a textarea of comma-separated UUIDs, with
 * the instruction "copy an ID from the end of a photograph's gallery address".
 * Curating the front of the gallery therefore meant opening the public site in
 * another tab, finding a photograph, copying a fragment of its URL, and pasting
 * it into a box that showed no pictures at all. A typo produced no error — the
 * id simply matched nothing and the photograph silently failed to appear.
 *
 * Nothing about where the list is STORED has changed. It is still the
 * `gallery_top_20` row of `ui_content`, still an array of artwork ids, still
 * read by GalleryPage exactly as before. Only the way a person edits it is
 * different: search the real photographs, click the ones you want.
 *
 * ── Why the ids are still what gets saved ───────────────────────────────────
 *
 * Because the gallery reads ids. Storing anything richer here — titles, urls, a
 * snapshot of the photograph — would be a second copy of data that already
 * lives in `artworks`, free to drift the moment a photographer edits a title or
 * the image is re-encoded. The picker resolves ids to photographs for display
 * and saves ids back. One source of truth, unchanged.
 */

/** The `ui_content` row the gallery reads its curated strip from. */
const TOP_PICKS_ID = 'gallery_top_20';

/**
 * Where the previous selection is kept when a new one is saved.
 *
 * Requirements §4 asks that changing the picks not destroy what was there
 * before. This is the smallest way to honour that: another `ui_content` row —
 * no new table, no schema change — holding the last few selections with the
 * time each was replaced.
 *
 * It is deliberately NOT in `PUBLIC_CONTENT_IDS` on the server, so unlike
 * `gallery_top_20` it cannot be read without an internal session.
 */
const HISTORY_ID = 'gallery_top_20_history';

/** How many past selections to keep. Enough to undo a mistake, not an archive. */
const HISTORY_LIMIT = 12;

interface HistoryEntry {
  ids: string[];
  /** When this selection stopped being the live one. */
  replacedAt: string;
  /** `2026-09`, so a month's curation can be found without parsing dates. */
  month: string;
}

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** One photograph, as a card that can be picked or dropped. */
function ArtworkTile({
  artwork,
  selected,
  onToggle,
  index,
}: {
  artwork: ArtworkWithArtist;
  selected: boolean;
  onToggle: () => void;
  index?: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={[
        'group relative overflow-hidden rounded-lg border text-left transition-all',
        selected ? 'border-bronze ring-2 ring-bronze/30' : 'border-line hover:border-line-strong',
      ].join(' ')}
    >
      <Photo
        src={artwork.thumbnailUrl || artwork.imageUrl}
        alt={artwork.title}
        ratio="aspect-[4/5]"
        imgClassName="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />

      {/* Position in the strip, so the order a visitor sees is visible here. */}
      {selected && index !== undefined && (
        <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-bronze font-label text-[0.6875rem] text-white shadow-subtle">
          {index + 1}
        </span>
      )}

      <span
        className={[
          'absolute right-2 top-2 flex size-6 items-center justify-center rounded-full shadow-subtle transition-colors',
          selected ? 'bg-bronze text-white' : 'bg-canvas/85 text-subtle backdrop-blur-md',
        ].join(' ')}
      >
        {selected ? <Check className="size-3.5" aria-hidden /> : <Star className="size-3.5" aria-hidden />}
      </span>

      <span className="block bg-canvas px-2.5 py-2">
        <span className="block truncate text-[0.8125rem] font-medium text-ink">{artwork.title}</span>
        <span className="block truncate text-xs text-subtle">{artwork.artist?.name ?? 'Unknown'}</span>
      </span>
    </button>
  );
}

export function TopPicksPicker() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [search, setSearch] = React.useState('');

  // ── What is curated right now ─────────────────────────────────────────────
  const { data: record, isLoading: loadingRecord } = useQuery({
    queryKey: ['content', TOP_PICKS_ID],
    queryFn: () => contentService.getContent(TOP_PICKS_ID),
  });

  React.useEffect(() => {
    if (loaded || !record) return;
    setSelected(Array.isArray(record.data) ? (record.data as string[]) : []);
    setLoaded(true);
  }, [record, loaded]);

  /*
    The photographs behind the selected ids.

    Keyed on the SAVED list rather than on `selected`, so picking and dropping
    does not refetch on every click. Newly picked photographs are already in the
    browse results below, and `resolve` reads from either source.
  */
  const savedIds = React.useMemo(
    () => (Array.isArray(record?.data) ? (record.data as string[]) : []),
    [record],
  );

  const { data: savedArtworks } = useQuery({
    queryKey: ['top-picks-resolved', savedIds],
    queryFn: () => catalogService.gallery({ ids: savedIds, pageSize: 60 }),
    enabled: savedIds.length > 0,
  });

  // ── Browse everything, to pick from ───────────────────────────────────────
  const { data: browse, isFetching: browsing } = useQuery({
    queryKey: ['top-picks-browse', search],
    queryFn: () => catalogService.gallery({ q: search || undefined, pageSize: 36, sort: 'latest' }),
  });

  /*
    One lookup covering both lists.

    A selected photograph may not be in the current search results — that is the
    normal case once somebody types a query — so the strip above has to resolve
    from the saved set as well, or picks would vanish from view while filtering.
  */
  const byId = React.useMemo(() => {
    const map = new Map<string, ArtworkWithArtist>();
    for (const artwork of savedArtworks?.items ?? []) map.set(artwork.id, artwork);
    for (const artwork of browse?.items ?? []) map.set(artwork.id, artwork);
    return map;
  }, [savedArtworks, browse]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const move = (id: string, direction: -1 | 1) =>
    setSelected((current) => {
      const from = current.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  const dirty = loaded && selected.join(',') !== savedIds.join(',');

  const save = useMutation({
    mutationFn: async (ids: string[]) => {
      /*
        Archive first, then publish.

        The previous list is written to the history row BEFORE the live one is
        replaced, so a failure between the two leaves the gallery untouched and
        the archive merely holding one extra copy — the harmless direction. The
        archive is best-effort: it must never be the reason a curator cannot
        publish, so its failure is logged as a warning and swallowed.
      */
      if (savedIds.length > 0) {
        try {
          const existing = await contentService.getContent(HISTORY_ID).catch(() => null);
          const previous: HistoryEntry[] = Array.isArray(existing?.data) ? existing.data : [];
          const entry: HistoryEntry = {
            ids: savedIds,
            replacedAt: new Date().toISOString(),
            month: monthKey(new Date()),
          };
          await contentService.setContent(HISTORY_ID, [entry, ...previous].slice(0, HISTORY_LIMIT));
        } catch {
          // Keeping a copy is a convenience, not a precondition for curating.
        }
      }

      return contentService.setContent(TOP_PICKS_ID, ids);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['content', TOP_PICKS_ID] });
      // The public gallery reads the same record and its own artwork query.
      void queryClient.invalidateQueries({ queryKey: ['gallery'] });
      setLoaded(false);
      toast.success('Top picks updated. They are on the gallery now.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const lastChanged = record?.updatedAt
    ? new Date(record.updatedAt).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Curator&rsquo;s top picks</CardTitle>
        <CardDescription>
          The photographs pinned above the automatic ordering on the gallery, under &ldquo;Chosen
          this month&rdquo;. Click a photograph to pick it or drop it, then save. Leave it empty and
          the gallery sorts itself.
          {lastChanged && <> Last changed {lastChanged}.</>}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {loadingRecord ? (
          <div className="flex items-center gap-2.5 py-8 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading the current picks…
          </div>
        ) : (
          <>
            {/* ── Currently chosen ─────────────────────────────────────────── */}
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
                <h3 className="eyebrow eyebrow-muted">
                  Chosen ({selected.length})
                </h3>
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="text-xs text-subtle underline underline-offset-4 hover:text-danger"
                  >
                    Remove all
                  </button>
                )}
              </div>

              {selected.length === 0 ? (
                <p className="mt-5 rounded-lg border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                  Nothing is pinned. The gallery is sorting itself — pick photographs below to put
                  them at the top.
                </p>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {selected.map((id, index) => {
                    const artwork = byId.get(id);
                    if (!artwork) {
                      /*
                        An id with no photograph behind it — deleted since it was
                        pinned, or a bad id typed into the old textarea. The
                        gallery silently skips these; showing it here is how
                        somebody finds out it is there and can clear it.
                      */
                      return (
                        <div
                          key={id}
                          className="flex flex-col justify-between rounded-lg border border-warning/40 bg-warning-soft p-3"
                        >
                          <p className="text-xs text-warning">
                            This photograph no longer exists and will not appear on the gallery.
                          </p>
                          <code className="mt-2 block truncate text-[0.625rem] text-subtle">{id}</code>
                          <Button size="sm" variant="ghost" className="mt-2" onClick={() => toggle(id)}>
                            <X aria-hidden /> Remove
                          </Button>
                        </div>
                      );
                    }
                    return (
                      <div key={id} className="space-y-1.5">
                        <ArtworkTile
                          artwork={artwork}
                          selected
                          index={index}
                          onToggle={() => toggle(id)}
                        />
                        {/* Order matters: this is the order the strip renders in. */}
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={index === 0}
                            onClick={() => move(id, -1)}
                            aria-label={`Move ${artwork.title} earlier`}
                          >
                            ←
                          </Button>
                          <GripVertical className="size-3 text-subtle" aria-hidden />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={index === selected.length - 1}
                            onClick={() => move(id, 1)}
                            aria-label={`Move ${artwork.title} later`}
                          >
                            →
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Browse and pick ──────────────────────────────────────────── */}
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
                <h3 className="eyebrow eyebrow-muted">All photographs</h3>
                {browsing && <Loader2 className="size-3.5 animate-spin text-subtle" aria-hidden />}
              </div>

              <div className="relative mt-5">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by title, tag or photographer"
                  className="pl-10"
                  aria-label="Search photographs"
                />
              </div>

              {browse && browse.items.length === 0 && (
                <p className="mt-5 rounded-lg border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                  No photograph matches that search.
                </p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {(browse?.items ?? []).map((artwork) => (
                  <ArtworkTile
                    key={artwork.id}
                    artwork={artwork}
                    selected={selected.includes(artwork.id)}
                    onToggle={() => toggle(artwork.id)}
                  />
                ))}
              </div>
            </section>

            {/* ── Save ─────────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
              <Button onClick={() => save.mutate(selected)} loading={save.isPending} disabled={!dirty}>
                <Save aria-hidden />
                Save top picks
              </Button>
              {dirty ? (
                <Badge variant="warning">Unsaved changes</Badge>
              ) : (
                <span className="text-xs text-subtle">Everything here is live on the gallery.</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
