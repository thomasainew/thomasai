-- ============================================================================
-- CloudBasket 360 — v3: Security Verification, Installment extras, Income Sources.
-- Run in Supabase → SQL Editor → New query → Run, after 0015. Safe to re-run.
--
-- Additive only. Adds:
--   * verification_questions — the admin-configured "which person…" questions
--   * verification_attempts  — a log of every challenge shown and its result
--   * notes.extra_charge, notes.auto_add_to_budget — installment-plan extras
--   * income_sources — planned/expected income (salary, recurring, future) that
--     feeds the Financial Forecast for months that have not happened yet
--
-- The correct answer (correct_person_id) is never sent to a signed-in browser
-- directly: the app only ever reads/writes this table through the owner's own
-- admin screen (RLS: owner only). Logging in as anyone else goes through the
-- `security-verify` edge function, which uses the service role key to read
-- the correct answer server-side and only ever returns true/false.
-- ============================================================================

insert into public.schema_info (id, version) values (1, 16)
  on conflict (id) do update set version = excluded.version where public.schema_info.version < 16;

alter table public.notes
  add column if not exists extra_charge      numeric(14,2),
  add column if not exists auto_add_to_budget boolean not null default true;

create table if not exists public.verification_questions (
  id                 text not null,
  user_id            uuid not null references auth.users on delete cascade,
  question           text not null,
  scene              text not null default 'Airport',
  correct_person_id  text not null,
  other_person_ids   jsonb not null default '[]'::jsonb,
  status             text not null default 'Draft' check (status in ('Active','Draft')),
  number_of_choices  integer not null default 12,
  shuffle_positions  boolean not null default true,
  randomize          boolean not null default true,
  avoid_repeat_last  boolean not null default true,
  last_used_at       timestamptz,
  times_shown        integer not null default 0,
  times_correct      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.verification_questions enable row level security;
drop policy if exists "own_rows_select" on public.verification_questions;
drop policy if exists "own_rows_insert" on public.verification_questions;
drop policy if exists "own_rows_update" on public.verification_questions;
drop policy if exists "own_rows_delete" on public.verification_questions;
create policy "own_rows_select" on public.verification_questions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own_rows_insert" on public.verification_questions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own_rows_update" on public.verification_questions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own_rows_delete" on public.verification_questions for delete to authenticated
  using ((select auth.uid()) = user_id);
drop trigger if exists set_updated_at on public.verification_questions;
create trigger set_updated_at before update on public.verification_questions
  for each row execute function public.set_updated_at();

-- Attempts are written only by the security-verify edge function (service
-- role, bypasses RLS). Only the owner may ever read the log.
create table if not exists public.verification_attempts (
  id                  text not null,
  user_id             uuid not null references auth.users on delete cascade,
  member_id           uuid not null,
  member_name         text,
  question_id         text,
  question_text       text,
  selected_person_id  text,
  correct             boolean not null,
  at                  timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.verification_attempts enable row level security;
drop policy if exists "own_rows_select" on public.verification_attempts;
create policy "own_rows_select" on public.verification_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.verification_questions to authenticated;
grant select on public.verification_attempts to authenticated;

-- ------------------------------------------------------------- income sources ---
-- Planned/expected income (salary, recurring, future) — see src/lib/income.ts.
-- Shared with the household the same way loans/budget/etc. already are.
create table if not exists public.income_sources (
  id         text not null,
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  category   text not null default 'Other',
  amount     numeric(14,2) not null default 0,
  currency   text not null default 'AED',
  frequency  text not null default 'Monthly' check (frequency in ('Monthly','Quarterly','Yearly','One-Time')),
  start_date date not null,
  end_date   date,
  person     text,
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.income_sources enable row level security;
drop policy if exists "own_rows_select" on public.income_sources;
drop policy if exists "own_rows_insert" on public.income_sources;
drop policy if exists "own_rows_update" on public.income_sources;
drop policy if exists "own_rows_delete" on public.income_sources;
create policy "own_rows_select" on public.income_sources for select to authenticated
  using ((select auth.uid()) = user_id or public.member_of(user_id, 'income', false));
create policy "own_rows_insert" on public.income_sources for insert to authenticated
  with check ((select auth.uid()) = user_id or public.member_of(user_id, 'income', true));
create policy "own_rows_update" on public.income_sources for update to authenticated
  using ((select auth.uid()) = user_id or public.member_of(user_id, 'income', true))
  with check ((select auth.uid()) = user_id or public.member_of(user_id, 'income', true));
create policy "own_rows_delete" on public.income_sources for delete to authenticated
  using ((select auth.uid()) = user_id or public.member_of(user_id, 'income', true));
drop trigger if exists set_updated_at on public.income_sources;
create trigger set_updated_at before update on public.income_sources
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.income_sources to authenticated;

-- Make the API pick up the new tables straight away.
notify pgrst, 'reload schema';
