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
