-- ============================================================================
-- ARTINU — a durable record of every email the app tries to send
--
-- ── Why this table exists ──────────────────────────────────────────────────
--
-- Every message was already being recorded, as JSON files under
-- server/.data/mail. That works locally and is worthless in production: Render
-- gives each deploy a fresh filesystem, so Console → Mail was permanently empty
-- on the live site.
--
-- The cost of that showed up the first time password reset emails appeared not
-- to arrive. There was no way to answer the only question that mattered — was
-- it sent, was it refused by SendGrid, or was it never attempted? — because the
-- one screen built to answer it had nothing in it. The monthly quota counter
-- said 74 messages had been accepted, and nothing said which.
--
-- `delivered` is the important column. It is true only when the provider
-- ACCEPTED the message, so a row with delivered = false is a message ARTINU
-- tried and failed to send, and the server log will carry the provider's reason
-- next to it.
--
-- ── Running it ─────────────────────────────────────────────────────────────
--
--   Supabase Dashboard → SQL Editor → paste → Run
--   (or: psql "$SUPABASE_DB_URL" -f database/migrations/012_mail_log.sql)
--
-- No backfill is possible or wanted: the messages sent before this table
-- existed were written to a filesystem that no longer exists.
--
-- Safe to re-run.
-- ============================================================================

create table if not exists mail_log (
  id            uuid primary key default gen_random_uuid(),
  "to"          text not null,
  subject       text not null,
  heading       text,
  body          text,
  html          text,
  -- True only when the provider accepted it. False means it was attempted and
  -- refused, or that no provider was configured.
  delivered     boolean not null default false,
  via           text,
  sent_at       timestamptz not null default now(),
  -- Who caused it. Null for anonymous actions like a public enquiry form.
  triggered_by  jsonb,
  -- Shares its value with the audit entry for the same action, so a message and
  -- the privileged action behind it can be lined up.
  request_id    text,
  trigger       text
);

-- The mail screen is always "most recent first", and the two things anyone
-- searches by are the recipient and whether it actually went out.
create index if not exists mail_log_sent_idx on mail_log (sent_at desc);
create index if not exists mail_log_to_idx on mail_log (lower("to"));
create index if not exists mail_log_undelivered_idx on mail_log (sent_at desc) where delivered = false;

alter table mail_log enable row level security;
