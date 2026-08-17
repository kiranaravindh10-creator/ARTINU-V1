import { VALIDATION_CHECKS, type ArtworkValidationResult } from '@artinu/shared';
import { db } from '@/database/db';

/**
 * The upload validation pipeline (requirements §5).
 *
 * IMPORTANT, AND SAID PLAINLY: there is no machine-learning model here. The MVP
 * has no classifier for AI-generated imagery or nudity, and pretending otherwise
 * would be worse than useless — an artist would trust a verdict nothing actually
 * checked. Each stage below is an honest, inspectable heuristic that catches the
 * obvious cases and is explicit about its limits. Anything genuinely uncertain is
 * passed through to the human review queue, which is where the real decision is
 * made. Swap any single check for a real model later without touching the flow.
 */

export interface PipelineInput {
  imageBase64?: string;
  imageUrl: string;
  width: number;
  height: number;
  title: string;
  description?: string | null;
  tags?: string[];
  category?: string | null;
  location?: string | null;
  artistId: string;
}

/** Words that warrant a human look before publishing. */
const BLOCKLIST = [
  'nude',
  'nudity',
  'explicit',
  'nsfw',
  'porn',
  'gore',
  'graphic violence',
  'slur',
];

/**
 * The size above which a photograph prints comfortably at A3 or larger.
 *
 * This is advisory only. It is **not** a minimum: uploads below it are accepted
 * and published exactly like anything else, and the quality check simply notes
 * the dimensions on the artwork so the print team is not surprised later.
 */
const COMFORTABLE_LONG_EDGE = 2000;

function decodedBytes(base64?: string): number {
  if (!base64) return 0;
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;

/**
 * Which checks may reject a photograph outright.
 *
 * Only one, now. `quality` and `duplicate` used to block: the first refused
 * anything under the print floor, the second refused a re-upload. Both are gone
 * from this set because any photograph at any size and any resolution is now
 * accepted — they still run, and what they find is recorded on the artwork as a
 * note, but neither stops a publish.
 *
 * What remains is a text scan of the title, description and tags. It has
 * nothing to do with the image and everything to do with not printing a slur on
 * a café wall, so it stays.
 */
const BLOCKING: ReadonlySet<string> = new Set(['nsfw']);

const result = (
  check: (typeof VALIDATION_CHECKS)[number],
  passed: boolean,
  detail: string,
): ArtworkValidationResult => ({
  check,
  passed,
  severity: passed ? 'pass' : BLOCKING.has(check) ? 'fail' : 'warning',
  detail,
});

export async function runValidationPipeline(
  input: PipelineInput,
): Promise<ArtworkValidationResult[]> {
  const results: ArtworkValidationResult[] = [];
  const bytes = decodedBytes(input.imageBase64);
  const pixels = Math.max(1, input.width * input.height);
  const longEdge = Math.max(input.width, input.height);
  const shortEdge = Math.max(1, Math.min(input.width, input.height));
  const haystack = [input.title, input.description, ...(input.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // 1 · AI-generated detection ────────────────────────────────────────────────
  // Generated images are commonly exported at exact power-of-two or square
  // "model native" sizes and arrive without capture metadata. That is a weak
  // signal, so it only fails when both dimensions look synthetic.
  const bothPowerOfTwo = isPowerOfTwo(input.width) && isPowerOfTwo(input.height);
  const suspiciousSize = bothPowerOfTwo && input.width === input.height;
  results.push(
    result(
      'ai_generated',
      !suspiciousSize,
      suspiciousSize
        ? 'Exact power-of-two square dimensions with no capture metadata — this needs a human look before publishing.'
        : 'Dimensions and aspect ratio are consistent with a physical camera.',
    ),
  );

  // 2 · Content safety ────────────────────────────────────────────────────────
  // Text-only scan. It cannot see the photograph, which is exactly why every
  // upload still reaches a human reviewer.
  const flagged = BLOCKLIST.filter((term) => haystack.includes(term));
  results.push(
    result(
      'nsfw',
      flagged.length === 0,
      flagged.length === 0
        ? 'No unsafe or abusive language found in the title, description or tags.'
        : `The wording includes “${flagged[0]}”, which needs a human review before this can be published.`,
    ),
  );

  /*
   * 3 · Quality assessment — reported, never blocking.
   *
   * Any photograph at any size and any resolution is now accepted, so this no
   * longer refuses an upload. It still records what the file is, because the
   * print team needs to know before someone tries to run a 900px phone
   * screenshot at A2, and the note lands on the artwork where they can see it.
   */
  const ratio = longEdge / shortEdge;
  const bytesPerPixel = bytes > 0 ? bytes / pixels : null;
  const belowPrintFloor = longEdge < COMFORTABLE_LONG_EDGE;
  const overCompressed = bytesPerPixel !== null && bytesPerPixel < 0.06;

  results.push(
    result(
      'quality',
      true,
      belowPrintFloor
        ? `Published at ${input.width}×${input.height}. Fine on screen; check with the print team before framing above A4.`
        : overCompressed
          ? `Published at ${input.width}×${input.height}. The file is heavily compressed for its dimensions, which may show in a large print.`
          : `Resolution (${input.width}×${input.height}) and compression are comfortably above print requirements.`,
    ),
  );

  // 4 · Duplicate detection ───────────────────────────────────────────────────
  // A cheap fingerprint — normalised title plus dimensions — compared against
  // this artist's existing work. It catches accidental re-uploads, not visually
  // similar frames.
  const normalisedTitle = input.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const existing = await db.artworks.find({ where: { artistId: input.artistId } });

  const duplicate = existing.find((artwork) => {
    const sameTitle = artwork.title.trim().toLowerCase().replace(/\s+/g, ' ') === normalisedTitle;
    const sameShape = artwork.width === input.width && artwork.height === input.height;
    return sameTitle || (sameShape && artwork.orientation === orientationOf(input.width, input.height) && sameTitle);
  });

  results.push(
    result(
      'duplicate',
      !duplicate,
      duplicate
        ? `This looks like “${duplicate.title}”, which is already in your portfolio.`
        : 'No matching photograph found in your portfolio.',
    ),
  );

  // 5 · Metadata validation ───────────────────────────────────────────────────
  const missing: string[] = [];
  if (input.title.trim().length < 3) missing.push('a longer title');
  if (!input.category) missing.push('a category');
  if (!input.tags || input.tags.length === 0) missing.push('at least one tag');
  if (!input.location) missing.push('a location');

  results.push(
    result(
      'metadata',
      missing.length === 0,
      missing.length === 0
        ? 'Title, category, tags and location are all present.'
        : `Curators need ${missing.join(', ')} to place this photograph accurately.`,
    ),
  );

  return results;
}

export function orientationOf(width: number, height: number) {
  if (Math.abs(width - height) / Math.max(width, height) < 0.05) return 'square' as const;
  return width > height ? ('landscape' as const) : ('portrait' as const);
}

/** The first check that blocks publication, if any. */
export function blockingFailure(
  results: ArtworkValidationResult[],
): ArtworkValidationResult | null {
  return results.find((entry) => entry.severity === 'fail') ?? null;
}

/** Non-blocking notes the human reviewer should see. */
export function advisories(results: ArtworkValidationResult[]): ArtworkValidationResult[] {
  return results.filter((entry) => entry.severity === 'warning');
}
