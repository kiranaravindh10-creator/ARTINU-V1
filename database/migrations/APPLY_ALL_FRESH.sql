-- ============================================================================
-- ARTINU — complete database bootstrap for a FRESH, EMPTY Supabase project.
--
-- Generated convenience file: it is the base schema followed by every migration
-- in order. The individual files remain the source of truth; this exists so a
-- new project can be created in a single paste.
--
--   Supabase Dashboard → SQL Editor → New query → paste all of this → Run
--
-- Every statement is `if not exists` / `add column if not exists`, so running
-- it twice is harmless. Nothing here drops a table or a column.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/schema.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Curate — PostgreSQL schema (Supabase)
--
-- Only needed when DATA_DRIVER=supabase. With the default memory driver the
-- API seeds itself and this file is not used.
--
-- Column names are snake_case here and camelCase in the TypeScript types;
-- SupabaseTable (server/src/database/table.ts) converts between them at the
-- top level, which is why nested jsonb payloads keep their original casing.
--
--   psql "$SUPABASE_DB_URL" -f database/schema.sql
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Identity ────────────────────────────────────────────────────────────────

create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  role            text not null default 'space_owner',
  status          text not null default 'pending_verification',
  email_verified  boolean not null default false,
  password_hash   text not null,
  phone           text,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create index if not exists users_role_idx on users (role);
create index if not exists users_status_idx on users (status);

create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  full_name    text not null,
  display_name text,
  phone        text,
  date_of_birth date,
  avatar_url   text,
  cover_url    text,
  city         text,
  country      text,
  bio          text,
  website      text,
  instagram    text,
genres       jsonb not null default '[]'::jsonb,
  photographer_code text,
  next_photo_number integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists profiles_user_idx on profiles (user_id);
-- Existing deployments may predate artist cover images.
alter table profiles add column if not exists cover_url text;
-- Existing deployments may predate the Photo ID system.
alter table profiles add column if not exists photographer_code text;
alter table profiles add column if not exists next_photo_number integer not null default 1;
-- Photographer codes are permanent and never reassigned: enforce globally.
create unique index if not exists profiles_photographer_code_key
  on profiles (photographer_code) where photographer_code is not null;

-- ── Spaces ──────────────────────────────────────────────────────────────────

