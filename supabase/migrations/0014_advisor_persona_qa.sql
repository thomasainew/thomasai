-- ============================================================================
-- Thomas.ai — guided question-and-answer training for AI Advisor personas.
-- Run in Supabase → SQL Editor → New query → Run, after 0013.
-- ============================================================================

alter table public.advisor_personas
  add column if not exists qa jsonb not null default '[]'::jsonb;
