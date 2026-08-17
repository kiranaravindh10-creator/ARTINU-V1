#!/usr/bin/env node
/**
 * Runs before `npm run dev` and `npm run build`.
 *
 * Everything it checks has one thing in common: it fails *later* and *silently*
 * if nobody checks it here. A Node version the toolchain cannot parse surfaces
 * as a syntax error inside a dependency. A missing install surfaces as "cannot
 * find module vite". Running from the wrong folder surfaces as an empty script
 * list. None of those messages tell you what to actually do, so this does.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (colour ? `[${code}m` : '');
const RESET = paint(0);
const RED = paint(31);
const YELLOW = paint(33);
const DIM = paint(2);
const BOLD = paint(1);

const problems = [];
const warnings = [];

/* ── Node version ─────────────────────────────────────────────────────────── */

// The app runs on 20.11+. The Supabase client library declares 22, but nothing
// loads it unless DATA_DRIVER=supabase — the default is an in-memory store — so
// 20 is fine for the demo and only worth mentioning to someone about to connect
// a real database.
const MIN_MAJOR = 20;
const MIN_MINOR = 11;
const SUPABASE_MAJOR = 22;
const [major, minor] = process.versions.node.split('.').map(Number);

if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
  problems.push(
    `Node ${process.versions.node} is too old. This project needs Node ${MIN_MAJOR}.${MIN_MINOR} or newer,\n` +
      `    and Node ${SUPABASE_MAJOR} is recommended.\n` +
      `    Install the LTS build from https://nodejs.org — it replaces your old one.\n` +
      `    ${DIM}If you use nvm:  nvm install ${SUPABASE_MAJOR} && nvm use ${SUPABASE_MAJOR}${RESET}`,
  );
} else if (major < SUPABASE_MAJOR) {
  const envFile = path.join(root, '.env');
  const usesSupabase =
    existsSync(envFile) &&
    /^\s*(DATA_DRIVER|STORAGE_DRIVER)\s*=\s*supabase/m.test(readFileSync(envFile, 'utf8'));

  if (usesSupabase) {
    warnings.push(
      `Your .env points at Supabase, whose client library asks for Node ${SUPABASE_MAJOR} or newer.\n` +
        `    You are on Node ${process.versions.node}. The app still starts, but upgrade before\n` +
        `    relying on the Supabase connection.`,
    );
  }
}

/* ── Are we in the right folder? ──────────────────────────────────────────── */

const rootManifest = path.join(root, 'package.json');
if (!existsSync(rootManifest)) {
  problems.push(`Could not find package.json at ${root}. Open the folder that contains it.`);
} else {
  const manifest = JSON.parse(readFileSync(rootManifest, 'utf8'));
  if (!manifest.workspaces) {
    problems.push(
      'This is not the project root. Open the folder that contains the "client" and "server" folders.',
    );
  }
}

/* ── Dependencies ─────────────────────────────────────────────────────────── */

// Workspaces hoist to the root node_modules, so this is the one that matters.
const marker = path.join(root, 'node_modules', 'vite', 'package.json');
if (!existsSync(marker)) {
  problems.push(
    `Dependencies are not installed yet.\n` +
      `    Run this once, from ${BOLD}this folder${RESET}:  ${BOLD}npm install${RESET}\n` +
      `    ${DIM}(Not inside client/ or server/ — workspaces install from the root.)${RESET}`,
  );
}

if (existsSync(path.join(root, 'client', 'node_modules', 'vite'))) {
  warnings.push(
    'client/node_modules exists — someone ran `npm install` inside client/.\n' +
      '    That usually still works, but if anything behaves oddly, delete client/node_modules\n' +
      '    and server/node_modules, then run `npm install` from the root.',
  );
}

/* ── Configuration ────────────────────────────────────────────────────────── */

if (!existsSync(path.join(root, '.env'))) {
  warnings.push(
    'No .env file — running in local demo mode.\n' +
      '    Data lives in memory (persisted to .data/), files are stored on disk, email is\n' +
      '    captured in the app instead of being sent. Nothing else is needed to try it.\n' +
      `    ${DIM}To connect Supabase or SMTP later: copy .env.example to .env and fill it in.${RESET}`,
  );
}

/* ── The inline boot script ───────────────────────────────────────────────── */

// index.html carries a small inline script that reports why the app failed to
// start. If that script has a syntax error, every page throws before it can help
// — the one place a broken diagnostic is worst. It is hand-edited rarely enough
// that nothing else would catch it, so it is parsed here.
const indexHtml = path.join(root, 'client', 'index.html');
if (existsSync(indexHtml)) {
  const html = readFileSync(indexHtml, 'utf8');
  for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try {
      new Function(body);
    } catch (error) {
      problems.push(
        `client/index.html has a broken inline <script>: ${error.message}
` +
          `    Every page will throw before it renders. Fix the script tag in that file.`,
      );
    }
  }
}

/* ── Report ───────────────────────────────────────────────────────────────── */

if (warnings.length) {
  for (const warning of warnings) console.log(`${YELLOW}note${RESET}  ${warning}\n`);
}

if (problems.length) {
  console.error(`\n${RED}${BOLD}Curate cannot start yet.${RESET}\n`);
  for (const problem of problems) console.error(`  ${RED}·${RESET} ${problem}\n`);
  console.error(`${DIM}Full setup instructions are in SETUP.md${RESET}\n`);
  process.exit(1);
}
