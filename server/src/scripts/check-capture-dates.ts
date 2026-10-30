/**
 * Checks for reading a capture date out of a photograph's EXIF, and for the
 * rules around capture dates and photograph details.
 *
 *   cd server && npx tsx src/scripts/check-capture-dates.ts
 *
 * Every JPEG here is built byte by byte - exactly the blocks a camera or an
 * editing app writes - so each case is the one it says it is, with no fixtures
 * and no network. It runs itself west of Greenwich (America/Los_Angeles, or
 * CHECK_TZ) to prove a capture date is never shown as the day before. The zone
 * is set in the process rather than on the command line because Git Bash drops
 * a TZ it hands to a Windows program.
 *
 * Exits non-zero if any check fails.
 */
import {
  artworkEditSchema,
  artworkMetadataStatus,
  formatCalendarDate,
  formatDate,
  isPlaceholderTitle,
  isValidCaptureDate,
} from '@artinu/shared';
import { exifOrientation, scanJpeg, suggestionFromScan } from '@/services/exif.service';
import { imageDimensions } from '@/services/storage.service';

process.env.TZ = process.env.CHECK_TZ ?? 'America/Los_Angeles';

const results: boolean[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

type Entry = [tag: number, value: string];

/** A TIFF block: IFD0, and an EXIF directory behind it when there are EXIF tags. */
function tiff(ifd0: Entry[], exif: Entry[], bigEndian = false, exifPointer?: number): Buffer {
  const w16 = (b: Buffer, v: number, at: number) => (bigEndian ? b.writeUInt16BE(v, at) : b.writeUInt16LE(v, at));
  const w32 = (b: Buffer, v: number, at: number) => (bigEndian ? b.writeUInt32BE(v, at) : b.writeUInt32LE(v, at));
  const ifd0Count = ifd0.length + (exif.length || exifPointer ? 1 : 0);
  const exifStart = 8 + 2 + ifd0Count * 12 + 4;
  const dataStart = exifStart + (exif.length ? 2 + exif.length * 12 + 4 : 0);
  const out = Buffer.alloc(dataStart + [...ifd0, ...exif].reduce((sum, [, v]) => sum + v.length + 1, 0));
  out.write(bigEndian ? 'MM' : 'II', 0, 'latin1');
  w16(out, 42, 2);
  w32(out, 8, 4);
  let data = dataStart;
  const directory = (start: number, entries: Entry[], pointer?: number) => {
    const all: { tag: number; value?: string; pointer?: number }[] = entries.map(([tag, value]) => ({ tag, value }));
    if (pointer !== undefined) all.push({ tag: 0x8769, pointer });
    all.sort((a, b) => a.tag - b.tag);
    w16(out, all.length, start);
    let at = start + 2;
    for (const entry of all) {
      w16(out, entry.tag, at);
      if (entry.pointer !== undefined) {
        w16(out, 4, at + 2);
        w32(out, 1, at + 4);
        w32(out, entry.pointer, at + 8);
      } else {
        const bytes = Buffer.from(`${entry.value}\0`, 'latin1');
        w16(out, 2, at + 2);
        w32(out, bytes.length, at + 4);
        if (bytes.length <= 4) bytes.copy(out, at + 8);
        else {
          w32(out, data, at + 8);
          bytes.copy(out, data);
          data += bytes.length;
        }
      }
      at += 12;
    }
    w32(out, 0, at);
  };
  directory(8, ifd0, exif.length ? exifStart : exifPointer);
  if (exif.length) directory(exifStart, exif);
  return out;
}

const segment = (marker: number, payload: Buffer) => {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
};
const SOI = Buffer.from([0xff, 0xd8]);
const JFIF = segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
const SCAN = Buffer.concat([segment(0xda, Buffer.alloc(10)), Buffer.from([0x12, 0x34, 0xff, 0xd9])]);
const exifSegment = (block: Buffer) => segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), block]));

function jpeg(ifd0: Entry[], exif: Entry[], options: { bigEndian?: boolean; before?: Buffer[] } = {}): Buffer {
  return Buffer.concat([SOI, JFIF, ...(options.before ?? []), exifSegment(tiff(ifd0, exif, options.bigEndian)), SCAN]);
}

const ORIGINAL = 0x9003;
const DIGITIZED = 0x9004;
const OFFSET_ORIGINAL = 0x9011;
const MODIFIED = 0x0132;
const TODAY = new Date(Date.UTC(2026, 9, 30, 12));
const suggest = (buffer: Buffer) => suggestionFromScan(scanJpeg(buffer), TODAY);

