/**
 * Regenerates every favicon asset from one master image.
 *
 *   npm run favicons
 *
 * Source of truth is assets/brand/artinu-mark-512.png — the gold A on black.
 * This used to rasterise client/public/favicon.svg instead, which meant the
 * whole icon set could only ever be as good as that one hand-written SVG.
 *
 * ── Two things it fixes that a plain resize loop does not ───────────────────
 *
 * 1. favicon.ico is written as a real multi-resolution ICO (16/32/48). The
 *    previous file was a PNG with an .ico extension. Modern browsers cope,
 *    but Windows, older clients and some crawlers read the ICO header and get
 *    nonsense.
 *
 * 2. favicon.svg embeds the mark rather than trying to redraw it. Chrome
 *    prefers an SVG icon over every PNG here, so a wrong SVG wins over a
 *    correct icon set — the version shipped with the artwork was a plain black
 *    circle with no letter in it, which would have shown a black dot in every
 *    tab.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const OUTPUT_DIR = resolve(__dirname, '../client/public');
const MASTER = resolve(__dirname, '../assets/brand/artinu-mark-512.png');

if (!existsSync(MASTER)) {
  console.error(`Master image not found: ${MASTER}`);
  process.exit(1);
}
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

/** Every size the app's <head>, manifest and browserconfig actually reference. */
const sizes = [
  ['favicon-16.png', 16], ['favicon-32.png', 32], ['favicon-48.png', 48],
  ['favicon-57.png', 57], ['favicon-60.png', 60], ['favicon-70.png', 70],
  ['favicon-72.png', 72], ['favicon-76.png', 76], ['favicon-96.png', 96],
  ['favicon-120.png', 120], ['favicon-128.png', 128], ['favicon-144.png', 144],
  ['favicon-150.png', 150], ['favicon-152.png', 152], ['favicon-180.png', 180],
  ['favicon-192.png', 192], ['favicon-196.png', 196], ['favicon-310.png', 310],
  ['favicon-512.png', 512],
  ['android-chrome-192x192.png', 192], ['android-chrome-512x512.png', 512],
  ['apple-touch-icon.png', 180],
  ['apple-touch-icon-57x57.png', 57], ['apple-touch-icon-60x60.png', 60],
  ['apple-touch-icon-72x72.png', 72], ['apple-touch-icon-76x76.png', 76],
  ['apple-touch-icon-114x114.png', 114], ['apple-touch-icon-120x120.png', 120],
  ['apple-touch-icon-144x144.png', 144], ['apple-touch-icon-152x152.png', 152],
  ['apple-touch-icon-180x180.png', 180],
];

// The mark is a full-bleed black square, so it is resized rather than padded.
const square = (size) => sharp(MASTER).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 });

let count = 0;
for (const [name, size] of sizes) {
  await square(size).toFile(resolve(OUTPUT_DIR, name));
  count += 1;
}

// The Windows wide tile is the only non-square asset: pad rather than crop, so
// the letter is not sliced in half.
await sharp(MASTER)
  .resize(310, 150, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(resolve(OUTPUT_DIR, 'favicon-310x150.png'));
count += 1;

/**
 * A real ICO. Header, then one 16-byte directory entry per image, then the
 * PNG payloads. Embedding PNG inside ICO is valid and is what every modern
 * generator emits.
 */
async function writeIco(target, dims = [16, 32, 48]) {
  const images = [];
  for (const d of dims) images.push({ d, buf: await square(d).toBuffer() });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { d, buf } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(d >= 256 ? 0 : d, 0);   // 0 means 256
    e.writeUInt8(d >= 256 ? 0 : d, 1);
    e.writeUInt8(0, 2);                  // palette count
    e.writeUInt8(0, 3);                  // reserved
    e.writeUInt16LE(1, 4);               // colour planes
    e.writeUInt16LE(32, 6);              // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  }

  writeFileSync(target, Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]));
  return dims;
}
const icoDims = await writeIco(resolve(OUTPUT_DIR, 'favicon.ico'));

/**
 * favicon.svg wraps the raster instead of redrawing it. A 128px payload is
 * ample: this is only ever read for a tab icon, and keeping it small matters
 * more than resolution nobody sees.
 */
const embedded = (await square(128).toBuffer()).toString('base64');
writeFileSync(
  resolve(OUTPUT_DIR, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128" width="128" height="128">
  <title>ARTINU</title>
  <image width="128" height="128" xlink:href="data:image/png;base64,${embedded}"/>
</svg>
`,
);

console.log(`favicons: ${count} PNGs, favicon.ico (${icoDims.join('/')}), favicon.svg`);
