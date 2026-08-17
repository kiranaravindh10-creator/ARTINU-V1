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