console.log(`\n── Reading the camera's date ───────────────────────────────`);
{
  const phone = suggest(jpeg([[MODIFIED, '2026:10:04 19:05:34']], [[ORIGINAL, '2026:10:02 09:23:39'], [DIGITIZED, '2026:10:02 09:23:39']]));
  check('A phone photograph: the day it was taken is found', phone.status === 'found' && phone.date === '2026-10-02' && phone.source === 'DateTimeOriginal', JSON.stringify(phone));
  check('...the date the editing app saved it on is not mistaken for it', phone.date !== '2026-10-04');
  check('...and the photographer is told it is only a suggestion', /suggestion/.test(phone.message));

  const lateNight = suggest(jpeg([], [[ORIGINAL, '2024:03:09 23:45:10'], [OFFSET_ORIGINAL, '-08:00']]));
  check('11:45pm with a -08:00 offset stays on its own day (no shift to the 10th)', lateNight.date === '2024-03-09' && lateNight.offset === '-08:00', JSON.stringify(lateNight));
  const earlyMorning = suggest(jpeg([], [[ORIGINAL, '2024:03:10 00:30:00'], [OFFSET_ORIGINAL, '+05:30']]));
  check('00:30 with a +05:30 offset stays on its own day (no shift to the 9th)', earlyMorning.date === '2024-03-10', JSON.stringify(earlyMorning));

  const motorola = suggest(jpeg([], [[ORIGINAL, '2025:12:31 18:02:00']], { bigEndian: true }));
  check('A big-endian ("MM") block reads the same', motorola.status === 'found' && motorola.date === '2025-12-31', JSON.stringify(motorola));
  const behindProfile = suggest(jpeg([], [[ORIGINAL, '2023:06:01 07:00:00']], { before: [segment(0xe2, Buffer.alloc(65000, 7))] }));
  check('EXIF behind a 64 KB colour profile is still found', behindProfile.date === '2023-06-01', behindProfile.status);
  const digitizedOnly = suggest(jpeg([], [[DIGITIZED, '2022:08:15 10:10:10']]));
  check('Only a digitised time: used, and labelled as such', digitizedOnly.status === 'found' && digitizedOnly.source === 'DateTimeDigitized' && digitizedOnly.date === '2022-08-15');

  const editedOnly = suggest(jpeg([[MODIFIED, '2026:04:18 14:24:24']], []));
  check('Only a "last saved" date: no suggestion, and the reason is given', editedOnly.status === 'missing' && editedOnly.date === null && /last saved/.test(editedOnly.message), editedOnly.message);
  const noExif = suggest(Buffer.concat([SOI, JFIF, SCAN]));
  check('No EXIF at all: missing, with a plain explanation', noExif.status === 'missing' && noExif.date === null && /does not record/.test(noExif.message));
  const unset = suggest(jpeg([], [[ORIGINAL, '0000:00:00 00:00:00']]));
  check('A camera clock never set (0000:00:00): invalid, not suggested', unset.status === 'invalid' && unset.date === null && /not a real date/.test(unset.message), unset.message);
  const impossible = suggest(jpeg([], [[ORIGINAL, '2023:02:30 10:00:00']]));
  check('30 February: invalid', impossible.status === 'invalid' && impossible.date === null);
  const future = suggest(jpeg([], [[ORIGINAL, '2026:12:25 10:00:00']]));
  check('A date after today: invalid', future.status === 'invalid' && future.date === null);
  const twoDays = suggest(jpeg([], [[ORIGINAL, '2021:05:01 22:00:00'], [DIGITIZED, '2021:05:03 09:00:00']]));
  check('Taken and stored on different days: ambiguous, both offered, neither chosen', twoDays.status === 'ambiguous' && twoDays.date === null && twoDays.candidates.join() === '2021-05-01,2021-05-03', JSON.stringify(twoDays));

  const png = suggest(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
  check('A PNG: missing, because there is no camera date to read in it', png.status === 'missing' && /not a JPEG/.test(png.message));
  const whole = jpeg([], [[ORIGINAL, '2020:01:01 12:00:00']]);
  check('A file cut off inside its EXIF block reads as truncated, not as "no date"', scanJpeg(whole.subarray(0, 40)).kind === 'truncated');
  const brokenPointer = Buffer.concat([SOI, exifSegment(tiff([], [], false, 0xfffff)), SCAN]);
  let survived = true;
  try {
    survived = suggest(brokenPointer).status === 'missing';
  } catch {
    survived = false;
  }
  check('An EXIF pointer past the end of its block does not throw', survived);
}

console.log('\n── Which way up ────────────────────────────────────────────');
{
  /** A JPEG of the given stored size carrying an EXIF Orientation (a SHORT in IFD0), or none. */
  const turned = (width: number, height: number, orientation: number | null) => {
    const sof = segment(0xc0, Buffer.from([8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]));
    if (orientation === null) return Buffer.concat([SOI, JFIF, sof, SCAN]);
    const block = Buffer.alloc(8 + 2 + 12 + 4);
    block.write('II', 0, 'latin1');
    block.writeUInt16LE(42, 2);
    block.writeUInt32LE(8, 4);
    block.writeUInt16LE(1, 8);
    block.writeUInt16LE(0x0112, 10);
    block.writeUInt16LE(3, 12);
    block.writeUInt32LE(1, 14);
    block.writeUInt16LE(orientation, 18);
    return Buffer.concat([SOI, exifSegment(block), sof, SCAN]);
  };
  const size = (buffer: Buffer) => JSON.stringify(imageDimensions(buffer, 'image/jpeg'));
  check('A phone portrait stored sideways (EXIF 6) is recorded upright', size(turned(4000, 3000, 6)) === '{"width":3000,"height":4000}', size(turned(4000, 3000, 6)));
  check('...and so is EXIF 8 (turned the other way)', size(turned(6000, 4000, 8)) === '{"width":4000,"height":6000}');
  check('EXIF 1 (upright) keeps its stored size', size(turned(4000, 3000, 1)) === '{"width":4000,"height":3000}');
  check('No EXIF keeps its stored size', size(turned(4000, 3000, null)) === '{"width":4000,"height":3000}');
  check('The flag itself reads back', exifOrientation(turned(10, 10, 6)) === 6 && exifOrientation(turned(10, 10, null)) === null);
}

console.log('\n── Capture date rules ──────────────────────────────────────');
check('A real day is accepted', isValidCaptureDate('2026-10-02', TODAY));
check('29 February in a leap year is accepted', isValidCaptureDate('2024-02-29', TODAY));
check('29 February in 2026 is not', !isValidCaptureDate('2026-02-29', TODAY));
check('Month 13 is not', !isValidCaptureDate('2026-13-01', TODAY));
check('Before photography existed is not', !isValidCaptureDate('1825-12-31', TODAY));
check('Tomorrow is (a photographer east of the server can be a day ahead)', isValidCaptureDate('2026-10-31', TODAY));
check('The day after tomorrow is not', !isValidCaptureDate('2026-11-01', TODAY));
check('Only YYYY-MM-DD is accepted', !isValidCaptureDate('2/10/2026', TODAY) && !isValidCaptureDate('2026-10-02T00:00:00Z', TODAY));

const stored = '2026-10-02T00:00:00+00:00';
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
check(`Running west of Greenwich (${zone}, UTC${-new Date(stored).getTimezoneOffset() / 60})`, new Date(stored).getTimezoneOffset() > 0);
check(`A stored capture date shows its own day in ${zone}`, formatCalendarDate(stored, 'long') === '2 October 2026', formatCalendarDate(stored, 'long'));
check('...where formatDate, used for it before, showed the day before', formatDate(stored, 'long') === '1 October 2026', formatDate(stored, 'long'));
check('A bare YYYY-MM-DD (the in-memory store) shows the same day', formatCalendarDate('2026-10-02', 'long') === '2 October 2026');

console.log('\n── Is a photograph complete? ───────────────────────────────');
for (const title of ['Untitled 3', 'untitled', 'IMG_2041', 'DSC-0001', 'Photo 12', ' ']) {
  check(`"${title}" is a placeholder title`, isPlaceholderTitle(title));
}
for (const title of ['Monsoon over Kudremukh', 'Untitled Sky', 'Moonrise']) {
  check(`"${title}" is a real title`, !isPlaceholderTitle(title));
}
const carried = artworkMetadataStatus({ title: 'Untitled 1', story: null, capturedAt: null });
check('A carried-over photograph needs a title and a story', !carried.complete && carried.missing.join() === 'title,story' && !carried.hasCaptureDate);
const short = artworkMetadataStatus({ title: 'Moonrise', story: 'Nineteen characters', capturedAt: null });
check('A 19-character story is not enough', !short.complete && short.missing.join() === 'story');
const done = artworkMetadataStatus({ title: 'Moonrise', story: 'Twenty characters!!!', capturedAt: null });
check('A title and a 20-character story complete it; the date is not required', done.complete && !done.hasCaptureDate);

console.log('\n── What an edit may say ────────────────────────────────────');
const parse = (patch: unknown) => artworkEditSchema.safeParse(patch);
check('Category can be corrected', parse({ category: 'nature' }).success);
check('...to a category that exists', !parse({ category: 'sunsets' }).success);
check('A capture date can be set', parse({ capturedAt: '2026-10-02' }).success);
check('...or cleared', parse({ capturedAt: null }).success);
check('...but not to a day that does not exist', !parse({ capturedAt: '2026-02-30' }).success);
check('...nor in another format', !parse({ capturedAt: '02/10/2026' }).success);
check('A story shorter than 20 characters is refused', !parse({ story: 'Nice sunset' }).success);
check('An empty story is allowed (it clears it)', parse({ story: '   ' }).success);
check('A 20-character story is accepted', parse({ story: 'Monsoon light, 6am.!' }).success);
const titled = parse({ title: '  Moonrise  ' });
check('Titles are trimmed', titled.success && titled.data.title === 'Moonrise');
check('Unknown fields are refused', !parse({ photoId: 'SHC001' }).success && !parse({ artistId: 'x' }).success);
check('The image itself is not an editable field', !parse({ imageUrl: 'https://example.com/x.jpg' }).success);
check('An empty edit is refused', !parse({}).success);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
