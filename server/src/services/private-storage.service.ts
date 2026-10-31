import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { assertWritable } from '@/database/db';
import { badRequest, notFound, serverError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Files that must never have a public URL - receipts and supplier invoices.
 *
 * Everything else ARTINU stores is public by design: a photograph exists to be
 * seen. A receipt carries a vendor's account details and what the business
 * paid for, so it lives somewhere no URL reaches, and the only way out is the
 * authorised download endpoint, which checks who is asking every time.
 *
 *   memory/local driver   <server>/private-uploads/<bucket>/…  - deliberately
 *                         outside STORAGE_LOCAL_DIR, which is served at /uploads
 *   supabase driver       a PRIVATE bucket, created private on first use
 */

export const RECEIPTS_BUCKET = 'finance-receipts';

const ACCEPTED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const MAX_BYTES = 10 * 1024 * 1024;
const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(;[^,]*)?;base64,([\s\S]+)$/i;

export interface PrivateFile {
  path: string;
  contentType: string;
  bytes: number;
}

const localRoot = () => path.resolve(env.uploadsDir, '..', 'private-uploads');

let client: SupabaseClient | null = null;
function storageClient(): SupabaseClient {
  if (!client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw serverError('Supabase storage is selected but its credentials are missing.');
    }
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Decode a receipt sent as a data URL, check it, and store it privately. */
export async function storePrivateDataUrl(dataUrl: string, bucket = RECEIPTS_BUCKET): Promise<PrivateFile> {
  assertWritable('storing a private file');
  const match = DATA_URL.exec((dataUrl ?? '').trim());
  if (!match) throw badRequest('Attach the receipt as a file - a photograph or a PDF.');

  const contentType = match[1]!.toLowerCase();
  const extension = ACCEPTED[contentType];
  if (!extension) throw badRequest('A receipt can be a JPEG, PNG, WebP or HEIC photograph, or a PDF.');

  const buffer = Buffer.from(match[3]!, 'base64');
  if (buffer.length === 0) throw badRequest('That file is empty.');
  if (buffer.length > MAX_BYTES) throw badRequest('A receipt can be up to 10 MB.');

  const name = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${extension}`;

  if (env.STORAGE_DRIVER === 'supabase') {
    const upload = () =>
      storageClient().storage.from(bucket).upload(name, buffer, { contentType, upsert: false });
    let { error } = await upload();
    if (error && /bucket not found|not found/i.test(error.message)) {
      // First receipt ever: create the bucket, private, and try once more.
      const created = await storageClient().storage.createBucket(bucket, { public: false });
      if (created.error && !/already exists/i.test(created.error.message)) {
        throw serverError(`The receipt store could not be created: ${created.error.message}`);
      }
      ({ error } = await upload());
    }
    if (error) throw serverError(`The receipt could not be stored: ${error.message}`);
  } else {
    const directory = path.join(localRoot(), bucket, path.dirname(name));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(localRoot(), bucket, name), buffer);
  }

  return { path: `${bucket}/${name}`, contentType, bytes: buffer.length };
}

/** Read a private file back for the authorised download endpoint. */
export async function readPrivateFile(storedPath: string): Promise<{ buffer: Buffer; contentType: string }> {
  const [bucket, ...rest] = (storedPath ?? '').split('/');
  const name = rest.join('/');
  if (!bucket || !name || storedPath.includes('..')) throw notFound('That file');

  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const contentType =
    Object.entries(ACCEPTED).find(([, ext]) => ext === extension)?.[0] ?? 'application/octet-stream';

  try {
    if (env.STORAGE_DRIVER === 'supabase') {
      const { data, error } = await storageClient().storage.from(bucket).download(name);
      if (error || !data) throw new Error(error?.message ?? 'missing');
      return { buffer: Buffer.from(await data.arrayBuffer()), contentType };
    }
    return { buffer: await readFile(path.join(localRoot(), bucket, name)), contentType };
  } catch (error) {
    logger.warn(`Private file ${storedPath} could not be read`, error);
    throw notFound('That file');
  }
}
