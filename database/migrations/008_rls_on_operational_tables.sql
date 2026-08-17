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
