-- ── 013 · Payment mode, and the gateway columns the code already writes ──────
--
-- Two separate problems, one table.
--
-- 1. DRIFT THAT WAS ALREADY BREAKING PRODUCTION
--
--    `payments` in schema.sql has never had `gateway_order_id` or
--    `gateway_payment_id`, but the server writes both. PostgREST rejects an
--    insert naming a column it cannot see, so EVERY payment failed with
--    "Could not find the 'gateway_order_id' column of 'payments' in the schema
--    cache" and a 500. The customer pressed Place order and nothing happened -
--    no QR, no page, no error they could act on.
--
--    The server no longer sends a null for these, so payments work without
--    this migration. They are added here because a real gateway genuinely
--    needs them, and because a type that claims a column exists while the
--    table has none is a trap for whoever looks next.
--
-- 2. HOW THE CUSTOMER SAYS THEY PAID
--
--    Money arrives as a UPI transfer and a person reconciles it by hand. They
--    are looking in one of two places - the Google Pay/UPI ledger or the bank
--    statement - and the transaction reference alone does not say which. Asking
--    the customer costs them one tap and tells the reconciler where to look.
--
-- Safe to re-run: every statement is `if not exists`.

alter table payments add column if not exists gateway_order_id   text;
alter table payments add column if not exists gateway_payment_id text;

-- 'gpay' | 'upi' | 'bank' - free text rather than an enum so adding a method
-- later is a code change and not a migration against a live table.
alter table payments add column if not exists paid_via text;

-- Reconciliation is always "show me what is waiting", so the index is on the
-- status that means waiting rather than on the whole column.
create index if not exists payments_verifying_idx
  on payments (status)
  where status = 'verifying';
