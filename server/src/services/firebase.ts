import { logger } from '@/utils/logger';

/**
 * Firebase is no longer used as a backend driver.
 * All Firebase references have been migrated to Supabase.
 * 
 * This file exists only to prevent import breakage.
 * Imports should use @artinu/server services instead.
 */

export const isFirebaseConfigured = false;

/** No-op replacement for initializeFirebase. */
export function initializeFirebase(): void {
  logger.info('Firebase initialization skipped — using Supabase instead.');
}

/** No-op replacement for getFirebaseFirestore. */
export function getFirebaseFirestore() {
  throw new Error('Firebase Firestore is no longer used. Use Supabase PostgreSQL instead.');
}

/** No-op replacement for getFirebaseStorage. */
export function getFirebaseStorage() {
  throw new Error('Firebase Storage is no longer used. Use Supabase Storage instead.');
}

/** No-op replacement for getFirebaseBucket. */
export function getFirebaseBucket() {
  throw new Error('Firebase Storage is no longer used. Use Supabase Storage instead.');
}

/** No-op replacement for isFirebaseConfigured. */
export function isFirebaseConfiguredCheck(): boolean {
  return false;
}