import { randomUUID } from 'node:crypto';
import {
  artworkMetadataStatus,
  ROLE_LABELS,
  startingPrice,
  type ArtistApplication,
  type Artwork,
  type GalleryCategory,
  type MetadataGap,
} from '@artinu/shared';
import { db, type StoredUser } from '@/database/db';
import { recordAudit } from '@/services/audit.service';
import { createProfile, createUser, findByEmail, issueToken, profileFor, temporaryPassword } from '@/services/auth.service';
import { scanJpeg, suggestionFromScan } from '@/services/exif.service';
import { generateVariants } from '@/services/image-variants.service';
import { allocatePhotoId, ensurePhotographerCode } from '@/services/photo-id.service';
import { imageDimensions, removeStored, removeVariants, storeDerivative } from '@/services/storage.service';
import { accessOf, sendInvitation } from '@/services/user-admin.service';
import { blockingFailure, orientationOf, runValidationPipeline } from '@/services/validation-pipeline.service';
import { now } from '@/utils/ids';
import { logger } from '@/utils/logger';

/**
 * An artist application becomes an artist account. There is no approval step.
 *
 * Submitting the form is enough: the account is created (or the existing one
 * on that address is used), the profile is made, a photographer code is
 * allocated once, every submitted photograph becomes a record owned by that
 * account, and a single-use link to choose a password goes out if they have
 * no way to sign in yet.
 *
 * Safe to run again on the same application - it is how a half-finished setup
 * is repaired. Nothing is created twice: the account is found by email, the
 * profile by account, the code is kept once set, and a photograph already
 * linked to its file is left exactly as it is.
 *
 * The photographs are published the way every Studio upload is (see the
 * upload route in artwork.routes.ts): the automated checks run, and whatever
 * clears them is `approved` - live in the gallery and on the artist's public
 * page. There is no curator queue in front of uploads any more; the one check
 * that can block is the text scan of the title, description and tags, and a
 * photograph it blocks is recorded as `rejected` with the reason, never
 * dropped. Like an upload, each gets its screen copies (the 400/800/1600px
 * WebP variants), so the gallery never has to resize the original.
 *
 * What the application never asked for is not made up. A photograph arrives
 * with a placeholder title ("Untitled 3"), no story and no date, and the Studio
 * shows it as needing details until the photographer adds them. A date the
 * camera recorded in the file is reported here as `cameraDate` and offered in
 * the Studio - it is never written to `capturedAt` unconfirmed.
 */

export type PhotographOutcome = 'linked' | 'already_linked' | 'missing_file' | 'owned_by_another_account';

export interface OnboardingResult {
  applicationId: string;
  userId: string | null;
  accountCreated: boolean;
  photographerCode: string | null;
  photographs: {
    url: string;
    outcome: PhotographOutcome;
    artworkId: string | null;
    photoId: string | null;
    /** What the photographer still has to add before the photograph is complete. */
    needs?: MetadataGap[];
    /** The day the camera recorded, unconfirmed - offered in the Studio, never stored by itself. */
    cameraDate?: string | null;
  }[];
  invitation: 'sent' | 'not_delivered' | 'already_pending' | 'not_needed' | 'skipped';
  /** Why setup could not finish - shown on the Applications screen. Null when it did. */
  problem: string | null;
}

export interface OnboardingOptions {
  /** Who set this off - null for the public form. */
  actor?: { id: string; email: string } | null;
  /** False for repairs that must not email anyone. Defaults to true. */
  sendInvitation?: boolean;
  /** Sizes already known from the upload, by URL, so the files are not read again. */
  knownSizes?: Map<string, { width: number; height: number }>;
  /** The files' bytes when the caller already holds them (the form has just stored them), by URL. */
  knownFiles?: Map<string, { buffer: Buffer; contentType: string }>;
  /** Recorded on the audit entries - e.g. the repair script's name. */
  source?: string;
}

/** One setup at a time per address, so a double-submit cannot race itself. */
const running = new Map<string, Promise<unknown>>();
function serialised<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = running.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  running.set(key, next.catch(() => undefined));
  return next;
}

/** The photograph records that already point at this file, by any of their URLs. */
function recordsForFile(all: Artwork[], url: string): Artwork[] {
  return all.filter((artwork) => artwork.originalUrl === url || artwork.imageUrl === url || artwork.thumbnailUrl === url);
}

