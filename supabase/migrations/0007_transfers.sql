-- ============================================================================
-- Thomas.ai — transfers between your own accounts.
-- Run in Supabase → SQL Editor → New query → Run, after 0006.
--
-- A transfer moves value between two of your own accounts (or pays down a
-- loan) and is never income or expense — see the FINAL ACCOUNTING RULE in
-- the corrections spec. to_kind + to_id point at either an account row or a
-- loan row, since both are valid transfer destinations.
-- ============================================================================

create table if not exists public.transfers (
  id              text        not null,
  user_id         uuid        not null references auth.users on delete cascade,
  date            date        not null,
  from_account_id text        not null,
  to_kind         text        not null check (to_kind in ('account','loan')),
  to_id           text        not null,
  amount          numeric(14,2) not null,
  currency        text        not null default 'AED',
  purpose         text        not null default 'Other',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists transfers_user_idx on public.transfers (user_id, date desc);

alter table public.transfers enable row level security;

drop policy if exists "own_rows_select" on public.transfers;
drop policy if exists "own_rows_insert" on public.transfers;
drop policy if exists "own_rows_update" on public.transfers;
drop policy if exists "own_rows_delete" on public.transfers;

create policy "own_rows_select" on public.transfers for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own_rows_insert" on public.transfers for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own_rows_update" on public.transfers for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own_rows_delete" on public.transfers for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists set_updated_at on public.transfers;
create trigger set_updated_at before update on public.transfers
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.transfers to authenticated;
revoke all on public.transfers from anon;
