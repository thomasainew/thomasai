import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { hasSupabase, supabase } from '@/lib/supabase'
import { pullAll } from '@/lib/sync'
import { SignInScreen } from '@/components/SignInScreen'
import { useStore } from '@/store/useStore'

type Phase = 'checking' | 'signed-out' | 'loading-data' | 'ready'

export function AuthGate({ children }: { children: ReactNode }) {
  const setSession = useStore((s) => s.setSession)
  const hydrate = useStore((s) => s.hydrate)
  const clearLocalData = useStore((s) => s.clearLocalData)
  const [phase, setPhase] = useState<Phase>(hasSupabase ? 'checking' : 'ready')
  const [error, setError] = useState<string | null>(null)
  // The user whose data is already loaded. Guards against the duplicate
  // INITIAL_SESSION callback and against TOKEN_REFRESHED re-pulling everything
  // every hour.
  const loadedFor = useRef<string | null>(null)

  // ---- watch the Supabase session -----------------------------------------
  useEffect(() => {
    if (!hasSupabase || !supabase) return

    let cancelled = false

    const apply = async (userId: string | null, email: string | null) => {
      if (cancelled) return
      setSession(userId, email)

      if (!userId) {
        // Drop the previous account's rows so the next person to sign in on
        // this browser never sees them.
        if (loadedFor.current) clearLocalData()
        loadedFor.current = null
        setError(null)
        setPhase('signed-out')
        return
      }

      // Same user as the last load (token refresh, tab focus) — nothing to do.
      if (loadedFor.current === userId) {
        setPhase('ready')
        return
      }
      loadedFor.current = userId

      setPhase('loading-data')
      try {
        const data = await pullAll()
        if (cancelled) return
        hydrate(data)
        setError(null)
        setPhase('ready')
      } catch (e) {
        if (cancelled) return
        // Let the next event retry rather than pinning a failed load.
        loadedFor.current = null
        setError(e instanceof Error ? e.message : String(e))
        setPhase('ready') // fall through to the app on cached local data
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user.id ?? null, session?.user.email ?? null)
    })

    // onAuthStateChange fires INITIAL_SESSION on subscribe, but read the
    // session too in case that event is missed — apply() de-duplicates.
    supabase.auth.getSession().then(({ data }) => {
      apply(data.session?.user.id ?? null, data.session?.user.email ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [setSession, hydrate, clearLocalData])

  if (phase === 'checking' || phase === 'loading-data') {
    return (
      <div className="h-screen grid place-items-center bg-canvas">
        <div className="text-center">
          <Loader2 size={26} className="animate-spin text-brand-600 mx-auto mb-3" />
          <p className="text-[13px] font-semibold text-slate-600">
            {phase === 'checking' ? 'Checking your session…' : 'Loading your finances…'}
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'signed-out') return <SignInScreen />

  return (
    <>
      {error && (
        <div className="fixed bottom-4 right-4 z-50 card px-4 py-3 max-w-sm bg-amber-50 border-amber-200 flex items-start gap-2.5">
          <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12.5px] font-bold text-amber-900">Cloud sync unavailable</p>
            <p className="text-[11.5px] text-amber-800 mt-0.5">{error}</p>
            <p className="text-[11.5px] text-amber-700 mt-1">Working from local data for now.</p>
          </div>
        </div>
      )}
      {children}
    </>
  )
}
