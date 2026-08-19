/**
 * ARTINU — registration welcome email check.
 *
 * THE EASY WAY — starts its own throwaway API, checks it, shuts it down:
 *
 *   npm run check:welcome
 *
 * Against a server you started yourself:
 *
 *   npm run check:welcome -- --port 4000
 *
 * Always run this from the REPO ROOT, not from server/ — the script lives at
 * the root and is not part of the server workspace.
 *
 * Verifies that the welcome message is sent once on registration, carries the
 * real registered name, uses the right copy per role, is NOT resent on sign-in,
 * is not duplicated by a replayed or double-submitted registration, and that a
 * rejected registration neither sends mail nor leaves an account behind.
 *
 * ── It registers real accounts ──────────────────────────────────────────────
 * So it refuses to run against an API backed by a real database. Pointed at a
 * DATA_DRIVER=supabase server it would write half a dozen fictional users into
 * that project permanently — including into production. Override deliberately
 * with --allow-live if you genuinely want that.
 *
 * It reads the Console mail log rather than an inbox, so it proves the logic
 * with MAIL_PROVIDER=console and no provider at all. Run it against a SendGrid
 * server with a real inbox to confirm actual delivery on top.
 *
 * Exits non-zero if any check fails, so it can gate a deploy.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const ALLOW_LIVE = flag('--allow-live');
// `--port N`, or a bare number for backwards compatibility.
const portArg = argv.includes('--port')
  ? argv[argv.indexOf('--port') + 1]
  : argv.find((a) => /^\d+$/.test(a));
const SPAWN = !portArg;

/** An OS-assigned free port, so a spawned server cannot collide with anything. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const PORT = SPAWN ? await freePort() : Number(portArg);
const BASE = `http://127.0.0.1:${PORT}/api`;

let child = null;

function stopChild() {
  if (!child) return;
  const pid = child.pid;
  const handle = child;
  child = null;
  try {
    // npx spawns through a shell on Windows, so the tsx process is a
    // grandchild — killing the shell alone would leave it holding the port.
    // spawnSync, not spawn: this runs on the way out, and an async kill would
    // never get scheduled before the process exits.
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    /* already gone */
  }
  // The piped stdio keeps the event loop alive on its own, so detach it too —
  // otherwise the script hangs after the last check instead of exiting.
  try {
    handle.stdout?.destroy();
    handle.stderr?.destroy();
    handle.unref();
  } catch {
    /* nothing to detach */
  }
}

/**
 * The only way out, so the throwaway server can never be left running.
 *
 * Deliberately does NOT call process.exit(). On Windows + Node 24, exiting
 * explicitly after a fetch() trips a libuv assertion —
 *
 *   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:76
 *
 * — which replaces the real exit code with 127 and prints a crash over the
 * report. Setting exitCode and letting the loop drain avoids it; stopChild()
 * has already released the only handles that would keep the loop alive.
 *
 * The whole flow therefore lives in run() below and signals its result by
 * returning an exit code, rather than exiting from wherever it happens to be.
 */
function finish(code) {
  stopChild();
  process.exitCode = code;
}

process.on('exit', stopChild);
process.on('SIGINT', () => finish(130));