/** Reads the size from the stored file itself - the only honest source for an application photograph. */
export async function sizeOf(url: string): Promise<{ width: number; height: number } | null | 'missing'> {
  try {
    const response = await fetch(url);
    if (response.status === 404 || response.status === 400) return 'missing';
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return 'missing';
    return imageDimensions(buffer, response.headers.get('content-type') ?? 'image/jpeg') ?? null;
  } catch (error) {
    logger.warn(`Could not read ${url} to size it`, error);
    return null;
  }
}

/** A submitted file's bytes: the caller's copy when it has one, otherwise read from storage. */
async function bytesOf(
  url: string,
  known?: { buffer: Buffer; contentType: string },
): Promise<{ buffer: Buffer; contentType: string } | 'missing' | null> {
  if (known?.buffer?.length) return known;
  try {
    const response = await fetch(url);
    if (response.status === 404 || response.status === 400) return 'missing';
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return 'missing';
    return { buffer, contentType: (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0]!.trim() };
  } catch (error) {
    logger.warn(`Could not read ${url}`, error);
    return null;
  }
}

/**
 * The screen copies an upload gets (generateVariants + storeDerivative, as
 * storeImageSet does), made from a file that is already stored. All or
 * nothing: a partial set is removed again and the original is served instead.
 */
async function screenCopies(file: { buffer: Buffer; contentType: string }, url: string): Promise<Record<number, string>> {
  const derived = await generateVariants(file.buffer, file.contentType);
  if (derived.length === 0) return {};
  const stem = url.split('?')[0]!.split('/').pop()?.replace(/\.[^.]+$/, '') || randomUUID();
  const variants: Record<number, string> = {};
  const storedPaths: string[] = [];
  try {
    for (const variant of derived) {
      const stored = await storeDerivative('thumbnails', `${stem}-${variant.width}.webp`, variant.buffer, 'image/webp');
      variants[variant.width] = stored.url;
      storedPaths.push(stored.path);
    }
    return variants;
  } catch (error) {
    logger.warn(`Could not store screen copies of ${url} - the original will be served.`, error);
    await Promise.all(storedPaths.map((storedPath) => removeStored(storedPath).catch(() => undefined)));
    return {};
  }
}

/**
 * The application asks for the photographer's genres (ART_STYLES); the gallery
 * files photographs by category (GALLERY_CATEGORIES). The nearest category for
 * the first genre they chose is the best information there is - they can
 * change it per photograph in their Studio (Portfolio → Edit details).
 */
const CATEGORY_FOR_GENRE: Record<string, GalleryCategory> = {
  architecture: 'architecture',
  documentary: 'street',
  fine_art: 'abstract',
  landscape: 'nature',
  portrait: 'people',
  street: 'street',
  travel: 'travel',
  wildlife: 'nature',
  abstract: 'abstract',
  food: 'lifestyle',
};

export function categoryFor(application: Pick<ArtistApplication, 'genres'>): GalleryCategory {
  for (const genre of application.genres) {
    const category = CATEGORY_FOR_GENRE[genre];
    if (category) return category;
  }
  return 'places';
}

/**
 * One submitted file as a photograph record - the same shape and the same
 * publication decision as a Studio upload. The file is referenced where it
 * already is and kept as `originalUrl`; only its screen copies, when given, are
 * new. Titles are "Untitled 1, 2, …" because the application never asked for
 * titles - a placeholder the Studio flags until the photographer renames it.
 */
