import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Loader2, LogIn, Mail, Lock } from 'lucide-react'
import { hasSupabase, supabase } from '@/lib/supabase'
import { pullAll } from '@/lib/sync'
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

  if (phase === 'signed-out') return <SignIn />

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

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setMsg(null)

    // Single-user app — there is no sign-up flow. The one account is created
    // once, directly in Supabase, and this screen only ever signs it in.
    const res = await supabase.auth.signInWithPassword({ email, password })
    if (res.error) setMsg({ tone: 'error', text: res.error.message })
    setBusy(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* brand panel */}
      <div className="hidden lg:flex w-[46%] bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-500 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur grid place-items-center font-black text-2xl">
              T
            </div>
            <div>
              <p className="text-[24px] font-extrabold tracking-tight leading-none">Thomas.ai</p>
              <p className="text-[12px] text-white/70 mt-1">Your Money. Smarter Life.</p>
            </div>
          </div>
        </div>

        <div className="relative">
          <h2 className="text-[34px] font-extrabold leading-tight tracking-tight">
            Every dirham,
            <br />
            accounted for.
          </h2>
          <p className="text-[14px] text-white/80 mt-4 leading-relaxed max-w-sm">
            Accounts, income, expenses, purchases, loans, bills and documents — tracked in one place and synced
            securely to your own database.
          </p>
          <ul className="mt-7 space-y-2.5">
            {['Multi-currency accounts rolled into AED', 'Budgets, goals and loan schedules', 'Document expiry reminders', 'Reports and CSV export'].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-[13px] text-white/85">
                <span className="h-5 w-5 rounded-full bg-white/20 grid place-items-center text-[11px]">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-white/50">Plan Today · A Better Tomorrow</p>
      </div>

      {/* form panel */}
      <div className="flex-1 grid place-items-center p-6 bg-canvas">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-400 grid place-items-center text-white font-black text-lg">
              T
            </div>
            <div>
              <p className="text-[20px] font-extrabold tracking-tight">
                <span className="text-slate-900">Thomas</span>
                <span className="text-brand-600">.ai</span>
              </p>
              <p className="text-[10px] text-slate-400">Your Money. Smarter Life.</p>
            </div>
          </div>

          <h1 className="text-[26px] font-extrabold tracking-tight text-slate-900">Welcome back</h1>
          <p className="text-[13px] text-slate-500 mt-1.5 mb-7">Sign in to reach your financial dashboard.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="input pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  className="input pl-10"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {msg && (
              <div
                className={`rounded-xl px-3.5 py-2.5 text-[12px] font-medium ${
                  msg.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {msg.text}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full h-11 disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
