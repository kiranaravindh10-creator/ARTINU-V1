/**
 * Creates the five internal ARTINU accounts in whatever database is configured.
 *
 *   npm run create:staff --workspace server              # strong random passwords
 *   npm run create:staff --workspace server -- --demo    # the README passwords
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The sign-in table in README.md comes from the demo seed, and the demo seed
 * only runs against DATA_DRIVER=memory. Point the app at a real Supabase
 * project and there are no accounts at all — not the CEO one, not any — so
 * every documented login fails with "That email and password do not match".
 * That is correct behaviour, not a bug: seeding 31 fictional users and 140
 * invented artworks into production would be far worse. But it leaves nobody
 * able to open the Console.
 *
 * This creates only the five staff accounts. No demo users, no demo artworks,
 * no spaces, no orders.
 *
 * ── About the passwords ─────────────────────────────────────────────────────
 *
 * The README passwords are published in the repository. Anyone who reads it
 * can sign in as the CEO, which on a live deployment is a full compromise of
 * every Console module. So by default this generates a strong random password
 * per account, prints each one ONCE, and sets must_change_password so the
 * holder has to replace it at first sign-in.
 *
 * `--demo` uses the documented passwords instead. Only for a throwaway
 * environment — it is refused outright when NODE_ENV=production.
 *
 * Safe to re-run: an account that already exists is reported and skipped, never
 * modified, so this can never reset a password somebody has already chosen.
 */

import { randomBytes } from 'node:crypto';
import { env } from '@/config/env';
import { db } from '@/database/db';
import { createProfile, createUser, findByEmail, setPassword } from '@/services/auth.service';
import type { StoredUser } from '@/database/db';

const DEMO = process.argv.includes('--demo');
/**
 * Re-set the password on accounts that already exist.
 *
 * Off by default, because silently resetting a password somebody has chosen is
 * exactly the surprise this script should not spring. Opt in when the point of
 * the run *is* to get back into an account whose password is lost.
 */
const RESET = process.argv.includes('--reset');

const STAFF: { email: string; demoPassword: string; role: StoredUser['role']; name: string }[] = [
  { email: 'ceo@artinu.in', demoPassword: 'ARTINU@CEO2026', role: 'ceo', name: 'Ananya Rao' },
  { email: 'manager@artinu.in', demoPassword: 'ARTINU@Mgr2026', role: 'manager', name: 'Vikram Sheth' },
  { email: 'accounts@artinu.in', demoPassword: 'ARTINU@Acc2026', role: 'accounts', name: 'Priya Nair' },
  { email: 'it@artinu.in', demoPassword: 'ARTINU@IT2026', role: 'it_team', name: 'Nikhil Menon' },
  { email: 'fieldops@artinu.in', demoPassword: 'ARTINU@Ops2026', role: 'operations', name: 'Rahul Deshpande' },
];

/**
 * Readable but genuinely random: 30 bits from crypto per password, formatted so
 * it can be copied off a terminal without ambiguity. Never derived from the
 * email or the name.
 */
function strongPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(18);
  const body = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `Artinu-${body.slice(0, 6)}-${body.slice(6, 12)}-${body.slice(12, 18)}`;
}

async function run() {
  if (DEMO && env.isProduction) {
    console.error(
      '\nRefusing --demo with NODE_ENV=production.\n\n' +
        '  Those passwords are printed in README.md, which is in the repository.\n' +
        '  Creating them on a live deployment hands the Console to anyone who reads it.\n' +
        '  Run without --demo to get random passwords instead.\n',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nARTINU staff accounts — driver: ${env.DATA_DRIVER}\n`);

  const created: { email: string; role: string; password: string }[] = [];
  let skipped = 0;

  for (const person of STAFF) {
    const existing = await findByEmail(person.email);

    if (existing && !RESET) {
      console.log(`  exists   ${person.email.padEnd(24)} (${existing.role}) — left untouched`);
      skipped += 1;
      continue;
    }

    const password = DEMO ? person.demoPassword : strongPassword();

    if (existing) {
      // setPassword also clears must_change_password, which is right: whoever
      // ran this now knows the credential, so there is nothing to force.
      await setPassword(existing.id, password);
      created.push({ email: person.email, role: existing.role, password });
      console.log(`  reset    ${person.email.padEnd(24)} (${existing.role})`);
      continue;
    }

    const user = await createUser({
      email: person.email,
      password,
      role: person.role,
      // Staff are created by ARTINU, not self-registered, so there is no
      // address to confirm and no verification email to chase.
      emailVerified: true,
      // A generated credential must be replaced by one the person chose.
      // The demo passwords are already known to whoever ran this, so there
      // is nothing to force.
      mustChangePassword: !DEMO,
    });

    await createProfile(user.id, { fullName: person.name });

    created.push({ email: person.email, role: person.role, password });
    console.log(`  created  ${person.email.padEnd(24)} (${person.role})`);
  }

  if (created.length && !DEMO) {
    console.log(`
  ┌─ Passwords — shown once, not stored anywhere in readable form ─────────────
`);
    for (const account of created) {
      console.log(`  │  ${account.email.padEnd(24)}  ${account.password}`);
    }
    console.log(`  │
  │  Copy these now. Each account must change its password at first sign-in.
  └────────────────────────────────────────────────────────────────────────────
`);
  }

  if (created.length && DEMO) {
    console.log('\n  Using the README passwords. Do not do this on a live deployment.\n');
  }

  const total = await db.users.count();
  console.log(`  ${created.length} created, ${skipped} already present. ${total} user(s) in the database.\n`);
}

run().catch((error) => {
  console.error('\nCould not create the staff accounts:', error instanceof Error ? error.message : error);
  console.error('\nIf this says a table is missing, apply database/migrations/APPLY_ALL_FRESH.sql first.\n');
  process.exitCode = 1;
});
