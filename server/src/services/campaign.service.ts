import {
  CAMPAIGN_POSTER_MAX_BYTES,
  CAMPAIGN_POSTER_TYPES,
  campaignStatus,
  type ActiveCampaign,
  type CampaignInput,
  type SocialMediaCampaign,
} from '@artinu/shared';
import { db } from '@/database/db';
import { badRequest } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { isRemoteUrl, removeStored, storeBase64 } from '@/services/storage.service';

/**
 * SOCIAL MEDIA CAMPAIGNS — the server's half.
 *
 * Two audiences read from here and they get very different things:
 *
 *   · the social media dashboard gets whole rows, because the team needs to see
 *     the schedule, the switch and what a campaign points at in order to work.
 *
 *   · the public popup endpoint gets {@link publicView} — title, copy, poster,
 *     button, frequency. Never `createdBy`, never the window, never the row id
 *     of the artist being promoted. An anonymous visitor is handed the poster
 *     and nothing about who made it or what else is scheduled.
 */

/** A poster is optional; when present it must be a real, small, web image. */
async function storePoster(
  imageBase64: string | undefined,
  existing: string | null | undefined,
): Promise<string | null> {
  // Nothing new supplied — keep whatever the campaign already had.
  if (!imageBase64) return existing ?? null;

  // An edit that re-submits the stored url rather than new bytes.
  if (isRemoteUrl(imageBase64)) return imageBase64;

  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,/i.exec(imageBase64.trim());
  if (!match) {
    throw badRequest('Attach the poster as an image file.');
  }

  const type = match[1].toLowerCase();
  if (!(CAMPAIGN_POSTER_TYPES as readonly string[]).includes(type)) {
    throw badRequest('The poster must be a JPG, PNG or WebP.');
  }

  /*
    Checked from the encoded length, before a Buffer is allocated for it.

    A poster is a banner, not a print file, so the ceiling is 5 MB rather than
    the photograph limit of 25 MB. base64 carries three bytes in every four
    characters, which is what the ratio below undoes.
  */
  const encoded = imageBase64.slice(imageBase64.indexOf(',') + 1);
  const bytes = Math.floor((encoded.length * 3) / 4);
  if (bytes > CAMPAIGN_POSTER_MAX_BYTES) {
    throw badRequest(
      `That poster is ${(bytes / (1024 * 1024)).toFixed(1)} MB - the limit is ${
        CAMPAIGN_POSTER_MAX_BYTES / (1024 * 1024)
      } MB.`,
    );
  }

  /*
    `storeBase64`, the same function every other upload goes through, so the
    poster gets the same signature check (a file that is not really the image
    type it claims is refused) and lands in the same bucket.

    No variants are generated. A popup shows one image at one size and the
    resize would be three more uploads and a sharp decode for nothing — see the
    memory note in image-variants.service.ts for why decodes are not free here.
  */
  const stored = await storeBase64(imageBase64, 'campaigns');
  return stored.url;
}

/** Take a replaced poster back out of the bucket, but never fail the save for it. */
async function discardPoster(url: string | null, replacement: string | null) {
  if (!url || url === replacement) return;
  // Only ours to remove, and only the `<folder>/<name>` form removeStored wants.
  const path = url.split('/campaigns/')[1];
  if (!path) return;
  await removeStored(`campaigns/${path}`).catch((error) =>
    logger.warn(`Could not remove the replaced campaign poster ${path}`, error),
  );
}

const clean = (value: string) => value.trim();
const orNull = (value: string) => (clean(value) === '' ? null : clean(value));

export async function createCampaign(
  input: CampaignInput,
  createdBy: string,
): Promise<SocialMediaCampaign> {
  const imageUrl = await storePoster(input.imageBase64, null);
  const at = new Date().toISOString();

  return db.socialMediaCampaigns.insert({
    title: clean(input.title),
    description: clean(input.description),
    imageUrl,
    ctaLabel: orNull(input.ctaLabel),
    ctaUrl: orNull(input.ctaUrl),
    frequency: input.frequency,
    subject: input.subject,
    subjectId: input.subjectId ?? null,
    active: input.active,
    startsAt: orNull(input.startsAt),
    endsAt: orNull(input.endsAt),
    createdBy,
    createdAt: at,
    updatedAt: at,
  });
}

