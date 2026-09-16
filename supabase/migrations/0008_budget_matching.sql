-- ============================================================================
-- Thomas.ai — category matching and alerts on budgets.
-- Run in Supabase → SQL Editor → New query → Run, after 0007.
--
-- A budget can now be wired to one of your own categories (and optionally a
-- sub-category) so spend matching is exact rather than guessed from the
-- budget's name — see the Category Matching section of Add Budget.
-- ============================================================================

alter table public.budgets
  add column if not exists period          text not null default 'Monthly',
  add column if not exists category_name   text,
  add column if not exists subcategory_name text,
  add column if not exists auto_match      boolean not null default true,
  add column if not exists rollover        boolean not null default false,
  add column if not exists alert_threshold integer not null default 80;

comment on column public.budgets.category_name is
  'Exact category name this budget tracks. When set, this always wins over name/keyword guessing.';
comment on column public.budgets.auto_match is
  'When false, transactions never post to this budget''s spend even if the category matches.';
comment on column public.budgets.rollover is
  'Roll unspent amount into next month''s budget. Stored for the UI toggle; not yet applied automatically.';
comment on column public.budgets.alert_threshold is
  'Percent of budget at which "approaching budget" fires, instead of only at 100%.';
