-- ============================================================================
-- Thomas.ai — AI Advisor chat history (Achachan & Chachan personas).
-- Run in Supabase → SQL Editor → New query → Run, after 0010.
--
-- "from" is a reserved SQL word, so every reference to the column is quoted.
-- ============================================================================

create table if not exists public.advisor_messages (
  id         text        not null,
  user_id    uuid        not null references auth.users on delete cascade,
  "from"     text        not null check ("from" in ('user','achachan','chachan')),
  text       text        not null,
  at         timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists advisor_messages_user_idx on public.advisor_messages (user_id, at);

alter table public.advisor_messages enable row level security;

drop policy if exists "own_rows_select" on public.advisor_messages;
drop policy if exists "own_rows_insert" on public.advisor_messages;
drop policy if exists "own_rows_update" on public.advisor_messages;
drop policy if exists "own_rows_delete" on public.advisor_messages;

create policy "own_rows_select" on public.advisor_messages for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own_rows_insert" on public.advisor_messages for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own_rows_update" on public.advisor_messages for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own_rows_delete" on public.advisor_messages for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.advisor_messages to authenticated;
revoke all on public.advisor_messages from anon;
