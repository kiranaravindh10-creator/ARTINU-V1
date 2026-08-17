#!/usr/bin/env node
/**
 * Builds the zip you hand to someone else.
 *
 * The reason this exists rather than "right-click, Send to, Compressed folder":
 * a folder zip includes .env, and this project's .env holds a Supabase
 * service-role key (full read/write on the database, bypassing row-level
 * security) and a Gmail app password. Sending that to a client hands over the
 * live database and a mail account. It also points their copy at the owner's
 * cloud data, so every recipient shares — and can delete — the same records.
 *
 * What ships instead is the source, the lockfile, and .env.example. With no
 * .env the app runs entirely locally: in-memory data seeded on first boot,
 * files on disk, email captured in the app.
 *
 *   npm run package
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().slice(0, 10);
const outDir = path.join(root, 'release');
const outFile = path.join(outDir, `curate-${stamp}.zip`);

/** Never leaves this machine. Matched against any path segment. */
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.vite',
  'coverage',
  '.data',
  'uploads',
  'release',
  '.turbo',
  '.next',
]);

/** Never leaves this machine. Matched against the file name. */
const EXCLUDE_FILES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.DS_Store',
  'Thumbs.db',
]);

const EXCLUDE_PATTERNS = [/\.log$/, /\.tsbuildinfo$/, /^\.env\..*\.local$/];

function collect(dir, base = '') {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      files.push(...collect(path.join(dir, entry.name), rel));
    } else {
      if (EXCLUDE_FILES.has(entry.name)) continue;
      if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;
      files.push(rel);
    }
  }
  return files;
}

const files = collect(root);

/* ── Refuse to ship a secret ──────────────────────────────────────────────── */

// Anything that looks like a live credential. .env.example is allowed to carry
// placeholders, so it is checked for real-looking values rather than skipped.
const SECRET_SHAPES = [
  { name: 'Supabase JWT (anon or service-role key)', re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./ },
  // SendGrid keys are "SG." then a 22-char id and a 43-char secret. This one
  // can send mail as the whole artinu.in domain, so it matters as much as the
  // service-role key above.
  { name: 'SendGrid API key', re: /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/ },
  { name: 'Supabase Postgres connection string', re: /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/ },
  { name: 'Razorpay live key', re: /rzp_live_[A-Za-z0-9]+/ },
  { name: 'Stripe secret key', re: /sk_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    // A Gmail app password is sixteen letters in four groups of four. On its own
    // that shape also matches four ordinary short words — "link that ends most"
    // — so it only counts sitting in a value position after a password-ish key.
    name: 'Google/Gmail app password',
    re: /(?:pass(?:word)?|pwd|secret)[^\n]{0,20}[=:]\s*["']?[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}/i,
  },
];

/** A documented placeholder is the point of a template, not a leak. */
const PLACEHOLDERS = [
  /abcd efgh ijkl mnop/i,
  /your[-_ ]?(app[-_ ]?)?password/i,
  /xxxx xxxx xxxx xxxx/i,
  /change[-_ ]?me/i,
];

const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|yml|yaml|env|example|html|css|sql)$/i;
const leaks = [];

for (const rel of files) {
  if (!TEXT.test(rel) && !rel.includes('.env')) continue;
  const full = path.join(root, rel);
  if (statSync(full).size > 2_000_000) continue;

  const body = readFileSync(full, 'utf8');
  for (const shape of SECRET_SHAPES) {
    const hit = body.match(shape.re);
    if (!hit) continue;
    if (PLACEHOLDERS.some((placeholder) => placeholder.test(hit[0]))) continue;
    leaks.push({ rel, what: shape.name, line: body.slice(0, hit.index).split('\n').length });
  }
}

if (leaks.length > 0) {
  console.error('\n  Refusing to build the zip — it would contain live credentials:\n');
  for (const leak of leaks) console.error(`    ${leak.rel}:${leak.line}  →  ${leak.what}`);
  console.error(
    '\n  Move these into .env (which is excluded from the zip), or replace them with\n' +
      '  placeholders, then run this again.\n',
  );
  process.exit(1);
}

/* ── Build it ─────────────────────────────────────────────────────────────── */

mkdirSync(outDir, { recursive: true });

// Staging rather than passing every path to the archiver: a few hundred -Path
// arguments overflows PowerShell's command line, and staging also gives the
// recipient one clean folder inside the zip instead of loose files.
const stageName = `curate-${stamp}`;
const stage = path.join(outDir, stageName);
rmSync(stage, { recursive: true, force: true });

for (const rel of files) {
  const target = path.join(stage, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(root, rel), target);
}

rmSync(outFile, { force: true });

if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `$ErrorActionPreference='Stop'; Compress-Archive -Path '${stage.replace(/'/g, "''")}' ` +
        `-DestinationPath '${outFile.replace(/'/g, "''")}' -CompressionLevel Optimal`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-qr', outFile, stageName], { cwd: outDir, stdio: 'inherit' });
}

rmSync(stage, { recursive: true, force: true });

const size = statSync(outFile).size;
const sha = createHash('sha256').update(readFileSync(outFile)).digest('hex').slice(0, 16);

console.log(`\n  ${path.relative(root, outFile)}`);
console.log(`  ${files.length} files · ${(size / 1024 / 1024).toFixed(1)} MB · sha256 ${sha}\n`);
console.log('  Excluded: node_modules, .git, dist, uploads, .data, and every .env file.');
console.log('  The recipient runs:  npm install  then  npm run dev\n');
