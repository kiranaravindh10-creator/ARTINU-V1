-- ============================================================================
-- ARTINU — bring a live Supabase project up to the current code's schema
--
-- WHY THIS EXISTS
-- The deployed project was created from an older `schema.sql`. The code has
-- since gained the Photo ID system and the manager-controlled content tables,
-- and neither was ever applied. The symptoms that traces back to:
--
--   · "Register as an artist" hangs ~90s, then fails — and the account is
--     half-created, so every retry returns "account already exists".
--     Cause: profiles.photographer_code does not exist, so the code-allocation
--     loop fails on all 300 candidates before giving up.
--   · "Upload Work" publish fails for the same reason (same allocation path)
--     plus the missing artworks.photo_id column.
--   · The manager cannot control the homepage collaboration / featured-artist
--     carousels: the API is built, but ui_content, hero_slides,
--     featured_collections, cafes and collaboration_slides do not exist.
--   · The artist profile has no backdrop image: profiles.cover_url is missing.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── 1. Profiles: artist backdrop + Photo ID system ──────────────────────────

alter table profiles add column if not exists cover_url text;
alter table profiles add column if not exists photographer_code text;
alter table profiles add column if not exists next_photo_number integer not null default 1;

-- Photographer codes are permanent and never reassigned, so uniqueness is
-- enforced by the database rather than by the application loop.
create unique index if not exists profiles_photographer_code_key
  on profiles (photographer_code) where photographer_code is not null;

-- ── 2. Artworks: Photo ID ───────────────────────────────────────────────────

alter table artworks add column if not exists photo_id text;
alter table artworks add column if not exists photo_number integer;

create unique index if not exists artworks_photo_id_key
  on artworks (photo_id) where photo_id is not null;

-- ── 3. Atomic Photo ID allocation ───────────────────────────────────────────
-- Locks the artist's profile row inside one transaction so two concurrent
-- uploads can never be handed the same sequential number.

create or replace function artinu_allocate_photo_id(p_artist_id uuid)
returns text
language plpgsql
as $$
declare
  v_code     text;
  v_next     integer;
  v_photo_id text;
begin
  select photographer_code, coalesce(next_photo_number, 1)
    into v_code, v_next
    from profiles
   where user_id = p_artist_id
   for update;

  if v_code is null then
    raise exception 'no photographer code for artist %', p_artist_id;
  end if;

  v_photo_id := v_code || lpad(v_next::text, 3, '0');

  update profiles
     set next_photo_number = v_next + 1
   where user_id = p_artist_id;

  return v_photo_id;
end;
$$;

-- ── 4. Manager-controlled content ───────────────────────────────────────────
-- These back the carousels the manager/IT console edits. Column names are
-- snake_case here and camelCase in TypeScript; SupabaseTable converts at the
-- top level (server/src/database/table.ts).

