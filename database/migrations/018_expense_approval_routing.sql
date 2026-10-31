-- ============================================================================
-- ARTINU — Expense approval routing.
--
-- Every submitted expense now has a named approver, chosen by the routing in
-- Finance → Settings → Expense approval routing (stored with the other finance
-- settings in ui_content, so the routing itself needs no table).
--
--   expenses.approver_id            who has to decide it
--   expenses.approver_email         kept for the record if the account goes
--   expenses.approval_route         which rule chose them ('branch', 'backup',
--                                   'manual', ...)
--   expenses.approver_assigned_at   when it was assigned or reassigned
--
-- Additive only. Requires 017 (the expenses table). Expenses already waiting
-- keep everything they have; their approver is filled in by
-- "Route waiting expenses" in the Console, which records each assignment on
-- the audit trail. Nothing here rewrites a row.
--
--   Supabase Dashboard → SQL Editor → paste → Run   (after 017)
--
-- Safe to re-run.
-- ============================================================================

alter table expenses add column if not exists approver_id          uuid references users (id) on delete set null;
alter table expenses add column if not exists approver_email       text;
alter table expenses add column if not exists approval_route       text;
alter table expenses add column if not exists approver_assigned_at timestamptz;

-- "Awaiting my approval" reads waiting expenses by approver.
create index if not exists expenses_approver_idx
  on expenses (approver_id)
  where status = 'pending_approval';

notify pgrst, 'reload schema';
