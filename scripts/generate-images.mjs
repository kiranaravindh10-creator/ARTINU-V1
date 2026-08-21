/**
 * Builds the responsive WebP derivatives the public site serves.
 *
 *   npm run images
 *
 * Source of truth is assets/source/**. Masters live there at whatever size and
 * format they arrived in; nothing in client/public/image is hand-made.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `buildHeroSrcSet`/`buildThumbnailSrcSet` in client/src/lib/imageOptimization
 * can only synthesise a srcSet for Unsplash and picsum URLs, because those
 * services resize on request. A local file gets no srcSet at all, so every
 * phone downloads the desktop image. Generating the widths ahead of time is
 * what lets a local photograph compete with a CDN one.
 *
 * Each entry also emits a 24px WebP as a base64 data URI, collected into
 * client/src/lib/generated-images.ts. That is what fills the frame on the
 * first paint instead of a grey box — inlined, so it costs no request.
 *
 * Crops are declared, never guessed. A 1600×1600 café photograph placed in a
 * 4:3 card has to lose 400px somewhere, and `position` says where from.
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'assets/source');
const OUT = resolve(root, 'client/public/image');
const MANIFEST = resolve(root, 'client/src/lib/generated-images.ts');

/**
 * One entry per photograph the site addresses by name.
 *
 * `widths` are the srcSet steps. `ratio` is the shape the layout reserves —
 * omit it to keep the master's own proportions. `position` picks the part of
 * the frame worth keeping when a crop is unavoidable; sharp's default is
 * centre, which would cut the top off a wall of framed prints.
 */
const ASSETS = [
  /*
    The three Nib & Nosh photographs, all at 4:5.

    The collaboration card is portrait because the supplied card image is: it is
    1080×1350 with the ARTINU/Nib & Nosh lockup and the café's address across the
    bottom third. Cropping it to a landscape 4:3 cut exactly that off. The two
    interior shots are 4:5 and 1:1, so both survive this ratio with room to
    spare, and all three can sit in one frame without changing size as they
    rotate.

    The collaboration card is never wider than ~450 CSS px in its grid, so 1024
    covers it at 2× and there is no larger step to ship.
  */
  {
    src: 'partners/nib-and-nosh-card.jpg',
    out: 'partners/nib-and-nosh-card',
    widths: [480, 768, 1024],
    ratio: 4 / 5,
  },
  {
    src: 'partners/nib-and-nosh-interior-1.jpg',
    out: 'partners/nib-and-nosh-interior-1',
    widths: [480, 768, 1024],
    ratio: 4 / 5,
    position: 'north',
  },
  {
    src: 'partners/nib-and-nosh-interior-2.jpg',
    out: 'partners/nib-and-nosh-interior-2',
    widths: [480, 768, 1024],
    ratio: 4 / 5,
    position: 'north',
  },

  /*
    Six individual ARTINU prints hanging at Nib & Nosh, one photograph each with
    its artist plate and QR code.

    Centre-cropped rather than biased to an edge: the framed print is the
    subject and it sits near the middle of every one of these. Their source
    ratios vary from 2:3 portrait to 5:4 landscape, so the crop does real work
    here — the generated set is checked visually after each run to confirm no
    frame loses an edge.
  */
  ...['1', '2', '3', '4', '5', '6'].map((n) => ({
    src: `partners/${n}.png`,
    out: `partners/nib-and-nosh-frame-${n}`,
    widths: [480, 768, 1024],
    ratio: 4 / 5,
    position: 'centre',
  })),
  {
    src: 'testimonials/oummishra.png',
    out: 'testimonials/oummishra',
    widths: [360, 720],
    ratio: 3 / 4,
    position: 'north',
  },
  {
    src: 'testimonials/sachin.jpg',
    out: 'testimonials/sachin',
    widths: [360, 720],
    // Kept in portrait. This is a man standing beside his daughter's exhibited
    // photograph — squaring it to an avatar disc throws away the half of the
    // picture that carries the story.
    ratio: 3 / 4,
    position: 'north',
  },
];

const ensure = (dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

/** 24px wide WebP, inlined. Small enough that the base64 beats a request. */
async function blurPlaceholder(input, ratio) {
  const pipeline = sharp(input).resize(24, ratio ? Math.round(24 / ratio) : null, {
    fit: ratio ? 'cover' : 'inside',
  });
  const buffer = await pipeline.webp({ quality: 45 }).toBuffer();
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`No assets/source directory — nothing to build.`);
    process.exit(1);
  }

  const blurs = {};
  /** Widths that actually made it to disk, per asset. */
  const built = {};
  let written = 0;

  for (const asset of ASSETS) {
    const input = resolve(SOURCE, asset.src);
    if (!existsSync(input)) {
      console.warn(`  skip  ${asset.src} (not uploaded yet)`);
      continue;
    }

    const meta = await sharp(input).metadata();
    ensure(resolve(OUT, dirname(asset.out)));

    for (const width of asset.widths) {
      // Never upscale — a 1080px master asked for at 1440 would just be a
      // blurrier file of the same photograph at a larger byte cost.
      if (width > meta.width) {
        console.warn(
          `  skip  ${asset.out}-${width}.webp (master is only ${meta.width}px wide)`,
        );
        continue;
      }

      const height = asset.ratio ? Math.round(width / asset.ratio) : null;
      const file = resolve(OUT, `${asset.out}-${width}.webp`);

      await sharp(input)
        .resize(width, height, {
          fit: height ? 'cover' : 'inside',
          position: asset.position ?? 'centre',
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 6 })
        .toFile(file);

      written += 1;
      (built[asset.out] ??= []).push(width);
      console.log(`  ok    ${asset.out}-${width}.webp`);
    }

    blurs[asset.out] = await blurPlaceholder(input, asset.ratio);
  }

  const blurEntries = Object.entries(blurs)
    .map(([key, value]) => `  '${key}': '${value}',`)
    .join('\n');

  const widthEntries = Object.entries(built)
    .map(([key, widths]) => `  '${key}': [${widths.join(', ')}],`)
    .join('\n');

  writeFileSync(
    MANIFEST,
    `/**
 * Generated by scripts/generate-images.mjs — do not edit by hand.
 *
 * Run \`npm run images\` after adding a master to assets/source.
 */

/**
 * Inline 24px previews, one per photograph. They hold the frame on the first
 * paint so nothing reflows when the real file arrives, and cost no request.
 */
export const BLUR: Record<string, string> = {
${blurEntries}
};

/** Which widths actually exist on disk, so a srcSet never points at a 404. */
export const WIDTHS: Record<string, number[]> = {
${widthEntries}
};

/**
 * The base name for a generated file, or null if this URL is not one of ours.
 *
 * "/image/partners/nib-and-nosh-1024.webp" → "partners/nib-and-nosh"
 */
export function generatedNameFor(url: string): string | null {
  const match = /^\\/image\\/(.+?)-\\d+\\.webp$/.exec(url);
  if (match && WIDTHS[match[1]]) return match[1];

  // Also accept the bare name, so a caller can address the photograph without
  // committing to one of its widths.
  const bare = url.replace(/^\\/image\\//, '').replace(/\\.webp$/, '');
  return WIDTHS[bare] ? bare : null;
}
`,
    'utf8',
  );

  console.log(`\n${written} file(s) written to client/public/image`);
  console.log(`manifest → client/src/lib/generated-images.ts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
