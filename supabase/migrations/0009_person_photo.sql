-- ============================================================================
-- Thomas.ai — optional avatar photo on people.
-- Run in Supabase → SQL Editor → New query → Run, after 0008.
--
-- Stored as a data URL, same as everything else in this app that keeps a
-- small user-supplied image — no separate storage bucket needed.
-- ============================================================================

alter table public.people
  add column if not exists photo text;
