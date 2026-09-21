-- ============================================================================
-- CloudBasket 360 — v2 schema.
-- Run in Supabase → SQL Editor → New query → Run, after 0014. Safe to re-run.
--
-- Additive only: nothing is dropped and no existing row is rewritten, so all
-- current data is preserved. The app detects this migration through
-- public.schema_info and keeps working in a compatibility mode until it runs.
--
-- What it adds
--   * derived-balance support (opening balance, credit limit, bank style)
--   * transaction kinds, receipts, item brand / pack size, refunds
--   * loan <-> loan-account link; interest and fees on transfers
--   * assets, valuations and gold rates
--   * smart monthly budget items and payment schedules on notes
--   * document files (private storage) and their links
--   * family users: household_members + row level security that enforces
--     per-section and per-account permissions in the database itself
--   * site_config (public SEO + analytics ids) and a schema version marker
-- ============================================================================

-- ------------------------------------------------------------ schema marker ---
create table if not exists public.schema_info (
  id      integer primary key default 1 check (id = 1),
  version integer not null
);
insert into public.schema_info (id, version) values (1, 15)
  on conflict (id) do update set version = excluded.version;
-- Supabase may switch row level security on for every new table; without a policy the
-- version row would be invisible and the app would think this migration had not run.
alter table public.schema_info enable row level security;
drop policy if exists "schema_info_read" on public.schema_info;
create policy "schema_info_read" on public.schema_info for select to authenticated using (true);
grant select on public.schema_info to authenticated;

-- ---------------------------------------------------------- column additions ---
alter table public.accounts
  add column if not exists opening_balance   numeric(14,2),
  add column if not exists opening_confirmed boolean not null default false,
  add column if not exists credit_limit      numeric(14,2),
  add column if not exists bank_style        text;

alter table public.transactions
  add column if not exists kind           text not null default 'normal',
  add column if not exists receipt_id     text,
  add column if not exists brand          text,
  add column if not exists pack_size      numeric(14,3),
  add column if not exists pack_unit      text,
  add column if not exists refund_of      text,
  add column if not exists budget_item_id text,
  add column if not exists asset_id       text;

alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions
  add constraint transactions_kind_check
  check (kind in ('normal','refund','asset_purchase'));

create index if not exists transactions_receipt_idx on public.transactions (user_id, receipt_id);

alter table public.transfers
  add column if not exists kind     text not null default 'transfer',
  add column if not exists interest numeric(14,2) not null default 0,
  add column if not exists fees     numeric(14,2) not null default 0;

alter table public.loans
  add column if not exists account_id text,
  add column if not exists start_date date;

alter table public.settings
  add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.documents
  add column if not exists storage_path     text,
  add column if not exists file_name        text,
  add column if not exists mime_type        text,
  add column if not exists size_bytes       bigint,
  add column if not exists uploaded_at      timestamptz,
  add column if not exists links            jsonb not null default '[]'::jsonb,
  add column if not exists renewal_cost     numeric(14,2),
  add column if not exists renewal_currency text;

alter table public.notes
  add column if not exists schedule     jsonb not null default '[]'::jsonb,
  add column if not exists person       text,
  add column if not exists amount       numeric(14,2),
  add column if not exists currency     text,
  add column if not exists fee_category text;

