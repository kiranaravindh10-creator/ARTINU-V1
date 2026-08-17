-- ============================================================================
-- ARTINU Photo ID system (run this once in the Supabase SQL editor)
--
-- Adds the photographer-code + per-photographer counter to `profiles`, the
-- Photo ID to `artworks`, and the atomic allocation function. Safe to re-run.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

-- ── Profiles ────────────────────────────────────────────────────────────────

alter table profiles add column if not exists photographer_code text;
alter table profiles add column if not exists next_photo_number integer not null default 1;

-- Codes are permanent and never reassigned: enforce globally.
create unique index if not exists profiles_photographer_code_key
  on profiles (photographer_code) where photographer_code is not null;

-- ── Artworks ────────────────────────────────────────────────────────────────

alter table artworks add column if not exists photo_id text;
alter table artworks add column if not exists photo_number integer;

-- The Photo ID is the final authority on uniqueness, even under concurrency.
create unique index if not exists artworks_photo_id_key
  on artworks (photo_id) where photo_id is not null;

-- ── Atomic allocation ───────────────────────────────────────────────────────
-- Locks the artist's profile row inside one transaction so concurrent uploads
-- can never receive the same sequential number.

create or replace function artinu_allocate_photo_id(p_artist_id uuid)
returns text
language plpgsql
as $$
declare
  v_code text;
  v_next integer;
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