-- Generic key/value UI content ("homepage_hero", "featured_artists", …).
-- The id is a caller-supplied slug, not a uuid.
create table if not exists ui_content (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- `photographer_id` is deliberately NOT a foreign key. The console takes it as
-- a hand-typed field, so a typo would surface as an opaque 500 rather than a
-- validation message, and nothing server-side joins on it.
create table if not exists hero_slides (
  id              uuid primary key default gen_random_uuid(),
  image_url       text not null,
  photographer_id uuid,
  "order"         integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists hero_slides_active_order_idx
  on hero_slides (is_active, "order");

create table if not exists featured_collections (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  "order"       integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists featured_collections_active_order_idx
  on featured_collections (is_active, "order");

-- The collaborated cafés/restaurants shown on the homepage carousel and
-- mirrored into the artist / art-phile dashboards.
create table if not exists cafes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  photo_url   text not null,
  description text not null default '',
  -- Where the homepage card links to. Entered by a manager; never guessed.
  website_url text,
  "order"     integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table cafes add column if not exists website_url text;

create index if not exists cafes_active_order_idx on cafes (is_active, "order");

-- Same reasoning as hero_slides: no foreign key on a hand-entered field.
create table if not exists collaboration_slides (
  id              uuid primary key default gen_random_uuid(),
  image_url       text not null,
  photographer_id uuid,
  "order"         integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists collaboration_slides_active_order_idx
  on collaboration_slides (is_active, "order");

-- ── 5. Backfill photographer codes for existing artists ─────────────────────
-- Every artist who registered before this migration has no code. Derive one
-- from the display name (or full name) the same way the application does:
-- word initials first, padded from the remaining letters, then 'X'.
-- Collisions are resolved by appending the row number, so this is safe to run
-- on a project that already has artists.

-- One artist at a time, walking the same variant ladder the application uses
-- (KIR → KIA, KIB … → KAR, KBR …). Each attempt is its own subtransaction, so a
-- collision is caught and retried rather than aborting the whole migration.
-- An artist who somehow exhausts the ladder is simply left without a code; the
-- application assigns one on their next upload.

do $$
declare
  r           record;
  v_base      text;
  v_candidate text;
  v_letters   text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  i           integer;
  v_done      boolean;
begin
  for r in
    select p.id,
           coalesce(nullif(trim(p.display_name), ''), p.full_name) as nm
      from profiles p
      join users u on u.id = p.user_id
     where p.photographer_code is null
       and u.role = 'artist'
     order by p.id
  loop
    v_base := upper(
      rpad(
        substr(
          coalesce(nullif(regexp_replace(r.nm, '[^A-Za-z]', '', 'g'), ''), 'XXX'),
          1, 3
        ),
        3, 'X'
      )
    );

    v_done := false;

    for i in 0..52 loop
      if i = 0 then
        v_candidate := v_base;                                              -- KIR
      elsif i <= 26 then
        v_candidate := substr(v_base, 1, 2) || substr(v_letters, i, 1);     -- KIA…KIZ
      else
        v_candidate := substr(v_base, 1, 1)
                    || substr(v_letters, i - 26, 1)
                    || substr(v_base, 3, 1);                                -- KAR…KZR
      end if;

      begin
        update profiles set photographer_code = v_candidate where id = r.id;
        v_done := true;
        exit;
      exception when unique_violation then
        null;  -- already taken, try the next variant
      end;
    end loop;

    if not v_done then
      raise notice 'No photographer code available for profile % — the app will assign one later.', r.id;
    end if;
  end loop;
end $$;

-- ── 6. Reload the PostgREST schema cache ────────────────────────────────────
-- Supabase serves the REST API through PostgREST, which keeps its own cached
-- copy of the schema. Until it reloads, brand-new tables and columns still come
-- back as "Could not find the table … in the schema cache" even though the DDL
-- above succeeded. Supabase usually reloads on its own; this makes it immediate.

notify pgrst, 'reload schema';

-- ── 7. Verification ─────────────────────────────────────────────────────────
-- Run this after the migration; every row should report 'ok'.

select 'profiles.cover_url'         as item,
       case when exists (select 1 from information_schema.columns
                          where table_name = 'profiles' and column_name = 'cover_url')
            then 'ok' else 'MISSING' end as state
union all
select 'profiles.photographer_code',
       case when exists (select 1 from information_schema.columns
                          where table_name = 'profiles' and column_name = 'photographer_code')
            then 'ok' else 'MISSING' end
union all
select 'artworks.photo_id',
       case when exists (select 1 from information_schema.columns
                          where table_name = 'artworks' and column_name = 'photo_id')
            then 'ok' else 'MISSING' end
union all
select 'fn artinu_allocate_photo_id',
       case when exists (select 1 from pg_proc where proname = 'artinu_allocate_photo_id')
            then 'ok' else 'MISSING' end
union all
select 'table ' || t,
       case when exists (select 1 from information_schema.tables
                          where table_schema = 'public' and table_name = t)
            then 'ok' else 'MISSING' end
  from unnest(array['ui_content','hero_slides','featured_collections','cafes','collaboration_slides']) as t;
