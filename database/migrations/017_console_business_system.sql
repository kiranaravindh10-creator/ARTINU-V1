-- ============================================================================
-- ARTINU — Console business system: user administration, expenses and
-- accounting, client orders with custom pricing.
--
-- ── What it changes ─────────────────────────────────────────────────────────
--
-- Additive, with three deliberate relaxations. Nothing is read, rewritten or
-- deleted; every existing order, payment, space and account stays exactly as
-- it is, and nothing that runs today starts failing.
--
--   People & access
--     users.sessions_revoked_at   sessions issued before this are refused
--     tokens.meta                 the new address while an email change waits
--     support_sessions            audited "Assist User" sessions
--     audit_logs                  append-only from now on (trigger below)
--
--   Money
--     expense_categories          configurable; the 18 defaults are seeded
--     expenses                    with an approval workflow
--     expense_payments            partial payments and reversals
--     payments.*                  how offline money arrived, who recorded it,
--                                 structured refunds, an idempotency key
--
--   Clients and orders
--     clients                     businesses, with or without a login
--     spaces.client_id            a client's location
--     orders.client_id / created_by / created_by_email / payment_terms /
--       idempotency_key
--
--   The three relaxations: spaces.owner_id, orders.owner_id and
--   invoices.owner_id become nullable, so a business with no ARTINU account
--   can have a location, an order and an invoice. A check constraint keeps
--   every space and order attached to an owner OR a client - never neither.
--
-- ── Running it ─────────────────────────────────────────────────────────────
--
--   Supabase Dashboard → SQL Editor → paste → Run
--   (or: psql "$SUPABASE_DB_URL" -f database/migrations/017_console_business_system.sql)
--
-- Run it BEFORE deploying the code that uses it. `npm run check:schema`
-- reports the new tables and columns.
--
-- Receipts are stored in a PRIVATE Supabase Storage bucket named
-- `finance-receipts`. The API creates it (private) on first upload if it is
-- missing; creating it by hand in Storage → New bucket, with "Public bucket"
-- left OFF, is equally fine.
--
-- Safe to re-run.
-- ============================================================================

-- ── People & access ─────────────────────────────────────────────────────────

alter table users add column if not exists sessions_revoked_at timestamptz;
alter table tokens add column if not exists meta jsonb;

create table if not exists support_sessions (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid references users (id) on delete set null,
  admin_email     text not null,
  target_user_id  uuid references users (id) on delete set null,
  target_email    text not null,
  target_role     text not null,
  reason          text not null,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  ended_at        timestamptz,
  -- 'exited', 'expired' or 'revoked'
  end_reason      text,
  request_count   integer not null default 0,
  blocked_count   integer not null default 0,
  ip              text
);

create index if not exists support_sessions_target_idx on support_sessions (target_user_id, started_at desc);
create index if not exists support_sessions_admin_idx  on support_sessions (admin_id, started_at desc);

/*
  Audit records are append-only.

  Nobody - including an administrator with the service-role key in hand - may
  edit or delete an entry. The single exception is the one the schema already
  relies on: audit_logs.actor_id is ON DELETE SET NULL, so deleting an account
  clears the actor id on its entries (their email stays). That update, and
  only that one, is let through.
*/
create or replace function artinu_audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_id is null
     and old.actor_id is not null
     and new.id = old.id
     and new.action = old.action
     and new.entity = old.entity
     and new.entity_id is not distinct from old.entity_id
     and new.actor_email is not distinct from old.actor_email
     and new.meta = old.meta
     and new.ip is not distinct from old.ip
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'audit_logs is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists audit_logs_append_only on audit_logs;
create trigger audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function artinu_audit_logs_append_only();

-- ── Clients ─────────────────────────────────────────────────────────────────

create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  code            text,
  name            text not null,
  type            text not null,
  contact_name    text not null,
  email           text,
  phone           text not null,
  address_line1   text not null default '',
  address_line2   text,
  city            text not null,
  state           text,
  pin             text,
  gstin           text,
  notes           text,
  linked_user_id  uuid references users (id) on delete set null,
  linked_at       timestamptz,
  linked_by       uuid references users (id) on delete set null,
  status          text not null default 'active',
  created_by      uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint clients_status_check check (status in ('active', 'archived'))
);

create unique index if not exists clients_code_key  on clients (code) where code is not null;
create index        if not exists clients_name_idx  on clients (lower(name));
create index        if not exists clients_phone_idx on clients (phone);
create index        if not exists clients_email_idx on clients (lower(email)) where email is not null;

-- A client's location: a space with no login behind it.
alter table spaces add column if not exists client_id uuid references clients (id) on delete set null;
alter table spaces alter column owner_id drop not null;
create index if not exists spaces_client_idx on spaces (client_id) where client_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'spaces_owner_or_client_check') then
    alter table spaces
      add constraint spaces_owner_or_client_check
      check (owner_id is not null or client_id is not null);
  end if;
end $$;

-- ── Orders ──────────────────────────────────────────────────────────────────

alter table orders add column if not exists client_id        uuid references clients (id) on delete set null;
alter table orders add column if not exists created_by       uuid references users (id) on delete set null;
alter table orders add column if not exists created_by_email text;
alter table orders add column if not exists payment_terms    text;
alter table orders add column if not exists idempotency_key  text;
alter table orders alter column owner_id drop not null;

