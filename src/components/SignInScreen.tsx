import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ChartNoAxesCombined,
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
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import portrait from '@/assets/portrait.jpg'
import { CloudBasketMark } from '@/components/CloudBasketMark'
import {
  DEFAULT_ANALYTICS, DEFAULT_SEO, applySeoToDocument, loadSiteConfig, setRobots, type AnalyticsConfig, type SeoConfig,
} from '@/lib/siteConfig'
import { needsConsentPrompt, saveConsent, startAnalytics, trackEvent } from '@/lib/analytics'

type View = 'home' | 'login' | 'access' | 'features' | 'security'

const NAV: { view: View; label: string }[] = [
  { view: 'home', label: 'Home' },
  { view: 'features', label: 'Features' },
  { view: 'security', label: 'Security' },
]

export function SignInScreen() {
  const [view, setView] = useState<View>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [site, setSite] = useState<{ seo: SeoConfig; analytics: AnalyticsConfig }>({ seo: DEFAULT_SEO, analytics: DEFAULT_ANALYTICS })
  const [consentOpen, setConsentOpen] = useState(false)

  // Public-page SEO and (consented) analytics. The signed-in app does neither.
  useEffect(() => {
    let live = true
    setRobots(true)
    applySeoToDocument(DEFAULT_SEO, 'home')
    loadSiteConfig().then((c) => {
      if (!live) return
      setSite(c)
      applySeoToDocument(c.seo, 'home')
      startAnalytics(c.analytics)
      setConsentOpen(needsConsentPrompt(c.analytics))
    })
    return () => { live = false }
  }, [])

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
    //
    // Desktop sizes are in vw so the layout scales as one piece, matching the
    // 16:9 reference design.
    <div className="relative min-h-dvh overflow-x-hidden bg-[#eef5ff] lg:h-dvh lg:min-h-[640px] lg:overflow-hidden">
      <Backdrop />

      {/* ---- header ---- */}
      <header className="relative z-20 flex items-center px-5 pt-6 lg:absolute lg:left-[5.8%] lg:right-0 lg:top-[9.3%] lg:-translate-y-1/2 lg:gap-[6.8vw] lg:p-0">
        <Brand />
        <nav className="hidden lg:flex items-center gap-[2.9vw]">
          {NAV.map((n) => (
            <button
              key={n.view}
              onClick={() => go(n.view)}
              className={`border-b-2 pb-1.5 text-[clamp(0.85rem,1.06vw,1.1rem)] font-medium transition-colors ${
                view === n.view
                  ? 'border-[#1f6bff] text-[#1f6bff]'
                  : 'border-transparent text-[#1b2a5c] hover:text-[#1f6bff]'
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
        <div className="relative z-10 px-5 pt-9 lg:absolute lg:left-[5.9%] lg:top-[46.5%] lg:-translate-y-1/2 lg:p-0">
          <h1 className="whitespace-nowrap font-bold leading-[1.08] tracking-tight text-[clamp(1.9rem,8.4vw,2.75rem)] lg:text-[clamp(2.4rem,3.6vw,4rem)]">
            <span className="block text-[#0b1b6b]">Smarter today.</span>
            <span className="block text-[#1f6bff]">Brighter tomorrow.</span>
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-[#12224f] lg:mt-[1.4vw] lg:text-[clamp(0.95rem,1.36vw,1.5rem)] lg:leading-[1.3]">
            An <strong className="font-bold text-[#1f6bff]">AI-powered</strong> cloud-based app
            <br />
            to manage your daily <strong className="font-bold text-[#1f6bff]">financial basket.</strong>
          </p>

          <div className="mt-6 flex gap-3.5 lg:mt-[2.6vw] lg:gap-[1.1vw]">
            <button
              onClick={() => go('login')}
              className="inline-flex h-12 min-w-[7.5rem] flex-1 whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#2d8bff] to-[#0b5cf0] px-6 text-[16px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(11,92,240,0.7)] transition hover:brightness-110 active:scale-[0.98] sm:flex-none sm:min-w-[10.5rem] lg:h-[clamp(2.75rem,3.45vw,3.7rem)] lg:w-[clamp(7.5rem,11.1vw,12rem)] lg:min-w-0 lg:rounded-lg lg:px-0 lg:text-[clamp(0.95rem,1.15vw,1.25rem)]"
            >
              Login <ArrowRight size={19} />
            </button>
            <button
              onClick={() => go('access')}
              className="inline-flex h-12 flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-[#2f7bff] bg-white/30 px-4 text-[16px] font-semibold text-[#1f5fe0] backdrop-blur-sm transition hover:bg-white/70 active:scale-[0.98] sm:flex-none lg:h-[clamp(2.75rem,3.45vw,3.7rem)] lg:w-[clamp(8.5rem,12.75vw,13.75rem)] lg:rounded-lg lg:px-0 lg:text-[clamp(0.95rem,1.15vw,1.25rem)]"
            >
              Request Access
            </button>
          </div>

          <button
            onClick={() => go('features')}
            className="mt-5 inline-flex items-center gap-2 border-b border-[#1f5fe0] pb-0.5 text-[15px] font-medium text-[#1f5fe0] lg:mt-[1.75vw] lg:text-[clamp(0.85rem,1.06vw,1.15rem)]"
          >
            Learn more <ArrowRight size={16} />
          </button>
        </div>

        {/* ---- person + floating glass UI ---- */}
        <div className="pointer-events-none relative -mt-1 h-[118vw] sm:h-[560px] lg:absolute lg:inset-0 lg:mt-0 lg:h-auto">
          {/* rising bars, right of the laptop (xl only) */}
          <BarsDecor className="absolute left-[86.2%] top-[56.5%] hidden w-[13.8%] xl:block" />

          {/* tall glass slab holding the logo (xl only) */}
          <div className="absolute left-[74.4%] top-[12.4%] hidden h-[39.8%] w-[19.9%] rounded-lg border border-white/80 bg-gradient-to-br from-white/55 via-white/15 to-white/35 shadow-[0_24px_60px_-30px_rgba(37,99,235,0.4)] backdrop-blur-[1px] xl:block">
            <CloudBasketMark className="absolute left-[20%] top-[19%] w-[58%] drop-shadow-[0_18px_22px_rgba(37,99,235,0.3)]" />
          </div>

          <div className="absolute bottom-0 right-[-12%] w-[110%] sm:right-0 sm:w-[62%] sm:max-w-[520px] lg:bottom-[-0.5dvh] lg:right-[11.9vw] lg:w-[min(40vw,72dvh)] lg:max-w-none">
            <img
              src={portrait}
              width={1201}
              height={1310}
              alt="Cloud Basket — a smiling professional working on a laptop"
              className="block h-auto w-full mix-blend-multiply"
              fetchPriority="high"
            />
            {/* The photo is cropped at the knee; carry the trouser leg on to the
                screen edge, as the design does. Colours sampled from the photo. */}
            <svg
              viewBox="0 0 300 1310"
              preserveAspectRatio="none"
              className="absolute bottom-0 left-full hidden h-full w-[25%] lg:block"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="leg" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#464c64" />
                  <stop offset=".35" stopColor="#2f3650" />
                  <stop offset="1" stopColor="#222938" />
                </linearGradient>
              </defs>
              <polygon points="0,1103 300,1313 300,1310 0,1310" fill="url(#leg)" />
            </svg>
          </div>

          {/* mobile mark, top-right of the portrait */}
          <CloudBasketMark className="absolute right-[5%] top-[-1%] w-[27%] drop-shadow-[0_12px_16px_rgba(37,99,235,0.3)] lg:hidden" />

          <GlassCard
            Icon={ChartNoAxesCombined}
            label="AI Insights"
            className="left-[3%] top-[12%] xl:left-[44.5%] xl:top-[27.5%] xl:w-[11.9%]"
            delay="0s"
          />
          <GlassCard
            Icon={FileText}
            label="Daily Expenses"
            className="left-[3%] top-[33%] xl:left-[42.5%] xl:top-[50.2%] xl:w-[13.2%]"
            delay="1.2s"
          />
          <GlassCard
            Icon={ShoppingBasket}
            label="Your Financial Basket"
            wrap
            className="right-[2%] top-[24%] xl:left-[83.4%] xl:right-auto xl:top-[41.1%] xl:w-[13.9%]"
            delay="2.4s"
          />
        </div>
      </main>

      {/* ---- footer ---- */}
      <footer className="relative z-20 mx-5 -mt-10 pb-5 lg:absolute lg:inset-x-[3.9%] lg:bottom-[3.3%] lg:mx-0 lg:mt-0 lg:pb-0">
        <div className="flex items-center justify-center rounded-2xl border border-white/80 bg-white/85 px-2 py-3.5 shadow-[0_10px_30px_-12px_rgba(37,99,235,0.3)] backdrop-blur-xl lg:h-[clamp(3.25rem,6.7dvh,4.5rem)] lg:justify-start lg:gap-[2.3vw] lg:bg-white/80 lg:px-[1.9vw] lg:py-0">
          <button
            onClick={() => go('security')}
            className="flex flex-1 items-center justify-center gap-3 text-[14px] font-medium text-[#1b2a5c] hover:text-brand-700 lg:flex-none lg:text-[clamp(13px,0.94vw,16px)]"
          >
            <ShieldCheck size={26} className="text-[#1f6bff]" strokeWidth={1.6} /> Privacy &amp; Security
          </button>
          <span className="h-7 w-px bg-brand-300/70" />
          <button
            onClick={() => go('login')}
            className="flex flex-1 items-center justify-center gap-3 text-[14px] font-medium text-[#1b2a5c] hover:text-brand-700 lg:flex-none lg:text-[clamp(13px,0.94vw,16px)]"
          >
            <Lock size={26} className="text-[#1f6bff]" strokeWidth={1.6} /> Secure Access
          </button>
          <a
            href="https://www.cloudbasket.net"
            target="_blank"
            rel="noreferrer"
            className="ml-auto hidden items-center gap-3 text-[clamp(13px,0.94vw,16px)] font-medium text-[#1f5fe0] lg:flex"
          >
            <Globe size={22} strokeWidth={1.6} /> www.cloudbasket.net
          </a>
        </div>
        <a
          href="https://www.cloudbasket.net"
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2.5 text-[14px] font-medium text-[#1f5fe0] lg:hidden"
        >
          <Globe size={20} strokeWidth={1.6} /> www.cloudbasket.net
        </a>
      </footer>

      {view !== 'home' && <Panel view={view} onClose={() => go('home')} onSwitch={go} contactEmail={site.seo.contactEmail} onLead={() => trackEvent('lead')} />}

      {consentOpen && (
        <div role="dialog" aria-label="Cookie consent" className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-xl rounded-2xl border border-white/80 bg-white/95 p-4 shadow-2xl backdrop-blur">
          <p className="text-[12.5px] leading-relaxed text-slate-700">
            We would like to use analytics and advertising cookies on this public page to understand visits. They are never
            used inside your account and no financial information is shared.
          </p>
          <div className="mt-3 flex gap-2 justify-end">
            <button className="btn-ghost h-9" onClick={() => { saveConsent('denied'); setConsentOpen(false) }}>Decline</button>
            <button className="btn-primary h-9" onClick={() => { saveConsent('granted'); setConsentOpen(false); startAnalytics(site.analytics) }}>Accept</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Brand                                                                     */
/* ------------------------------------------------------------------------ */

function Brand() {
  return (
    <div className="flex items-center gap-2.5 lg:gap-[0.6vw]">
      <CloudBasketMark className="h-11 w-auto lg:h-[clamp(2.75rem,4.25vw,4.5rem)]" />
      <p className="text-[22px] font-bold leading-[0.95] tracking-tight lg:text-[clamp(1.35rem,1.75vw,1.9rem)]">
        <span className="block text-[#0b1b6b]">Cloud</span>
        <span className="block text-[#1f6bff]">Basket</span>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Background + floating cards                                              */
/* ------------------------------------------------------------------------ */

/**
 * The glass-office backdrop from the design: pale sky, blurred towers, window
 * mullions, soft plants and a white desk. Drawn in the design's 1600×900 space
 * and cropped with "slice", so phones get the centre of the same picture.
 */
function Backdrop() {
  const towers: [number, number, number, number][] = [
    // x, y, width, height
    [420, 320, 50, 400], [484, 214, 54, 500], [552, 232, 24, 480], [622, 150, 46, 560],
    [676, 300, 20, 410], [706, 236, 26, 470], [738, 118, 34, 600], [782, 210, 34, 500],
    [1074, 146, 40, 560], [1124, 250, 34, 450], [1190, 300, 40, 400],
  ]
  const blurs: [string, number][] = [['b1', 1], ['b3', 3], ['b14', 14]]
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#d6e6fa" />
          <stop offset=".4" stopColor="#e6f0fc" />
          <stop offset=".72" stopColor="#f6faff" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <linearGradient id="bg-tower" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#8dafdc" stopOpacity=".72" />
          <stop offset="1" stopColor="#dbe8f8" stopOpacity=".12" />
        </linearGradient>
        <linearGradient id="bg-floor" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#edf3fc" />
        </linearGradient>
        {blurs.map(([id, sd]) => (
          <filter key={id} id={`bg-${id}`} filterUnits="userSpaceOnUse" x="-200" y="-200" width="2000" height="1300">
            <feGaussianBlur stdDeviation={sd} />
          </filter>
        ))}
      </defs>

      <rect width="1600" height="900" fill="url(#bg-sky)" />
      <ellipse cx="800" cy="330" rx="760" ry="260" fill="#fff" opacity=".4" filter="url(#bg-b14)" />

      <g filter="url(#bg-b3)">
        {towers.map(([x, y, w, h]) => (
          <rect key={x} x={x} y={y} width={w} height={h} fill="url(#bg-tower)" />
        ))}
        <polygon points="742,118 755,74 768,118" fill="#8dafdc" opacity=".55" />
      </g>

      {/* window mullions */}
      <g filter="url(#bg-b1)">
        {[[26, 30], [858, 32], [1148, 14], [1506, 12]].map(([x, w]) => (
          <g key={x}>
            <rect x={x} y="0" width={w} height="770" fill="#fff" opacity=".78" />
            <rect x={x + w} y="0" width="6" height="770" fill="#a9c2e3" opacity=".25" />
          </g>
        ))}
      </g>

      {/* plants */}
      <g filter="url(#bg-b14)">
        <ellipse cx="18" cy="340" rx="44" ry="96" fill="#94cdb0" opacity=".8" />
        <ellipse cx="48" cy="470" rx="52" ry="58" fill="#7fc19f" opacity=".7" />
        <ellipse cx="6" cy="250" rx="40" ry="50" fill="#a9d8bf" opacity=".8" />
        <ellipse cx="1574" cy="330" rx="62" ry="92" fill="#94cdb0" opacity=".8" />
        <ellipse cx="1592" cy="424" rx="42" ry="58" fill="#7fc19f" opacity=".7" />
        <ellipse cx="684" cy="476" rx="88" ry="72" fill="#b3dbc7" opacity=".9" />
        <ellipse cx="744" cy="430" rx="40" ry="60" fill="#a2d3bb" opacity=".8" />
      </g>

      {/* planters, books and desk */}
      <g filter="url(#bg-b3)">
        <rect x="604" y="556" width="160" height="140" rx="10" fill="#fff" opacity=".92" />
        <rect x="-20" y="470" width="60" height="210" fill="#fff" opacity=".9" />
      </g>
      <rect y="690" width="1600" height="210" fill="url(#bg-floor)" />
      <g filter="url(#bg-b3)">
        <rect x="0" y="676" width="222" height="22" fill="#fff" stroke="#dbe6f4" />
        <rect x="0" y="700" width="318" height="36" fill="#fff" stroke="#dbe6f4" />
        <polygon points="700,748 1600,740 1600,770 700,782" fill="#fff" opacity=".6" stroke="#e1ebf7" />
      </g>
    </svg>
  )
}

/** Translucent rising bars on a glass shelf, right of the laptop. */
function BarsDecor({ className }: { className: string }) {
  const bars: [number, number][] = [[7, 42], [50, 66], [91, 100], [140, 147]]
  return (
    <svg viewBox="0 0 220 190" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bars-face" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#5ea3ff" stopOpacity=".9" />
          <stop offset="1" stopColor="#a9cdfc" stopOpacity=".55" />
        </linearGradient>
      </defs>
      {bars.map(([x, h]) => (
        <g key={x}>
          <rect x={x} y={160 - h} width="30" height={h} rx="2" fill="url(#bars-face)" stroke="#fff" strokeOpacity=".7" />
          <rect x={x + 30} y={160 - h + 4} width="6" height={h - 4} fill="#7db4ff" opacity=".45" />
        </g>
      ))}
      <rect x="0" y="162" width="220" height="22" rx="3" fill="#fff" fillOpacity=".55" stroke="#fff" />
    </svg>
  )
}

function GlassCard({
  Icon,
  label,
  className,
  delay,
  wrap = false,
}: {
  Icon: LucideIcon
  label: string
  className: string
  delay: string
  wrap?: boolean
}) {
  return (
    <div
      className={`animate-float absolute z-20 flex w-max max-w-[46%] items-center gap-2.5 rounded-2xl border border-white/80 bg-white/50 p-2.5 shadow-[0_14px_30px_-14px_rgba(37,99,235,0.45)] backdrop-blur-md lg:hidden xl:flex xl:max-w-none xl:gap-[0.9vw] xl:px-[1.2vw] xl:py-[1.4vw] ${className}`}
      style={{ animationDelay: delay }}
    >
      <Icon strokeWidth={1.7} className="h-[18px] w-[18px] shrink-0 text-[#1f6bff] xl:h-[2.4vw] xl:w-[2.4vw]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`flex-1 text-[12px] font-semibold leading-tight text-[#12224f] xl:text-[clamp(12px,0.94vw,16px)] ${wrap ? '' : 'whitespace-nowrap'}`}>
            {label}
          </span>
          <ChevronRight size={14} className="shrink-0 text-[#1f6bff]" />
        </div>
        <div className="mt-2 h-1.5 w-[85%] rounded-full bg-brand-200/80" />
        <div className="mt-1.5 h-1.5 w-[45%] rounded-full bg-brand-200/60" />
      </div>
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

function Panel({ view, onClose, onSwitch, contactEmail, onLead }: { view: Exclude<View, 'home'>; onClose: () => void; onSwitch: (v: View) => void; contactEmail?: string; onLead: () => void }) {
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
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}?subject=${encodeURIComponent('Request access to CloudBasket 360')}`}
                onClick={onLead}
                className="btn-primary mt-6 h-11 w-full"
              >
                Email the owner to request access <ArrowRight size={16} />
              </a>
            )}
            <button onClick={() => onSwitch('login')} className={`${contactEmail ? 'btn-ghost mt-3' : 'btn-primary mt-6'} h-11 w-full`}>
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
            <a href={view === 'features' ? '/features' : '/security'} className="mt-4 inline-block text-[12.5px] font-semibold text-brand-600">
              Read the full {view === 'features' ? 'features' : 'security'} page · <span className="underline">FAQ at /faq</span> →
            </a>
            <button onClick={() => onSwitch('login')} className="btn-primary mt-4 h-11 w-full">
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