export async function buildApplicationArtwork(input: {
  application: Pick<ArtistApplication, 'genres' | 'createdAt'>;
  artistId: string;
  url: string;
  index: number;
  size: { width: number; height: number };
  photoId: string;
  photoNumber: number;
  /** Screen copies by width, as `imageVariants` holds them. */
  variants?: Record<number, string>;
}): Promise<Omit<Artwork, 'id'>> {
  const { width, height } = input.size;
  const widths = Object.keys(input.variants ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  const title = `Untitled ${input.index + 1}`;
  const category = categoryFor(input.application);
  const validation = await runValidationPipeline({
    imageUrl: input.url,
    width,
    height,
    title,
    description: null,
    tags: [],
    category,
    location: null,
    artistId: input.artistId,
  });
  const failure = blockingFailure(validation);
  return {
    artistId: input.artistId,
    title,
    description: null,
    story: null,
    category,
    mood: [],
    colors: [],
    suitableFor: [],
    tags: [],
    // As an upload: the largest copy for the page, the smallest for a tile,
    // the file itself for print. Without copies all three are the file.
    imageUrl: widths.length > 0 ? input.variants![widths[widths.length - 1]!]! : input.url,
    thumbnailUrl: widths.length > 0 ? input.variants![widths[0]!]! : input.url,
    originalUrl: input.url,
    imageVariants: widths.length > 0 ? input.variants! : null,
    orientation: orientationOf(width, height),
    width,
    height,
    dominantColor: '#141210',
    location: null,
    capturedAt: null,
    photoId: input.photoId,
    photoNumber: input.photoNumber,
    status: failure ? 'rejected' : 'approved',
    validation,
    reviewNote: failure?.detail ?? null,
    reviewedBy: failure ? 'Automated checks' : null,
    reviewedAt: failure ? now() : null,
    views: 0,
    likes: 0,
    selections: 0,
    priceFrom: startingPrice(),
    featured: false,
    // When the photographer sent the file, not when it was linked.
    createdAt: input.application.createdAt,
    updatedAt: now(),
  };
}


const isDuplicateKey = (error: unknown): boolean => error instanceof Error && /duplicate key|23505/i.test(error.message);

export function onboardApplication(application: ArtistApplication, options: OnboardingOptions = {}): Promise<OnboardingResult> {
  return serialised(application.email.trim().toLowerCase(), () => run(application, options));
}

async function run(application: ArtistApplication, options: OnboardingOptions): Promise<OnboardingResult> {
  const result: OnboardingResult = {
    applicationId: application.id,
    userId: null,
    accountCreated: false,
    photographerCode: null,
    photographs: [],
    invitation: 'skipped',
    problem: null,
  };
  const email = application.email.trim().toLowerCase();
  const actor = options.actor ?? null;

  // ── The account ─────────────────────────────────────────────────────────
  let user: StoredUser | null = await findByEmail(email);
  if (user && user.role !== 'artist') {
    result.userId = user.id;
    result.problem =
      `${email} already belongs to a ${ROLE_LABELS[user.role]} account, so no artist account was made. ` +
      'An account has one role - use a different address for the artist account, or change this account\'s role.';
    return finish(application, result, actor, options.source ?? null);
  }
  if (!user) {
    try {
      user = await createUser({
        email,
        // Never shown to anyone; replaced from the setup link.
        password: temporaryPassword(),
        role: 'artist',
        emailVerified: true,
        signedIn: false,
      });
      result.accountCreated = true;
    } catch (error) {
      // Another request made it a moment ago - use that one.
      user = await findByEmail(email);
      if (!user) throw error;
    }
  }
  result.userId = user.id;

  // ── The profile ─────────────────────────────────────────────────────────
  let profile = await profileFor(user.id);
  if (!profile) {
    const [city, country] = application.location.split(',').map((part) => part.trim());
    profile = await createProfile(user.id, {
      fullName: application.fullName,
      displayName: application.fullName,
      city: city || application.location,
      country: country ?? null,
      bio: application.journey.slice(0, 400),
      website: application.website ?? null,
      instagram: application.instagram ?? null,
      genres: application.genres,
      avatarUrl: application.portfolioUrls[0] ?? null,
    });
  }

  // ── The photographer code: allocated once, never changed ────────────────
  try {
    result.photographerCode = await ensurePhotographerCode(profile);
  } catch (error) {
    result.problem = `A photographer code could not be allocated: ${error instanceof Error ? error.message : String(error)}`;
    return finish(application, result, actor, options.source ?? null);
  }

  // ── The photographs ─────────────────────────────────────────────────────
  const urls = [...new Set(application.portfolioUrls)];
  const all = await db.artworks.find();
  for (const [index, url] of urls.entries()) {
    const existing = recordsForFile(all, url);
    const mine = existing.find((artwork) => artwork.artistId === user!.id);
    if (mine) {
      result.photographs.push({
        url,
        outcome: 'already_linked',
        artworkId: mine.id,
        photoId: mine.photoId ?? null,
        needs: artworkMetadataStatus(mine).missing,
      });
      continue;
    }
    if (existing.length > 0) {
      // Never guess: a file another account owns stays with that account.
      result.photographs.push({ url, outcome: 'owned_by_another_account', artworkId: existing[0]!.id, photoId: null });
      continue;
    }

    // The file is read once: its size, its screen copies and its camera date
    // all come from the same bytes.
    const file = await bytesOf(url, options.knownFiles?.get(url));
    if (file === 'missing') {
      result.photographs.push({ url, outcome: 'missing_file', artworkId: null, photoId: null });
      continue;
    }
    const size = (file && imageDimensions(file.buffer, file.contentType)) || options.knownSizes?.get(url) || null;
    const width = size?.width ?? 2400;
    const height = size?.height ?? 1600;
    const variants = file ? await screenCopies(file, url) : {};
    const camera = file ? suggestionFromScan(scanJpeg(file.buffer)) : null;
    const cameraDate = camera?.status === 'found' ? camera.date : null;

    let allocated = await allocatePhotoId(user.id);
    let created: Artwork | null = null;
    try {
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        try {
          created = await db.artworks.insert(
            await buildApplicationArtwork({
              application,
              artistId: user.id,
              url,
              index,
              size: { width, height },
              photoId: allocated.photoId,
              photoNumber: allocated.photoNumber,
              variants,
            }),
          );
        } catch (error) {
          if (attempt >= 4 || !isDuplicateKey(error)) throw error;
          allocated = await allocatePhotoId(user.id);
        }
      }
    } catch (error) {
      // No record, so no copies either - a retry makes them again.
      await removeVariants(variants).catch(() => undefined);
      throw error;
    }
    await recordAudit({
      actor: actor ?? undefined,
      action: 'artwork.linked_from_application',
      entity: 'artwork',
      entityId: created!.id,
      meta: {
        applicationId: application.id,
        userId: user.id,
        photoId: created!.photoId,
        file: url,
        status: created!.status,
        screenCopies: Object.keys(variants).map(Number),
        cameraDate,
        source: options.source ?? null,
      },
    });
    all.push(created!);
    result.photographs.push({
      url,
      outcome: 'linked',
      artworkId: created!.id,
      photoId: created!.photoId ?? null,
      needs: artworkMetadataStatus(created!).missing,
      cameraDate,
    });
  }

  const missing = result.photographs.filter((photo) => photo.outcome === 'missing_file').length;
  const elsewhere = result.photographs.filter((photo) => photo.outcome === 'owned_by_another_account').length;
  if (missing || elsewhere) {
    result.problem = [
      missing ? `${missing} submitted photograph${missing === 1 ? ' is' : 's are'} no longer in storage` : '',
      elsewhere ? `${elsewhere} already belong${elsewhere === 1 ? 's' : ''} to another account and ${elsewhere === 1 ? 'was' : 'were'} left there` : '',
    ]
      .filter(Boolean)
      .join('; ')
      .concat('.');
  }

  // ── A way to sign in, if they have none yet ─────────────────────────────
  const links = await db.tokens.find({ where: { userId: user.id, purpose: 'password_reset', consumed: false } });
  const access = accessOf(user, links);
  const needsLink = result.accountCreated || access.state === 'invitation_expired';
  if (access.state === 'invited') result.invitation = 'already_pending';
  else if (!needsLink) result.invitation = 'not_needed';
  else if (options.sendInvitation === false) result.invitation = 'skipped';
  else {
    for (const old of links) await db.tokens.update(old.id, { consumed: true });
    const link = await issueToken(user.id, 'password_reset', 60 * 24 * 7);
    const sent = await sendInvitation(email, application.fullName, 'artist', link.token);
    result.invitation = sent.delivered ? 'sent' : 'not_delivered';
  }

  return finish(application, result, actor, options.source ?? null);
}

