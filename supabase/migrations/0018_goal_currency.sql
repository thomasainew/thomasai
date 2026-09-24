-- ============================================================================
-- CloudBasket 360 — Per-goal currency.
-- Run in Supabase → SQL Editor → New query → Run, after 0017. Safe to re-run.
--
-- Additive only. Adds goals.currency (defaulting existing rows to AED, which
-- is what they were always implicitly denominated in) so a savings goal can
-- be set in AED, INR or USD like everything else in the app.
-- ============================================================================

insert into public.schema_info (id, version) values (1, 18)
  on conflict (id) do update set version = excluded.version where public.schema_info.version < 18;

alter table public.goals
  add column if not exists currency text not null default 'AED';

notify pgrst, 'reload schema';
