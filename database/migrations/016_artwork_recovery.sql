-- ============================================================================
-- ARTINU — photographers can delete their own work, and recover it for 17 days
--
-- Three additive, nullable columns. Every existing row stays valid, nothing is
-- read, rewritten or deleted, and nothing that runs today starts failing.
--
--   artworks.deleted_at           when the photographer deleted it. The 17-day
--                                 window is counted from this exact timestamp.
--   artworks.deleted_by           the account that deleted it (always the
--                                 photographer; kept for the audit trail).
--   artworks.deleted_from_status  the status a recovery restores, so a
--                                 photograph that was archived by a moderator
--                                 comes back archived, not published.
--
-- `status` is plain text, so the new 'deleted' value needs no change to the
-- column itself. While status = 'deleted' the photograph is out of every public
-- listing, because every public read already asks for status = 'approved'.
--
-- ── Running it ─────────────────────────────────────────────────────────────
--
--   Supabase Dashboard → SQL Editor → paste → Run
--   (or: psql "$SUPABASE_DB_URL" -f database/migrations/016_artwork_recovery.sql)
--
-- Run it BEFORE deploying the code that uses it. Until it has run, deleting a
-- photograph fails with an error and changes nothing; every other part of the
-- site is unaffected. `npm run check:schema` reports the three columns.
--
-- Safe to re-run.
-- ============================================================================

alter table artworks add column if not exists deleted_at timestamptz;
alter table artworks add column if not exists deleted_by text;
alter table artworks add column if not exists deleted_from_status text;

-- The nightly purge asks one question of this table: which deleted photographs
-- have run out of time. A partial index keeps that to the handful of rows it
-- is actually about.
create index if not exists artworks_deleted_at_idx
  on artworks (deleted_at)
  where status = 'deleted';