/**
 * Records where setup got to. `status` keeps its old values so existing rows
 * and reports stay valid: 'accepted' now means "the account exists", and
 * 'submitted' means it could not be made - the reason is in `reviewNote`.
 */
async function finish(
  application: ArtistApplication,
  result: OnboardingResult,
  actor: { id: string; email: string } | null,
  source: string | null,
) {
  const status = result.userId && !result.problem?.includes('no artist account was made') ? 'accepted' : 'submitted';
  if (application.status !== status || (application.reviewNote ?? null) !== result.problem) {
    await db.applications.update(application.id, { status, reviewNote: result.problem, updatedAt: now() });
  }
  await recordAudit({
    actor: actor ?? undefined,
    action: 'application.processed',
    entity: 'application',
    entityId: application.id,
    meta: {
      source,
      userId: result.userId,
      accountCreated: result.accountCreated,
      photographerCode: result.photographerCode,
      linked: result.photographs.filter((photo) => photo.outcome === 'linked').length,
      alreadyLinked: result.photographs.filter((photo) => photo.outcome === 'already_linked').length,
      missing: result.photographs.filter((photo) => photo.outcome === 'missing_file').length,
      ownedElsewhere: result.photographs.filter((photo) => photo.outcome === 'owned_by_another_account').length,
      needDetails: result.photographs.filter((photo) => (photo.needs?.length ?? 0) > 0).length,
      cameraDates: result.photographs.filter((photo) => photo.cameraDate).length,
      invitation: result.invitation,
      problem: result.problem,
    },
  });
  return result;
}
