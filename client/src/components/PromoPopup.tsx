import type { ActiveCampaign, CampaignFrequency } from '@artinu/shared';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { campaignService } from '@/services/campaign.service';

/**
 * THE PROMOTIONAL POPUP, as a visitor sees it.
 *
 * Mounted once in PublicLayout, so it is a property of the public site rather
 * than something each page has to remember to include.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 *
 * It does not block the site. Requirements §5 asks that the popup not interfere
 * with navigation, so this is NOT a modal: it does not trap focus, it does not
 * freeze scrolling, and it does not cover the navigation bar. A visitor who
 * ignores it can carry on reading and clicking underneath. That is also why it
 * is not built on the Dialog primitive, which does all three of those things by
 * design and is right for a checkout confirmation and wrong for a poster.
 */

const STORAGE_PREFIX = 'artinu.campaign.';

/**
 * Has this visitor already had their look at this campaign?
 *
 * Kept per campaign id, so publishing a new campaign shows it to everybody
 * again without anything having to be cleared. Every access is wrapped: a
 * browser in private mode, or with site data blocked, THROWS on localStorage
 * rather than returning null, and an exception here would take the whole public
 * layout down with it. Failing open - showing the popup - is the safe direction.
 */
function alreadySeen(id: string, frequency: CampaignFrequency): boolean {
  if (frequency === 'always') return false;

  try {
    if (frequency === 'session') {
      return sessionStorage.getItem(STORAGE_PREFIX + id) !== null;
    }

    const seenAt = localStorage.getItem(STORAGE_PREFIX + id);
    if (!seenAt) return false;
    if (frequency === 'once') return true;

    // daily
    return Date.now() - Number(seenAt) < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markSeen(id: string, frequency: CampaignFrequency) {
  try {
    if (frequency === 'session') {
      sessionStorage.setItem(STORAGE_PREFIX + id, String(Date.now()));
      return;
    }
    if (frequency === 'always') return;
    localStorage.setItem(STORAGE_PREFIX + id, String(Date.now()));
  } catch {
    /* storage unavailable — the visitor simply sees it again next time */
  }
}

/** Seconds before it appears, so it does not fight the page for attention. */
const APPEAR_AFTER_MS = 1500;

/**
 * The card itself, with no behaviour attached.
 *
 * Split out so the dashboard's Preview renders THE SAME COMPONENT the visitor
 * gets rather than an imitation of it. A preview that drifts from the real
 * thing is worse than no preview: it is a confident answer to "how will this
 * look" that happens to be wrong, and the team only finds out once it is live.
 */
export function PromoCard({
  campaign,
  onClose,
  onCta,
}: {
  campaign: Pick<ActiveCampaign, 'title' | 'description' | 'imageUrl' | 'ctaLabel' | 'ctaUrl'>;
  onClose?: () => void;
  onCta?: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close this promotion"
        /*
          Its own control, over the poster, at 36px square. A close affordance
          that is hard to hit on a phone is the difference between a promotion
          and an obstruction.
        */
        className="absolute right-2.5 top-2.5 z-10 flex size-9 items-center justify-center rounded-full bg-canvas/85 text-ink shadow-subtle backdrop-blur-md transition-colors hover:bg-canvas"
      >
        <X className="size-4" aria-hidden />
      </button>

      {campaign.imageUrl && (
        <img
          src={campaign.imageUrl}
          alt=""
          /* Decorative: the title below carries the meaning. */
          className="h-40 w-full object-cover sm:h-44"
          loading="lazy"
        />
      )}

      <div className="p-5">
        <h2 className="font-display text-xl leading-tight text-ink">{campaign.title}</h2>
        {campaign.description && (
          <p className="mt-2 text-sm leading-relaxed text-muted">{campaign.description}</p>
        )}

        {campaign.ctaLabel && campaign.ctaUrl && (
          <Button className="mt-4 w-full" onClick={onCta}>
            {campaign.ctaLabel}
          </Button>
        )}
      </div>
    </>
  );
}

export function PromoPopup() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = React.useState(false);
  const [visible, setVisible] = React.useState(false);

  /*
    One request, cached for the session.

    `staleTime: Infinity` because a campaign changes a few times a week and this
    component mounts on every public page: without it, every navigation would
    re-ask. `retry: false` because a failed campaign lookup must never be worth
    a second round trip - there is no campaign to show either way, and the
    homepage has better things to spend a cold Render dyno on.
  */
  const { data: campaign } = useQuery({
    queryKey: ['active-campaign'],
    /*
      Failures are swallowed into "no campaign", deliberately.

      The global handler in lib/query.ts toasts any query that fails with no
      data — which is right for a screen whose content is missing, and wrong for
      this. A promotional popup is decorative: if it cannot be fetched the
      correct behaviour is that no popup appears, not that every visitor to the
      homepage is shown an error about it. Returning null here means the query
      never enters an error state, so nothing is reported.
    */
    queryFn: () => campaignService.active().catch(() => null),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const eligible =
    campaign && !dismissed && !alreadySeen(campaign.id, campaign.frequency) ? campaign : null;

  React.useEffect(() => {
    if (!eligible) return;
    const timer = setTimeout(() => setVisible(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [eligible?.id]);

  const close = React.useCallback(() => {
    if (!eligible) return;
    markSeen(eligible.id, eligible.frequency);
    setVisible(false);
    // Let the transition finish before it leaves the tree.
    setTimeout(() => setDismissed(true), 200);
  }, [eligible]);

  // Escape closes it, the one modal convention worth keeping.
  React.useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  if (!eligible) return null;

  return (
    <div
      /*
        `pointer-events-none` on the wrapper and `auto` on the card is what keeps
        the rest of the site clickable. The wrapper spans the viewport so the
        card can be positioned against it, and without this it would swallow
        every click on the page behind it.
      */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 sm:p-6"
      role="region"
      aria-label="Promotion"
    >
      <div
        className={[
          'pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border border-line',
          'bg-canvas shadow-lg transition-all duration-200 ease-out',
          // Desktop and tablet: a card in the bottom corner, out of the way of
          // the content. Phone: full width at the bottom, where a thumb is.
          'sm:max-w-md md:absolute md:bottom-6 md:right-6 md:mx-0',
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        ].join(' ')}
      >
        <PromoCard
          campaign={eligible}
          onClose={close}
          onCta={() => {
            const url = eligible.ctaUrl!;
            close();
            /*
              An internal path goes through the router, so the click is a
              navigation rather than a full page load that would throw away the
              app and reload the bundle. Anything else is external and opens in
              a new tab with `noopener`, which stops the opened page reaching
              back into this one through window.opener.
            */
            if (url.startsWith('/')) {
              navigate(url);
            } else {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          }}
        />
      </div>
    </div>
  );
}
