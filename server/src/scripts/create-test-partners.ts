/**
 * Creates three TEST space-owner partners, each with one space.
 *
 *   TEST_PARTNER_PW_AAB=... TEST_PARTNER_PW_GLENS=... TEST_PARTNER_PW_UDUPI=... \
 *     npm run create:test-partners --workspace server
 *
 *   npm run create:test-partners --workspace server -- --cleanup
 *
 * ── Why the passwords come from the environment ─────────────────────────────
 *
 * They are not in this file and must not be. `create-staff.ts` hardcodes its
 * demo passwords and says so plainly - they are published in the repository,
 * and anyone who reads it can sign in. These three are credentials somebody
 * actually typed at us, so they are read from the environment, used once to
 * hash, and never written anywhere. The database only ever sees the bcrypt
 * hash, via the same `setPassword` the real sign-up uses.
 *
 * ── Why it refuses production ───────────────────────────────────────────────
 *
 * These are demonstration partners with invented addresses. Creating them in a
 * live database would put fictional businesses in the Console next to real
 * ones, where the next person cannot tell which is which.
 *
 * Safe to re-run: an account that already exists is reported and skipped, never
 * modified, so this can never reset a password somebody has chosen.
 *
 * `--cleanup` removes exactly what this script creates - the three users, their
 * profiles, and their spaces - matched by their marker email domain, and
 * nothing else. It refuses to touch a space it did not create.
 */

import { env } from '@/config/env';
import { db } from '@/database/db';
import { createProfile, createUser, findByEmail } from '@/services/auth.service';
import { now } from '@/utils/ids';

const CLEANUP = process.argv.includes('--cleanup');

/**
 * The marker that makes these records identifiable and removable.
 *
 * Every address on the domain is a test partner, which is what `--cleanup`
 * matches on. Nothing outside it is ever touched.
 */
const TEST_DOMAIN = 'test-partner.artinu.in';

interface PartnerSeed {
  /** Environment variable carrying the password. Never a literal. */
  passwordEnv: string;
  email: string;
  ownerName: string;
  phone: string;
  space: {
    name: string;
    type: 'restaurant' | 'cafe';
    city: string;
    addressLine1: string;
    theme: string;
    cuisine: string;
    wallCount: number;
  };
}

const PARTNERS: PartnerSeed[] = [
  {
    passwordEnv: 'TEST_PARTNER_PW_AAB',
    email: `adyar.anandha.bhavan@${TEST_DOMAIN}`,
    ownerName: 'Adyar Anandha Bhavan',
    phone: '+91 90000 00001',
    space: {
      name: 'Adyar Anandha Bhavan',
      type: 'restaurant',
      city: 'Chennai',
      addressLine1: 'Test record - not a real address',
      theme: 'Traditional South Indian dining, warm wood and brass',
      cuisine: 'South Indian',
      wallCount: 6,
    },
  },
  {
    passwordEnv: 'TEST_PARTNER_PW_GLENS',
    email: `glens.bakery@${TEST_DOMAIN}`,
    ownerName: "Glen's Bakery",
    phone: '+91 90000 00002',
    space: {
      name: "Glen's Bakery",
      type: 'cafe',
      city: 'Bengaluru',
      addressLine1: 'Test record - not a real address',
      theme: 'Bright bakery counter, white tile and pale oak',
      cuisine: 'Bakery and coffee',
      wallCount: 4,
    },
  },
  {
    passwordEnv: 'TEST_PARTNER_PW_UDUPI',
    email: `udupi.garden@${TEST_DOMAIN}`,
    ownerName: 'Udupi Garden',
    phone: '+91 90000 00003',
    space: {
      name: 'Udupi Garden',
      type: 'restaurant',
      city: 'Bengaluru',
      addressLine1: 'Test record - not a real address',
      theme: 'Open courtyard dining, plants and terracotta',
      cuisine: 'Udupi vegetarian',
      wallCount: 8,
    },
  },
];

