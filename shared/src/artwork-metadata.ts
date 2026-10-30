/**
 * Is a photograph's own information complete?
 *
 * Shared because the Studio shows the answer and the server can be asked it,
 * and the two must agree. A photograph is complete when it has a title that
 * means something and a story of at least STORY_MIN_LENGTH characters - the
 * same bar an upload has to clear (`artworkUploadSchema`). Photographs that
 * reached the site another way - an application carried over, an import - can
 * be published without either, and this is how they are found again.
 *
 * The capture date is reported but does not decide completeness: a photographer
 * who does not know the day should not be blocked by it, and a date nobody
 * confirmed must never be filled in to make a badge go green.
 */
import type { Artwork } from './types.js';

export const STORY_MIN_LENGTH = 20;

/*
  Titles that say nothing about the photograph: the "Untitled 3" a carried-over
  application is given, and the file names a camera or phone invents.
*/
const PLACEHOLDER_TITLE = /^(untitled(\s*\d+)?|photo\s*\d+|image\s*\d*|img[\s_-]?\d+|dsc[\s_-]?\d+)$/i;

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  const value = (title ?? '').trim();
  return value.length < 2 || PLACEHOLDER_TITLE.test(value);
}

export type MetadataGap = 'title' | 'story';

export interface ArtworkMetadataStatus {
  complete: boolean;
  /** What is still needed, in the order the edit form asks for it. */
  missing: MetadataGap[];
  /**
   * Whether a capture date is on record. Only a photographer sets one - at
   * upload or in the Studio - so a date on record is a confirmed date.
   */
  hasCaptureDate: boolean;
}

export function artworkMetadataStatus(
  artwork: Pick<Artwork, 'title' | 'story' | 'capturedAt'>,
): ArtworkMetadataStatus {
  const missing: MetadataGap[] = [];
  if (isPlaceholderTitle(artwork.title)) missing.push('title');
  if ((artwork.story ?? '').trim().length < STORY_MIN_LENGTH) missing.push('story');
  return { complete: missing.length === 0, missing, hasCaptureDate: Boolean(artwork.capturedAt) };
}

/**
 * A capture date as the Studio sends it: `YYYY-MM-DD`, a day that exists, and
 * not later than tomorrow - a photographer east of the server can already be a
 * day ahead of it.
 */
export function isValidCaptureDate(value: string, today: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  const tomorrow = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1);
  return real && year >= 1826 && date.getTime() <= tomorrow;
}

/**
 * What the camera recorded about when a photograph was taken, read from the
 * original file's EXIF. A suggestion for the photographer to confirm - never
 * written to `capturedAt` by itself.
 */
export interface CaptureDateSuggestion {
  status: 'found' | 'missing' | 'invalid' | 'ambiguous' | 'unreadable';
  /**
   * The camera's own calendar day, `YYYY-MM-DD`. EXIF records local time with
   * no zone, so this is the day where the photograph was taken and is never
   * converted to another zone.
   */
  date: string | null;
  /** The timestamp exactly as the camera wrote it, e.g. `2026:10:02 09:23:39`. */
  recorded: string | null;
  /** The camera's UTC offset when the file records one (`+05:30`). */
  offset: string | null;
  source: 'DateTimeOriginal' | 'DateTimeDigitized' | null;
  /** The two days, when the file records different ones. */
  candidates: string[];
  /** One plain sentence for the photographer. */
  message: string;
}
