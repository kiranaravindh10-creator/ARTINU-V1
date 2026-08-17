import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

const SITE_URL = 'https://artinu.in';
const OUTPUT_DIR = resolve(__dirname, '../client/public');

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const staticRoutes = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/about', changefreq: 'monthly', priority: 0.8 },
  { path: '/spaces', changefreq: 'monthly', priority: 0.9 },
  { path: '/gallery', changefreq: 'weekly', priority: 0.9 },
  { path: '/artists', changefreq: 'weekly', priority: 0.8 },
  { path: '/lets-talk', changefreq: 'monthly', priority: 0.8 },
  { path: '/join', changefreq: 'monthly', priority: 0.6 },
  { path: '/join/apply', changefreq: 'yearly', priority: 0.5 },
  { path: '/help', changefreq: 'monthly', priority: 0.5 },
  { path: '/legal/privacy', changefreq: 'yearly', priority: 0.3 },
  { path: '/legal/terms', changefreq: 'yearly', priority: 0.3 },
  { path: '/legal/cookie', changefreq: 'yearly', priority: 0.3 },
  { path: '/legal/artist-agreement', changefreq: 'yearly', priority: 0.3 },
];

const today = new Date().toISOString().split('T')[0];

function generateSitemap() {
  const urls = staticRoutes.map((route) => {
    const lastmod = today;
    return `  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;
}

const sitemap = generateSitemap();
const outputPath = resolve(OUTPUT_DIR, 'sitemap.xml');
writeFileSync(outputPath, sitemap);
console.log(`✅ sitemap.xml generated at ${outputPath}`);
console.log(`   ${staticRoutes.length} URLs included`);