#!/usr/bin/env node
/**
 * Google Drive → Supabase Storage Migration Script
 *
 * Run with: npx tsx server/src/scripts/migrate-drive-to-firebase.ts
 *
 * This script has been re-purposed to migrate files from Google Drive
 * to Supabase Storage instead of Firebase Storage.
 *
 * It:
 * 1. Scans all DB records for Google Drive URLs
 * 2. Downloads each file from Drive
 * 3. Uploads to Supabase Storage with correct path structure
 * 4. Updates DB records with new Supabase URLs
 * 5. Logs failures for manual retry
 * 6. Runs in batches with rate limiting
 *
 * Does NOT delete from Drive — verify migration complete before cleanup.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { google, type drive_v3 } from 'googleapis';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { randomUUID } from 'node:crypto';

interface DbRecord {
  [key: string]: string | number | boolean | null | string[] | number[] | boolean[] | object | unknown[];
}

// Load .env from repo root
const here = fileURLToPath(import.meta.url);
const repoRoot = resolve(here, '../../..');
config({ path: resolve(repoRoot, '.env') });

const BATCH_SIZE = 50;
const DRIVE_RATE_LIMIT_MS = 100; // 10 req/s
const UPLOAD_RATE_LIMIT_MS = 200; // Supabase upload rate limit
const MAX_RETRIES = 3;
const DOWNLOAD_TIMEOUT_MS = 120_000;

// Tables and their URL fields that may contain Drive URLs
interface MigrationTarget {
  table: string;
  idField: string;
  urlFields: string[];
  // Function to determine Supabase folder from record
  getSupabaseFolder: (record: Record<string, unknown>) => { folder: string; photographerId?: string; nameHint?: string };
}

// Map of folder names to Supabase Storage bucket names
const BUCKET_NAMES: Record<string, string> = {
  profiles: 'artinu-profiles',
  photographers: 'artinu-artworks',
  spaces: 'artinu-spaces',
  hero: 'artinu-hero',
  featured: 'artinu-featured',
  cafes: 'artinu-cafes',
  collaborations: 'artinu-collaborations',
  artworks: 'artinu-artworks',
  thumbnails: 'artinu-thumbnails',
  documents: 'artinu-documents',
  invoices: 'artinu-invoices',
};

// Migration targets — maps DB tables to Supabase Storage folder logic
const MIGRATION_TARGETS: MigrationTarget[] = [
  {
    table: 'profiles',
    idField: 'id',
    urlFields: ['avatarUrl', 'coverUrl'],
    getSupabaseFolder: (record) => ({
      folder: 'profiles',
      photographerId: record.userId as string,
      nameHint: undefined,
    }),
  },
  {
    table: 'artworks',
    idField: 'id',
    urlFields: ['imageUrl', 'thumbnailUrl', 'originalUrl'],
    getSupabaseFolder: (record) => ({
      folder: 'photographers',
      photographerId: record.artistId as string,
      nameHint: undefined,
    }),
  },
  {
    table: 'spaces',
    idField: 'id',
    urlFields: ['imageUrls'],
    getSupabaseFolder: (record) => ({
      folder: 'spaces',
      photographerId: undefined,
      nameHint: record.id as string,
    }),
  },
  {
    table: 'hero_slides',
    idField: 'id',
    urlFields: ['imageUrl'],
    getSupabaseFolder: (record) => ({
      folder: 'hero',
      photographerId: undefined,
      nameHint: record.id as string,
    }),
  },
  {
    table: 'featured_collections',
    idField: 'id',
    urlFields: [],
    getSupabaseFolder: () => ({ folder: 'featured', photographerId: undefined }),
  },
  {
    table: 'cafes',
    idField: 'id',
    urlFields: ['photoUrl'],
    getSupabaseFolder: (record) => ({
      folder: 'cafes',
      photographerId: undefined,
      nameHint: record.id as string,
    }),
  },
  {
    table: 'collaboration_slides',
    idField: 'id',
    urlFields: ['imageUrl'],
    getSupabaseFolder: (record) => ({
      folder: 'collaborations',
      photographerId: undefined,
      nameHint: record.id as string,
    }),
  },
];

// Supabase Storage base URL
const SUPABASE_PUBLIC_BASE_URL = env.STORAGE_PUBLIC_BASE_URL || 'http://localhost:4000/uploads';

// ── Google Drive Client ───────────────────────────────────────────────────────

let driveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (!driveClient) {
    if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    }
    const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

// Extract file ID from various Google Drive URL formats
function extractDriveFileId(url: string): string | null {
  const patterns = [
    /[?&]id=([a-zA-Z0-9_-]+)/, // ?id=FILE_ID
    /\/file\/d\/([a-zA-Z0-9_-]+)/, // /file/d/FILE_ID/
    /\/open\?id=([a-zA-Z0-9_-]+)/, // /open?id=FILE_ID
    /^([a-zA-Z0-9_-]{25,})$/, // Bare file ID
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Download file from Google Drive
async function downloadFromDrive(fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string } > {
  const drive = getDriveClient();

  // Get file metadata
  const { data: file } = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true,
  });

  if (!file.mimeType?.startsWith('image/')) {
    throw new Error(`Not an image: ${file.mimeType}`);
  }

  // Download file content
  const { data: stream } = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    mimeType: file.mimeType!,
    fileName: file.name || `drive-${fileId}`,
  };
}

// ── Supabase Upload ──────────────────────────────────────────────────────────

// Extension map from MIME type
function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  return map[mimeType] || 'jpg';
}

async function uploadToSupabase(
  buffer: Buffer,
  mimeType: string,
  folder: string,
  nameHint?: string,
  photographerId?: string,
): Promise<{ url: string; path: string }> {
  const supabase = getSupabase();
  const extension = getExtensionFromMime(mimeType);
  const baseName = nameHint ? nameHint.replace(/\.[^.]+$/, '') : '';
  const fileName = baseName ? `${baseName}-${randomUUID()}.${extension}` : `${randomUUID()}.${extension}`;

  // Determine Supabase Storage path and bucket
  let bucketName = BUCKET_NAMES[folder as keyof typeof BUCKET_NAMES] || 'artinu-artworks';
  let supabasePath: string;

  switch (folder) {
    case 'profiles':
      supabasePath = `profile/${photographerId}/${fileName}`;
      break;
    case 'photographers':
      supabasePath = `photographers/${photographerId}/uploads/${fileName}`;
      break;
    case 'spaces':
      supabasePath = `spaces/${nameHint}/${fileName}`;
      break;
    case 'hero':
      supabasePath = `hero/${fileName}`;
      break;
    case 'featured':
      supabasePath = `featured/${nameHint}/${fileName}`;
      break;
    case 'cafes':
      supabasePath = `cafes/${fileName}`;
      break;
    case 'collaborations':
      supabasePath = `collaborations/${fileName}`;
      break;
    case 'artworks':
      supabasePath = `artworks/${fileName}`;
      break;
    case 'thumbnails':
      supabasePath = `thumbnails/${fileName}`;
      break;
    case 'documents':
      supabasePath = `documents/${fileName}`;
      break;
    case 'invoices':
      supabasePath = `invoices/${fileName}`;
      break;
    default:
      supabasePath = `${folder}/${fileName}`;
  }

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(supabasePath, buffer, {
      contentType: mimeType,
      cacheControl: '604800',
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(supabasePath);
  const fullUrl = `${SUPABASE_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${supabasePath}`;

  return {
    url: fullUrl,
    path: supabasePath,
  };
}

// ── Database Client ──────────────────────────────────────────────────────────

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToRecord(row: DbRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamelCase(k), v]));
}

function recordToRow(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [toSnakeCase(k), v]));
}

// ── Migration Logic ──────────────────────────────────────────────────────────

interface MigrationResult {
  recordId: string;
  table: string;
  field: string;
  oldUrl: string;
  newUrl: string;
  success: boolean;
  error?: string;
}

interface MigrationSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: MigrationResult[];
}

async function migrateRecord(
  table: string,
  record: Record<string, unknown>,
  target: MigrationTarget,
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];
  const id = record[target.idField] as string;

  for (const field of target.urlFields) {
    const value = record[field];
    if (!value) continue;

    const urls = Array.isArray(value) ? value : [value];

    for (let i = 0; i < urls.length; i++) {
      const oldUrl = urls[i];
      if (!oldUrl || !isGoogleDriveUrl(oldUrl)) {
        results.push({
          recordId: id,
          table,
          field: Array.isArray(value) ? `${field}[${i}]` : field,
          oldUrl: oldUrl || '',
          newUrl: '',
          success: true,
          error: 'Skipped: not a Google Drive URL',
        });
        continue;
      }

      const fileId = extractDriveFileId(oldUrl);
      if (!fileId) {
        results.push({
          recordId: id,
          table,
          field: Array.isArray(value) ? `${field}[${i}]` : field,
          oldUrl,
          newUrl: '',
          success: false,
          error: 'Could not extract Drive file ID',
        });
        continue;
      }

      try {
        logger.info(`Migrating ${table}.${field} for record ${id} (Drive ID: ${fileId})`);

        // Download from Drive
        const { buffer, mimeType, fileName } = await downloadFromDrive(fileId);

        // Determine Supabase path
        const { folder, photographerId, nameHint } = target.getSupabaseFolder(record);
        const hint = Array.isArray(value) ? `${nameHint}-${i}` : nameHint;

        // Upload to Supabase
        const { url: newUrl, path } = await uploadToSupabase(buffer, mimeType, folder, hint, photographerId);

        results.push({
          recordId: id,
          table,
          field: Array.isArray(value) ? `${field}[${i}]` : field,
          oldUrl,
          newUrl,
          success: true,
        });

        // Rate limit
        await sleep(UPLOAD_RATE_LIMIT_MS);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to migrate ${table}.${field} for record ${id}: ${errorMsg}`);
        results.push({
          recordId: id,
          table,
          field: Array.isArray(value) ? `${field}[${i}]` : field,
          oldUrl,
          newUrl: '',
          success: false,
          error: errorMsg,
        });
      }
    }
  }

  return results;
}

function isGoogleDriveUrl(url: string): boolean {
  return /drive\.google\.com|docs\.google\.com/.test(url);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMigration(): Promise<MigrationSummary> {
  const allResults: MigrationResult[] = [];
  const sb = getSupabase();

  for (const target of MIGRATION_TARGETS) {
    logger.info(`\n=== Processing ${target.table} ===`);

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch batch
      const selectFields = '*';
      const { data, error } = await sb
        .from(target.table)
        .select(selectFields)
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) {
        logger.error(`Error fetching ${target.table}: ${error.message}`);
        break;
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      logger.info(`Fetched ${data.length} records from ${target.table} (offset ${offset})`);

      // Process each record
      for (const row of (data as unknown as DbRecord[])) {
        const record = rowToRecord(row);
        const results = await migrateRecord(target.table, record, target);

        // Update DB with new URLs
        const updates: Record<string, unknown> = {};
        for (const result of results) {
          if (result.success && result.newUrl && result.newUrl !== result.oldUrl) {
            const fieldName = result.field.includes('[')
              ? result.field.split('[')[0]
              : result.field;
            const currentValue = record[fieldName];
            if (Array.isArray(currentValue)) {
              const index = parseInt(result.field.match(/\[(\d+)\]/)?.[1] || '0', 10);
              const newArray = [...currentValue];
              newArray[index] = result.newUrl;
              updates[fieldName] = newArray;
            } else {
              updates[fieldName] = result.newUrl;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          const updateRow = recordToRow({ ...updates, updated_at: new Date().toISOString() });
          const { error: updateError } = await sb
            .from(target.table)
            .update(updateRow)
            .eq(toSnakeCase(target.idField), record[target.idField]);

          if (updateError) {
            logger.error(`Failed to update ${target.table} record ${record[target.idField]}: ${updateError.message}`);
          } else {
            logger.info(`Updated ${target.table} record ${record[target.idField]}`);
          }
        }

        allResults.push(...results);

        // Rate limit between records
        await sleep(DRIVE_RATE_LIMIT_MS);
      }

      offset += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
    }
  }

  const summary: MigrationSummary = {
    total: allResults.length,
    succeeded: allResults.filter((r) => r.success).length,
    failed: allResults.filter((r) => !r.success && r.error !== 'Skipped: not a Google Drive URL').length,
    skipped: allResults.filter((r) => r.error === 'Skipped: not a Google Drive URL').length,
    results: allResults,
  };

  return summary;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  logger.info('Starting Google Drive → Supabase Storage migration...');

  try {
    const summary = await runMigration();

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    logger.info('\n=== MIGRATION SUMMARY ===');
    logger.info(`Total fields processed: ${summary.total}`);
    logger.info(`Succeeded: ${summary.succeeded}`);
    logger.info(`Failed: ${summary.failed}`);
    logger.info(`Skipped (non-Drive): ${summary.skipped}`);
    logger.info(`Duration: ${duration} minutes`);

    // Write failure report
    const failures = summary.results.filter((r) => !r.success && r.error !== 'Skipped: not a Google Drive URL');
    if (failures.length > 0) {
      const reportPath = resolve(repoRoot, `migration-failures-${Date.now()}.json`);
      const fs = await import('node:fs/promises');
      await fs.writeFile(reportPath, JSON.stringify(failures, null, 2));
      logger.info(`Failure report written to: ${reportPath}`);
    }

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exitCode = 1;
  }
}

main();