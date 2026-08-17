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