create index        if not exists orders_client_idx          on orders (client_id) where client_id is not null;
create unique index if not exists orders_idempotency_key_key on orders (idempotency_key) where idempotency_key is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_owner_or_client_check') then
    alter table orders
      add constraint orders_owner_or_client_check
      check (owner_id is not null or client_id is not null);
  end if;
end $$;

alter table invoices alter column owner_id drop not null;

-- ── Payments ────────────────────────────────────────────────────────────────

alter table payments add column if not exists method            text;
alter table payments add column if not exists paid_at           timestamptz;
alter table payments add column if not exists recorded_by       uuid references users (id) on delete set null;
alter table payments add column if not exists recorded_by_email text;
alter table payments add column if not exists notes             text;
alter table payments add column if not exists refunded_amount   numeric(12,2);
alter table payments add column if not exists refunded_at       timestamptz;
alter table payments add column if not exists idempotency_key   text;

create unique index if not exists payments_idempotency_key_key on payments (idempotency_key) where idempotency_key is not null;

-- ── Expenses ────────────────────────────────────────────────────────────────

create table if not exists expense_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  name         text not null,
  description  text,
  active       boolean not null default true,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists expense_categories_slug_key on expense_categories (slug);

insert into expense_categories (slug, name, sort_order) values
  ('transport-fuel',      'Transportation and fuel',            10),
  ('delivery-logistics',  'Delivery and logistics',             20),
  ('frame-manufacturing', 'Frame manufacturing',                30),
  ('printing',            'Printing',                           40),
  ('packaging',           'Packaging',                          50),
  ('installation',        'Installation',                       60),
  ('artist-payments',     'Artist payments and commissions',    70),
  ('salaries',            'Employee salaries',                  80),
  ('rent-utilities',      'Rent and utilities',                 90),
  ('marketing',           'Marketing and advertising',         100),
  ('software',            'Software subscriptions',            110),
  ('hosting',             'Website hosting and infrastructure', 120),
  ('travel',              'Travel and accommodation',          130),
  ('office-supplies',     'Office supplies',                   140),
  ('equipment',           'Equipment and maintenance',         150),
  ('bank-charges',        'Bank and payment gateway charges',  160),
  ('taxes',               'Taxes and statutory expenses',      170),
  ('misc',                'Miscellaneous',                     180)
on conflict (slug) do nothing;

create table if not exists expenses (
  id                    uuid primary key default gen_random_uuid(),
  number                text not null,
  title                 text not null,
  category_id           uuid not null references expense_categories (id) on delete restrict,
  amount                numeric(12,2) not null,
  expense_date          date not null,
  status                text not null default 'draft',
  -- How the money stood when it was recorded: 'unpaid', 'employee_reimbursable', 'company_paid'.
  payment_arrangement   text not null default 'unpaid',
  vendor                text,
  payment_method        text,
  transaction_reference text,
  branch                text,
  order_id              uuid references orders (id) on delete set null,
  client_id             uuid references clients (id) on delete set null,
  space_id              uuid references spaces (id) on delete set null,
  paid_by               text,
  notes                 text,
  receipt_path          text,
  receipt_name          text,
  receipt_type          text,
  created_by            uuid references users (id) on delete set null,
  created_by_email      text,
  submitted_at          timestamptz,
  approved_by           uuid references users (id) on delete set null,
  approved_by_email     text,
  approved_at           timestamptz,
  rejected_by           uuid references users (id) on delete set null,
  rejected_at           timestamptz,
  rejection_reason      text,
  cancelled_by          uuid references users (id) on delete set null,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint expenses_amount_check check (amount > 0),
  constraint expenses_payment_arrangement_check check (
    payment_arrangement in ('unpaid', 'employee_reimbursable', 'company_paid')
  ),
  constraint expenses_status_check check (
    status in ('draft', 'pending_approval', 'approved', 'rejected', 'partially_paid', 'paid', 'cancelled')
  )
);

create unique index if not exists expenses_number_key   on expenses (number);
create index        if not exists expenses_date_idx     on expenses (expense_date desc);
create index        if not exists expenses_status_idx   on expenses (status);
create index        if not exists expenses_order_idx    on expenses (order_id) where order_id is not null;
create index        if not exists expenses_category_idx on expenses (category_id);

create table if not exists expense_payments (
  id                 uuid primary key default gen_random_uuid(),
  expense_id         uuid not null references expenses (id) on delete restrict,
  amount             numeric(12,2) not null,
  paid_on            date not null,
  method             text not null,
  reference          text,
  paid_by            text,
  notes              text,
  recorded_by        uuid references users (id) on delete set null,
  recorded_by_email  text,
  idempotency_key    text,
  reversed_at        timestamptz,
  reversed_by        uuid references users (id) on delete set null,
  reversal_reason    text,
  created_at         timestamptz not null default now(),

  constraint expense_payments_amount_check check (amount > 0)
);

create index        if not exists expense_payments_expense_idx on expense_payments (expense_id);
create unique index if not exists expense_payments_idempotency_key_key
  on expense_payments (idempotency_key) where idempotency_key is not null;

-- ── Row level security ──────────────────────────────────────────────────────
-- Same rule as every other table: the API uses the service-role key and does
-- its own authorisation; nothing is readable with the anon key.

alter table support_sessions   enable row level security;
alter table clients            enable row level security;
alter table expense_categories enable row level security;
alter table expenses           enable row level security;
alter table expense_payments   enable row level security;

-- PostgREST caches the schema; new tables and columns are invisible to the API
-- until it reloads.
notify pgrst, 'reload schema';
