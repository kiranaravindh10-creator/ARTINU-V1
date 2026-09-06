import { useQuery } from '@tanstack/react-query';
import { Loader2, Megaphone, Search, UserRound } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { campaignService } from '@/services/campaign.service';

/**
 * Artists the social media team may promote.
 *
 * ── What this screen is not ─────────────────────────────────────────────────
 *
 * It is not artist administration. There is no approve, no suspend, no edit and
 * no contact detail, because the role has none of those powers and a screen
 * that showed them would be lying about what the account can do. The API backing
 * it returns `listPublicArtists` — the same data behind the public /artists
 * page — so nothing here is information the team could not read signed out.
 *
 * The only action is the one the role exists for: build a campaign around this
 * artist's work.
 */
export default function SocialMediaArtistsPage() {
  const [query, setQuery] = React.useState('');

  const { data: artists, isLoading, isError, error } = useQuery({
    queryKey: ['promotable-artists'],
    queryFn: () => campaignService.promotableArtists(),
  });

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return artists ?? [];
    return (artists ?? []).filter((artist) =>
      `${artist.displayName} ${artist.city ?? ''}`.toLowerCase().includes(needle),
    );
  }, [artists, query]);

  return (
    <div className="mx-auto max-w-3xl">
      <PanelHeader
        icon={UserRound}
        title="Artist promotions"
        description="Photographers with work on the site. Pick one to build a campaign around."
      />

      <div className="relative mb-6">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or city"
          className="pl-10"
          aria-label="Search artists"
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2.5 py-12 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading artists…
        </div>
      )}

      {isError && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}

      {artists && filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-line-strong p-10 text-center text-sm text-muted">
          {query ? 'No artist matches that search.' : 'No artists have published work yet.'}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((artist) => (
          <article
            key={artist.id}
            className="flex items-center gap-4 rounded-lg border border-line bg-canvas p-4"
          >
            {artist.avatarUrl ? (
              <img
                src={artist.avatarUrl}
                alt=""
                className="size-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sand-soft">
                <UserRound className="size-5 text-subtle" aria-hidden />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-base text-ink">{artist.displayName}</h3>
              <p className="mt-0.5 text-xs text-subtle">
                {artist.artworkCount} photograph{artist.artworkCount === 1 ? '' : 's'}
                {artist.city && ` · ${artist.city}`}
              </p>
            </div>

            <Button size="sm" variant="outline" asChild>
              <Link to={`/social-media/new?subject=artist&subjectId=${artist.id}`}>
                <Megaphone aria-hidden />
                Promote
              </Link>
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
