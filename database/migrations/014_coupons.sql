-- ── 014 · Coupons ───────────────────────────────────────────────────────────
--
-- Discount codes were three entries in a `COUPONS` object compiled into the
-- frontend bundle. A manager could not create one, change a value, set an
-- expiry or switch one off without a developer and a deploy - and one of the
-- three still carried the old brand name in the code customers had to type.
--
-- `value` is read against `type`: a percentage of the subtotal, or a flat
-- number of rupees off it. Both are stored as numeric(12,2) like every other
-- money column here, and the server clamps a flat discount to the subtotal so
-- an order can never total below zero.
--
-- Safe to re-run.

create table if not exists coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  type              text not null default 'percent',
  value             numeric(12,2) not null,
  label             text not null,
  active            boolean not null default true,
  starts_at         timestamptz,
  expires_at        timestamptz,
  min_order_amount  numeric(12,2),
  max_discount      numeric(12,2),
  -- Space types this applies to. Empty or null means every category.
  categories        text[] not null default '{}',
  usage_limit       integer,
  used_count        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint coupons_type_check  check (type in ('percent', 'flat')),
  constraint coupons_value_check check (value > 0),
  -- A percentage over 100 would discount more than the order is worth.
  constraint coupons_percent_range check (type <> 'percent' or value <= 100)
);

-- Codes are matched case-insensitively and must be unique. The index is on the
-- upper-cased code so "save10" and "SAVE10" cannot both exist.
create unique index if not exists coupons_code_key on coupons (upper(code));

-- Every lookup is "find this code, is it live" - so the partial index carries
-- the active flag rather than making the query check it afterwards.
create index if not exists coupons_active_idx on coupons (active) where active;

alter table coupons enable row level security;