-- --------------------------------------------------------------- new tables ---
create table if not exists public.receipts (
  id         text not null,
  user_id    uuid not null references auth.users on delete cascade,
  date       date not null,
  store      text not null default '',
  account_id text,
  person     text,
  method     text,
  currency   text not null default 'AED',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.item_aliases (
  id         text not null,
  user_id    uuid not null references auth.users on delete cascade,
  alias      text not null,
  canonical  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.assets (
  id             text not null,
  user_id        uuid not null references auth.users on delete cascade,
  name           text not null,
  category       text not null default 'Other',
  owner          text,
  purchase_date  date,
  purchase_price numeric(16,2),
  currency       text not null default 'AED',
  current_value  numeric(16,2) not null default 0,
  ownership_pct  numeric(6,3)  not null default 100,
  linked_loan_id text,
  valuation_date date,
  photos         jsonb not null default '[]'::jsonb,
  attachments    jsonb not null default '[]'::jsonb,
  notes          text,
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.asset_valuations (
  id         text not null,
  user_id    uuid not null references auth.users on delete cascade,
  asset_id   text not null,
  date       date not null,
  value      numeric(16,2) not null,
  currency   text not null default 'AED',
  source     text not null default 'manual',
  note       text,
  rate       numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.gold_rates (
  id           text not null,
  user_id      uuid not null references auth.users on delete cascade,
  date         date not null,
  per_gram_24k numeric(14,2) not null,
  currency     text not null default 'INR',
  source       text not null default 'manual',
  manual       boolean not null default false,
  fetched_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.budget_items (
  id          text not null,
  user_id     uuid not null references auth.users on delete cascade,
  month       text not null,
  name        text not null,
  category    text not null default 'Other',
  amount      numeric(14,2),
  currency    text not null default 'AED',
  due_date    date,
  person      text,
  source_kind text not null default 'manual',
  source_id   text,
  source_key  text not null,
  status      text not null default 'Suggested'
              check (status in ('Suggested','Planned','Paid','Overdue','Dismissed')),
  txn_id      text,
  paid_amount numeric(14,2),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
-- One item per source per month: this is what stops loans, notes, reminders
-- and schedules from being added to a month twice.
create unique index if not exists budget_items_source_uidx
  on public.budget_items (user_id, month, source_key);

-- ------------------------------------------------------------- family access ---
create table if not exists public.household_members (
  owner_id    uuid not null references auth.users on delete cascade,
  member_id   uuid not null references auth.users on delete cascade,
  name        text not null,
  email       text not null,
  person_name text,
  active      boolean not null default true,
  can_edit    boolean not null default true,
  -- '*' = every section, otherwise a subset of the section names below.
  sections    text[]  not null default '{}',
  -- null = every account; otherwise only these account ids.
  account_ids text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (owner_id, member_id)
);

create or replace function public.try_uuid(s text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return s::uuid;
exception when others then
  return null;
end $$;

-- Is the signed-in user an ACTIVE household member of `o` who may use `sect`?
create or replace function public.member_of(o uuid, sect text, w boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.owner_id = o
      and m.member_id = (select auth.uid())
      and m.active
      and (not w or m.can_edit)
      and ('*' = any (m.sections) or sect = any (m.sections))
  );
$$;

-- May the signed-in member touch this particular account?
create or replace function public.member_account_ok(o uuid, acct text, w boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.owner_id = o
      and m.member_id = (select auth.uid())
      and m.active
      and (not w or m.can_edit)
      and (m.account_ids is null or acct = any (m.account_ids))
  );
$$;

create or replace function public.member_any(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.owner_id = o and m.member_id = (select auth.uid()) and m.active
  );
$$;

alter table public.household_members enable row level security;
drop policy if exists "hm_owner_all" on public.household_members;
drop policy if exists "hm_self_read" on public.household_members;
create policy "hm_owner_all" on public.household_members for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "hm_self_read" on public.household_members for select to authenticated
  using ((select auth.uid()) = member_id);
drop trigger if exists set_updated_at on public.household_members;
create trigger set_updated_at before update on public.household_members
  for each row execute function public.set_updated_at();

-- ------------------------------------------------- triggers + policies (all) ---
-- (table, section) pairs. The owner always has full access to their own rows;
-- members additionally get the rows of their household for permitted sections.
do $$
declare
  pair text[];
  t text; sect text;
begin
  foreach pair slice 1 in array array[
    array['accounts','accounts'],
    array['transactions','transactions'],
    array['transfers','transactions'],
    array['categories','transactions'],
    array['subcategories','transactions'],
    array['receipts','shopping'],
    array['item_aliases','shopping'],
    array['price_watch','shopping'],
    array['budgets','budget'],
    array['budget_items','budget'],
    array['loans','loans'],
    array['people','people'],
    array['bills','bills'],
    array['documents','documents'],
    array['notes','notes'],
    array['goals','goals'],
    array['assets','assets'],
    array['asset_valuations','assets'],
    array['gold_rates','assets'],
    array['advisor_messages','advisor'],
    array['advisor_personas','advisor']
  ] loop
    t := pair[1]; sect := pair[2];

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_rows_select" on public.%I', t);
    execute format('drop policy if exists "own_rows_insert" on public.%I', t);
    execute format('drop policy if exists "own_rows_update" on public.%I', t);
    execute format('drop policy if exists "own_rows_delete" on public.%I', t);

    execute format(
      'create policy "own_rows_select" on public.%I for select to authenticated
         using ((select auth.uid()) = user_id or public.member_of(user_id, %L, false))', t, sect);
    execute format(
      'create policy "own_rows_insert" on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id or public.member_of(user_id, %L, true))', t, sect);
    execute format(
      'create policy "own_rows_update" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id or public.member_of(user_id, %L, true))
         with check ((select auth.uid()) = user_id or public.member_of(user_id, %L, true))', t, sect, sect);
    execute format(
      'create policy "own_rows_delete" on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id or public.member_of(user_id, %L, true))', t, sect);

    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Account-level restriction, layered on top: a member limited to certain
-- accounts sees only those accounts, and only the transactions and transfers
-- that touch them. AS RESTRICTIVE means it can only narrow, never widen.
drop policy if exists "member_accounts_select" on public.accounts;
create policy "member_accounts_select" on public.accounts as restrictive for select to authenticated
  using ((select auth.uid()) = user_id or public.member_account_ok(user_id, id, false));
drop policy if exists "member_accounts_write" on public.accounts;
create policy "member_accounts_write" on public.accounts as restrictive for all to authenticated
  using ((select auth.uid()) = user_id or public.member_account_ok(user_id, id, true))
  with check ((select auth.uid()) = user_id or public.member_account_ok(user_id, id, true));

drop policy if exists "member_txn_scope" on public.transactions;
create policy "member_txn_scope" on public.transactions as restrictive for all to authenticated
  using ((select auth.uid()) = user_id or public.member_account_ok(user_id, account_id, false))
  with check ((select auth.uid()) = user_id or public.member_account_ok(user_id, account_id, true));

drop policy if exists "member_transfer_scope" on public.transfers;
create policy "member_transfer_scope" on public.transfers as restrictive for all to authenticated
  using (
    (select auth.uid()) = user_id
    or (public.member_account_ok(user_id, from_account_id, false)
        and (to_kind <> 'account' or public.member_account_ok(user_id, to_id, false)))
  )
  with check (
    (select auth.uid()) = user_id
    or (public.member_account_ok(user_id, from_account_id, true)
        and (to_kind <> 'account' or public.member_account_ok(user_id, to_id, true)))
  );

-- Settings: members may read the household's settings, only the owner writes.
alter table public.settings enable row level security;
drop policy if exists "own_rows_select" on public.settings;
drop policy if exists "own_rows_insert" on public.settings;
drop policy if exists "own_rows_update" on public.settings;
drop policy if exists "own_rows_delete" on public.settings;
create policy "own_rows_select" on public.settings for select to authenticated
  using ((select auth.uid()) = user_id or public.member_any(user_id));
create policy "own_rows_insert" on public.settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own_rows_update" on public.settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own_rows_delete" on public.settings for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------ site_config ---
-- Public marketing settings (SEO text, analytics ids). Readable by anonymous
-- visitors because the login page must load analytics before anyone signs in;
-- it holds only ids meant to be public, never financial data. Owner writes.
create table if not exists public.site_config (
  user_id    uuid primary key references auth.users on delete cascade,
  seo        jsonb not null default '{}'::jsonb,
  analytics  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_config enable row level security;
drop policy if exists "site_read" on public.site_config;
drop policy if exists "site_write" on public.site_config;
create policy "site_read" on public.site_config for select to anon, authenticated using (true);
create policy "site_write" on public.site_config for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- grants ---
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.site_config to anon;
grant execute on function public.member_of(uuid, text, boolean) to authenticated;
grant execute on function public.member_account_ok(uuid, text, boolean) to authenticated;
grant execute on function public.member_any(uuid) to authenticated;

-- ---------------------------------------------------------------- storage ---
-- One private bucket. Every object lives under "<owner uuid>/…", so a policy
-- can decide access from the path alone: the owner, or an active household
-- member allowed the 'documents' section.
insert into storage.buckets (id, name, public)
  values ('cloudbasket', 'cloudbasket', false)
  on conflict (id) do nothing;

drop policy if exists "cb_read" on storage.objects;
drop policy if exists "cb_insert" on storage.objects;
drop policy if exists "cb_update" on storage.objects;
drop policy if exists "cb_delete" on storage.objects;

create policy "cb_read" on storage.objects for select to authenticated
  using (bucket_id = 'cloudbasket' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.member_of(public.try_uuid((storage.foldername(name))[1]), 'documents', false)));
create policy "cb_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'cloudbasket' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.member_of(public.try_uuid((storage.foldername(name))[1]), 'documents', true)));
create policy "cb_update" on storage.objects for update to authenticated
  using (bucket_id = 'cloudbasket' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.member_of(public.try_uuid((storage.foldername(name))[1]), 'documents', true)));
create policy "cb_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cloudbasket' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.member_of(public.try_uuid((storage.foldername(name))[1]), 'documents', true)));

-- Make the API pick up the new tables and columns straight away.
notify pgrst, 'reload schema';
