import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, Megaphone, Search } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { campaignService } from '@/services/campaign.service';

/**
 * Spaces the social media team may promote.
 *
 * Only verified spaces, and only six fields of each — name, code, type, city
 * and a photograph. A `Space` row also carries the owner's name, phone, email
 * and street address, and the API deliberately does not send them here: this
 * team promotes venues, it does not contact them, and data that never reaches
 * the browser cannot leak from it (requirements §8).
 */
export default function SocialMediaSpacesPage() {
  const [query, setQuery] = React.useState('');

  const { data: spaces, isLoading, isError, error } = useQuery({
    queryKey: ['promotable-spaces'],
    queryFn: () => campaignService.promotableSpaces(),
  });

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return spaces ?? [];
    return (spaces ?? []).filter((space) =>
      `${space.name} ${space.city} ${space.type}`.toLowerCase().includes(needle),
    );
  }, [spaces, query]);

  return (
    <div className="mx-auto max-w-3xl">
      <PanelHeader
        icon={MapPin}
        title="Space promotions"
        description="Verified spaces showing ARTINU work. Pick one to build a campaign around."
      />

      <div className="relative mb-6">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, city or type"
          className="pl-10"
          aria-label="Search spaces"
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2.5 py-12 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading spaces…
        </div>
      )}

      {isError && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}

      {spaces && filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-line-strong p-10 text-center text-sm text-muted">
          {query ? 'No space matches that search.' : 'No verified spaces yet.'}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((space) => (
          <article
            key={space.id}
            className="flex items-center gap-4 rounded-lg border border-line bg-canvas p-4"
          >
            {space.imageUrl ? (
              <img
                src={space.imageUrl}
                alt=""
                className="size-14 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-sand-soft">
                <MapPin className="size-5 text-subtle" aria-hidden />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-base text-ink">{space.name}</h3>
              <p className="mt-0.5 text-xs text-subtle">
                {space.city}
                {space.code && ` · ${space.code}`}
              </p>
            </div>

            <Button size="sm" variant="outline" asChild>
              <Link to={`/social-media/new?subject=space&subjectId=${space.id}`}>
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
