-- ============================================================================
-- Thomas.ai — phone number on settings.
-- Run in Supabase → SQL Editor → New query → Run, after 0005.
-- ============================================================================

alter table public.settings
  add column if not exists phone text not null default '';
