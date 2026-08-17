-- ============================================================================
-- ARTINU — DROP EVERYTHING. Destructive. Read this before running it.
--
-- This deletes all 28 application tables and every row in them, plus the
-- Photo ID allocator function. It is the exact inverse of APPLY_ALL_FRESH.sql.
--
-- There is no undo. Supabase's free tier has no point-in-time recovery, so
-- unless you have taken your own backup the data is simply gone.
--
-- WHAT IT DESTROYS
--   · users            every account, including staff and CEO logins
--   · profiles         photographer codes and photo numbering (never reissued)
--   · artworks         every uploaded photograph record
--   · orders, payments, invoices, installations, rotations
--   · spaces, applications, consultations, support_tickets
--   · notifications, payouts, wishlists, follows
--   · otp_challenges, tokens      (signs everyone out)
--   · audit_logs       the entire audit trail
--   · ui_content, hero_slides, featured_collections, cafes,
--     collaboration_slides        homepage content
--   · error_logs, employees, frames, frame_movements
--   · function artinu_allocate_photo_id
--
-- WHAT IT DOES **NOT** TOUCH
--   · Storage buckets and the image files in them. Dropping artworks orphans
--     every uploaded file — the rows pointing at them go, the objects stay and
--     keep costing storage. Empty the buckets separately if that is what you
--     want (Dashboard → Storage → select bucket → delete files).
--   · auth.users. ARTINU does not use Supabase Auth — it authenticates against
--     its own public.users table with bcrypt + JWT — so there is nothing there.
--   · Any other schema. Only `public` is affected.
--
-- TO RUN
--   1. Uncomment the `set` line in STEP 1 below.
--   2. Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   3. Re-apply the schema with APPLY_ALL_FRESH.sql before starting the API,
--      or it will refuse to boot.
--
-- Left as-is, this file aborts at the guard and changes nothing.
-- ============================================================================


-- ── STEP 1: arm it ──────────────────────────────────────────────────────────
-- Uncomment exactly this line to confirm you mean it:

-- set artinu.confirm_drop = 'DROP EVERYTHING';


-- ── Guard ───────────────────────────────────────────────────────────────────
-- Aborts the script unless the line above was uncommented. The SQL editor runs
-- the file as one transaction, so nothing below executes if this raises.

do $$
begin
  if coalesce(current_setting('artinu.confirm_drop', true), '') <> 'DROP EVERYTHING' then
    raise exception
      'Refusing to drop anything. This script deletes all 28 ARTINU tables and every row in them. If that is genuinely what you want, uncomment the "set artinu.confirm_drop" line at the top and run it again.';
  end if;

  raise notice 'Confirmed — dropping all ARTINU tables.';
end $$;


-- ── Drop ────────────────────────────────────────────────────────────────────
-- Children before parents, and `cascade` on top, so the order cannot bite if a
-- foreign key is added later. `if exists` makes the whole file re-runnable.

-- Operations (004)
drop table if exists frame_movements      cascade;
drop table if exists frames               cascade;
drop table if exists employees            cascade;
drop table if exists error_logs           cascade;

-- Content (003)
drop table if exists collaboration_slides cascade;
drop table if exists cafes                cascade;
drop table if exists featured_collections cascade;
drop table if exists hero_slides          cascade;
drop table if exists ui_content           cascade;

-- Engagement
drop table if exists wishlists            cascade;
drop table if exists follows              cascade;
drop table if exists notifications        cascade;
drop table if exists payouts              cascade;

-- Fulfilment
drop table if exists installations        cascade;
drop table if exists rotations            cascade;

-- Money
drop table if exists invoices             cascade;
drop table if exists payments             cascade;
drop table if exists orders               cascade;

-- Inbound
drop table if exists support_tickets      cascade;
drop table if exists consultations        cascade;
drop table if exists applications         cascade;

-- Auth support & audit
drop table if exists otp_challenges       cascade;
drop table if exists tokens               cascade;
drop table if exists audit_logs           cascade;

-- Core
drop table if exists artworks             cascade;
drop table if exists spaces               cascade;
drop table if exists profiles             cascade;
drop table if exists users                cascade;

-- Functions
drop function if exists artinu_allocate_photo_id(uuid);


-- ── Verify ──────────────────────────────────────────────────────────────────
-- Names anything left behind rather than reporting a clean sweep it did not do.

do $$
declare
  survivors text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into survivors
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname in (
       'users','profiles','spaces','artworks','orders','payments','invoices',
       'installations','rotations','notifications','payouts','support_tickets',
       'consultations','applications','audit_logs','wishlists','follows',
       'otp_challenges','tokens','ui_content','hero_slides',
       'featured_collections','cafes','collaboration_slides','error_logs',
       'employees','frames','frame_movements'
     );

  if survivors is not null then
    raise exception 'These tables were not dropped: %', survivors;
  end if;

  raise notice 'All ARTINU tables dropped. Storage buckets and their files are untouched.';
  raise notice 'Run APPLY_ALL_FRESH.sql before starting the API — it will not boot without a schema.';
end $$;