export async function updateCampaign(
  id: string,
  input: CampaignInput,
): Promise<SocialMediaCampaign> {
  const existing = await db.socialMediaCampaigns.byId(id);
  if (!existing) throw badRequest('That campaign no longer exists.');

  const imageUrl = await storePoster(input.imageBase64, input.imageUrl ?? existing.imageUrl);

  const updated = await db.socialMediaCampaigns.update(id, {
    title: clean(input.title),
    description: clean(input.description),
    imageUrl,
    ctaLabel: orNull(input.ctaLabel),
    ctaUrl: orNull(input.ctaUrl),
    frequency: input.frequency,
    subject: input.subject,
    subjectId: input.subjectId ?? null,
    active: input.active,
    startsAt: orNull(input.startsAt),
    endsAt: orNull(input.endsAt),
    updatedAt: new Date().toISOString(),
  });

  await discardPoster(existing.imageUrl, imageUrl);
  return updated;
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const existing = await db.socialMediaCampaigns.byId(id);
  if (!existing) return false;
  const removed = await db.socialMediaCampaigns.remove(id);
  if (removed) await discardPoster(existing.imageUrl, null);
  return removed;
}

/** Newest first — the order the dashboard lists them in. */
export function listCampaigns(): Promise<SocialMediaCampaign[]> {
  return db.socialMediaCampaigns.find({
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
}

/** The subset a visitor is allowed to see. */
const publicView = (campaign: SocialMediaCampaign): ActiveCampaign => ({
  id: campaign.id,
  title: campaign.title,
  description: campaign.description,
  imageUrl: campaign.imageUrl,
  ctaLabel: campaign.ctaLabel,
  ctaUrl: campaign.ctaUrl,
  frequency: campaign.frequency,
});

/**
 * The one campaign a visitor should be shown, or null.
 *
 * ── Why only one ────────────────────────────────────────────────────────────
 *
 * Two popups stacked on a phone is not two promotions, it is a broken site. If
 * several campaigns are live at once the most recently STARTED one wins, which
 * is the one the team most recently decided to run.
 *
 * The window is evaluated here rather than trusted from the `active` flag, so a
 * campaign that ended overnight stops appearing without anything having to run
 * on a schedule to switch it off.
 */
export async function activeCampaign(): Promise<ActiveCampaign | null> {
  /*
    A missing table is "no campaign", not an error.

    This endpoint is called on essentially every homepage load, and the table it
    reads is created by migration 016. Deploying this code before running that
    migration — or rolling the migration back — would otherwise make every
    visitor's homepage fire a 500, which the client's global query handler turns
    into a toast reading "social_media_campaigns: Could not find the table
    'public.social_media_campaigns' in the schema cache". A raw Postgres error,
    shown to the public, on the front page.

    Swallowing it here means the popup feature is simply inert until the
    migration is applied, which is exactly what it should be. The warning is
    logged once per call for whoever is watching the deploy; nothing else in the
    site depends on this answer.
  */
  let live: Awaited<ReturnType<typeof db.socialMediaCampaigns.find>>;
  try {
    live = await db.socialMediaCampaigns.find({
      where: { active: true },
      filter: (campaign) => campaignStatus(campaign) === 'active',
    });
  } catch (error) {
    logger.warn('Could not read social_media_campaigns - showing no popup.', error);
    return null;
  }

  if (live.length === 0) return null;

  const [newest] = live.sort(
    (a, b) =>
      Date.parse(b.startsAt ?? b.createdAt) - Date.parse(a.startsAt ?? a.createdAt),
  );

  return publicView(newest);
}