async function cleanup(): Promise<void> {
  let users = 0;
  let profiles = 0;
  let spaces = 0;
  let orders = 0;
  let invoices = 0;
  let payments = 0;

  for (const partner of PARTNERS) {
    const user = await findByEmail(partner.email);
    if (!user) continue;

    /*
      Everything the account produced, deepest first.

      Removing only the user would leave its orders, invoices and payments
      behind as rows pointing at an owner that no longer exists - which is worse
      than leaving the account alone, because the Console still totals them into
      revenue. Each is matched by ownerId, so nothing belonging to anyone else
      can be caught.
    */
    // Payments hang off the ORDER, not the owner, so the order ids are
    // collected first and the payments matched against those.
    const ownedOrders = await db.orders.find({ where: { ownerId: user.id } });
    const orderIds = new Set(ownedOrders.map((order) => order.id));
    for (const payment of await db.payments.find({})) {
      if (!orderIds.has(payment.orderId)) continue;
      await db.payments.remove(payment.id);
      payments += 1;
    }
    for (const invoice of await db.invoices.find({ where: { ownerId: user.id } })) {
      await db.invoices.remove(invoice.id);
      invoices += 1;
    }
    for (const order of ownedOrders) {
      await db.orders.remove(order.id);
      orders += 1;
    }
    const owned = await db.spaces.find({ where: { ownerId: user.id } });
    for (const space of owned) {
      await db.spaces.remove(space.id);
      spaces += 1;
    }

    const profile = await db.profiles.findOne({ userId: user.id });
    if (profile) {
      await db.profiles.remove(profile.id);
      profiles += 1;
    }

    await db.users.remove(user.id);
    users += 1;
  }

  console.log(
    `Removed ${users} account(s), ${profiles} profile(s), ${spaces} space(s), ` +
      `${orders} order(s), ${invoices} invoice(s), ${payments} payment(s).`,
  );
  console.log('Nothing outside @' + TEST_DOMAIN + ' was touched.');
}

async function create(): Promise<void> {
  const missing = PARTNERS.filter((p) => !process.env[p.passwordEnv]).map((p) => p.passwordEnv);
  if (missing.length > 0) {
    console.error('Set a password for each partner before running:');
    missing.forEach((name) => console.error(`  ${name}`));
    process.exitCode = 1;
    return;
  }

  for (const partner of PARTNERS) {
    const existing = await findByEmail(partner.email);
    if (existing) {
      console.log(`skip   ${partner.email} - already exists, left untouched`);
      continue;
    }

    // createUser hashes through the same path as a real sign-up. The plaintext
    // is read from the environment here and never stored.
    const user = await createUser({
      email: partner.email,
      password: process.env[partner.passwordEnv]!,
      role: 'space_owner',
      emailVerified: true,
    });

    await createProfile(user.id, {
      fullName: partner.ownerName,
      phone: partner.phone,
      city: partner.space.city,
    });

    const space = await db.spaces.insert({
      ownerId: user.id,
      name: partner.space.name,
      type: partner.space.type,
      theme: partner.space.theme,
      cuisine: partner.space.cuisine,
      addressLine1: partner.space.addressLine1,
      city: partner.space.city,
      contactName: partner.ownerName,
      contactPhone: partner.phone,
      contactEmail: partner.email,
      wallCount: partner.space.wallCount,
      imageUrls: [],
      rotationIntervalMonths: 1,
      // Unverified, like every self-registered space. Verification is a person
      // turning up at a real door, and nobody has been to these.
      verified: false,
      createdAt: now(),
      updatedAt: now(),
    });

    console.log(`create ${partner.email}  ->  space "${space.name}" (${space.type})`);
  }

  console.log('\nDone. Passwords were read from the environment and never stored in plaintext.');
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to run against production: these are fictional partners.');
    process.exitCode = 1;
    return;
  }

  console.log(`Data driver: ${env.DATA_DRIVER}\n`);
  await (CLEANUP ? cleanup() : create());
}

void main();
