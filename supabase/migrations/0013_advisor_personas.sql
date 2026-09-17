-- ============================================================================
-- Thomas.ai — customisable AI Advisor personas (photo + personality notes).
-- Run in Supabase → SQL Editor → New query → Run, after 0012.
--
-- Exactly two rows ever exist per user, keyed by the fixed ids 'achachan'
-- and 'chachan' — there is no add/remove UI, only upsert.
-- ============================================================================

create table if not exists public.advisor_personas (
  id           text        not null check (id in ('achachan','chachan')),
  user_id      uuid        not null references auth.users on delete cascade,
  name         text        not null,
  photo        text,
  instructions text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.advisor_personas enable row level security;

drop policy if exists "own_rows_select" on public.advisor_personas;
drop policy if exists "own_rows_insert" on public.advisor_personas;
drop policy if exists "own_rows_update" on public.advisor_personas;
drop policy if exists "own_rows_delete" on public.advisor_personas;

create policy "own_rows_select" on public.advisor_personas for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own_rows_insert" on public.advisor_personas for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own_rows_update" on public.advisor_personas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own_rows_delete" on public.advisor_personas for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists set_updated_at on public.advisor_personas;
create trigger set_updated_at before update on public.advisor_personas
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.advisor_personas to authenticated;
revoke all on public.advisor_personas from anon;
