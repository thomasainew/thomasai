-- ============================================================================
-- Thomas.ai — whose account this is, for households tracking more than one
-- person's accounts (e.g. "Thomas" and "Wife" both hold a FAB account).
-- Run in Supabase → SQL Editor → New query → Run, after 0009.
-- ============================================================================

alter table public.accounts
  add column if not exists owner text;
