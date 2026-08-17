-- ============================================================================
-- ARTINU — index coverage for the hot read paths (requirements §45)
--
-- Two kinds of statement here:
--
--  1. Indexes that exist in the current `database/schema.sql` but may be absent
--     from a project created off an older copy of it. `if not exists` makes
--     re-declaring them free.
--  2. Genuinely missing ones — `follows` and `wishlists` carry no index at all
--     today, and both are read on every artist profile and gallery card.
--
-- Safe to re-run. `create index` briefly locks writes on the table; these are
-- small tables, but run it outside peak hours if you would rather not risk it.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

-- ── Follows ─────────────────────────────────────────────────────────────────
-- Read twice per artist profile (follower count, and "am I following?"), and
-- once per gallery card. Without these both are sequential scans.

create index if not exists follows_artist_idx on follows (artist_id);
create index if not exists follows_user_idx   on follows (user_id);

-- A unique index cannot be created over existing duplicates, so clear them
-- first, oldest row winning. Duplicates here are exactly the double-click bug
-- the index then prevents, so removing them is the repair, not data loss.
delete from follows a
 using follows b
 where a.user_id = b.user_id
   and a.artist_id = b.artist_id
   and a.ctid > b.ctid;

-- One row per (viewer, artist): makes the "already following?" lookup a single
-- index probe, and stops a double-click creating two follow rows — which would
-- inflate a follower count that the brief insists must be real.
create unique index if not exists follows_user_artist_key on follows (user_id, artist_id);

-- ── Wishlists ───────────────────────────────────────────────────────────────

create index if not exists wishlists_user_idx    on wishlists (user_id);
create index if not exists wishlists_artwork_idx on wishlists (artwork_id);

delete from wishlists a
 using wishlists b
 where a.user_id = b.user_id
   and a.artwork_id = b.artwork_id
   and a.ctid > b.ctid;

-- Same reasoning as follows: the wishlist toggle reads then writes, so without
-- this a fast double-tap can leave two rows and a like count that never
-- returns to zero.
create unique index if not exists wishlists_user_artwork_key on wishlists (user_id, artwork_id);

-- ── Artworks ────────────────────────────────────────────────────────────────
-- The gallery's actual query is "approved, newest first", and the artist's own
-- portfolio is "mine, newest first". Composite indexes serve both orderings
-- directly rather than sorting a filtered scan.

create index if not exists artworks_status_created_idx on artworks (status, created_at desc);
create index if not exists artworks_artist_created_idx on artworks (artist_id, created_at desc);

-- Re-declared from schema.sql in case this project predates them.
create index if not exists artworks_artist_idx   on artworks (artist_id);
create index if not exists artworks_status_idx   on artworks (status);
create index if not exists artworks_category_idx on artworks (category);
create index if not exists artworks_created_idx  on artworks (created_at desc);

-- ── Consultations ───────────────────────────────────────────────────────────
-- Availability reads every consultation for one date on each calendar click.

create index if not exists consultations_date_idx        on consultations (preferred_date);
create index if not exists consultations_date_status_idx on consultations (preferred_date, status);

-- ── Notifications ───────────────────────────────────────────────────────────

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

-- ── Profiles ────────────────────────────────────────────────────────────────
-- profileFor() runs on nearly every authenticated request.

create index if not exists profiles_user_idx on profiles (user_id);

-- ── Reload the PostgREST schema cache ───────────────────────────────────────
notify pgrst, 'reload schema';

-- ── Verification ────────────────────────────────────────────────────────────
-- Every row should report 'ok'.

select i as item,
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and indexname = i)
            then 'ok' else 'MISSING' end as state
  from unnest(array[
    'follows_artist_idx',
    'follows_user_idx',
    'follows_user_artist_key',
    'wishlists_user_idx',
    'wishlists_user_artwork_key',
    'artworks_status_created_idx',
    'artworks_artist_created_idx',
    'consultations_date_status_idx',
    'notifications_user_created_idx'
  ]) as i;
