/**
 * `npm run demo:sync` — copy the live database into the local demo store.
 *
 * The demo used to start from `seedAll`, which is a set of invented people and
 * photographs written months ago. Useful for a first run, useless for checking a
 * change against what the site actually contains: the seed has no hero slides at
 * all, while the live homepage has four.
 *
 * This reads production once, writes `server/.data/db.json`, and stops. After it
 * runs, `npm run dev:demo` comes up holding today's real content — and every
 * write you then make still goes nowhere near Supabase.
 *
 * READ-ONLY AGAINST PRODUCTION. The only operation performed is `find()`. There
 * is no insert, update or delete anywhere in this file, and it never calls
 * `seedAll`, which would clear the tables it was pointed at.
 *
 * WHAT IS DELIBERATELY NOT COPIED
 *
 *   tokens, otpChallenges   Live auth material. A copied session token is an
 *                           account takeover sitting in a plaintext file, and
 *                           it is worthless locally anyway.
 *   password hashes         Every hash is replaced (see PASSWORDS below). The
 *                           snapshot therefore contains no credential that works
 *                           against the real site.
 *
 * Real customer names, emails and phone numbers ARE copied — that is the point
 * of a realistic snapshot — into a gitignored plaintext file on your machine.
 * Pass `--scrub` to anonymise everyone who is not staff if you would rather not
 * have that sitting on disk.
 */
import bcrypt from 'bcryptjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { env } from '@/config/env';
import { db } from '@/database/db';
import { logger } from '@/utils/logger';

const SCRUB = process.argv.includes('--scrub');

/**
 * Tables copied, in no particular order — nothing here enforces foreign keys, so
 * dependency ordering does not matter for a straight snapshot.
 *
 * Mirrors TABLE_NAMES in database/db.ts minus the two exclusions above. A table
 * added there and forgotten here simply arrives empty in the demo, so the
 * reconciliation at the end of this file reports anything missing.
 */
const TABLES = [
  'users',
  'profiles',
  'spaces',
  'artworks',
  'orders',
  'payments',
  'invoices',
  'installations',
  'rotations',
  'notifications',
  'payouts',
  'supportTickets',
  'consultations',
  'applications',
  'auditLogs',
  'wishlists',
  'follows',
  'uiContent',
  'heroSlides',
  'featuredCollections',
  'cafes',
  'collaborationSlides',
  'errorLogs',
  'employees',
  'frames',
  'frameMovements',
] as const;

/**
 * The passwords every copied account gets locally.
 *
 * Production hashes are of passwords nobody here knows — `create:staff` issued
 * random ones — so a verbatim copy would be a database you cannot sign into.
 * Staff keep the documented demo passwords; everyone else gets one shared
 * password so you can sign in as any real artist or space owner to reproduce
 * something they reported.
 *
 * Mirrors STAFF in database/seed.ts. These only ever exist in the local store.
 */
const PASSWORDS: Record<string, string> = {
  'ceo@artinu.in': 'ARTINU@CEO2026',
  'manager@artinu.in': 'ARTINU@Mgr2026',
  'accounts@artinu.in': 'ARTINU@Acc2026',
  'it@artinu.in': 'ARTINU@IT2026',
  'fieldops@artinu.in': 'ARTINU@Ops2026',
};

/** Everyone not in PASSWORDS. */
const SHARED_PASSWORD = 'Demo@2026';

const STAFF_ROLES = new Set(['ceo', 'manager', 'accounts', 'operations', 'it_team']);

/**
 * Refuse to write the store while a demo server is holding it.
 *
 * The memory driver reads db.json once at boot and then owns that file: it
 * re-writes the whole thing from memory on a debounce after any change. So
 * syncing underneath a running server does nothing useful — the server is still
 * serving what it loaded at startup, and the first write it makes replaces the
 * fresh snapshot with its stale copy.
 *
 * That is not theoretical. It happened on the first run of this script: the
 * snapshot landed correctly, a demo server that was already up overwrote it
 * within seconds, and the verification that followed was reading the old data
 * out of the wrong process.
 *
 * Stop the server, sync, start it again — in that order.
 */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once('error', (error: NodeJS.ErrnoException) => resolve(error.code === 'EADDRINUSE'))
      .once('listening', () => probe.close(() => resolve(false)))
      // No host — binds 0.0.0.0 as the API does. Probing 127.0.0.1 succeeds on
      // Windows even when the port is taken, which makes it useless as a check.
      .listen(port);
  });
}

