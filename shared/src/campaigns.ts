/**
 * SOCIAL MEDIA CAMPAIGNS — the promotional popup shown to site visitors.
 *
 * ── Why this is a module of its own ─────────────────────────────────────────
 *
 * ARTINU already has `announcements`, and they are a different thing. An
 * announcement is an in-app notification delivered to an AUDIENCE OF ACCOUNTS
 * by role — every artist, every space owner — and it lands in the recipient's
 * notification list once they are signed in. A campaign is the opposite: it is
 * addressed to nobody in particular, shown to an anonymous visitor on their way
 * into the public site, and it is a poster rather than a message. Neither the
 * storage nor the delivery of one fits the other, so they stay separate.
 *
 * Everything here is deliberately additive. No existing type, schema or
 * constant is modified by this file.
 */
import { z } from 'zod';

/**
 * How often one visitor sees a campaign.
 *
 * Enforced in the visitor's own browser via localStorage, because the whole
 * point is to not nag somebody who has already seen and dismissed a poster, and
 * that is a per-device preference rather than something worth a database write
 * on every page view. A cleared browser showing the popup again is the correct
 * trade for not tracking anonymous visitors server-side.
 */
export const CAMPAIGN_FREQUENCIES = ['once', 'session', 'daily', 'always'] as const;
export type CampaignFrequency = (typeof CAMPAIGN_FREQUENCIES)[number];

export const CAMPAIGN_FREQUENCY_LABELS: Record<CampaignFrequency, string> = {
  once: 'First visit only',
  session: 'Once per session',
  daily: 'Once per day',
  always: 'Every visit',
};

export const CAMPAIGN_FREQUENCY_HELP: Record<CampaignFrequency, string> = {
  once: 'Shown a single time, then never again on that device.',
  session: 'Shown again next time they open the site in a new tab or window.',
  daily: 'Shown at most once every twenty-four hours.',
  always: 'Shown on every page load. Use sparingly.',
};

/**
 * What a campaign is promoting.
 *
 * `artist` and `space` exist so the social media team can build a campaign
 * around work that is already on the site (requirements §7) WITHOUT any change
 * to the artists or spaces tables — the campaign row simply records which one
 * it points at, and reads the name and image from the existing record.
 */
export const CAMPAIGN_SUBJECTS = ['general', 'artist', 'space'] as const;
export type CampaignSubject = (typeof CAMPAIGN_SUBJECTS)[number];

export const CAMPAIGN_SUBJECT_LABELS: Record<CampaignSubject, string> = {
  general: 'General promotion',
  artist: 'Artist promotion',
  space: 'Space promotion',
};

/**
 * Where a campaign is in its life.
 *
 * DERIVED, never stored. A stored status is a second source of truth that has
 * to be kept in step with the clock by something, and whatever that something
 * is will eventually not run — leaving a campaign marked "active" three weeks
 * after it ended. Computing it from `active` plus the two dates means the
 * answer is right the moment it is asked.
 */
export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'expired'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
};

