import { CAMPAIGN_FREQUENCY_LABELS, CAMPAIGN_STATUS_LABELS, type CampaignStatus } from '@artinu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Megaphone, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PanelHeader } from '@/components/layout/DashboardShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { campaignService, type CampaignRow } from '@/services/campaign.service';

/**
 * Every campaign, grouped by what it is doing right now.
 *
 * The grouping is the whole screen: the question a social media person opens
 * this with is "what is on the site at this moment", and a flat list sorted by
 * date does not answer it. Active first, then what is queued, then the archive.
 */

const STATUS_STYLE: Record<CampaignStatus, 'success' | 'info' | 'neutral' | 'outline'> = {
  active: 'success',
  scheduled: 'info',
  draft: 'neutral',
  expired: 'outline',
};

/** A date a non-technical person can read at a glance. */
const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    // The public popup reads its own cached query; drop it so a change the team
    // just made is what the next page load sees.
    void queryClient.invalidateQueries({ queryKey: ['active-campaign'] });
  };

  const toggle = useMutation({
    mutationFn: () => campaignService.setActive(campaign.id, !campaign.active),
    onSuccess: (updated) => {
      invalidate();
      toast.success(
        updated.active
          ? 'Campaign started. It is on the site now.'
          : 'Campaign stopped. It is off the site now.',
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => campaignService.remove(campaign.id),
    onSuccess: () => {
      invalidate();
      toast.success('Campaign deleted.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const start = when(campaign.startsAt);
  const end = when(campaign.endsAt);

  return (
    <article className="flex gap-4 rounded-lg border border-line bg-canvas p-4">
      {campaign.imageUrl ? (
        <img
          src={campaign.imageUrl}
          alt=""
          className="hidden size-20 shrink-0 rounded-md object-cover sm:block"
        />
      ) : (
        <div className="hidden size-20 shrink-0 items-center justify-center rounded-md bg-sand-soft sm:flex">
          <Megaphone className="size-5 text-subtle" aria-hidden />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg leading-tight text-ink">
              {campaign.title}
            </h3>
            {campaign.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted">{campaign.description}</p>
            )}
          </div>
          <Badge variant={STATUS_STYLE[campaign.status]}>
            {CAMPAIGN_STATUS_LABELS[campaign.status]}
          </Badge>
        </div>

        <p className="mt-2.5 text-xs text-subtle">
          {CAMPAIGN_FREQUENCY_LABELS[campaign.frequency]}
          {start && ` · from ${start}`}
          {end && ` · until ${end}`}
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={campaign.active ? 'outline' : 'primary'}
            onClick={() => toggle.mutate()}
            loading={toggle.isPending}
          >
            <Power aria-hidden />
            {campaign.active ? 'Stop' : 'Start'}
          </Button>

          <Button size="sm" variant="ghost" asChild>
            <Link to={`/social-media/${campaign.id}`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </Button>

          {/*
            Two presses to delete, not a browser confirm().

            A campaign is cheap to recreate, but window.confirm is a modal the
            page cannot style and that some mobile browsers render as a full
            screen interruption. Turning the button itself into the confirmation
            keeps the decision where the thing being deleted is.
          */}
          {confirmingDelete ? (
            <>
              <Button
                size="sm"
                variant="danger"
                onClick={() => remove.mutate()}
                loading={remove.isPending}
              >
                Delete for good
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Group({ title, hint, campaigns }: { title: string; hint: string; campaigns: CampaignRow[] }) {
  if (campaigns.length === 0) return null;
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
        <h2 className="eyebrow eyebrow-muted">
          {title} ({campaigns.length})
        </h2>
        <p className="text-xs text-subtle">{hint}</p>
      </div>
      <div className="mt-5 space-y-3">
        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
      </div>
    </section>
  );
}

export default function SocialMediaCampaignsPage() {
  const { data: campaigns, isLoading, isError, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignService.list(),
  });

  const by = (status: CampaignStatus) =>
    (campaigns ?? []).filter((campaign) => campaign.status === status);

  return (
    <div className="mx-auto max-w-3xl">
      <PanelHeader
        icon={Megaphone}
        title="Campaigns"
        description="What visitors see when they arrive on the ARTINU site. A campaign is live only while it is started and inside its dates."
        actions={
          <Button asChild>
            <Link to="/social-media/new">
              <Plus aria-hidden />
              Create campaign
            </Link>
          </Button>
        }
      />

      {isLoading && (
        <div className="flex items-center gap-2.5 py-12 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading campaigns…
        </div>
      )}

      {isError && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}

      {campaigns && campaigns.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong p-10 text-center">
          <Megaphone className="mx-auto size-6 text-subtle" aria-hidden />
          <p className="mt-3 font-display text-xl text-ink">No campaigns yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            A campaign is the small card a visitor sees on the public site — an offer, an
            exhibition, a photographer worth looking at.
          </p>
          <Button asChild className="mt-5">
            <Link to="/social-media/new">Create the first one</Link>
          </Button>
        </div>
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="space-y-10">
          <Group title="Active" hint="On the site right now" campaigns={by('active')} />
          <Group title="Scheduled" hint="Starts on its own" campaigns={by('scheduled')} />
          <Group title="Drafts" hint="Switched off" campaigns={by('draft')} />
          <Group title="Expired" hint="Past its end date" campaigns={by('expired')} />
        </div>
      )}
    </div>
  );
}
