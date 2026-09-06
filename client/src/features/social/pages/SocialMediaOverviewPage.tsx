import { CAMPAIGN_STATUS_LABELS, formatRelative } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { Images, LayoutDashboard, Loader2, Megaphone, Plus, UserRound } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Photo } from '@/components/ui/photo';
import { StatGrid, StatTile } from '@/components/ui/stat';
import { errorMessage } from '@/lib/api';
import { catalogService } from '@/services/catalog.service';
import { campaignService } from '@/services/campaign.service';

/**
 * THE SOCIAL MEDIA TEAM'S FIRST SCREEN.
 *
 * ── What it is for ──────────────────────────────────────────────────────────
 *
 * Answering, in one glance: what is live on the site right now, who has just
 * joined, and what has just been uploaded that might be worth posting about.
 * Everything else in this area is a place to act; this is the place to look.
 *
 * ── Every number here is real ───────────────────────────────────────────────
 *
 * There are no impressions, no reach, no engagement rate. ARTINU does not
 * collect any of that, and a dashboard that shows invented figures is worse
 * than one that shows none — somebody eventually makes a decision on them. The
 * four tiles below are counted from records this role can already read:
 *
 *   · campaigns          — /campaigns, this role's own module
 *   · artists            — /campaigns/promotable/artists, same module
 *   · recent photographs — /artworks, the public gallery endpoint
 *
 * No new endpoint, no new permission, and nothing here is visible to this role
 * that was not already.
 */

/** Uploaded within the last week — "new" in the sense a social team means it. */
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const isRecent = (iso?: string | null) =>
  Boolean(iso) && Date.now() - Date.parse(iso!) < SEVEN_DAYS;

function SectionHead({
  title,
  hint,
  to,
  cta,
}: {
  title: string;
  hint?: string;
  to?: string;
  cta?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
      <h2 className="eyebrow eyebrow-muted">{title}</h2>
      {to && cta ? (
        <Link to={to} className="text-xs text-subtle underline underline-offset-4 hover:text-ink">
          {cta}
        </Link>
      ) : (
        hint && <p className="text-xs text-subtle">{hint}</p>
      )}
    </div>
  );
}

export default function SocialMediaOverviewPage() {
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: () => campaignService.list() });
  const artists = useQuery({
    queryKey: ['promotable-artists'],
    queryFn: () => campaignService.promotableArtists(),
  });
  /*
    The public gallery, newest first. Read rather than a dedicated endpoint
    because it is the same list a visitor sees, so it can carry nothing private
    and needs no extra authorisation to be safe.
  */
  const artwork = useQuery({
    queryKey: ['social-recent-artwork'],
    queryFn: () => catalogService.gallery({ sort: 'latest', pageSize: 12 }),
  });

  const loading = campaigns.isLoading || artists.isLoading || artwork.isLoading;
  const failed = campaigns.isError || artists.isError || artwork.isError;

  const rows = campaigns.data ?? [];
  const live = rows.filter((c) => c.status === 'active');
  const scheduled = rows.filter((c) => c.status === 'scheduled');
  const recentWork = (artwork.data?.items ?? []).filter((a) => isRecent(a.createdAt));

  if (failed) {
    return (
      <div className="mx-auto max-w-4xl">
        <PanelHeader icon={LayoutDashboard} title="Today" />
        <p className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          We couldn&rsquo;t load this information. Please try again.
          <span className="mt-1 block text-xs opacity-80">
            {errorMessage(campaigns.error ?? artists.error ?? artwork.error)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PanelHeader
        icon={LayoutDashboard}
        title="Today"
        description="What is live on ARTINU right now, and what has just arrived worth talking about."
        actions={
          <Button asChild>
            <Link to="/social-media/new">
              <Plus aria-hidden />
              Create campaign
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2.5 py-12 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <div className="space-y-10">
          <StatGrid columns={4}>
            <StatTile
              label="Live on the site"
              value={live.length}
              icon={Megaphone}
              hint={live.length === 0 ? 'Nothing showing to visitors' : live[0]?.title}
              href="/social-media/campaigns"
            />
            <StatTile
              label="Scheduled"
              value={scheduled.length}
              hint={scheduled.length === 0 ? 'Nothing queued' : 'Starts on its own'}
              href="/social-media/campaigns"
            />
            <StatTile
              label="Photographs this week"
              value={recentWork.length}
              icon={Images}
              hint="Uploaded in the last 7 days"
            />
            <StatTile
              label="Artists to promote"
              value={artists.data?.length ?? 0}
              icon={UserRound}
              hint="With work on the site"
              href="/social-media/artists"
            />
          </StatGrid>

          {/* ── Just uploaded ─────────────────────────────────────────────── */}
          <section>
            <SectionHead
              title="Just uploaded"
              to="/social-media/artists"
              cta="Browse artists"
            />
            {recentWork.length === 0 ? (
              <p className="mt-5 rounded-lg border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                No photographs uploaded in the last week. New work will appear here as artists
                add it.
              </p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {recentWork.slice(0, 8).map((art) => (
                  <article key={art.id} className="overflow-hidden rounded-lg border border-line">
                    <Photo
                      src={art.thumbnailUrl || art.imageUrl}
                      alt={art.title}
                      ratio="aspect-[4/5]"
                      imgClassName="object-cover"
                    />
                    <div className="p-2.5">
                      <p className="truncate text-[0.8125rem] font-medium text-ink">{art.title}</p>
                      <p className="truncate text-xs text-subtle">{art.artist?.name ?? 'Unknown'}</p>
                      <p className="mt-0.5 text-xs text-subtle">{formatRelative(art.createdAt)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ── Newest artists ────────────────────────────────────────────── */}
          <section>
            <SectionHead title="Newest artists" to="/social-media/artists" cta="See all" />
            {(artists.data ?? []).length === 0 ? (
              <p className="mt-5 rounded-lg border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                No artists have published work yet. When somebody joins and uploads, they will
                appear here.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {(artists.data ?? []).slice(0, 5).map((artist) => (
                  <article
                    key={artist.id}
                    className="flex items-center gap-4 rounded-lg border border-line bg-canvas p-3.5"
                  >
                    {artist.avatarUrl ? (
                      <img src={artist.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand-soft">
                        <UserRound className="size-4 text-subtle" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{artist.displayName}</p>
                      <p className="truncate text-xs text-subtle">
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
            )}
          </section>

          {/* ── What is running ───────────────────────────────────────────── */}
          <section>
            <SectionHead title="Your campaigns" to="/social-media/campaigns" cta="Manage" />
            {rows.length === 0 ? (
              <p className="mt-5 rounded-lg border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                No campaigns yet. Create one to show visitors an offer, an exhibition or a
                photographer worth looking at.
              </p>
            ) : (
              <div className="mt-5 space-y-2.5">
                {rows.slice(0, 5).map((campaign) => (
                  <div
                    key={campaign.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-line bg-canvas px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{campaign.title}</span>
                      <span className="block text-xs text-subtle">
                        {formatRelative(campaign.updatedAt)}
                      </span>
                    </span>
                    <Badge
                      variant={
                        campaign.status === 'active'
                          ? 'success'
                          : campaign.status === 'scheduled'
                            ? 'info'
                            : campaign.status === 'expired'
                              ? 'outline'
                              : 'neutral'
                      }
                    >
                      {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
