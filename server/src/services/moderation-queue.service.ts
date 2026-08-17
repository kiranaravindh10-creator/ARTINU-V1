import type { Artwork } from '@artinu/shared';
import { db } from '@/database/db';
import { advisories, blockingFailure } from '@/services/validation-pipeline.service';
import { notify } from '@/services/notification.service';
import { now } from '@/utils/ids';

/**
 * The review queue holds exactly one kind of thing: a photograph the automated
 * checks could not settle on their own.
 *
 * The rule is the same everywhere it is applied — in the upload route, here, and
 * in the seed:
 *
 *   a blocking check failed        -> rejected, no human involved
 *   every check passed             -> published, no human involved
 *   an advisory was raised         -> a photographer looks at it
 *
 * Anything sitting in `pending_review` with a clean validation record is a bug
 * in whatever put it there: it asks a person to re-make a decision the pipeline
 * already made. `reconcileReviewQueue` enforces the invariant at boot so old
 * rows written before the rule existed cannot keep a reviewer busy.
 */
export function needsHumanJudgement(artwork: Pick<Artwork, 'validation'>): boolean {
  const validation = artwork.validation ?? [];
  if (validation.length === 0) return true; // never validated — a person must look
  if (blockingFailure(validation)) return false; // decided: rejected
  return advisories(validation).length > 0; // advisory -> a photographer decides
}

export interface ReconcileResult {
  scanned: number;
  published: string[];
  rejected: string[];
}

/**
 * Publishes anything stuck in review with a clean bill of health, and closes out
 * anything stuck in review that actually failed a blocking check. Idempotent —
 * a second run finds nothing to do.
 */
export async function reconcileReviewQueue(): Promise<ReconcileResult> {
  const pending = await db.artworks.find({ where: { status: 'pending_review' } });
  const result: ReconcileResult = { scanned: pending.length, published: [], rejected: [] };

  for (const artwork of pending) {
    const validation = artwork.validation ?? [];
    if (validation.length === 0) continue;

    const failure = blockingFailure(validation);

    if (failure) {
      await db.artworks.update(artwork.id, {
        status: 'rejected',
        reviewNote: failure.detail,
        reviewedBy: 'Automated checks',
        reviewedAt: now(),
        updatedAt: now(),
      });
      result.rejected.push(artwork.id);
      await notify({
        userId: artwork.artistId,
        type: 'upload_rejected',
        title: `“${artwork.title}” could not be published`,
        body: failure.detail,
        link: '/studio/submissions',
      });
      continue;
    }

    if (advisories(validation).length === 0) {
      await db.artworks.update(artwork.id, {
        status: 'approved',
        reviewNote: null,
        reviewedBy: 'Automated checks',
        reviewedAt: now(),
        updatedAt: now(),
      });
      result.published.push(artwork.id);
      await notify({
        userId: artwork.artistId,
        type: 'upload_approved',
        title: `“${artwork.title}” is live`,
        body: 'Every check passed, so it is in the gallery where spaces can choose it.',
        link: `/gallery/${artwork.id}`,
      });
    }
  }

  return result;
}