create table if not exists spaces (
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid not null references users (id) on delete cascade,
  name                      text not null,
  type                      text not null,
  theme                     text,
  cuisine                   text,
  wall_color                text,
  lighting                  text,
  address_line1             text not null default '',
  address_line2             text,
  city                      text not null,
  state                     text,
  pin                       text,
  contact_name              text not null,
  contact_phone             text not null,
  contact_email             text not null,
  wall_count                integer,
  image_urls                jsonb not null default '[]'::jsonb,
  rotation_interval_months  integer not null default 3,
  verified                  boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists spaces_owner_idx on spaces (owner_id);
create index if not exists spaces_city_idx on spaces (city);

-- ── Artworks ────────────────────────────────────────────────────────────────

create table if not exists artworks (
  id             uuid primary key default gen_random_uuid(),
  artist_id      uuid not null references users (id) on delete cascade,
  title          text not null,
  description    text,
  story          text,
  category       text not null,
  mood           jsonb not null default '[]'::jsonb,
  colors         jsonb not null default '[]'::jsonb,
  suitable_for   jsonb not null default '[]'::jsonb,
  tags           jsonb not null default '[]'::jsonb,
  image_url      text not null,
  thumbnail_url  text not null,
  original_url   text,
  orientation    text not null,
  width          integer not null,
  height         integer not null,
  dominant_color text,
  location       text,
  captured_at    timestamptz,
  photo_id       text,
  photo_number   integer,
  status         text not null default 'pending_review',
  validation     jsonb not null default '[]'::jsonb,
  review_note    text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  views          integer not null default 0,
  likes          integer not null default 0,
  selections     integer not null default 0,
  price_from     numeric(12,2) not null default 0,
  featured       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists artworks_artist_idx on artworks (artist_id);
create index if not exists artworks_status_idx on artworks (status);
create index if not exists artworks_category_idx on artworks (category);
-- Existing deployments may predate the Photo ID system.
alter table artworks add column if not exists photo_id text;
alter table artworks add column if not exists photo_number integer;
-- The Photo ID is the final authority on uniqueness, even under concurrency.
create unique index if not exists artworks_photo_id_key
  on artworks (photo_id) where photo_id is not null;
-- Gallery sorts by recency and popularity, so index both paths.
create index if not exists artworks_created_idx on artworks (created_at desc);
create index if not exists artworks_popular_idx on artworks (selections desc, likes desc);

-- ── Orders, payments, invoices ──────────────────────────────────────────────

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  space_id        uuid not null references spaces (id) on delete restrict,
  owner_id        uuid not null references users (id) on delete restrict,
  items           jsonb not null default '[]'::jsonb,
  pricing         jsonb not null,
  status          text not null default 'pending_payment',
  timeline        jsonb not null default '[]'::jsonb,
  payment_id      uuid,
  invoice_id      uuid,
  installation_id uuid,
  notes           text,
  placed_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists orders_owner_idx on orders (owner_id);
create index if not exists orders_space_idx on orders (space_id);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_placed_idx on orders (placed_at desc);

create table if not exists payments (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders (id) on delete cascade,
  provider          text not null default 'mock_qr',
  amount            numeric(12,2) not null,
  currency          text not null default 'INR',
  status            text not null default 'created',
  qr_payload        text,
  qr_image_data_url text,
  reference         text not null,
  expires_at        timestamptz,
  attempts          integer not null default 0,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists payments_order_idx on payments (order_id);
create index if not exists payments_status_idx on payments (status);

create table if not exists invoices (
  id        uuid primary key default gen_random_uuid(),
  number    text not null unique,
  order_id  uuid not null references orders (id) on delete cascade,
  space_id  uuid not null references spaces (id) on delete restrict,
  owner_id  uuid not null references users (id) on delete restrict,
  amount    numeric(12,2) not null,
  gst       numeric(12,2) not null default 0,
  issued_at timestamptz not null default now(),
  pdf_url   text
);

create index if not exists invoices_owner_idx on invoices (owner_id);

-- ── Fulfilment ──────────────────────────────────────────────────────────────

create table if not exists installations (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders (id) on delete cascade,
  space_id      uuid not null references spaces (id) on delete cascade,
  scheduled_for timestamptz not null,
  installation_window text,
  status        text not null default 'scheduled',
  technician    text,
  notes         text,
  completed_at  timestamptz
);

create index if not exists installations_space_idx on installations (space_id);

create table if not exists rotations (
  id                   uuid primary key default gen_random_uuid(),
  space_id             uuid not null references spaces (id) on delete cascade,
  cycle_number         integer not null default 1,
  current_artwork_ids  jsonb not null default '[]'::jsonb,
  proposed_artwork_ids jsonb not null default '[]'::jsonb,
  status               text not null default 'active',
  due_at               timestamptz not null,
  approved_at          timestamptz,
  installed_at         timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists rotations_space_idx on rotations (space_id);
create index if not exists rotations_due_idx on rotations (due_at);

-- ── Engagement ──────────────────────────────────────────────────────────────

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  link       text,
  read       boolean not null default false,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- The unread badge is the hottest query in the product.
create index if not exists notifications_unread_idx
  on notifications (user_id, read, archived, created_at desc);

create table if not exists payouts (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references users (id) on delete cascade,
  order_id     uuid references orders (id) on delete set null,
  amount       numeric(12,2) not null,
  status       text not null default 'pending',
  period_label text not null,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists payouts_artist_idx on payouts (artist_id, status);

create table if not exists wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  artwork_id uuid not null references artworks (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, artwork_id)
);

create table if not exists follows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  artist_id  uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, artist_id)
);

-- ── Inbound ─────────────────────────────────────────────────────────────────

create table if not exists support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  subject    text not null,
  message    text not null,
  category   text not null default 'other',
  status     text not null default 'open',
  reply      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consultations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text not null,
  phone           text not null,
  space_type      text not null,
  location        text not null,
  message         text,
  mode            text not null default 'video',
  preferred_date  text not null,
  preferred_slot  text not null,
  status          text not null default 'new',
  created_at      timestamptz not null default now()
);

create index if not exists consultations_date_idx on consultations (preferred_date);

-- One consultation resource means one booking per slot, enforced here rather
-- than only in the route: two requests can both read "free" before either one
-- inserts. Cancelled bookings are excluded so a cancelled slot reopens.
create unique index if not exists consultations_slot_key
  on consultations (preferred_date, preferred_slot)
  where status <> 'cancelled';

create table if not exists applications (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text not null,
  location       text not null,
  website        text,
  instagram      text,
  journey        text not null,
  genres         jsonb not null default '[]'::jsonb,
  goals          text,
  referral       text,
  portfolio_urls jsonb not null default '[]'::jsonb,
  status         text not null default 'submitted',
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists applications_status_idx on applications (status);

-- ── Auth support & audit ────────────────────────────────────────────────────

create table if not exists otp_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  code       text not null,
  sent_to    text not null,
  channel    text not null default 'email',
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token      text not null unique,
  purpose    text not null,
  expires_at timestamptz not null,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users (id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  meta        jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_created_idx on audit_logs (created_at desc);

-- ── Row level security ──────────────────────────────────────────────────────
-- The API talks to Postgres with the service-role key and performs its own
-- authorisation, so RLS is enabled with no permissive policies: nothing can be
-- read with the anon key even if it leaks. Add policies only if you later let
-- the browser query Supabase directly.

alter table users            enable row level security;
alter table profiles         enable row level security;
alter table spaces           enable row level security;
alter table artworks         enable row level security;
alter table orders           enable row level security;
alter table payments         enable row level security;
alter table invoices         enable row level security;
alter table installations    enable row level security;
alter table rotations        enable row level security;
alter table notifications    enable row level security;
alter table payouts          enable row level security;
alter table wishlists        enable row level security;
alter table follows          enable row level security;
alter table support_tickets  enable row level security;
alter table consultations    enable row level security;
alter table applications     enable row level security;
alter table otp_challenges   enable row level security;
alter table tokens           enable row level security;
alter table audit_logs       enable row level security;

-- ── Photo ID allocation ──────────────────────────────────────────────────────
-- Atomically reserves the next sequential Photo ID for an artist. The row is
-- locked (SELECT … FOR UPDATE) inside a single transaction, so concurrent
-- uploads — even from different server instances — can never receive the same
-- number. Callers invoke it via `supabase.rpc('artinu_allocate_photo_id', …)`.

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

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/002_photo_id_system.sql
-- ═══════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/003_sync_live_schema.sql
-- ═══════════════════════════════════════════════════════════════════════

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
  website_url text,
  "order"     integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/004_operations.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- ARTINU — operational tables: error logging, employees, frame inventory
--
-- Everything the remaining brief items need, in one file so it is one paste
-- into the Supabase SQL editor. Safe to re-run.
--
--   §31/32  employees  — staff accounts + generated company email
--   §36     error_logs — centralised error capture with retry/resolution state
--   §39     frames     — physical frame inventory and reallocation tracking
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── §36 Error logging ───────────────────────────────────────────────────────
-- Errors worth acting on. Deliberately not the audit log: audit entries record
-- what a person deliberately did, these record what went wrong on its own.

create table if not exists error_logs (
  id            uuid primary key default gen_random_uuid(),
  -- 'api' | 'auth' | 'database' | 'upload' | 'booking' | 'email' | 'job' | 'client'
  source        text not null,
  severity      text not null default 'error',   -- info | warning | error | critical
  message       text not null,
  stack         text,
  route         text,
  operation     text,
  user_id       uuid references users (id) on delete set null,
  request_id    text,
  -- Arbitrary structured context; never put credentials in here.
  meta          jsonb not null default '{}'::jsonb,
  -- Auto-recovery bookkeeping.
  retry_count   integer not null default 0,
  recovered     boolean not null default false,
  resolution    text not null default 'open',    -- open | auto_recovered | resolved | ignored
  resolved_at   timestamptz,
  resolved_by   uuid references users (id) on delete set null,
  -- Identical errors are folded together rather than flooding the dashboard.
  fingerprint   text,
  occurrences   integer not null default 1,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists error_logs_open_idx      on error_logs (resolution, severity, last_seen_at desc);
create index if not exists error_logs_created_idx   on error_logs (created_at desc);
create unique index if not exists error_logs_fingerprint_key
  on error_logs (fingerprint) where fingerprint is not null and resolution = 'open';

-- ── §31/32 Employees ────────────────────────────────────────────────────────
-- An employee is a `users` row (so authentication and RBAC are unchanged) plus
-- the employment record below. Splitting it this way means no new login path.

create table if not exists employees (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  -- Human-readable staff code, e.g. ARTINU-0007.
  employee_code  text not null,
  full_name      text not null,
  -- The generated official address, e.g. firstname.lastname@artinu.in
  company_email  text not null,
  personal_email text,
  phone          text,
  job_title      text not null,
  department     text,
  -- Mirrors users.role; kept here so the employment record is self-describing.
  role           text not null,
  -- Extra grants beyond the role's defaults.
  permissions    jsonb not null default '[]'::jsonb,
  status         text not null default 'active',  -- active | suspended | offboarded
  invited_at     timestamptz,
  onboarded_at   timestamptz,
  offboarded_at  timestamptz,
  created_by     uuid references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists employees_user_key          on employees (user_id);
create unique index if not exists employees_code_key          on employees (employee_code);
create unique index if not exists employees_company_email_key on employees (lower(company_email));
create index        if not exists employees_status_idx        on employees (status, department);

-- ── §39 Frame inventory and smart reallocation ──────────────────────────────
-- The point of this table: when a café cancels, its frames must become visibly
-- available so the next installation reuses them instead of triggering a
-- purchase. Everything below exists to answer "what can I move, and from where".

create table if not exists frames (
  id               uuid primary key default gen_random_uuid(),
  -- Human-readable asset tag, e.g. FRM-000042.
  frame_code       text not null,
  -- Matches the FRAME_SIZES / FRAME_MATERIALS catalogue in shared/constants.
  size             text not null,
  material         text not null,
  color            text not null,
  glass            text not null default 'normal',
  condition        text not null default 'good',     -- good | fair | damaged | retired
  -- available = in the store room and reusable right now.
  status           text not null default 'available',
  -- available | reserved | installed | in_transit | maintenance | retired
  space_id         uuid references spaces (id) on delete set null,
  installation_id  uuid references installations (id) on delete set null,
  order_id         uuid references orders (id) on delete set null,
  artwork_id       uuid references artworks (id) on delete set null,
  installed_at     timestamptz,
  removed_at       timestamptz,
  -- How many times this frame has been moved to a new space; a reuse counter
  -- is the cheapest possible proof that procurement was avoided.
  times_reused     integer not null default 0,
  purchase_cost    numeric(10, 2),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists frames_code_key      on frames (frame_code);
create index if not exists frames_status_idx           on frames (status, size, material);
create index if not exists frames_space_idx            on frames (space_id) where space_id is not null;

-- Movement history, so "where has this frame been" is answerable and a
-- reallocation can be audited after the fact.
create table if not exists frame_movements (
  id           uuid primary key default gen_random_uuid(),
  frame_id     uuid not null references frames (id) on delete cascade,
  from_space   uuid references spaces (id) on delete set null,
  to_space     uuid references spaces (id) on delete set null,
  from_status  text,
  to_status    text not null,
  reason       text,                                  -- installed | cancelled | reallocated | maintenance
  moved_by     uuid references users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists frame_movements_frame_idx on frame_movements (frame_id, created_at desc);

-- ── Reload the PostgREST schema cache ───────────────────────────────────────
notify pgrst, 'reload schema';

-- ── Verification ────────────────────────────────────────────────────────────
select 'table ' || t as item,
       case when exists (select 1 from information_schema.tables
                          where table_schema = 'public' and table_name = t)
            then 'ok' else 'MISSING' end as state
  from unnest(array['error_logs','employees','frames','frame_movements']) as t;

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/005_indexes.sql
-- ═══════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/006_space_codes.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- ARTINU — space codes and first-sign-in password change (requirements §1)
--
-- The brief is that a space owner should not have to invent credentials: the
-- system issues them an ID and a password when their space is registered.
--
--   · spaces.code            the issued ID, e.g. SPC-0001. Permanent, unique,
--                            printed on paperwork and quoted in support.
--   · users.must_change_password  set when we generated the password rather
--                            than the person choosing it, so the first sign-in
--                            forces a replacement. A password ARTINU chose is
--                            a password ARTINU has seen; it is a hand-over
--                            credential, not a long-lived one.
--
-- Safe to re-run.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

alter table spaces add column if not exists code text;

alter table users add column if not exists must_change_password boolean not null default false;

-- Partial, so the rows that predate this column do not all collide on null.
create unique index if not exists spaces_code_key
  on spaces (code) where code is not null;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Existing spaces get codes in registration order, so the oldest café is
-- SPC-0001. Numbering continues from the highest code already present, which
-- makes this idempotent: a second run finds nothing left to number.

do $$
declare
  row_space record;
  next_number integer;
begin
  select coalesce(max((regexp_replace(code, '^SPC-', ''))::integer), 0) + 1
    into next_number
    from spaces
   where code ~ '^SPC-\d+$';

  for row_space in
    select id from spaces where code is null order by created_at, id
  loop
    begin
      update spaces
         set code = 'SPC-' || lpad(next_number::text, 4, '0')
       where id = row_space.id;
      next_number := next_number + 1;
    exception when unique_violation then
      -- Someone else took that number between the read and the write; skip it
      -- and let the next pass pick this row up rather than aborting the batch.
      next_number := next_number + 1;
    end;
  end loop;
end $$;

-- PostgREST caches the table shape; without this the new columns 400 until the
-- next restart.
notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/007_consultation_slot_lock.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- ARTINU — one consultation slot, one booking (requirements §5)
--
-- ARTINU has a single person taking consultations, so a date + time slot is a
-- global resource: once it is booked it is gone for every space type, every
-- mode and every visitor.
--
-- The API already refused a slot it could see was taken, but it did so by
-- reading availability and then inserting — two round trips with a gap between
-- them. Under the memory driver that gap is a microtask and nothing can
-- interleave, which is why this never showed up in development. Against
-- Postgres each step is a real network hop, so two visitors who press "Confirm"
-- within the same few hundred milliseconds both read "10:00 AM is free" before
-- either row lands, and both are told they are booked. One of them is turned
-- away on the day, and nothing in the data says which.
--
-- Application code cannot close that window on its own. This index can: the
-- second insert fails, and the route turns that failure into the same 409 the
-- slow path already returns.
--
-- Cancelled bookings are excluded from the index so a cancelled slot genuinely
-- reopens (requirements §5, "cancellations reopen slots") rather than blocking
-- its own time forever.
--
-- Safe to re-run.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

-- ── 1. Clear any double bookings already in the table ───────────────────────
-- A unique index cannot be built over existing duplicates. Where a slot was
-- booked more than once, the earliest request keeps it — it was made first and
-- is the one the visitor was most likely told about — and the rest are marked
-- cancelled rather than deleted, so the people involved can still be contacted.

with ranked as (
  select
    id,
    row_number() over (
      partition by preferred_date, preferred_slot
      order by created_at asc, id asc
    ) as position
  from consultations
  where status <> 'cancelled'
)
update consultations
   set status = 'cancelled'
 where id in (select id from ranked where position > 1);

-- ── 2. Enforce it from here on ──────────────────────────────────────────────

create unique index if not exists consultations_slot_key
  on consultations (preferred_date, preferred_slot)
  where status <> 'cancelled';

-- ── 3. Verify ───────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where tablename = 'consultations'
       and indexname = 'consultations_slot_key'
  ) then
    raise exception 'consultations_slot_key was not created';
  end if;

  raise notice 'Consultation slots are now unique per date + time.';
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/008_rls_on_operational_tables.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ============================================================================
-- ARTINU — close the RLS gap on the operational tables (requirements §44)
--
-- `database/schema.sql` enables row level security on all nineteen tables it
-- creates, with no policies attached. That is deliberate and correct for this
-- architecture: every read and write goes through the Express API using the
-- service-role key, which bypasses RLS. RLS-on-with-no-policies therefore means
-- "the browser gets nothing directly", which is exactly the intent.
--
-- The nine tables added later — five in 003, four in 004 — never got the same
-- treatment. They were created without RLS, which in PostgREST means anyone
-- holding the anon key can read and write them directly.
--
-- The anon key is not a secret. It ships in the browser bundle as
-- VITE_SUPABASE_ANON_KEY, so it is readable by anyone who opens devtools. Left
-- as-is, that exposes:
--
--   · employees        staff names, company emails, roles, employment status
--   · error_logs       stack traces and operational context
--   · frames,
--     frame_movements  physical inventory and where every frame is installed
--   · ui_content,
--     hero_slides,
--     featured_collections,
--     cafes,
--     collaboration_slides
--                      homepage content — writable, so defaceable
--
-- Enabling RLS with no policies denies anon and authenticated outright while
-- leaving the service-role key (and therefore the whole application) working
-- exactly as before. Nothing in the app talks to these tables from the browser.
--
-- NOT destructive: no data is read, changed or removed. Safe to re-run.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

alter table ui_content            enable row level security;
alter table hero_slides           enable row level security;
alter table featured_collections  enable row level security;
alter table cafes                 enable row level security;
alter table collaboration_slides  enable row level security;
alter table error_logs            enable row level security;
alter table employees             enable row level security;
alter table frames                enable row level security;
alter table frame_movements       enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
-- SOURCE: database/migrations/009_registration_and_collaborations.sql
-- ═══════════════════════════════════════════════════════════════════════

alter table profiles add column if not exists date_of_birth date;
alter table cafes    add column if not exists website_url text;


-- ── Verify ──────────────────────────────────────────────────────────────────

do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into unprotected
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity = false;

  if unprotected is not null then
    raise exception 'Tables still without row level security: %', unprotected;
  end if;

  raise notice 'Row level security is enabled on every public table.';
end $$;
