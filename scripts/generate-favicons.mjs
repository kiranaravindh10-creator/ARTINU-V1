import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const OUTPUT_DIR = resolve(__dirname, '../client/public');

const sizes = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-48.png', size: 48 },
  { name: 'favicon-57.png', size: 57 },
  { name: 'favicon-60.png', size: 60 },
  { name: 'favicon-70.png', size: 70 },
  { name: 'favicon-72.png', size: 72 },
  { name: 'favicon-76.png', size: 76 },
  { name: 'favicon-96.png', size: 96 },
  { name: 'favicon-120.png', size: 120 },
  { name: 'favicon-128.png', size: 128 },
  { name: 'favicon-144.png', size: 144 },
  { name: 'favicon-150.png', size: 150 },
  { name: 'favicon-152.png', size: 152 },
  { name: 'favicon-180.png', size: 180 },
  { name: 'favicon-192.png', size: 192 },
  { name: 'favicon-196.png', size: 196 },
  { name: 'favicon-310.png', size: 310 },
  { name: 'favicon-310x150.png', size: { width: 310, height: 150 } },
  { name: 'favicon-512.png', size: 512 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-57x57.png', size: 57 },
  { name: 'apple-touch-icon-60x60.png', size: 60 },
  { name: 'apple-touch-icon-72x72.png', size: 72 },
  { name: 'apple-touch-icon-76x76.png', size: 76 },
  { name: 'apple-touch-icon-114x114.png', size: 114 },
  { name: 'apple-touch-icon-120x120.png', size: 120 },
  { name: 'apple-touch-icon-144x144.png', size: 144 },
  { name: 'apple-touch-icon-152x152.png', size: 152 },
  { name: 'apple-touch-icon-180x180.png', size: 180 },
];

async function generateFavicons() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('⚠️  sharp not installed. Skipping PNG generation.');
    console.log('   Install with: npm install sharp --save-dev');
    console.log('   Then run this script again to generate all PNG favicons.');
    createPlaceholderFiles();
    return;
  }

  const svgPath = resolve(OUTPUT_DIR, 'favicon.svg');
  if (!existsSync(svgPath)) {
    console.error('❌ favicon.svg not found at', svgPath);
    process.exit(1);
  }

  console.log('🔄 Generating favicon PNG files...');

  for (const { name, size } of sizes) {
    try {
      const outputPath = resolve(OUTPUT_DIR, name);
      if (typeof size === 'number') {
        await sharp(svgPath)
          .resize(size, size, { fit: 'contain', background: { r: 20, g: 18, b: 15, alpha: 1 } })
          .png()
          .toFile(outputPath);
      } else {
        await sharp(svgPath)
          .resize(size.width, size.height, { fit: 'contain', background: { r: 20, g: 18, b: 15, alpha: 1 } })
          .png()
          .toFile(outputPath);
      }
      console.log(`  ✅ ${name} (${typeof size === 'number' ? size + 'x' + size : size.width + 'x' + size.height})`);
    } catch (error) {
      console.error(`  ❌ Failed to generate ${name}:`, error);
    }
  }

  // Generate favicon.ico (multi-resolution)
  try {
    await sharp(svgPath)
      .resize(32, 32, { fit: 'contain', background: { r: 20, g: 18, b: 15, alpha: 1 } })
      .png()
      .toBuffer()
      .then((buffer) => {
        // Note: For a proper ICO file, you'd need a dedicated ICO encoder
        // This creates a PNG named .ico which works in most modern browsers
        writeFileSync(resolve(OUTPUT_DIR, 'favicon.ico'), buffer);
        console.log('  ✅ favicon.ico (PNG-based)');
      });
  } catch (error) {
    console.error('  ❌ Failed to generate favicon.ico:', error);
  }

  console.log('\n✅ Favicon generation complete!');
  console.log('   All files saved to', OUTPUT_DIR);
}

function createPlaceholderFiles() {
  console.log('\n📝 Creating placeholder reference files...');
  // Create a simple reference file listing all needed files
  const reference = sizes.map((s) => s.name).join('\n');
  writeFileSync(resolve(OUTPUT_DIR, 'FAVICON_FILES_NEEDED.txt'), reference);
  console.log('   Created FAVICON_FILES_NEEDED.txt with list of required files');
}

generateFavicons().catch(console.error);