async function reachable() {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function startThrowawayServer() {
  console.log(`Starting a throwaway API on :${PORT} (in-memory, mail to console)…`);
  child = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: path.join(root, 'server'),
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Only ever SET values here, never blank them: on Windows an empty
      // environment variable is dropped rather than set to "", which would let
      // the real .env show through and point this at the live project.
      NODE_ENV: 'development',
      PORT: String(PORT),
      DATA_DRIVER: 'memory',
      MEMORY_PERSIST: 'false',
      STORAGE_DRIVER: 'local',
      // Under .data/, which is already gitignored and excluded from packaging.
      STORAGE_LOCAL_DIR: './.data/welcome-check-uploads',
      MAIL_PROVIDER: 'console',
      SEED_DEMO_DATA: 'true',
    },
  });

  let log = '';
  child.stdout.on('data', (d) => { log += d.toString(); });
  child.stderr.on('data', (d) => { log += d.toString(); });
  child.on('exit', (code) => {
    if (child) {
      console.error(`\nThe throwaway API exited early (code ${code}). Its output:\n`);
      console.error(log.split('\n').slice(-25).join('\n'));
      finish(1);
    }
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const health = await reachable();
    if (health) return health;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error('\nThe throwaway API did not come up within 90s. Its output:\n');
  console.error(log.split('\n').slice(-25).join('\n'));
  return null;
}

// ── Connect ─────────────────────────────────────────────────────────────────

const health = SPAWN ? await startThrowawayServer() : await reachable();

if (!health && !SPAWN) {
  console.error(`
Could not reach an ARTINU API on port ${PORT}.

Nothing is listening there. This script does not start a server when you pass
--port; it checks one that is already running.

  · Let it start its own throwaway server instead (recommended):

        npm run check:welcome

  · Or start a server yourself, in a SECOND terminal, then re-run:

        npm run dev:server                     # uses .env, PORT=${process.env.PORT ?? 4000}
        npm run check:welcome -- --port ${process.env.PORT ?? 4000}

Run both from the repo root — this script is not in the server workspace, so
"cd server && npm run check:welcome" will always fail with "Missing script".
`);
}

// ── Refuse to pollute a real database ───────────────────────────────────────

const live = Boolean(health) && health.drivers?.data !== 'memory' && !ALLOW_LIVE;

if (live) {
  console.error(`
Refusing to run: that API is backed by DATA_DRIVER=${health.drivers?.data}.

This script registers about six fictional accounts (Ada Lovelace, Grace Hopper,
Vivian Maier…). Against a real database those rows are permanent, and their
email addresses stay taken.

  · To test the logic safely, let it start its own in-memory server:

        npm run check:welcome

  · If you really do want these accounts written to ${health.drivers?.data}:

        npm run check:welcome -- --port ${PORT} --allow-live
`);
}

// Anything above that printed a reason means we must not run the checks.
if (!health || live) {
  finish(1);
} else {
  try {
    finish(await runChecks());
  } catch (error) {
    // call() already explained a lost connection; anything else is a genuine bug.
    if (error?.message !== 'connection lost') console.error('\nUnexpected failure:', error);
    finish(1);
  }
}

// ── The checks ──────────────────────────────────────────────────────────────
// In a function so a guard can decline to call it, and so the result comes
// back as a return value instead of an exit from deep inside the flow.

async function runChecks() {
console.log(
  `Checking API on :${PORT} — data=${health.drivers?.data} mail=${health.drivers?.email}` +
    (ALLOW_LIVE && health.drivers?.data !== 'memory' ? '  ** WRITING TO A REAL DATABASE **' : ''),
);

const stamp = Date.now();
const results = [];

const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function call(path, options = {}) {
  try {
    const res = await fetch(BASE + path, options);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  } catch (error) {
    // A mid-run connection drop means the server died. Say that, rather than
    // letting an unhandled "fetch failed" bury it in a stack trace.
    console.error(`\nLost the connection to the API during ${path} — ${error.message}`);
    console.error('The server most likely crashed. Check its output.\n');
    throw new Error('connection lost');
  }
}

const post = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

// Staff token, so we can read the Console mail log. The seeded CEO account is
// the one credential this check needs; on a real database it will not exist,
// which is the other reason --allow-live is rarely what you want.
const staff = await call('/auth/sign-in', post({ email: 'ceo@artinu.in', password: 'ARTINU@CEO2026' }));
if (staff.status !== 200) {
  console.error(`
Could not sign in as ceo@artinu.in to read the mail log — HTTP ${staff.status}.

This check needs a staff account to read Console → Email Log. That account
comes from the demo seed, which only runs on an in-memory server.

  · On a real database, create an internal user and sign in as them, or just
    run the safe version:  npm run check:welcome
`);
  return 1;
}
const token = staff.body.accessToken;

const mailFor = async (address) => {
  const { body } = await call(`/admin/mail?to=${encodeURIComponent(address)}&limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return body.items ?? [];
};

const welcomesFor = async (address) =>
  (await mailFor(address)).filter((m) => m.subject === 'Welcome to Artinu');

// ── 1. Art Phile / generic signup ───────────────────────────────────────────
console.log('\n── SIGNUP SENDS ONE WELCOME ───────────────────────────────');

const guestEmail = `welcome.guest.${stamp}@example.com`;
const signup = await call(
  '/auth/sign-up',
  post({
    fullName: 'Ada Lovelace',
    email: guestEmail,
    phone: '+91 98765 43210',
    dateOfBirth: '1990-12-10',
    password: 'Artinu@2026Test',
    confirmPassword: 'Artinu@2026Test',
    role: 'guest',
    acceptTerms: true,
  }),
);
check('Registration succeeds', signup.status === 201, `HTTP ${signup.status}`);
check('Session returned', Boolean(signup.body?.accessToken));

await new Promise((r) => setTimeout(r, 900)); // the send is fire-and-forget

let welcomes = await welcomesFor(guestEmail);
check('Exactly one welcome email', welcomes.length === 1, `${welcomes.length} found`);
check('Addressed to the registered address', welcomes[0]?.to === guestEmail, welcomes[0]?.to);
check('Subject is "Welcome to Artinu"', welcomes[0]?.subject === 'Welcome to Artinu');
check(
  'Uses the real registered name, no placeholder',
  Boolean(welcomes[0]?.body?.includes('Hi Ada')) && !/\{\{|\}\}/.test(welcomes[0]?.body ?? ''),
  welcomes[0]?.body?.split('\n')[0],
);
check(
  'Confirms registration was received',
  Boolean(welcomes[0]?.body?.includes('registration has been successfully received')),
);
check('Signed off by Team Artinu', Boolean(welcomes[0]?.body?.includes('Team Artinu')));
check('Carries hello@artinu.in', Boolean(welcomes[0]?.body?.includes('hello@artinu.in')));

// ── 2. Sign-in must NOT resend ──────────────────────────────────────────────
console.log('\n── SIGN-IN DOES NOT RESEND ────────────────────────────────');

for (let i = 0; i < 3; i++) {
  await call('/auth/sign-in', post({ email: guestEmail, password: 'Artinu@2026Test' }));
}
await new Promise((r) => setTimeout(r, 600));
welcomes = await welcomesFor(guestEmail);
check('Still exactly one after three sign-ins', welcomes.length === 1, `${welcomes.length} found`);

// ── 3. Replayed registration must not duplicate ─────────────────────────────
console.log('\n── DUPLICATE REGISTRATION ─────────────────────────────────');

const replay = await call(
  '/auth/sign-up',
  post({
    fullName: 'Ada Lovelace',
    email: guestEmail,
    phone: '+91 98765 43210',
    dateOfBirth: '1990-12-10',
    password: 'Artinu@2026Test',
    confirmPassword: 'Artinu@2026Test',
    role: 'guest',
    acceptTerms: true,
  }),
);
check('Replayed signup is rejected', replay.status === 409, `HTTP ${replay.status}`);
await new Promise((r) => setTimeout(r, 600));
welcomes = await welcomesFor(guestEmail);
check('Still exactly one welcome email', welcomes.length === 1, `${welcomes.length} found`);

// Concurrent burst — the double-submit / retry case.
const burstEmail = `welcome.burst.${stamp}@example.com`;
const burst = await Promise.all(
  Array.from({ length: 5 }, () =>
    call('/auth/sign-up', post({
      fullName: 'Grace Hopper',
      email: burstEmail,
      phone: '+91 98765 43211',
      dateOfBirth: '1988-12-09',
      password: 'Artinu@2026Test',
      confirmPassword: 'Artinu@2026Test',
      role: 'guest',
      acceptTerms: true,
    })),
  ),
);
const created = burst.filter((r) => r.status === 201).length;
check('Five concurrent submissions create exactly one account', created === 1, `${created} created`);
check('No 5xx during the burst', burst.every((r) => r.status < 500));
await new Promise((r) => setTimeout(r, 900));
const burstWelcomes = await welcomesFor(burstEmail);
check('Exactly one welcome email from the burst', burstWelcomes.length === 1, `${burstWelcomes.length} found`);

// ── 4. Role-specific copy ───────────────────────────────────────────────────
console.log('\n── ROLE-SPECIFIC COPY ─────────────────────────────────────');

const artistEmail = `welcome.artist.${stamp}@example.com`;
const artist = await call(
  '/auth/register/artist',
  post({
    fullName: 'Vivian Maier',
    email: artistEmail,
    phone: '+91 98765 43210',
    dateOfBirth: '1985-02-01',
    password: 'Artinu@2026Test',
    confirmPassword: 'Artinu@2026Test',
    artistName: 'V. Maier',
    location: 'Chicago, USA',
    artStyle: 'street',
    acceptTerms: true,
  }),
);
check('Artist registration succeeds', artist.status === 201, `HTTP ${artist.status}`);
await new Promise((r) => setTimeout(r, 900));
const artistWelcome = (await welcomesFor(artistEmail))[0];
check('Artist gets exactly one welcome', (await welcomesFor(artistEmail)).length === 1);
check('Artist copy mentions uploading work', Boolean(artistWelcome?.body?.includes('upload your photographs')));
check('Artist greeted by name', Boolean(artistWelcome?.body?.includes('Hi Vivian')));

const ownerEmail = `welcome.owner.${stamp}@example.com`;
const owner = await call(
  '/auth/register/space-owner',
  post({
    fullName: 'Mies Rohe',
    email: ownerEmail,
    spaceName: 'Barcelona Pavilion Cafe',
    spaceType: 'cafe',
    city: 'Barcelona',
    phone: '9876501234',
    dateOfBirth: '1976-03-27',
    acceptTerms: true,
  }),
);
check('Space-owner registration succeeds', owner.status === 201, `HTTP ${owner.status}`);
await new Promise((r) => setTimeout(r, 900));
const ownerWelcome = (await welcomesFor(ownerEmail))[0];
check('Space owner gets exactly one welcome', (await welcomesFor(ownerEmail)).length === 1);
check('Owner copy mentions completing the space', Boolean(ownerWelcome?.body?.includes('complete your space details')));
check(
  'Welcome email never contains the issued password',
  !ownerWelcome?.body?.includes(owner.body?.credentials?.password ?? ' '),
);

// ── 5. Invalid registration leaves nothing behind ───────────────────────────
console.log('\n── INVALID REGISTRATION ───────────────────────────────────');

// A well-formed address, so sign-in below reaches the credential check rather
// than being turned away by its own email-format validation.
const badEmail = `welcome.invalid.${stamp}@example.com`;
const bad = await call(
  '/auth/sign-up',
  post({
    fullName: 'X',
    email: badEmail,
    password: 'short',
    confirmPassword: 'nope',
    role: 'guest',
    acceptTerms: true,
  }),
);
check('Invalid registration rejected with a validation error', bad.status === 422, `HTTP ${bad.status}`);
check('Field-level errors returned', Boolean(bad.body?.details));
await new Promise((r) => setTimeout(r, 400));
check('No welcome email for a rejected registration', (await welcomesFor(badEmail)).length === 0);

const signedIn = await call('/auth/sign-in', post({ email: badEmail, password: 'Artinu@2026Test' }));
check('No broken account left behind — cannot sign in', signedIn.status === 401, `HTTP ${signedIn.status}`);

// And the address is genuinely free afterwards: a rejected registration must
// not silently consume the email it failed on.
const retry = await call(
  '/auth/sign-up',
  post({
    fullName: 'Valid Retry',
    email: badEmail,
    phone: '+91 98765 43212',
    dateOfBirth: '1994-08-08',
    password: 'Artinu@2026Test',
    confirmPassword: 'Artinu@2026Test',
    role: 'guest',
    acceptTerms: true,
  }),
);
check('The address is still free to register properly', retry.status === 201, `HTTP ${retry.status}`);
await new Promise((r) => setTimeout(r, 900));
check('That successful retry gets its welcome email', (await welcomesFor(badEmail)).length === 1);

// ── Summary ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log('\n───────────────────────────────────────────────────────────');
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  · ${f.name}`);
  return 1;
}
return 0;

} // end runChecks
