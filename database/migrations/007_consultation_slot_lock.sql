-- ============================================================================
-- ARTINU — one consultation slot, one booking (requirements §5)
--
-- ARTINU has a single person taking consultations, so a date + time slot is a
-- global resource: once it is booked it is gone for every space type, every
-- mode and every visitor.
--
-- The API already refused a slot it could see was taken, but it did so by
-- reading availability and then inserting — two round trips with a gap between
-- them. Under the memory driver that gap is a microtask and nothing can
-- interleave, which is why this never showed up in development. Against
-- Postgres each step is a real network hop, so two visitors who press "Confirm"
-- within the same few hundred milliseconds both read "10:00 AM is free" before
-- either row lands, and both are told they are booked. One of them is turned
-- away on the day, and nothing in the data says which.
--
-- Application code cannot close that window on its own. This index can: the
-- second insert fails, and the route turns that failure into the same 409 the
-- slow path already returns.
--
-- Cancelled bookings are excluded from the index so a cancelled slot genuinely
-- reopens (requirements §5, "cancellations reopen slots") rather than blocking
-- its own time forever.
--
-- Safe to re-run.
--
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

-- ── 1. Clear any double bookings already in the table ───────────────────────
-- A unique index cannot be built over existing duplicates. Where a slot was
-- booked more than once, the earliest request keeps it — it was made first and
-- is the one the visitor was most likely told about — and the rest are marked
-- cancelled rather than deleted, so the people involved can still be contacted.

with ranked as (
  select
    id,
    row_number() over (
      partition by preferred_date, preferred_slot
      order by created_at asc, id asc
    ) as position
  from consultations
  where status <> 'cancelled'
)
update consultations
   set status = 'cancelled'
 where id in (select id from ranked where position > 1);

-- ── 2. Enforce it from here on ──────────────────────────────────────────────

create unique index if not exists consultations_slot_key
  on consultations (preferred_date, preferred_slot)
  where status <> 'cancelled';

-- ── 3. Verify ───────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where tablename = 'consultations'
       and indexname = 'consultations_slot_key'
  ) then
    raise exception 'consultations_slot_key was not created';
  end if;

  raise notice 'Consultation slots are now unique per date + time.';
end $$;
