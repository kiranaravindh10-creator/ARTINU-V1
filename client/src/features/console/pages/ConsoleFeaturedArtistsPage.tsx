import type { PublicArtist } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Search, Sparkles, Star, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/DashboardShell';
import { SubNav } from '@/features/console/components/SubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { errorMessage } from '@/lib/api';
import { catalogService } from '@/services/catalog.service';
import { operationsService } from '@/services/operations.service';

/**
 * Editor for the "Featuring Artist" carousel (requirements §13).
 *
 * Ordering is done with explicit up/down buttons rather than drag-and-drop:
 * the list is short, this works on a phone and with a keyboard, and it does not
 * hide the running order behind a gesture.
 *
 * The whole list is saved in one call — the array index *is* the running order,
 * so adding, removing and reordering are the same operation and there is no
 * half-applied state to reason about.
 */

interface Row {
  artistId: string;
  sponsored: boolean;
  note?: string | null;
}

export default function ConsoleFeaturedArtistsPage() {
  const queryClient = useQueryClient();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [search, setSearch] = React.useState('');

  const { data: curated, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ops', 'featured-artists'],
    queryFn: () => operationsService.featuredArtists(),
  });

  // A full roster to pick from. The carousel is small, so one page is plenty.
  const { data: allArtists } = useQuery({
    queryKey: ['ops', 'featured-artists', 'roster'],
    queryFn: () => catalogService.artists({ pageSize: 60 }),
  });

  // Seed the editable copy once the saved list arrives, then leave it alone so
  // a refetch cannot silently discard edits in progress.
  React.useEffect(() => {
    if (curated && rows === null) {
      setRows(curated.map((entry) => ({
        artistId: entry.artistId,
        sponsored: entry.sponsored,
        note: entry.note,
      })));
    }
  }, [curated, rows]);

  const save = useMutation({
    mutationFn: (next: Row[]) => operationsService.setFeaturedArtists(next),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['ops', 'featured-artists'] });
      toast.success(
        saved.length === 0
          ? 'Carousel cleared — it falls back to the most-liked artists.'
          : `${saved.length} artist${saved.length === 1 ? '' : 's'} featured.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const byId = React.useMemo(
    () => new Map((allArtists?.items ?? []).map((artist) => [artist.id, artist])),
    [allArtists],
  );

  const list = rows ?? [];
  const chosen = new Set(list.map((row) => row.artistId));

  const available = (allArtists?.items ?? []).filter(
    (artist) =>
      !chosen.has(artist.id) &&
      (search.trim() === '' || artist.name.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const move = (index: number, direction: -1 | 1) => {
    const next = [...list];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRows(next);
  };

  const dirty =
    rows !== null &&
    JSON.stringify(rows.map((r) => [r.artistId, r.sponsored])) !==
      JSON.stringify((curated ?? []).map((r) => [r.artistId, r.sponsored]));

  return (
    <div>
      <PageHeader
        title="Featured artists"
        description="The carousel at the top of the Artists page. Order here is the order visitors see."
        actions={
          <div className="flex gap-2">
            {dirty && (
              <Button variant="outline" onClick={() => setRows(null)}>
                Discard
              </Button>
            )}
            <Button
              loading={save.isPending}
              disabled={!dirty}
              onClick={() => save.mutate(list)}
            >
              Save carousel
            </Button>
          </div>
        }
      />
      <SubNav
        items={[
          { to: '/console/artists', label: 'Artists', end: true },
          { to: '/console/artists/featured', label: 'Featured' },
          { to: '/console/artists/applications', label: 'Applications' },
        ]}
      />

      {list.length === 0 && !isLoading && (
        <div className="mb-6 rounded-lg border border-line bg-canvas-soft px-5 py-4 text-sm text-muted">
          Nothing is curated, so the carousel currently shows the most-liked artists
          automatically. Add someone below to take control of it.
        </div>
      )}

      {/* min-w-0 on both columns: a grid item defaults to min-width:auto, so
          the longest unbreakable line inside (an artist's "city · N photographs
          · N likes") sets the column's floor and the whole page scrolled
          sideways at 390px. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── The carousel, in order ─────────────────────────────────────── */}
        <div className="min-w-0">
          <h2 className="mb-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
            In the carousel ({list.length})
          </h2>

          {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Star />}
              title="No featured artists."
              description="Pick artists from the right to build the carousel."
            />
          ) : (
            <ul className="space-y-2">
              {list.map((row, index) => {
                const artist = byId.get(row.artistId);
                return (
                  <li key={row.artistId}>
                    <Card>
                      <CardContent className="flex items-center gap-3 p-3">
                        <span className="w-5 shrink-0 text-center font-mono text-xs text-subtle">
                          {index + 1}
                        </span>
                        <Avatar
                          src={artist?.avatarUrl ?? undefined}
                          name={artist?.name ?? row.artistId}
                          className="size-9 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">
                            {artist?.name ?? 'Unknown artist'}
                          </p>
                          <p className="truncate text-xs text-subtle">
                            {artist?.city ?? '—'} · {artist?.artworkCount ?? 0} photographs
                          </p>
                        </div>

                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted">
                          <Checkbox
                            checked={row.sponsored}
                            onCheckedChange={(value) => {
                              const next = [...list];
                              next[index] = { ...row, sponsored: value === true };
                              setRows(next);
                            }}
                          />
                          Sponsored
                        </label>

                        <div className="flex shrink-0 items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move up"
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move down"
                            disabled={index === list.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${artist?.name ?? 'artist'}`}
                            onClick={() => setRows(list.filter((_, i) => i !== index))}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Everyone else ──────────────────────────────────────────────── */}
        <div className="min-w-0">
          <h2 className="mb-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-bronze">
            Add an artist
          </h2>

          <Input
            icon={<Search />}
            placeholder="Search artists by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mb-3"
          />

          {available.length === 0 ? (
            <p className="rounded-lg border border-line bg-canvas-soft px-4 py-3 text-sm text-subtle">
              {search ? 'No artists match that search.' : 'Every artist is already featured.'}
            </p>
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {available.map((artist: PublicArtist) => (
                <li key={artist.id}>
                  <button
                    type="button"
                    disabled={list.length >= 24}
                    onClick={() =>
                      setRows([...list, { artistId: artist.id, sponsored: false, note: null }])
                    }
                    className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-bronze/50 hover:bg-bronze-soft/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Avatar
                      src={artist.avatarUrl ?? undefined}
                      name={artist.name}
                      className="size-9 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{artist.name}</p>
                      <p className="truncate text-xs text-subtle">
                        {artist.city ?? '—'} · {artist.artworkCount} photographs
                      </p>
                    </div>
                    {artist.featured && <Badge variant="bronze">Auto</Badge>}
                    <Sparkles className="size-4 shrink-0 text-bronze" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {list.length >= 24 && (
            <p className="mt-2 text-xs text-warning">
              The carousel holds at most 24 artists.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
