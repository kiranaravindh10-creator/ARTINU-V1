/**
 * What a photograph's camera recorded: when it was taken, and which way up.
 *
 * Phone and camera JPEGs usually carry the moment of capture in their EXIF block
 * (DateTimeOriginal). Work carried over from an artist application arrived with
 * no date at all, though thirteen of the first fifteen originals had one sitting
 * in the file. This reads it so the Studio can offer it - as a suggestion the
 * photographer confirms or corrects, never as a fact written to `capturedAt`
 * behind their back.
 *
 * The same block says which way up to show the pixels (Orientation). A phone
 * often stores a portrait photograph sideways and flags it to be turned; every
 * browser and the resizer obey the flag, so its size has to be read turned too
 * (see `imageDimensions`).
 *
 * Only these fields are read. EXIF can also hold the GPS position of somebody's
 * home; nothing else is parsed and nothing else leaves this module.
 *
 * ── Time zones ───────────────────────────────────────────────────────────────
 *
 * An EXIF timestamp is the camera's local time with no zone. The day is taken
 * exactly as written - `2026:10:02 23:40:00` is 2 October - and never
 * converted: turning a zone-less time "into UTC" would invent a zone and can
 * move the photograph to another day. OffsetTimeOriginal, when a camera writes
 * one, is passed along for information only.
 */
import { open } from 'node:fs/promises';
import path from 'node:path';
import { formatCalendarDate, isValidCaptureDate, type CaptureDateSuggestion } from '@artinu/shared';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/** EXIF sits at the front of a JPEG; 256 KB clears it even behind a large colour profile. */
const HEAD_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export interface ExifFields {
  dateTimeOriginal: string | null;
  dateTimeDigitized: string | null;
  offsetTimeOriginal: string | null;
  offsetTimeDigitized: string | null;
  /** IFD0 DateTime: when the file was last saved - an editing app's date, not the camera's. */
  modified: string | null;
  /** IFD0 Orientation, 1-8. 5-8 are a quarter turn: the stored pixels are sideways. */
  orientation: number | null;
}

export type ExifScan =
  | { kind: 'exif'; fields: ExifFields }
  /** A JPEG whose image data begins with no EXIF block before it. */
  | { kind: 'none' }
  /** The bytes ran out before either. */
  | { kind: 'truncated' }
  | { kind: 'not-jpeg' };

/** Walk a JPEG's segments to its EXIF block and read the fields above from it. */
export function scanJpeg(buffer: Buffer): ExifScan {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return { kind: 'not-jpeg' };
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return { kind: 'none' };
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Start of scan or end of image: the metadata segments are all behind us.
    if (marker === 0xda || marker === 0xd9) return { kind: 'none' };
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return { kind: 'none' };
    const end = offset + 2 + length;
    if (marker === 0xe1 && buffer.toString('latin1', offset + 4, offset + 10) === 'Exif\0\0') {
      if (end > buffer.length) return { kind: 'truncated' };
      const fields = readTiffFields(buffer.subarray(offset + 10, end));
      if (fields) return { kind: 'exif', fields };
    }
    offset = end;
  }
  return { kind: 'truncated' };
}

