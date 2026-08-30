-- ============================================================================
-- ARTINU — the one migration still to run against production.
--
-- WHAT TO DO
--   1. Open supabase.com and sign in.
--   2. Pick the ARTINU project.
--   3. Left sidebar → SQL Editor → New query.
--   4. Paste this whole file. Click Run.
--
-- It takes a second and prints "Success. No rows returned".
--
-- IS THIS SAFE?
--   Yes. Every statement only ADDS things:
--     · add column if not exists   — never drops or retypes a column
--     · create table if not exists — never touches an existing table
--     · create index if not exists — never changes data
--
--   No row is read, rewritten or deleted. Every account, photograph and
--   testimonial that exists today is left exactly as it is, and every new
--   column starts empty.
--
--   Running it twice is harmless — the "if not exists" on every statement
--   means the second run does nothing at all.
--
-- WHAT IT TURNS ON
--   · Email verification by 6-digit code (already built and tested)
--   · Community Guidelines acceptance, recorded per account
--   · Warnings, the three-warning policy, and the removal-request queue
--   · Date of birth, so the birthday emails have a date to work from
--   · The café website link on the homepage collaboration card
--
--   Until it is run, the site keeps working exactly as it does now; those
--   features simply have nowhere to write.
--
-- AFTER RUNNING IT
--   Back here, run:  npm run audit:production --workspace server
--   The two lines that currently say "not created yet" should become counts.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- PART 1 of 2 — from 009_registration_and_collaborations.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- ARTINU — date of birth on registration, and a destination for a collaboration
--
-- Two columns, both additive and both nullable, so every existing row stays
-- valid and nothing that runs today starts failing:
--
--   profiles.date_of_birth  — collected at registration alongside the phone
--                             number. Null on every account created before
--                             this migration; the application never requires
--                             it of an existing user.
--
--   cafes.website_url       — where a homepage collaboration card links to.
--                             Null until a manager enters the partner's real
--                             address in Console → Homepage → Collaborations.
--                             It is deliberately not backfilled: a guessed URL
--                             is worse than no link at all.
--
-- Safe to re-run.
--
--   Supabase Dashboard → SQL Editor → paste → Run
--   (or: psql "$SUPABASE_DB_URL" -f database/migrations/009_registration_and_collaborations.sql)
-- ============================================================================

alter table profiles add column if not exists date_of_birth date;

alter table cafes add column if not exists website_url text;

-- The homepage reads active collaborations in display order on every visit.
create index if not exists cafes_active_order_idx on cafes (is_active, "order");


-- ─────────────────────────────────────────────────────────────────────────
-- PART 2 of 2 — from 010_verification_and_enforcement.sql
-- ─────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- ARTINU — email verification by code, guidelines acceptance, and the
-- enforcement records the Community Guidelines describe.
--
-- Every statement is additive and re-runnable. No column is dropped, no column
-- changes type, and no existing row is rewritten — an account that exists today
-- keeps working with every new column left null.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

-- ── Email verification by 6-digit code ──────────────────────────────────────
--
-- `otp_challenges` already backs the sign-in code. Verification reuses it
-- rather than adding a second table, so one place expires codes, counts
-- attempts and marks them consumed.
--
--   purpose    — 'sign_in' (everything that exists today) or 'email_verification'.
--                Defaulted, so rows written before this migration stay valid.
--   code_hash  — SHA-256 of the code. New verification challenges store only
--                this and leave `code` null, so a database dump never contains
--                a live code. Sign-in continues to use `code` until it is
--                migrated separately; `consume` prefers the hash when present.
alter table otp_challenges add column if not exists purpose text not null default 'sign_in';
alter table otp_challenges add column if not exists code_hash text;

create index if not exists otp_challenges_user_purpose_idx
  on otp_challenges (user_id, purpose, consumed);

-- ── Community Guidelines acceptance ─────────────────────────────────────────
--
-- Which version a photographer agreed to, and when. Stored per profile rather
-- than as a boolean so that publishing a new version can ask for a fresh
-- acknowledgement without losing the record of the old one.
alter table profiles add column if not exists guidelines_version text;
alter table profiles add column if not exists guidelines_accepted_at timestamptz;

-- ── Warnings ────────────────────────────────────────────────────────────────
--
-- The three-warning policy in §12. A count on its own cannot answer "why", so
-- each warning is a row with a reason, an issuer and a timestamp.
create table if not exists warnings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  -- 1, 2, 3 … computed at issue time so the sequence survives a deletion.
  number         integer not null,
  category       text not null default 'guidelines',
  reason         text not null,
  notes          text,
  -- The submission that prompted it, when there was one.
  artwork_id     uuid references artworks (id) on delete set null,
  issued_by      uuid references users (id) on delete set null,
  issued_by_email text,
  -- Whether the photographer has seen it in their studio.
  acknowledged   boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists warnings_user_idx on warnings (user_id, created_at desc);

-- ── Removal requests ────────────────────────────────────────────────────────
--
-- §11 and §21: a photograph that is hanging in a café stays active until it has
-- physically come down, and ARTINU then has five days to process the removal.
-- Both halves of that are dates, so both are columns rather than an assumption.
--
--   kind                     — 'artwork' or 'account'
--   status                   — requested | under_review | awaiting_installation_removal
--                              | approved | completed | rejected
--   installation_active      — is the piece currently hanging somewhere
--   physically_removed_at    — when it actually came off the wall
--   process_by               — physically_removed_at + 5 days; the operational deadline
create table if not exists removal_requests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users (id) on delete cascade,
  artwork_id            uuid references artworks (id) on delete set null,
  kind                  text not null default 'artwork',
  status                text not null default 'requested',
  reason                text,
  installation_active   boolean not null default false,
  physically_removed_at timestamptz,
  process_by            timestamptz,
  decided_by            uuid references users (id) on delete set null,
  decided_at            timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists removal_requests_status_idx on removal_requests (status, created_at desc);
create index if not exists removal_requests_user_idx on removal_requests (user_id);

-- ── Enforcement bookkeeping on the account ──────────────────────────────────
--
-- `users.status` already carries 'suspended'; 'banned' joins it as a value, not
-- as a new column. These three record why and when, so a suspended photographer
-- can be told what happened and an admin can undo it.
alter table users add column if not exists status_reason text;
alter table users add column if not exists status_changed_at timestamptz;
alter table users add column if not exists status_changed_by uuid references users (id) on delete set null;

-- §13 and §14 run on a timer and must not re-issue the same warning every day.
alter table users add column if not exists inactivity_warned_at timestamptz;
alter table users add column if not exists inactivity_reviewed_at timestamptz;
