import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = __SUPABASE_URL__
const anonKey = __SUPABASE_ANON_KEY__

/**
 * True when both env vars are present. When false the whole app falls back to
 * local-only mode: the Zustand store still works, it just persists to
 * localStorage instead of Postgres and no sign-in is required.
 */
export const hasSupabase = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Narrowing helper so call sites don't repeat the null check. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured — check .env.local')
  return supabase
}
