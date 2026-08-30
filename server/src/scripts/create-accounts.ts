/**
 * Creates named space-owner accounts, idempotently.
 *
 *   ACCOUNT_PW_HOMEDECOR='…' ACCOUNT_PW_NIBANDNOSH='…' \
 *     npx tsx src/scripts/create-accounts.ts
 *
 * Passwords come from the environment, are used once to hash through the same
 * path a real sign-up uses, and are never written to this file, the database or
 * a log. An account that already exists is reported and left completely alone,
 * so re-running can never reset a password somebody has chosen.
 */

import { env } from '@/config/env';
import { db } from '@/database/db';
import { createProfile, createUser, findByEmail } from '@/services/auth.service';
import { now } from '@/utils/ids';

interface Seed {
  passwordEnv: string;
  email: string;
  ownerName: string;
  space: {
    name: string;
    /** Drives the tariff: home_decor bills from the home book, cafe from standard. */
    type: 'cafe' | 'home_decor';
    city: string;
    addressLine1: string;
    addressLine2?: string;
    /** Verified only where ARTINU work genuinely already hangs. */
    verified: boolean;
  };
}

const SEEDS: Seed[] = [
  {
    passwordEnv: 'ACCOUNT_PW_HOMEDECOR',
    email: 'homedecor@artinu.in',
    ownerName: 'ARTINU Home Decor',
    space: {
      name: 'ARTINU Home Decor',
      type: 'home_decor',
      city: 'Bengaluru',
      addressLine1: 'Home decor account',
      verified: false,
    },
  },
  {
    passwordEnv: 'ACCOUNT_PW_NIBANDNOSH',
    email: 'nibandnoshcafe@artinu.in',
    ownerName: 'Nib & Nosh Café',
    space: {
      name: 'Nib & Nosh Café',
      type: 'cafe',
      city: 'Bengaluru',
      // Their real address, as recorded on the café row used by the homepage.
      addressLine1: 'No 59, 13, 19th Main Rd',
      addressLine2: '2nd Block, Rajajinagar',
      // ARTINU work already hangs here, which is what verification means.
      verified: true,
    },
  },
];

async function main(): Promise<void> {
  const missing = SEEDS.filter((s) => !process.env[s.passwordEnv]).map((s) => s.passwordEnv);
  if (missing.length > 0) {
    console.error('Set a password for each account:');
    missing.forEach((name) => console.error(`  ${name}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Data driver: ${env.DATA_DRIVER}\n`);

  for (const seed of SEEDS) {
    if (await findByEmail(seed.email)) {
      console.log(`skip   ${seed.email} - already exists, left untouched`);
      continue;
    }

    const user = await createUser({
      email: seed.email,
      password: process.env[seed.passwordEnv]!,
      role: 'space_owner',
      emailVerified: true,
    });

    await createProfile(user.id, { fullName: seed.ownerName, city: seed.space.city });

    /*
      Reuse the café's own photograph where we already have one, rather than
      leaving the space without an image or inventing a stock one.
    */
    const cafes = await db.cafes.find({});
    const match = cafes.find((cafe) => cafe.name.replace(/\s+/g, '') === seed.space.name.replace(/\s+/g, ''));

    const space = await db.spaces.insert({
      ownerId: user.id,
      name: seed.space.name,
      type: seed.space.type,
      addressLine1: seed.space.addressLine1,
      addressLine2: seed.space.addressLine2 ?? null,
      city: seed.space.city,
      contactName: seed.ownerName,
      contactPhone: '',
      contactEmail: seed.email,
      imageUrls: match?.photoUrl ? [match.photoUrl] : [],
      rotationIntervalMonths: 1,
      verified: seed.space.verified,
      createdAt: now(),
      updatedAt: now(),
    });

    console.log(`create ${seed.email}  ->  "${space.name}" (${space.type})`);
  }

  console.log('\nPasswords were read from the environment and never stored in plaintext.');
}

void main();
