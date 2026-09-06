-- ── 016 · Social media campaigns ────────────────────────────────────────────
--
-- The promotional popup the social media team shows to visitors: a poster, a
-- line of copy, a button, and a window of time to run in.
--
-- ── Why this is a new table rather than a reuse ──────────────────────────────
--
-- Requirements §9 asks that existing structures be reused wherever they can be,
-- so each candidate was checked before this file was written:
--
--   · announcements   Not a table. Broadcasts are written into `notifications`,
--                     one row PER RECIPIENT ACCOUNT, and are read from a
--                     signed-in user's notification list. A campaign has no
--                     recipient — it is shown to anonymous visitors — so there
--                     is no account to hang a row on and nothing to read it.
--
--   · ui_content /    The homepage carousel and its slides. Closest fit, and
--     hero_slides     still wrong: those are permanent page furniture edited by
--                     the content module, with no schedule, no frequency, no
--                     active window and no notion of a visitor having already
--                     dismissed one. Adding five columns for a different
--                     feature's lifecycle to the table the homepage renders
--                     from would put the two features in each other's way, and
--                     would mean the social media role needed `content` — which
--                     is edit access to the homepage itself.
--
--   · coupons         A discount code, not a message. No overlap beyond both
--                     having a date window.
--
-- So: a new table, isolated, referenced by nothing and referencing only
-- `users`. NO EXISTING TABLE IS ALTERED BY THIS MIGRATION.
--
-- Artist and space promotions (requirements §7) are handled by the two
-- `subject` columns rather than by touching those tables: the campaign records
-- WHICH artist or space it points at, and reads their name and image from the
-- existing row at display time.
--
-- NOT destructive: creates one table. Safe to re-run.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

create table if not exists social_media_campaigns (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  -- Public url of the stored poster. Null is a valid, text-only campaign.
  image_url     text,
  cta_label     text,
  cta_url       text,
  -- How often ONE visitor sees it. Enforced in the browser (localStorage), so
  -- this column is a setting the popup reads, not something the server counts.
  frequency     text not null default 'session',
  -- What is being promoted: nothing in particular, an artist, or a space.
  subject       text not null default 'general',
  -- The artist (users.id) or space (spaces.id) it points at. Deliberately NOT a
  -- foreign key: it addresses two different tables depending on `subject`, and
  -- a campaign that outlives the artist it mentioned should go stale rather
  -- than block that account from ever being deleted.
  subject_id    text,
  -- The switch the team controls. Live also requires the window below.
  active        boolean not null default false,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_by    uuid not null references users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint smc_frequency_check check (frequency in ('once', 'session', 'daily', 'always')),
  constraint smc_subject_check   check (subject in ('general', 'artist', 'space')),
  -- A window that closes before it opens can never be shown, and would sit in
  -- the list looking scheduled forever.
  constraint smc_window_check    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- The public popup endpoint asks one question on a large share of page loads:
-- "is there a live campaign right now". The partial index answers it from the
-- handful of active rows rather than scanning every campaign ever run.
create index if not exists social_media_campaigns_active_idx
  on social_media_campaigns (active, starts_at desc)
  where active;

-- The dashboard's own list, newest first.
create index if not exists social_media_campaigns_created_idx
  on social_media_campaigns (created_at desc);

/*
  Same posture as every other table here (see migration 008).

  RLS on with NO policies denies the anon and authenticated keys outright. The
  anon key ships in the browser bundle and is not a secret, so without this
  anyone could read and — worse — WRITE this table directly, which for a table
  whose whole purpose is "show this to every visitor" means defacing the site
  with an arbitrary poster and an arbitrary outbound link.

  The API reaches it with the service-role key, which bypasses RLS, so the
  application is unaffected.
*/
alter table social_media_campaigns enable row level security;
