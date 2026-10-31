-- ============================================================================
-- ARTINU — Branch isolation: the branch a member of staff works in, and the
-- branch that handles an order.
--
-- ── What it changes ─────────────────────────────────────────────────────────
--
--   users.branch    the branch a member of staff works in. Customers and
--                   photographers keep none - they are shared by every branch.
--   orders.branch   the branch handling the order. Its payments, invoice and
--                   recorded costs belong to the same branch.
--
-- Expenses already carry a branch (017_console_business_system.sql).
--
-- Additive and nullable. Nothing is read, rewritten or deleted: a member of
-- staff or an order without a branch belongs to the first branch configured in
-- Console → Finance → Settings (Bengaluru today), which is where every existing
-- record was handled. Which branch each person may see is decided by the API
-- on every request (server/src/services/branch.service.ts); this only gives
-- the facts a column to live in.
--
-- ── Running it ──────────────────────────────────────────────────────────────
--
--   After 017 and 018. Before deploying the code that scopes by branch.
--   Safe to run twice: every statement is "if not exists".
-- ============================================================================

alter table users add column if not exists branch text;
alter table orders add column if not exists branch text;

create index if not exists users_branch_idx on users (branch) where branch is not null;
create index if not exists orders_branch_idx on orders (branch) where branch is not null;

comment on column users.branch is
  'Branch a member of staff works in. Null means the first configured branch. Customers and photographers have none.';
comment on column orders.branch is
  'Branch handling the order; its payments, invoice and costs follow it. Null means the first configured branch.';
