import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * AI image safety check (requirements §28).
 *
 * This is the only thing standing between an upload and the public gallery now
 * that manual review is switched off. The rest of the validation pipeline reads
 * the *text* around a photograph — title, tags, dimensions, duplicates — and is
 * therefore blind to the picture itself: explicit imagery with an innocent
 * title passes every one of those checks. This service actually looks at the
 * pixels.
 *
 * Two deliberate design choices:
 *
 *  · **Unconfigured is reported, never silently passed.** With no API key the
 *    verdict is `skipped`, and the caller records that the check did not run.
 *    Returning "safe" for an image nothing inspected would be the single most
 *    dangerous lie this codebase could tell.
 *  · **Errors fail closed for the strong signals only.** A network blip should
 *    not block a photographer's upload, so a transport failure returns
 *    `skipped` and is logged. A model verdict of unsafe blocks.
 */

export type ModerationDecision = 'safe' | 'unsafe' | 'skipped';

export interface ModerationVerdict {
  decision: ModerationDecision;
  /** Which policy categories fired — empty when safe. */
  categories: string[];
  /** Human-readable explanation, shown to the artist when blocking. */
  reason: string;
  /** 0–1. Only meaningful when the check actually ran. */
  confidence: number;
  /** Why the check did not run, when `decision` is 'skipped'. */
  skippedReason?: string;
}

/** Formats Claude's vision API accepts. AVIF is not among them. */
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** The API rejects a single base64 image above 5 MB. */
const MAX_VISION_BYTES = 5 * 1024 * 1024;

const POLICY = `You are the content-safety check for ARTINU, a service that prints
photographs and hangs them on the walls of cafés, restaurants, offices and homes
in India. Every image you see is about to be published publicly and may end up
printed at A2 size in a family restaurant.

Block an image if it contains any of:
- sexual_content: nudity, sexual acts, or sexualised depiction of any person
- minor_safety: any sexualised or exploitative depiction of a child
- graphic_violence: gore, mutilation, corpses, or violence against a person
- hate_symbols: extremist, hateful or terrorist symbols and iconography
- illegal_activity: depiction of drug manufacture or use, or other criminal acts
- shocking: material a reasonable diner would find disturbing on a wall

Do NOT block for:
- artistic nudity being merely implied, silhouettes, or classical statuary
- ordinary street photography including people in public
- religious or cultural imagery, festivals, or ceremonies
- animals, food, architecture, landscapes, abstract work
- low technical quality — that is judged separately

Judge the photograph itself, not any text accompanying it. When genuinely
uncertain, prefer 'safe' and give a low confidence: a human can still take a
photograph down, but a wrongly blocked artist usually just leaves.`;

let client: Anthropic | null = null;

/** Configured once an API key is present; null keeps the check honestly off. */
function anthropic(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // An upload is waiting on this, so fail fast rather than hold the request.
      timeout: 30_000,
      maxRetries: 2,
    });
  }
  return client;
}

export const imageModerationConfigured = () => Boolean(env.ANTHROPIC_API_KEY);

const skip = (reason: string): ModerationVerdict => ({
  decision: 'skipped',
  categories: [],
  reason: 'Automated image inspection did not run.',
  confidence: 0,
  skippedReason: reason,
});

export async function moderateImage(
  buffer: Buffer,
  contentType: string,
): Promise<ModerationVerdict> {
  const api = anthropic();
  if (!api) return skip('ANTHROPIC_API_KEY is not configured');

  if (!VISION_MEDIA_TYPES.has(contentType)) {
    return skip(`${contentType} cannot be inspected — the vision API does not read it`);
  }
  if (buffer.byteLength > MAX_VISION_BYTES) {
    return skip(`image is ${Math.round(buffer.byteLength / 1024 / 1024)} MB, over the 5 MB limit`);
  }

  try {
    const response = await api.messages.create({
      model: env.ANTHROPIC_MODEL,
      // Thinking is on by default and shares this budget with the reply, so
      // leave headroom well beyond the few lines of JSON we want back.
      max_tokens: 4096,
      // A safety classification is not a reasoning-heavy task, and an upload
      // is blocked while it runs.
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              safe: { type: 'boolean' },
              categories: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'sexual_content',
                    'minor_safety',
                    'graphic_violence',
                    'hate_symbols',
                    'illegal_activity',
                    'shocking',
                  ],
                },
              },
              reason: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['safe', 'categories', 'reason', 'confidence'],
            additionalProperties: false,
          },
        },
      },
      system: POLICY,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: buffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: 'Is this photograph safe to print and display publicly? Answer with the schema.',
            },
          ],
        },
      ],
    });

    // Safety classifiers can decline the request itself; that is not a verdict
    // on the photograph, so it must not be read as one.
    if (response.stop_reason === 'refusal') {
      logger.warn('Image moderation request was refused by the safety classifier');
      return skip('the moderation request was itself declined');
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (!text.trim()) return skip('the model returned no verdict');

    const parsed = JSON.parse(text) as {
      safe: boolean;
      categories: string[];
      reason: string;
      confidence: number;
    };

    return {
      decision: parsed.safe ? 'safe' : 'unsafe',
      categories: parsed.categories ?? [],
      reason: parsed.reason,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0)),
    };
  } catch (error) {
    // A provider outage must not become an upload outage. Logged loudly so the
    // gap is visible rather than silent.
    logger.error('Image moderation could not run', error);
    return skip(error instanceof Error ? error.message : 'the moderation call failed');
  }
}
