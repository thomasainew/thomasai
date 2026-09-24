-- ============================================================================
-- CloudBasket 360 — Savings and Investment account types.
-- Run in Supabase → SQL Editor → New query → Run, after 0016. Safe to re-run.
--
-- Additive only. Widens the accounts.type check constraint to also allow
-- 'savings' and 'investment' — both behave exactly like a bank/cash account
-- (money you own; balance falls on an expense, rises on income) everywhere
-- in the app. No existing row's type changes.
-- ============================================================================

alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts
  add constraint accounts_type_check
  check (type in ('bank','cash','savings','investment','card','loan'));

notify pgrst, 'reload schema';
