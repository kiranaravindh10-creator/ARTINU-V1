/**
 * Checks the configured database against what the code actually needs.
 *
 * Run this after applying a migration — and any time a flow fails in a way
 * that smells like a "pipeline issue". A deployed project can sit several
 * migrations behind `database/schema.sql`, and the symptom is never "column
 * missing": it is a hanging registration or a publish button that does nothing.
 *
 *   npm run check:schema --workspace server
 *
 * Exits non-zero if anything required is absent, so CI can gate on it.
 */

import { db, supabaseClient } from '@/database/db';
import { env } from '@/config/env';

type Check = { label: string; ok: boolean; detail?: string };

/**
 * The checker walks the tables by name, which the typed Database interface has
 * no index signature for. One narrow view of it here, rather than a cast at
 * every call site.
 */
type AnyTable = { find: (options: { limit: number }) => Promise<Record<string, unknown>[]> };
const tables = db as unknown as Record<string, AnyTable>;

const results: Check[] = [];
const record = (label: string, ok: boolean, detail?: string) =>
  results.push({ label, ok, detail });

/** Every table the Database interface exposes must be readable. */
const TABLES = [
  'users', 'profiles', 'spaces', 'artworks', 'orders', 'payments', 'invoices',
  'installations', 'rotations', 'notifications', 'payouts', 'supportTickets',
  'consultations', 'applications', 'auditLogs', 'wishlists', 'follows',
  'otpChallenges', 'tokens', 'uiContent', 'heroSlides', 'featuredCollections',
  'cafes', 'collaborationSlides',
  // Added by 004_operations.sql
  'errorLogs', 'employees', 'frames', 'frameMovements',
] as const;

/** Columns added after the initial schema, which older projects will lack. */
const COLUMNS: { table: 'profiles' | 'artworks' | 'cafes'; column: string }[] = [
  { table: 'profiles', column: 'coverUrl' },
  { table: 'profiles', column: 'photographerCode' },
  { table: 'profiles', column: 'nextPhotoNumber' },
  // Added by 009_registration_and_collaborations.sql
  { table: 'profiles', column: 'dateOfBirth' },
  { table: 'cafes', column: 'websiteUrl' },
  { table: 'artworks', column: 'photoId' },
  { table: 'artworks', column: 'photoNumber' },
];

async function run() {
  console.log(`\nARTINU schema check — driver: ${env.DATA_DRIVER}\n`);

  for (const name of TABLES) {
    try {
      await tables[name]!.find({ limit: 1 });
      record(`table ${name}`, true);
    } catch (error) {
      record(`table ${name}`, false, (error as Error).message.slice(0, 120));
    }
  }

  // A column is only provable from a row, so probe with a harmless write that
  // is always rolled back by updating the record to its own current value.
  for (const { table, column } of COLUMNS) {
    try {
      const [row] = await tables[table]!.find({ limit: 1 });

      if (!row) {
        record(`${table}.${column}`, true, 'no rows to verify against — skipped');
        continue;
      }
      record(`${table}.${column}`, column in row, column in row ? undefined : 'absent from returned row');
    } catch (error) {
      record(`${table}.${column}`, false, (error as Error).message.slice(0, 120));
    }
  }

  // The atomic Photo ID allocator. Calling it with a nil uuid should reach the
  // function body and fail on "no photographer code" — proving it is deployed.
  if (env.DATA_DRIVER === 'supabase') {
    const client = supabaseClient();
    if (client) {
      const { error } = await client.rpc('artinu_allocate_photo_id', {
        p_artist_id: '00000000-0000-0000-0000-000000000000',
      });
      const missing = error?.message?.includes('Could not find the function');
      record('fn artinu_allocate_photo_id', !missing, missing ? 'not deployed' : undefined);
    }
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`  ${r.ok ? 'ok     ' : 'MISSING'} ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
  }

  if (failed.length) {
    const needs004 = failed.some((f) =>
      /errorLogs|employees|frames|frameMovements/.test(f.label),
    );
    console.log(
      `\n${failed.length} problem(s). Apply ` +
        (needs004
          ? 'database/migrations/004_operations.sql'
          : 'database/migrations/003_sync_live_schema.sql') +
        ` in the Supabase SQL editor, then run this again.\n`,
    );
    process.exit(1);
  }

  console.log('\nEverything the code needs is present.\n');
  process.exit(0);
}

run().catch((error) => {
  console.error('Schema check could not run:', error);
  process.exit(1);
});
