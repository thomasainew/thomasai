-- ============================================================================
-- Thomas.ai — a budget's limit can be set in its own currency.
-- Run in Supabase → SQL Editor → New query → Run, after 0011.
--
-- Spend is always tallied in base currency (AED-equivalent); this only
-- affects which currency the limit itself is entered and displayed in.
-- ============================================================================

alter table public.budgets
  add column if not exists currency text not null default 'AED';
