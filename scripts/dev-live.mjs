/**
 * `npm run dev:live` — the whole app on localhost, showing the real ARTINU data,
 * with every change refused.
 *
 * WHY THIS EXISTS
 *
 * The root .env points DATA_DRIVER at the live Supabase project, so a plain
 * `npm run dev` has always been able to change the live site from a laptop:
 * create an order, approve an expense, delete a photograph. This starts the
 * same app against the same database in read-only mode instead:
 *
 *   READ_ONLY_MODE=true    the API refuses every POST/PUT/PATCH/DELETE except
 *                          signing in and out, and the table layer refuses
 *                          every write underneath (server/src/database/db.ts)
 *   MAIL_PROVIDER=console  and, in read-only mode, no mail is sent at all
 *   PAYMENT_PROVIDER=mock_qr  no payment gateway is ever called
 *   scheduler + sweeps off birthdays, inactivity sweeps, deleted-photo purge
 *
 * The service-role key stays in the server process. The browser talks to the
 * local API only and is never given a database credential; it learns that
 * read-only mode is on from /api/health and shows a banner.
 *
 * You sign in with your own ARTINU account. Nothing is recorded against it -
 * not even the last-login time.
 *
 * Usage:
 *   npm run dev:live
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const line = (char, width) => char.repeat(width);

/**
 * Which settings the .env provides - names only. Values are never read into
 * anything that prints, so a key cannot end up in a terminal or a log.
 */
function envNames() {
  const file = path.join(repoRoot, '.env');
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((row) => /^\s*([A-Z0-9_]+)\s*=\s*\S/.exec(row)?.[1])
      .filter(Boolean),
  );
}

const present = envNames();
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
  (name) => !present.has(name) && !process.env[name],
);
if (missing.length) {
  console.error(`
${line('─', 78)}
  Cannot start against live data - ${missing.join(' and ')} not set.

  Add them to the .env file at the project root (they stay on this machine,
  in the server process). Nothing has been started.
${line('─', 78)}
`);
  process.exit(1);
}

/** Same guard as dev:demo: Vite would proxy to whatever already holds the port. */
function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once('error', (error) => resolve(error.code === 'EADDRINUSE'))
      .once('listening', () => probe.close(() => resolve(false)))
      .listen(port);
  });
}

const apiPort = Number(process.env.PORT) || 4000;
if (await portInUse(apiPort)) {
  console.error(`
${line('─', 78)}
  Cannot start - port ${apiPort} is already in use.

  Something is already listening on the API port, and the browser would talk
  to it instead - possibly a copy of the API that is NOT read-only. Stop it
  and run this again.

  Find it:   Get-NetTCPConnection -LocalPort ${apiPort} -State Listen |
               Select-Object OwningProcess
${line('─', 78)}
`);
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'development',
  READ_ONLY_MODE: 'true',
  DATA_DRIVER: 'supabase',
  STORAGE_DRIVER: 'supabase',
  SEED_DEMO_DATA: 'false',
  MEMORY_PERSIST: 'false',
  MAIL_PROVIDER: 'console',
  PAYMENT_PROVIDER: 'mock_qr',
  BIRTHDAY_EMAILS_ENABLED: 'false',
  LIFECYCLE_SWEEPS_ENABLED: 'false',
  DELETED_ARTWORK_PURGE_ENABLED: 'false',
};

console.log(`
${line('─', 78)}
  ARTINU — live data, READ ONLY

  Database   the live Supabase project from .env     READ ONLY
  Changes    refused by the API and by the database layer
  Email      not sent                                 Payments  never charged
  Scheduler  off                                      Review-queue reconcile  off
${line('─', 78)}

  Open http://localhost:5173 and sign in with your own ARTINU account.
  Every screen shows a "READ ONLY" bar; anything you press that would save
  something is refused by the server and says so.

  The live database is behind this code: migrations 016, 017 and 018 have not
  been run there. Expenses, Finance, clients, Assist User and photographers'
  Recently Deleted report an error instead of data until those migrations are
  approved and run - nothing here will run them.
${line('─', 78)}
`);

const child = spawn('npm run dev', { cwd: repoRoot, env, stdio: 'inherit', shell: true });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
