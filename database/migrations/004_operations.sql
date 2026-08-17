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
