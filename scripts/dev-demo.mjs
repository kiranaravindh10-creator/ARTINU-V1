/**
 * `npm run dev:demo` — the whole app on localhost, against a throwaway database,
 * with demo accounts for every role.
 *
 * WHY THIS EXISTS
 *
 * The root .env points DATA_DRIVER at Supabase. That is correct for a deployment
 * and quietly wrong for local work, because it means `npm run dev` on your laptop
 * is editing the live site: add a carousel slide locally and it appears on
 * artinu.in, change the slideshow timing locally and real visitors get it. There
 * is no staging copy in between.
 *
 * dotenv does not overwrite variables that are already set, so the environment
 * assembled below beats whatever .env says — without editing .env, and without
 * the risk of forgetting to put it back.
 *
 * Four things are redirected, and each one is a way local testing currently
 * reaches the outside world:
 *
 *   DATA_DRIVER=memory     writes go to server/.data/db.json, not Supabase
 *   STORAGE_DRIVER=local   uploads go to server/uploads, not the Supabase bucket
 *   MAIL_PROVIDER=console  mail is written to the log, not sent by SendGrid to
 *                          real inboxes — the seed data includes real addresses
 *   SEED_DEMO_DATA=true    creates the accounts printed below
 *
 * Usage:
 *   npm run dev:demo              start; seeds only if the local store is empty
 *   npm run dev:demo -- --fresh   discard the local store and reseed first
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pad = (value, width) => String(value).padEnd(width);
const line = (char, width) => char.repeat(width);
const fresh = process.argv.includes('--fresh');

/**
 * Mirrors STAFF and FIXED_ARTIST_PASSWORDS in server/src/database/seed.ts.
 *
 * Duplicated rather than imported because this is a plain .mjs launcher outside
 * the TypeScript build. If the seed passwords change, change them here too — the
 * check below at least catches the file moving.
 */
const ACCOUNTS = [
  ['CEO', 'ceo@artinu.in', 'ARTINU@CEO2026', 'Console — every module'],
  ['Manager', 'manager@artinu.in', 'ARTINU@Mgr2026', 'Console — operations & curation'],
  ['IT Team', 'it@artinu.in', 'ARTINU@IT2026', 'Console — users, system, homepage'],
  ['Accounts', 'accounts@artinu.in', 'ARTINU@Acc2026', 'Console — finance only'],
  ['Operations', 'fieldops@artinu.in', 'ARTINU@Ops2026', 'Console — orders & production'],
  ['Artist', 'photographer.demo@artinu.in', 'ARTINU@Photo2026', 'Artist workspace (/studio)'],
  ['Space owner', 'restaurant.demo@artinu.in', 'ARTINU@Rest2026', 'Space experience (/space)'],
];

const seedFile = path.join(repoRoot, 'server/src/database/seed.ts');
if (!existsSync(seedFile)) {
  console.error(`\nCannot find ${seedFile} — the seed may have moved. Check the accounts below still exist.\n`);
}

const env = {
  ...process.env,
  DATA_DRIVER: 'memory',
  SEED_DEMO_DATA: 'true',
  MEMORY_PERSIST: 'true',
  STORAGE_DRIVER: 'local',
  MAIL_PROVIDER: 'console',
  PAYMENT_PROVIDER: 'mock_qr',
  NODE_ENV: 'development',
};

/**
 * Is something already listening there?
 *
 * This is a safety check, not a convenience one. If the API port is taken, the
 * demo server fails to bind but Vite starts anyway and proxies to whatever is
 * already on that port — which may well be an API pointed at Supabase. The
 * banner below would then promise "NOT Supabase" over a client editing
 * production, which is worse than not having the script at all.
 *
 * So: refuse to start rather than print a guarantee that is not true.
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once('error', (error) => resolve(error.code === 'EADDRINUSE'))
      .once('listening', () => probe.close(() => resolve(false)))
      // No host, so this binds 0.0.0.0 exactly as the API does.
      //
      // The first version passed '127.0.0.1' and was useless on Windows: a bind
      // to a specific interface succeeds there even while another socket holds
      // 0.0.0.0 on the same port, unless that socket set SO_EXCLUSIVEADDRUSE.
      // The probe therefore reported the port free, the guard waved the run
      // through, and the API then failed to start with EADDRINUSE — the exact
      // situation this function exists to prevent.
      .listen(port);
  });
}

const apiPort = Number(process.env.PORT) || 4000;

if (await portInUse(apiPort)) {
  console.error(`
${line('─', 78)}
  Cannot start the demo — port ${apiPort} is already in use.

  Something is already listening on the API port. If the demo server cannot
  bind it, the browser would talk to that other server instead — and this
  script cannot tell whether that one is pointed at Supabase. Rather than
  print a promise it cannot keep, it stops here.

  Find it:   npx kill-port ${apiPort}
             or, on Windows:
             Get-NetTCPConnection -LocalPort ${apiPort} -State Listen |
               Select-Object OwningProcess

  Then stop that process and run this again.
${line('─', 78)}
`);
  process.exit(1);
}

if (fresh) {
  const store = path.join(repoRoot, 'server/.data/db.json');
  if (existsSync(store)) {
    rmSync(store);
    console.log('Discarded server/.data/db.json — the demo data will be rebuilt.');
  }
}

console.log(`
${line('─', 78)}
  ARTINU — local demo

  Database   in-memory (server/.data/db.json)      NOT Supabase
  Uploads    server/uploads                        NOT the Supabase bucket
  Email      written to this log                   NOT sent
${line('─', 78)}

  ${pad('Role', 13)}${pad('Email', 30)}${pad('Password', 19)}Lands on`);

for (const [role, email, password, lands] of ACCOUNTS) {
  console.log(`  ${pad(role, 13)}${pad(email, 30)}${pad(password, 19)}${lands}`);
}

console.log(`
  Other seeded artists sign in with Artist123, other space owners with
  SpaceOwner1. These accounts exist only in the local store — they are not in
  Supabase and never will be, because the seed refuses to run against it.

  Nothing done here can reach artinu.in. To point at the real thing again, stop
  this and run npm run dev.
${line('─', 78)}
`);

// Delegates to the existing dev script so there is one definition of how the
// app starts; this only decides what environment it starts in.
// One string rather than (command, args) — with `shell: true` Node deprecates
// the array form (DEP0190), because it concatenates the arguments into the shell
// command without escaping them. Nothing here is user input, but the warning is
// noise on every start and the single-string form is what the shell gets anyway.
const child = spawn('npm run dev', {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