export interface SocialMediaCampaign {
  id: string;
  title: string;
  description: string;
  /** Public url of the poster, or null for a text-only popup. */
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  frequency: CampaignFrequency;
  subject: CampaignSubject;
  /** The artwork/artist id or space id this promotes, when subject is not general. */
  subjectId: string | null;
  /** The switch the team controls. A campaign is only shown when this is true. */
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What the public popup endpoint returns — never the whole row. */
export interface ActiveCampaign {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  frequency: CampaignFrequency;
}

export const CAMPAIGN_LIMITS = {
  title: { min: 3, max: 80 },
  description: { min: 0, max: 300 },
  ctaLabel: { max: 32 },
  ctaUrl: { max: 300 },
} as const;

/** Poster ceiling. Well under the 25 MB photograph limit — this is a banner. */
export const CAMPAIGN_POSTER_MAX_BYTES = 5 * 1024 * 1024;

export const CAMPAIGN_POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * A campaign's CTA may point off-site, unlike an announcement's link.
 *
 * That is the difference in purpose: an announcement is ARTINU talking to its
 * own users, and sending that roster to an external address is the shape of a
 * phishing message, so `announcementSchema` restricts it to a site path. A
 * campaign genuinely does need to reach an Instagram post or a ticketed event.
 *
 * So external is allowed, but only over https, and the dangerous shapes are
 * still refused: `javascript:` and `data:` (script execution in the visitor's
 * page), and protocol-relative `//host` or `/\host`, which look like site paths
 * and are not — the same trap announcementSchema documents.
 */
const SAFE_INTERNAL_PATH = /^\/(?![/\\])[\w\-./?=&#%]*$/;

export const isSafeCampaignUrl = (value: string): boolean => {
  if (value === '') return true;
  if (SAFE_INTERNAL_PATH.test(value)) return true;
  // Anything else must be an absolute https url and nothing more exotic.
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/** An ISO timestamp, or empty. Kept as a string so it round-trips unchanged. */
const isoDateTime = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), {
    message: 'Enter a valid date and time',
  });

export const campaignSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(CAMPAIGN_LIMITS.title.min, 'Give the campaign a title')
      .max(CAMPAIGN_LIMITS.title.max),
    description: z.string().trim().max(CAMPAIGN_LIMITS.description.max).default(''),
    /**
     * A data URL on the way in, a stored public url on the way out. The server
     * hands it to the same storage service every other upload uses; it is never
     * written to the row as base64.
     */
    imageBase64: z.string().trim().optional(),
    /** Set when editing and keeping the poster that is already stored. */
    imageUrl: z.string().trim().max(500).nullable().optional(),
    ctaLabel: z.string().trim().max(CAMPAIGN_LIMITS.ctaLabel.max).default(''),
    ctaUrl: z
      .string()
      .trim()
      .max(CAMPAIGN_LIMITS.ctaUrl.max)
      .refine(isSafeCampaignUrl, {
        message: 'Use a path on this site (/gallery) or a full https:// address',
      })
      .default(''),
    frequency: z.enum(CAMPAIGN_FREQUENCIES).default('session'),
    subject: z.enum(CAMPAIGN_SUBJECTS).default('general'),
    subjectId: z.string().trim().max(100).nullable().default(null),
    active: z.boolean().default(false),
    startsAt: isoDateTime.default(''),
    endsAt: isoDateTime.default(''),
  })
  /*
    A window that closes before it opens is never shown, and the team would have
    no way to tell from the campaign list why. Caught at the edge instead.
  */
  .refine(
    (value) =>
      !value.startsAt ||
      !value.endsAt ||
      Date.parse(value.endsAt) > Date.parse(value.startsAt),
    { message: 'The end must come after the start', path: ['endsAt'] },
  )
  /* A button with a label and nowhere to go is a dead control. */
  .refine((value) => !value.ctaLabel || Boolean(value.ctaUrl), {
    message: 'Add the address the button should open',
    path: ['ctaUrl'],
  })
  .refine((value) => value.subject === 'general' || Boolean(value.subjectId), {
    message: 'Choose which one this campaign promotes',
    path: ['subjectId'],
  });

export type CampaignInput = z.infer<typeof campaignSchema>;

/**
 * Is this campaign live right now?
 *
 * One function, used by the server to decide what the public endpoint returns
 * and by the dashboard to label a row, so the two can never disagree about what
 * "active" means.
 */
export function campaignStatus(
  campaign: Pick<SocialMediaCampaign, 'active' | 'startsAt' | 'endsAt'>,
  at: Date = new Date(),
): CampaignStatus {
  if (!campaign.active) return 'draft';
  const now = at.getTime();
  if (campaign.endsAt && Date.parse(campaign.endsAt) <= now) return 'expired';
  if (campaign.startsAt && Date.parse(campaign.startsAt) > now) return 'scheduled';
  return 'active';
}