function readTiffFields(tiff: Buffer): ExifFields | null {
  if (tiff.length < 8) return null;
  const order = tiff.toString('latin1', 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  if (u16(2) !== 42) return null;

  const fields: ExifFields = {
    dateTimeOriginal: null,
    dateTimeDigitized: null,
    offsetTimeOriginal: null,
    offsetTimeDigitized: null,
    modified: null,
    orientation: null,
  };
  // An ASCII field: inline when it fits in four bytes, otherwise at an offset.
  const ascii = (entry: number): string | null => {
    const count = u32(entry + 4);
    if (u16(entry + 2) !== 2 || count === 0 || count > 64) return null;
    const at = count > 4 ? u32(entry + 8) : entry + 8;
    if (at + count > tiff.length) return null;
    const text = tiff.toString('latin1', at, at + count).replace(/\0[\s\S]*$/, '').trim();
    return text || null;
  };
  const directory = (start: number, read: (tag: number, entry: number) => void) => {
    if (start < 8 || start + 2 > tiff.length) return;
    const count = u16(start);
    for (let i = 0; i < count; i += 1) {
      const entry = start + 2 + i * 12;
      if (entry + 12 > tiff.length) return;
      read(u16(entry), entry);
    }
  };

  let exifDirectory = 0;
  try {
    directory(u32(4), (tag, entry) => {
      if (tag === 0x0132) fields.modified = ascii(entry);
      if (tag === 0x8769) exifDirectory = u32(entry + 8);
      // A SHORT, so its value sits in the first two bytes of the value field.
      if (tag === 0x0112 && u16(entry + 2) === 3) {
        const value = u16(entry + 8);
        fields.orientation = value >= 1 && value <= 8 ? value : null;
      }
    });
    directory(exifDirectory, (tag, entry) => {
      if (tag === 0x9003) fields.dateTimeOriginal = ascii(entry);
      if (tag === 0x9004) fields.dateTimeDigitized = ascii(entry);
      if (tag === 0x9011) fields.offsetTimeOriginal = ascii(entry);
      if (tag === 0x9012) fields.offsetTimeDigitized = ascii(entry);
    });
  } catch {
    // A directory that points past its own block: keep what was read before it.
  }
  return fields;
}

/**
 * The EXIF Orientation of a JPEG, or null when it has none. 5-8 mean the
 * stored pixels are a quarter turn from how the photograph is shown.
 */
export function exifOrientation(buffer: Buffer): number | null {
  const scan = scanJpeg(buffer);
  return scan.kind === 'exif' ? scan.fields.orientation : null;
}

type Day = { day: string; time: string } | 'invalid' | null;

/** The calendar day of an EXIF timestamp, or 'invalid' for one no camera could mean. */
function dayOf(stamp: string | null, today: Date): Day {
  if (!stamp) return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(stamp);
  if (!match) return 'invalid';
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  // "0000:00:00 00:00:00" is what a camera whose clock was never set writes.
  return isValidCaptureDate(day, today) ? { day, time: `${match[4]}:${match[5]}` } : 'invalid';
}

const long = (day: string) => formatCalendarDate(day, 'long');

/** Turn what the file says into the suggestion the Studio shows. */
export function suggestionFromScan(scan: ExifScan, today: Date = new Date()): CaptureDateSuggestion {
  const none = { date: null, recorded: null, offset: null, source: null, candidates: [] };
  if (scan.kind === 'not-jpeg') {
    return {
      ...none,
      status: 'missing',
      message: 'Your original file is not a JPEG, so there is no camera date in it to read. If you know the day it was taken, enter it.',
    };
  }
  if (scan.kind === 'truncated') {
    return {
      ...none,
      status: 'unreadable',
      message: 'We could not read your original file all the way through. If you know the day it was taken, enter it.',
    };
  }
  if (scan.kind === 'none') {
    return {
      ...none,
      status: 'missing',
      message: 'Your original file does not record when it was taken. If you know the day, enter it.',
    };
  }

  const dates = scan.fields;
  const original = dayOf(dates.dateTimeOriginal, today);
  const digitized = dayOf(dates.dateTimeDigitized, today);

  if (original && original !== 'invalid' && digitized && digitized !== 'invalid' && original.day !== digitized.day) {
    return {
      ...none,
      status: 'ambiguous',
      recorded: dates.dateTimeOriginal,
      candidates: [original.day, digitized.day],
      message: `Your file records two different days: ${long(original.day)} as when it was taken and ${long(digitized.day)} as when it was stored. Choose the right one, or enter the day yourself.`,
    };
  }

  const found =
    original && original !== 'invalid'
      ? { ...original, source: 'DateTimeOriginal' as const, recorded: dates.dateTimeOriginal, offset: dates.offsetTimeOriginal }
      : digitized && digitized !== 'invalid'
        ? { ...digitized, source: 'DateTimeDigitized' as const, recorded: dates.dateTimeDigitized, offset: dates.offsetTimeDigitized }
        : null;
  if (found) {
    return {
      status: 'found',
      date: found.day,
      recorded: found.recorded,
      offset: found.offset,
      source: found.source,
      candidates: [],
      message: `Your camera recorded ${long(found.day)} at ${found.time}, local time where it was taken. It is only a suggestion - check it before you save it.`,
    };
  }

  const bad = original === 'invalid' ? dates.dateTimeOriginal : digitized === 'invalid' ? dates.dateTimeDigitized : null;
  if (bad) {
    return {
      ...none,
      status: 'invalid',
      recorded: bad,
      message: `Your camera recorded "${bad}", which is not a real date - its clock was probably never set. If you know the day it was taken, enter it.`,
    };
  }
  return {
    ...none,
    status: 'missing',
    message: dates.modified
      ? 'Your original file only records when it was last saved, which is not necessarily when it was taken. If you know the day, enter it.'
      : 'Your original file does not record when it was taken. If you know the day, enter it.',
  };
}

/*
  The first HEAD_BYTES of a stored file. Files kept on this machine are read
  from disk - their URL names this server's own /uploads, which a test
  instance on another port cannot fetch from itself.
*/
async function readStoredHead(url: string, whole: boolean): Promise<{ buffer: Buffer; partial: boolean } | null> {
  const localBase = env.STORAGE_PUBLIC_BASE_URL.replace(/\/+$/, '');
  if (env.STORAGE_DRIVER === 'local' && url.startsWith(`${localBase}/`)) {
    const root = path.resolve(env.uploadsDir);
    const file = path.resolve(root, decodeURIComponent(url.slice(localBase.length + 1).split('?')[0]));
    if (!file.startsWith(root + path.sep)) return null;
    const handle = await open(file, 'r');
    try {
      const size = (await handle.stat()).size;
      const length = whole ? size : Math.min(size, HEAD_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);
      return { buffer, partial: length < size };
    } finally {
      await handle.close();
    }
  }
  if (!/^https?:\/\//i.test(url)) return null;
  const response = await fetch(url, {
    headers: whole ? {} : { Range: `bytes=0-${HEAD_BYTES - 1}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return { buffer: Buffer.from(await response.arrayBuffer()), partial: response.status === 206 };
}

/** The camera's date for the photograph at `url`, as a suggestion. Never throws. */
export async function suggestCaptureDate(url: string | null | undefined, today: Date = new Date()): Promise<CaptureDateSuggestion> {
  try {
    const head = url ? await readStoredHead(url, false) : null;
    if (!head) return suggestionFromScan({ kind: 'truncated' }, today);
    let scan = scanJpeg(head.buffer);
    if (scan.kind === 'truncated' && head.partial) {
      const whole = await readStoredHead(url!, true);
      if (whole) scan = scanJpeg(whole.buffer);
    }
    return suggestionFromScan(scan, today);
  } catch (error) {
    logger.warn(`Could not read a capture date from ${url}`, error);
    return suggestionFromScan({ kind: 'truncated' }, today);
  }
}