async function main() {
  const apiPort = Number(process.env.PORT) || 4000;
  if (await portInUse(apiPort)) {
    throw new Error(
      [
        `Something is listening on port ${apiPort} - almost certainly a demo server.`,
        '',
        '  It owns server/.data/db.json while it runs, and will overwrite anything',
        '  written here with the data it loaded at startup. Stop it (Ctrl+C), then:',
        '',
        '    npm run demo:sync',
        '    npm run dev:demo',
        '',
      ].join('\n'),
    );
  }

  if (env.DATA_DRIVER !== 'supabase') {
    throw new Error(
      `DATA_DRIVER is "${env.DATA_DRIVER}". This script reads the live database, so it needs ` +
        '"supabase" - which is what the repo .env already sets. If you overrode it in this ' +
        'shell, unset it and run again.',
    );
  }

  logger.info('Reading the live database (read-only)…');

  const snapshot: Record<string, unknown[]> = {};
  const counts: [string, number][] = [];

  for (const table of TABLES) {
    const accessor = (db as unknown as Record<string, { find: () => Promise<unknown[]> }>)[table];
    if (!accessor?.find) {
      logger.warn(`db.${table} does not exist - skipping.`);
      continue;
    }
    const rows = await accessor.find();
    snapshot[table] = rows;
    counts.push([table, rows.length]);
  }

  // Auth material is never copied; the demo mints its own on first sign-in.
  snapshot.tokens = [];
  snapshot.otpChallenges = [];

  // ── Make the copy signable-into, and credential-free ─────────────────────
  const staffHashes = new Map<string, string>();
  for (const [email, plain] of Object.entries(PASSWORDS)) {
    staffHashes.set(email, bcrypt.hashSync(plain, 10));
  }
  const sharedHash = bcrypt.hashSync(SHARED_PASSWORD, 10);

  const users = (snapshot.users ?? []) as Record<string, unknown>[];
  let scrubbed = 0;

  for (const user of users) {
    const email = String(user.email ?? '').toLowerCase();
    user.passwordHash = staffHashes.get(email) ?? sharedHash;
    // `create:staff` set this on the real accounts. Leaving it on would send
    // every demo sign-in straight to a change-password screen.
    user.mustChangePassword = false;

    if (SCRUB && !STAFF_ROLES.has(String(user.role))) {
      const id = String(user.id ?? '').slice(0, 8);
      user.email = `demo-${id}@example.invalid`;
      user.phone = '+91 90000 00000';
      scrubbed += 1;
    }
  }

  if (SCRUB) {
    for (const profile of (snapshot.profiles ?? []) as Record<string, unknown>[]) {
      const owner = users.find((u) => u.id === profile.userId);
      if (owner && STAFF_ROLES.has(String(owner.role))) continue;
      if (profile.phone) profile.phone = '+91 90000 00000';
    }
  }

  // ── Write it where the memory driver looks ───────────────────────────────
  const target = path.join(env.serverRoot, '.data', 'db.json');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(snapshot), 'utf8');

  // ── Report ──────────────────────────────────────────────────────────────
  const width = Math.max(...counts.map(([name]) => name.length));
  const nonEmpty = counts.filter(([, n]) => n > 0);
  const empty = counts.filter(([, n]) => n === 0).map(([name]) => name);

  logger.success(`Wrote ${target}`);
  console.log('');
  for (const [name, n] of nonEmpty) {
    console.log(`  ${name.padEnd(width)}  ${n}`);
  }
  if (empty.length) console.log(`\n  empty: ${empty.join(', ')}`);

  console.log(`
  Sign in locally with the usual staff passwords (ceo@artinu.in / ARTINU@CEO2026
  and so on). Every other account - real artists, real space owners - now uses
  ${SHARED_PASSWORD}, so you can sign in as any of them to reproduce a report.
${
  SCRUB
    ? `\n  Scrubbed contact details for ${scrubbed} non-staff account(s).`
    : `\n  Real names, emails and phone numbers are in that file. Re-run with --scrub
  to anonymise everyone who is not staff.`
}

  Now run:  npm run dev:demo
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Snapshot failed', error);
    process.exit(1);
  });
