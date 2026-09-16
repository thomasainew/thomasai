/// <reference types="vite/client" />

/**
 * Resolved at build time by vite.config.ts from either the VITE_-prefixed
 * name or the bare one, so a host that strips the VITE_ prefix still works.
 * Empty string when unset. Inlined into the browser bundle — see src/lib/supabase.ts.
 */
declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string

/**
 * Gemini config, resolved at build time by vite.config.ts from either
 * VITE_GEMINI_API_KEY or GEMINI_API_KEY. Empty string when unset.
 * Note: this is inlined into the browser bundle — see src/lib/gemini.ts.
 */
declare const __GEMINI_API_KEY__: string
declare const __GEMINI_MODEL__: string
declare const __GEMINI_FAST_MODEL__: string
