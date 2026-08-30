import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  Coupon,
  Warning,
  RemovalRequest,
  ArtistApplication,
  Artwork,
  AuditLogEntry,
  Cafe,
  CollaborationSlide,
  ConsultationRequest,
  FeaturedCollection,
  HeroSlide,
  Installation,
  Invoice,
  Notification,
  Order,
  Payment,
  Payout,
  Profile,
  RotationCycle,
  Space,
  SupportTicket,
  User,
  WishlistEntry,
} from '@artinu/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { MemoryTable, SupabaseTable, type Table } from '@/database/table';

/** A user row as stored — the API never returns `passwordHash`. */
export interface StoredUser extends User {
  passwordHash: string;
  phone?: string | null;
}

/**
 * A short-lived numeric code. Two flows use it, told apart by `purpose`:
 * the sign-in challenge, and email verification at registration.
 */
export interface OtpChallengeRecord {
  id: string;
  userId: string;
  /**
   * The code in the clear. Sign-in still writes this. Verification does not —
   * it writes `codeHash` and leaves this empty, so a live verification code
   * cannot be read out of the database.
   */
  code: string;
  /** sha256 of the code. Preferred over `code` when present. */
  codeHash?: string | null;
  /** 'sign_in' (the default, and everything written before migration 010) or 'email_verification'. */
  purpose?: string;
  sentTo: string;
  channel: 'email' | 'phone';
  expiresAt: string;
  attempts: number;
  consumed: boolean;
  createdAt: string;
}

/** One-time tokens for password reset and email verification. */
export interface TokenRecord {
  id: string;
  userId: string;
  token: string;
  purpose: 'password_reset' | 'email_verification';
  expiresAt: string;
  consumed: boolean;
  createdAt: string;
}

export interface FollowRecord {
  id: string;
  userId: string;
  artistId: string;
  createdAt: string;
}

import type { UiContentRecord } from '@artinu/shared';

export interface Database {
  users: Table<StoredUser>;
  profiles: Table<Profile>;  spaces: Table<Space>;
  artworks: Table<Artwork>;
  orders: Table<Order>;
  payments: Table<Payment>;
  invoices: Table<Invoice>;
  coupons: Table<Coupon>;
  installations: Table<Installation>;
  rotations: Table<RotationCycle>;
  notifications: Table<Notification>;
  payouts: Table<Payout>;
  supportTickets: Table<SupportTicket>;
  consultations: Table<ConsultationRequest>;
  applications: Table<ArtistApplication>;
  auditLogs: Table<AuditLogEntry>;
  wishlists: Table<WishlistEntry>;
  follows: Table<FollowRecord>;
  otpChallenges: Table<OtpChallengeRecord>;
  tokens: Table<TokenRecord>;
  uiContent: Table<UiContentRecord>;
  warnings: Table<Warning>;
  removalRequests: Table<RemovalRequest>;
  heroSlides: Table<HeroSlide>;
  featuredCollections: Table<FeaturedCollection>;
  cafes: Table<Cafe>;
  collaborationSlides: Table<CollaborationSlide>;
  errorLogs: Table<{ id: string } & Record<string, any>>;
  employees: Table<{ id: string } & Record<string, any>>;
  frames: Table<{ id: string } & Record<string, any>>;
  frameMovements: Table<{ id: string } & Record<string, any>>;
  /**
   * Every email the app has tried to send.
   *
   * In the database rather than on disk because the disk does not survive: the
   * mailbox used to live in server/.data/mail, and Render replaces the
   * filesystem on every deploy and every restart. So the one screen that could
   * answer "did the password reset actually go out?" was permanently empty in
   * production, which is precisely where the question gets asked.
   */
  mailLog: Table<{ id: string } & Record<string, any>>;
}

const TABLE_NAMES = [
  'users',
  'profiles',
  'spaces',
  'artworks',
  'orders',
  'payments',
  'invoices',
  'coupons',
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
  'otpChallenges',
  'tokens',
  'uiContent',
  'heroSlides',
  'featuredCollections',
  'cafes',
  'collaborationSlides',
  'errorLogs',
  'employees',
  'frames',
  'frameMovements',
  'mailLog',
  'warnings',
  'removalRequests',
] as const;

type TableName = (typeof TABLE_NAMES)[number];

/** camelCase in code, snake_case as the Postgres table name. */
const sqlName = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// ── Dev-time persistence ─────────────────────────────────────────────────────
// The memory driver keeps everything in process; without this, every `tsx watch`
// restart would throw away the orders you just placed. Writes are debounced.

const dataFile = path.join(env.serverRoot, '.data', 'db.json');
let persistTimer: NodeJS.Timeout | null = null;
let memoryTables: Partial<Record<TableName, MemoryTable<any>>> = {};

function persist() {
  if (env.DATA_DRIVER !== 'memory' || !env.MEMORY_PERSIST) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      mkdirSync(path.dirname(dataFile), { recursive: true });
      const snapshot = Object.fromEntries(
        Object.entries(memoryTables).map(([name, table]) => [name, table?.snapshot() ?? []]),
      );
      writeFileSync(dataFile, JSON.stringify(snapshot), 'utf8');
    } catch (error) {
      logger.warn('Could not persist the in-memory store', error);
    }
  }, 400);
}

function restore(): boolean {
  if (env.DATA_DRIVER !== 'memory' || !env.MEMORY_PERSIST || !existsSync(dataFile)) return false;
  try {
    const raw = JSON.parse(readFileSync(dataFile, 'utf8')) as Record<string, unknown[]>;
    let restored = 0;
    for (const name of TABLE_NAMES) {
      const rows = raw[name];
      if (Array.isArray(rows)) {
        memoryTables[name]?.restore(rows as { id: string }[]);
        restored += rows.length;
      }
    }
    // An empty file is the same as no file — let the seeder run.
    return restored > 0;
  } catch (error) {
    logger.warn('Could not read the persisted store - starting fresh', error);
    return false;
  }
}

let supabaseAdmin: SupabaseClient | null = null;

/** The service-role client, available only when DATA_DRIVER=supabase. */
export function supabaseClient(): SupabaseClient | null {
  return supabaseAdmin;
}

function buildTables(): Database {
  if (env.DATA_DRIVER === 'supabase') {
    const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    supabaseAdmin = client;
    const make = <T extends { id: string }>(name: TableName) =>
      new SupabaseTable<T>(sqlName(name), client);
    return Object.fromEntries(
      TABLE_NAMES.map((name) => [name, make(name)]),
    ) as unknown as Database;
  }

  memoryTables = Object.fromEntries(
    TABLE_NAMES.map((name) => [name, new MemoryTable(name, persist)]),
  ) as Partial<Record<TableName, MemoryTable<any>>>;

  return memoryTables as unknown as Database;
}

export const db: Database = buildTables();

/** True when a previous session's data was restored from disk. */
export const restoredFromDisk = restore();

export function isSeeded(): Promise<boolean> {
  return db.users.count().then((count) => count > 0);
}

/** Wipes the persisted dev store — used by `npm run seed -- --fresh`. */
export function clearPersistedStore() {
  try {
    if (existsSync(dataFile)) writeFileSync(dataFile, '{}', 'utf8');
  } catch {
    /* nothing to clear */
  }
}
