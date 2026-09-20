import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  FileText,
  Globe,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Menu,
  ShieldCheck,
  ShoppingBasket,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import portrait from '@/assets/portrait.jpg'

type View = 'home' | 'login' | 'access' | 'features' | 'security'

const NAV: { view: View; label: string }[] = [
  { view: 'home', label: 'Home' },
  { view: 'features', label: 'Features' },
  { view: 'security', label: 'Security' },
]

export function SignInScreen() {
  const [view, setView] = useState<View>('home')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (view === 'home') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setView('home')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  const go = (v: View) => {
    setMenuOpen(false)
    setView(v)
  }

  return (
    // No z-index on this root or on the stage below: the portrait is a white-
    // background photo that relies on mix-blend-multiply against the backdrop,
    // and a stacking context in between would leave the white box visible.
    <div className="relative min-h-dvh overflow-x-hidden bg-[#eef5ff] lg:h-dvh lg:min-h-[640px] lg:overflow-hidden">
      <Backdrop />

      {/* ---- header ---- */}
      <header className="relative z-20 flex items-center px-5 pt-6 lg:absolute lg:inset-x-0 lg:top-0 lg:gap-16 lg:px-[6%] lg:pt-8">
        <Brand />
        <nav className="hidden lg:flex items-center gap-10">
          {NAV.map((n) => (
            <button
              key={n.view}
              onClick={() => go(n.view)}
              className={`text-[15px] font-medium pb-1 border-b-2 transition-colors ${
                view === n.view
                  ? 'text-brand-600 border-brand-600'
                  : 'text-slate-700 border-transparent hover:text-brand-600'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <button
          className="lg:hidden ml-auto h-10 w-10 grid place-items-center rounded-xl text-brand-600"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={28} /> : <Menu size={30} />}
        </button>

        {menuOpen && (
          <div className="lg:hidden absolute right-5 top-[4.5rem] w-48 rounded-2xl border border-white/80 bg-white/80 backdrop-blur-xl shadow-xl p-1.5 animate-pop">
            {NAV.map((n) => (
              <button
                key={n.view}
                onClick={() => go(n.view)}
                className="w-full text-left rounded-xl px-3.5 py-2.5 text-[14px] font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700"
              >
                {n.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="relative flex flex-col lg:absolute lg:inset-0 lg:block">
        {/* ---- copy + calls to action ---- */}
        <div className="relative z-10 px-5 pt-9 lg:absolute lg:left-[6%] lg:top-[46%] lg:-translate-y-1/2 lg:max-w-[640px] lg:p-0">
          <h1 className="whitespace-nowrap font-bold leading-[1.06] tracking-tight text-[clamp(1.9rem,8.4vw,2.75rem)] lg:text-[clamp(2.9rem,4.4vw,4.75rem)]">
            <span className="block text-[#0b1b6b]">Smarter today.</span>
            <span className="block text-[#1f6bff]">Brighter tomorrow.</span>
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-slate-800 lg:mt-6 lg:text-[clamp(1rem,1.4vw,1.35rem)]">
            An <strong className="font-bold text-[#1f6bff]">AI-powered</strong> cloud-based app
            <br />
            to manage your daily <strong className="font-bold text-[#1f6bff]">financial basket.</strong>
          </p>

          <div className="mt-6 flex gap-3.5 lg:mt-9">
            <button
              onClick={() => go('login')}
              className="inline-flex h-12 min-w-[7.5rem] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#2d8bff] to-[#0b5cf0] px-6 text-[16px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(11,92,240,0.7)] transition hover:brightness-110 active:scale-[0.98] sm:flex-none sm:min-w-[10.5rem] lg:h-14"
            >
              Login <ArrowRight size={19} />
            </button>
            <button
              onClick={() => go('access')}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-[#2f7bff] bg-white/30 px-6 text-[16px] font-semibold text-[#1f5fe0] backdrop-blur-sm transition hover:bg-white/70 active:scale-[0.98] sm:flex-none lg:h-14"
            >
              Request Access
            </button>
          </div>

          <button
            onClick={() => go('features')}
            className="mt-5 inline-flex items-center gap-2 border-b border-[#1f5fe0] pb-0.5 text-[15px] font-medium text-[#1f5fe0] lg:mt-7"
          >
            Learn more <ArrowRight size={16} />
          </button>
        </div>

        {/* ---- person + floating glass UI ---- */}
        <div className="pointer-events-none relative -mt-1 h-[118vw] sm:h-[560px] lg:absolute lg:inset-0 lg:mt-0 lg:h-auto">
          {/* big glass panel with the logo (xl only) */}
          <div className="absolute right-[2%] top-[11%] hidden h-[33%] w-[16%] rounded-[28px] border border-white/70 bg-gradient-to-b from-white/55 to-white/10 shadow-[0_20px_50px_-20px_rgba(37,99,235,0.35)] backdrop-blur-[2px] xl:block">
            <CloudBasketMark className="absolute left-1/2 top-[16%] w-[72%] -translate-x-1/2 drop-shadow-[0_18px_22px_rgba(37,99,235,0.35)]" />
          </div>

          <img
            src={portrait}
            width={1201}
            height={1310}
            alt="Cloud Basket — a smiling professional working on a laptop"
            className="absolute bottom-0 right-[-12%] w-[110%] max-w-none mix-blend-multiply sm:right-0 sm:w-[62%] sm:max-w-[520px] lg:-bottom-[6dvh] lg:h-[min(88dvh,50vw)] lg:w-auto lg:max-w-none"
            fetchPriority="high"
          />

          {/* mobile mark, top-right of the portrait */}
          <CloudBasketMark className="absolute right-[5%] top-[-1%] w-[27%] drop-shadow-[0_12px_16px_rgba(37,99,235,0.3)] lg:hidden" />

          <GlassCard
            icon={<BarChart3 size={20} />}
            label="AI Insights"
            className="left-[3%] top-[12%] xl:left-[47%] xl:top-[27%] xl:w-[13%]"
            delay="0s"
          />
          <GlassCard
            icon={<FileText size={20} />}
            label="Daily Expenses"
            className="left-[3%] top-[33%] xl:left-[45%] xl:top-[50%] xl:w-[14%]"
            delay="1.2s"
          />
          <GlassCard
            icon={<ShoppingBasket size={20} />}
            label="Your Financial Basket"
            className="right-[2%] top-[24%] xl:right-[1.5%] xl:top-[47%] xl:w-[13.5%]"
            delay="2.4s"
          />
        </div>
      </main>

      {/* ---- footer ---- */}
      <footer className="relative z-20 mx-5 -mt-10 pb-5 lg:absolute lg:inset-x-[4%] lg:bottom-6 lg:mx-0 lg:mt-0 lg:pb-0">
        <div className="flex items-center justify-center rounded-2xl border border-white/80 bg-white/85 px-2 py-3.5 shadow-[0_10px_30px_-12px_rgba(37,99,235,0.3)] backdrop-blur-xl lg:justify-start lg:gap-14 lg:px-8 lg:py-4">
          <button
            onClick={() => go('security')}
            className="flex flex-1 items-center justify-center gap-3 text-[14px] font-medium text-slate-700 hover:text-brand-700 lg:flex-none"
          >
            <ShieldCheck size={26} className="text-brand-600" strokeWidth={1.6} /> Privacy &amp; Security
          </button>
          <span className="h-7 w-px bg-brand-300/70 lg:hidden" />
          <span className="hidden h-7 w-px bg-brand-300/70 lg:block" />
          <button
            onClick={() => go('login')}
            className="flex flex-1 items-center justify-center gap-3 text-[14px] font-medium text-slate-700 hover:text-brand-700 lg:flex-none"
          >
            <Lock size={26} className="text-brand-600" strokeWidth={1.6} /> Secure Access
          </button>
          <a
            href="https://www.cloudbasket.net"
            target="_blank"
            rel="noreferrer"
            className="ml-auto hidden items-center gap-3 text-[14px] font-medium text-brand-700 lg:flex"
          >
            <Globe size={22} strokeWidth={1.6} /> www.cloudbasket.net
          </a>
        </div>
        <a
          href="https://www.cloudbasket.net"
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2.5 text-[14px] font-medium text-brand-700 lg:hidden"
        >
          <Globe size={20} strokeWidth={1.6} /> www.cloudbasket.net
        </a>
      </footer>

      {view !== 'home' && <Panel view={view} onClose={() => go('home')} onSwitch={go} />}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Brand                                                                     */
/* ------------------------------------------------------------------------ */

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <CloudBasketMark className="h-11 w-auto lg:h-[3.25rem]" />
      <p className="text-[22px] font-bold leading-[0.95] tracking-tight lg:text-[26px]">
        <span className="block text-[#0b1b6b]">Cloud</span>
        <span className="block text-[#1f6bff]">Basket</span>
      </p>
    </div>
  )
}

/** A cloud holding a rising bar chart, sitting in a basket. */
function CloudBasketMark({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const stroke = `${id}-s`
  const fill = `${id}-f`
  return (
    <svg viewBox="0 0 64 58" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={stroke} x1="8" y1="6" x2="56" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5db2ff" />
          <stop offset="1" stopColor="#1256e8" />
        </linearGradient>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#4a9bff" />
          <stop offset="1" stopColor="#0f4fdc" />
        </linearGradient>
      </defs>
      <path
        d="M19 37C11 37 7 31.5 8 26C9 20.5 14.5 17.5 20 18.5C21.5 10.5 30 6 37.5 8.8C42 10.4 44.6 13.4 45.6 16.6C52.5 16 57.5 21 56.5 27.5C55.6 33 51.5 37 46 37"
        stroke={`url(#${stroke})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="23" y="27" width="5.5" height="11" rx="1.2" fill={`url(#${fill})`} />
      <rect x="30.5" y="20" width="5.5" height="18" rx="1.2" fill={`url(#${fill})`} />
      <rect x="38" y="13" width="5.5" height="25" rx="1.2" fill={`url(#${fill})`} />
      <rect x="10.5" y="38.5" width="43" height="5" rx="2.5" fill={`url(#${fill})`} />
      <path
        d="M14.5 45.5H49.5L46.6 52.6C46 54.1 44.7 55 43.2 55H20.8C19.3 55 18 54.1 17.4 52.6Z"
        fill={`url(#${fill})`}
      />
      <path d="M24 47.5V52.5M32 47.5V52.5M40 47.5V52.5" stroke="#fff" strokeOpacity=".4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------------ */
/* Background + floating cards                                              */
/* ------------------------------------------------------------------------ */

const TOWERS: [number, number, number][] = [
  // x, width, height
  [40, 70, 210], [130, 55, 300], [205, 80, 250], [305, 60, 380], [385, 90, 290], [495, 55, 340],
  [570, 75, 240], [665, 50, 420], [735, 85, 300], [840, 60, 260], [920, 70, 360], [1010, 90, 280],
  [1120, 60, 330], [1200, 80, 250], [1300, 55, 400], [1375, 85, 290], [1480, 70, 230],
]

function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-br from-white via-[#eaf3ff] to-[#d6e8ff]" />
      <div className="absolute -left-[10%] top-[8%] h-[55%] w-[55%] rounded-full bg-white/70 blur-3xl" />
      <div className="absolute -right-[8%] bottom-[10%] h-[50%] w-[45%] rounded-full bg-[#bcd9ff]/60 blur-3xl" />
      <svg
        viewBox="0 0 1600 500"
        preserveAspectRatio="xMidYMax slice"
        className="absolute bottom-0 left-0 h-[62%] w-full opacity-70 blur-[5px]"
      >
        <defs>
          <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#9fc4f5" stopOpacity=".65" />
            <stop offset="1" stopColor="#d9e9ff" stopOpacity=".1" />
          </linearGradient>
        </defs>
        {TOWERS.map(([x, w, h]) => (
          <rect key={x} x={x} y={500 - h} width={w} height={h} rx="3" fill="url(#tower)" />
        ))}
      </svg>
      {/* keep the copy legible where it crosses the towers */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white/70 to-transparent" />
    </div>
  )
}

function GlassCard({
  icon,
  label,
  className,
  delay,
}: {
  icon: ReactNode
  label: string
  className: string
  delay: string
}) {
  return (
    <div
      className={`animate-float absolute z-20 w-max max-w-[40%] rounded-2xl border border-white/80 bg-white/55 p-2.5 shadow-[0_14px_30px_-14px_rgba(37,99,235,0.45)] backdrop-blur-md lg:hidden xl:block xl:max-w-none xl:p-3.5 ${className}`}
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-2 text-[#1f6bff]">
        {icon}
        <span className="flex-1 text-[12px] font-semibold leading-tight xl:whitespace-normal text-slate-800 xl:text-[13px]">{label}</span>
        <ChevronRight size={14} />
      </div>
      <div className="mt-2 ml-7 h-1.5 w-[70%] rounded-full bg-brand-200/80" />
      <div className="mt-1.5 ml-7 h-1.5 w-[40%] rounded-full bg-brand-200/60" />
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Dialog: sign in / request access / features / security                    */
/* ------------------------------------------------------------------------ */

const FEATURES = [
  'AI insights and advisors that read your own numbers',
  'Multi-currency accounts rolled into one base currency',
  'Budgets, goals and loan schedules',
  'Bill scanning with price history',
  'Document expiry reminders',
  'Reports and CSV export',
]

const SECURITY = [
  'Private sign-in — there is no public sign-up',
  'Your data syncs to your own database, not a shared one',
  'Signing out clears the data from this browser',
]

function Panel({ view, onClose, onSwitch }: { view: Exclude<View, 'home'>; onClose: () => void; onSwitch: (v: View) => void }) {
  const title = { login: 'Welcome back', access: 'Request access', features: 'What you get', security: 'Privacy & security' }[view]

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/25 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="animate-pop relative w-full max-w-[400px] rounded-3xl border border-white/80 bg-white/95 p-7 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={18} />
        </button>

        <CloudBasketMark className="mb-4 h-10 w-auto" />
        <h2 className="text-[24px] font-extrabold tracking-tight text-[#0b1b6b]">{title}</h2>

        {view === 'login' && <LoginForm />}

        {view === 'access' && (
          <>
            <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">
              Cloud Basket is a private workspace. Accounts are created by the owner — there is no public sign-up.
              Ask the owner to set up your login, then come back and sign in.
            </p>
            <button onClick={() => onSwitch('login')} className="btn-primary mt-6 h-11 w-full">
              I already have a login <ArrowRight size={16} />
            </button>
          </>
        )}

        {(view === 'features' || view === 'security') && (
          <>
            <ul className="mt-4 space-y-2.5">
              {(view === 'features' ? FEATURES : SECURITY).map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-slate-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => onSwitch('login')} className="btn-primary mt-6 h-11 w-full">
              Login <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function LoginForm() {
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
    <>
      <p className="mb-6 mt-1.5 text-[13px] text-slate-500">Sign in to reach your financial dashboard.</p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              autoFocus
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

        <button type="submit" disabled={busy} className="btn-primary h-11 w-full disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          Sign In
        </button>
      </form>
    </>
  )
}
