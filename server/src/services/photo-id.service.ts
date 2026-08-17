import type { Profile, Role } from '@artinu/shared';
import { db, supabaseClient } from '@/database/db';
import { env } from '@/config/env';
import { conflict, notFound } from '@/utils/errors';
import { now } from '@/utils/ids';

/**
 * ARTINU Photo ID system.
 *
 * Format: 3 uppercase letters (photographer code, permanent) + 3 digits
 * (per-photographer sequential number, starting at 001, never reset or reused).
 * Generation is backend-only: the client never supplies a code or a Photo ID.
 *
 * Concurrency is handled per driver:
 *   · Supabase — the Postgres function `artinu_allocate_photo_id` locks the
 *     artist's profile row (SELECT … FOR UPDATE) inside one transaction, so
 *     two uploads — even from different server instances — can never receive
 *     the same number. The UNIQUE index on artworks.photo_id is the final
 *     authority and we fall back to an optimistic retry if the function has
 *     not been created on the project yet.
 *   · memory  — an in-process promise mutex serialises read-increment-write
 *     (dev-only, single process).
 */

const PHOTO_ID_PATTERN = /^[A-Z]{3}\d{3}$/;
const CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * A candidate code was taken by someone else — the only error worth retrying.
 *
 * Anything else (a missing column, a dropped connection) means the *next*
 * candidate will fail in exactly the same way, so retrying is pointless and
 * actively harmful: 300 candidates × one round trip each is roughly a minute
 * and a half of the caller hanging before it gives up. Registration awaits
 * this, so the visitor's account is left half-created and every retry then
 * collides on the email address. Fail fast and say what actually went wrong.
 */
function isCodeCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate key|23505|unique constraint/i.test(message);
}

export interface AllocatedPhotoId {
  photoId: string;
  photoNumber: number;
  photographerCode: string;
}

// ── Photographer code derivation ─────────────────────────────────────────────

/** Initials of the name (e.g. "Kiran" → "KIR"), padded to 3 letters. */
export function photographerCodeFromName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words
    .map((word) => word[0])
    .filter((char): char is string => /[A-Za-z]/.test(char ?? ''))
    .map((char) => char.toUpperCase());

  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();

  let base = '';
  for (const initial of initials) {
    if (base.length >= 3) break;
    base += initial;
  }
  if (base.length < 3) {
    for (const letter of letters) {
      if (base.length >= 3) break;
      if (!base.includes(letter)) base += letter;
    }
  }
  while (base.length < 3) base += 'X';
  return base.slice(0, 3);
}

/**
 * Candidate codes to try when the primary derivation is taken, so a collision
 * never blocks an artist and no two artists share a code.
 */
export function codeVariants(base: string, max = 300): string[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const out = [base];
  for (const c of letters) out.push(base.slice(0, 2) + c);
  for (const c of letters) out.push(base[0] + c + base[2]);
  for (const c of letters) out.push(c + base.slice(1));
  for (const a of letters) for (const b of letters) out.push(base[0] + a + b);
  return out.slice(0, max);
}

// ── Code assignment ──────────────────────────────────────────────────────────

/**
 * Ensures the profile has a permanent photographer code, assigning one from the
 * artist's name if missing. Unique in the database (final authority), with a
 * deterministic variant ladder on collision.
 */
export async function ensurePhotographerCode(profile: Profile): Promise<string> {
  if (profile.photographerCode) return profile.photographerCode;

  const body = async () => {
    const taken = new Set(
      (await db.profiles.find())
        .map((candidate) => candidate.photographerCode)
        .filter((code): code is string => Boolean(code && CODE_PATTERN.test(code))),
    );

    const source = profile.displayName?.trim() || profile.fullName;
    for (const candidate of codeVariants(photographerCodeFromName(source))) {
      if (taken.has(candidate)) continue;
      try {
        const updated = await db.profiles.update(profile.id, {
          photographerCode: candidate,
          updatedAt: now(),
        });
        return updated.photographerCode!;
      } catch (error) {
        // Someone else claimed this one — move on to the next candidate.
        if (isCodeCollision(error)) {
          taken.add(candidate);
          continue;
        }
        // Anything else is not a collision and will not fix itself on the next
        // candidate. Surface it immediately rather than looping for a minute.
        throw error;
      }
    }
    throw conflict('We could not allocate a unique photographer code. Please try again.');
  };

  // The memory driver has no DB constraint, so serialise assignments.
  return env.DATA_DRIVER === 'supabase' ? body() : withMemoryLock(body);
}

/** Assigns a photographer code when an artist account is created. */
export async function assignPhotographerCodeIfArtist(userId: string, role: Role): Promise<void> {
  if (role !== 'artist') return;
  const profile = await db.profiles.findOne({ userId });
  if (!profile) return;
  await ensurePhotographerCode(profile);
}

// ── Photo ID allocation ──────────────────────────────────────────────────────

/** Reserves the next sequential Photo ID for an artist, atomically. */
export async function allocatePhotoId(artistId: string): Promise<AllocatedPhotoId> {
  if (env.DATA_DRIVER === 'supabase') return allocateSupabase(artistId);
  return withMemoryLock(() => allocateFromCounter(artistId));
}

async function allocateSupabase(artistId: string): Promise<AllocatedPhotoId> {
  const profile = await profileFor(artistId);
  if (!profile) throw notFound('Your profile');
  const code = await ensurePhotographerCode(profile);

  const client = supabaseClient();
  if (client) {
    // Atomic: the function locks the profile row and returns the next ID.
    const { data, error } = await client.rpc('artinu_allocate_photo_id', {
      p_artist_id: artistId,
    });
    if (!error && typeof data === 'string' && PHOTO_ID_PATTERN.test(data)) {
      return { photoId: data, photoNumber: Number(data.slice(-3)), photographerCode: code };
    }
    if (!error) {
      throw conflict(`Photo ID generation failed for code ${code}.`);
    }
  }

  // Function not deployed on this project yet — optimistic retry. The unique
  // index on artworks.photo_id remains the final authority; the upload route
  // re-allocates on a collision.
  return allocateFromCounter(artistId);
}

/**
 * Reads the counter, reserves the candidate, advances the counter. Safe because
 * the caller only commits when the artwork insert succeeds and re-allocates on
 * a duplicate photo_id.
 */
async function allocateFromCounter(artistId: string): Promise<AllocatedPhotoId> {
  const profile = await profileFor(artistId);
  if (!profile) throw notFound('Your profile');
  const code = await ensurePhotographerCode(profile);
  const number = profile.nextPhotoNumber ?? 1;
  const photoId = `${code}${String(number).padStart(3, '0')}`;
  await db.profiles.update(profile.id, { nextPhotoNumber: number + 1, updatedAt: now() });
  return { photoId, photoNumber: number, photographerCode: code };
}

function profileFor(userId: string): Promise<Profile | null> {
  return db.profiles.findOne({ userId });
}

// ── In-process mutex (memory driver) ─────────────────────────────────────────

let memoryLock: Promise<unknown> = Promise.resolve();

function withMemoryLock<T>(task: () => Promise<T>): Promise<T> {
  const run = memoryLock.then(task, task);
  memoryLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}