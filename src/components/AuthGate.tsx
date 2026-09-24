import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { hasSupabase, supabase } from '@/lib/supabase'
import { pullAll, resolveSession, type SessionContext } from '@/lib/sync'
import { verificationRequired } from '@/lib/security'
import { SignInScreen } from '@/components/SignInScreen'
import { SecurityVerification } from '@/components/SecurityVerification'
import { stopAnalytics } from '@/lib/analytics'
import { setRobots } from '@/lib/siteConfig'
import { useStore } from '@/store/useStore'

type Phase = 'checking' | 'signed-out' | 'verifying' | 'loading-data' | 'ready'

/** Has this browser tab already passed step 2 for this user? Cleared on sign-out / new tab. */
const verifiedKey = (userId: string) => `cb_verified_${userId}`

export function AuthGate({ children }: { children: ReactNode }) {
  const setSession = useStore((s) => s.setSession)
  const hydrate = useStore((s) => s.hydrate)
  const setContext = useStore((s) => s.setContext)
  const schemaV2 = useStore((s) => s.schemaV2)
  const schemaV3 = useStore((s) => s.schemaV3)
  const schemaV4 = useStore((s) => s.schemaV4)
  const [notice, setNotice] = useState<string | null>(null)
  const clearLocalData = useStore((s) => s.clearLocalData)
  const [phase, setPhase] = useState<Phase>(hasSupabase ? 'checking' : 'ready')
  const [error, setError] = useState<string | null>(null)
  // The user whose data is already loaded. Guards against the duplicate
  // INITIAL_SESSION callback and against TOKEN_REFRESHED re-pulling everything
  // every hour.
  const loadedFor = useRef<string | null>(null)
  // The resolved session, held while step 2 (security verification) is shown.
  const pendingSession = useRef<SessionContext | null>(null)
  const finishRef = useRef<((session: SessionContext) => Promise<void>) | null>(null)

  // ---- watch the Supabase session -----------------------------------------
  useEffect(() => {
    if (!hasSupabase || !supabase) return

    let cancelled = false

    /** Pull and hydrate every table for a resolved (and, if needed, verified) session. */
    const finish = async (session: SessionContext) => {
      if (cancelled) return
      setContext(session)
      try {
        const data = await pullAll()
        if (cancelled) return
        hydrate(data)
        setError(null)
        setPhase('ready')
      } catch (e) {
        if (cancelled) return
        loadedFor.current = null
        setError(e instanceof Error ? e.message : String(e))
        setPhase('ready') // fall through to the app on cached local data
      }
    }
    finishRef.current = finish

    const apply = async (userId: string | null, email: string | null) => {
      if (cancelled) return
      setSession(userId, email)
      // Signed in: stop every marketing pixel and keep the app out of search results.
      if (userId) {
        stopAnalytics()
        setRobots(false)
      }

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
        // Which schema is this database on, and whose data is this login for?
        const session = await resolveSession(userId)
        if (cancelled) return
        if (session.inactive) {
          loadedFor.current = null
          setNotice('This account has been switched off by the household owner.')
          await supabase!.auth.signOut()
          return
        }

        // Step 2: a security question, once per browser tab per sign-in.
        const already = sessionStorage.getItem(verifiedKey(userId)) === '1'
        if (!already) {
          let required = false
          try { required = await verificationRequired() } catch { required = false } // fail open — never brick sign-in
          if (cancelled) return
          if (required) {
            pendingSession.current = session
            setPhase('verifying')
            return
          }
        }
        await finish(session)
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
  }, [setSession, hydrate, clearLocalData, setContext])

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

  if (phase === 'signed-out')
    return (
      <>
        <SignInScreen />
        {notice && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] card px-4 py-3 max-w-sm bg-amber-50 border-amber-200 text-[12.5px] font-semibold text-amber-900">
            {notice}
          </div>
        )}
      </>
    )

  if (phase === 'verifying')
    return (
      <SecurityVerification
        onVerified={() => {
          const userId = useStore.getState().userId
          if (userId) sessionStorage.setItem(verifiedKey(userId), '1')
          const session = pendingSession.current
          if (!session) return
          setPhase('loading-data')
          finishRef.current?.(session)
        }}
        onSignOut={() => supabase?.auth.signOut()}
      />
    )

  return (
    <>
      {hasSupabase && !schemaV2 && (
        <div className="fixed bottom-4 left-4 z-50 card px-4 py-3 max-w-sm bg-brand-50 border-brand-200 flex items-start gap-2.5">
          <AlertCircle size={16} className="text-brand-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12.5px] font-bold text-brand-900">Database update needed</p>
            <p className="text-[11.5px] text-brand-800 mt-0.5">
              Run <b>supabase/migrations/0015_cloudbasket360_v2.sql</b> in the Supabase SQL Editor to switch on
              the new features. Until then everything keeps working as before.
            </p>
          </div>
        </div>
      )}
      {hasSupabase && schemaV2 && !schemaV3 && (
        <div className="fixed bottom-4 left-4 z-50 card px-4 py-3 max-w-sm bg-brand-50 border-brand-200 flex items-start gap-2.5">
          <AlertCircle size={16} className="text-brand-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12.5px] font-bold text-brand-900">Security Verification not set up yet</p>
            <p className="text-[11.5px] text-brand-800 mt-0.5">
              Run <b>supabase/migrations/0016_security_verification.sql</b> and deploy{' '}
              <b>supabase functions deploy security-verify</b> to turn on the step-2 login question. Everything else
              keeps working as before.
            </p>
          </div>
        </div>
      )}
      {hasSupabase && schemaV3 && !schemaV4 && (
        <div className="fixed bottom-4 left-4 z-50 card px-4 py-3 max-w-sm bg-brand-50 border-brand-200 flex items-start gap-2.5">
          <AlertCircle size={16} className="text-brand-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12.5px] font-bold text-brand-900">Database update needed</p>
            <p className="text-[11.5px] text-brand-800 mt-0.5">
              Run <b>supabase/migrations/0018_goal_currency.sql</b> to save a savings goal's own currency. Until then
              goals keep syncing in AED as before.
            </p>
          </div>
        </div>
      )}
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
