/**
 * Every resized photograph URL the site builds must keep the whole frame.
 *
 *   npx tsx --tsconfig client/tsconfig.json scripts/image-urls-check.ts
 *
 * Supabase's /render/image/ crops to the width when it is given only a width
 * (its default resize mode is `cover`), which turned photographs into strips of
 * their middle. Each builder that asks it for a size is checked here for
 * `resize=contain`, across every width it requests; anything that is not a
 * Supabase object must come back untouched. Exits non-zero on any failure.
 */
import {
  buildHeroSrcSet,
  buildSupabaseSrcSet,
  buildThumbnailSrcSet,
  resizedUpload,
  supabaseResized,
} from '../client/src/lib/imageOptimization';
import { previewSized } from '../lib/share-preview';

const results: boolean[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const original = 'https://abcd.supabase.co/storage/v1/object/public/artworks/3d11d1e4-fc5e-407b-a2a5-c9b1561455ab.jpg';
const candidates = (srcset: string) => srcset.split(', ').map((entry) => entry.split(' ')[0]!);
const wholeFrame = (url: string) =>
  url.includes('/storage/v1/render/image/public/artworks/3d11d1e4-fc5e-407b-a2a5-c9b1561455ab.jpg?') &&
  new URL(url).searchParams.get('resize') === 'contain' &&
  Number(new URL(url).searchParams.get('width')) > 0;

check('supabaseResized keeps the whole frame', wholeFrame(supabaseResized(original, 400)), supabaseResized(original, 400));
check('resizedUpload keeps the whole frame', wholeFrame(resizedUpload(original, 1600)), resizedUpload(original, 1600));
check('...and drops a query string the stored URL carried', wholeFrame(resizedUpload(`${original}?t=123`, 800)) && !resizedUpload(`${original}?t=123`, 800).includes('t=123'));
check('The link-preview image keeps the whole frame', wholeFrame(previewSized(original)), previewSized(original));
for (const [name, srcset] of [
  ['Gallery tile srcset', buildThumbnailSrcSet(original)],
  ['Detail / hero srcset', buildHeroSrcSet(original)],
  ['Lightbox srcset', buildSupabaseSrcSet(original, [800, 1600, 2048])],
] as const) {
  const urls = candidates(srcset);
  check(`${name}: every candidate keeps the whole frame (${urls.length})`, urls.length > 0 && urls.every(wholeFrame), srcset.slice(0, 120));
}
for (const foreign of [
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800',
  '/image/hero-1600.webp',
  'https://example.com/photo.jpg',
]) {
  check(`Left untouched: ${foreign}`, supabaseResized(foreign, 400) === foreign && resizedUpload(foreign, 400) === foreign && previewSized(foreign) === foreign);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
