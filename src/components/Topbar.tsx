import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, Check, ChevronDown, CloudOff, LogOut, Menu, Search, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { hardWarnings } from '@/lib/insights'
import { fmtDate, money, daysLeft } from '@/lib/format'
import { docStatus } from '@/lib/selectors'
import { hasSupabase, supabase } from '@/lib/supabase'
import type { Currency } from '@/types'
import { InstallAppButton } from '@/components/InstallApp'

interface Hit {
  label: string
  sub: string
  to: string
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const nav = useNavigate()
  const { settings, updateSettings, transactions, accounts, documents, notes, loans, bills } = useStore()
  const userEmail = useStore((s) => s.userEmail)
  const syncError = useStore((s) => s.syncError)
  const lastSynced = useStore((s) => s.lastSynced)
  const [userOpen, setUserOpen] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close the notification and account menus when clicking away or pressing Escape.
  useEffect(() => {
    if (!bellOpen && !userOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (bellOpen && !bellRef.current?.contains(target)) setBellOpen(false)
      if (userOpen && !userRef.current?.contains(target)) setUserOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setBellOpen(false)
      setUserOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [bellOpen, userOpen])

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const out: Hit[] = []
    for (const t of transactions) {
      if (t.description.toLowerCase().includes(term) || t.category.toLowerCase().includes(term))
        out.push({
          label: t.description,
          sub: `${t.type === 'income' ? 'Income' : 'Expense'} · ${fmtDate(t.date)} · ${money(t.amount, t.currency)}`,
          to: t.type === 'income' ? '/income' : '/expenses',
        })
    }
    for (const a of accounts)
      if (a.name.toLowerCase().includes(term)) out.push({ label: a.name, sub: `Account · ${a.details}`, to: '/accounts' })
    for (const d of documents)
      if (d.name.toLowerCase().includes(term)) out.push({ label: d.name, sub: `Document · expires ${fmtDate(d.expiry)}`, to: '/documents' })
    for (const n of notes)
      if (n.title.toLowerCase().includes(term)) out.push({ label: n.title, sub: `Note · ${n.status}`, to: '/notes' })
    for (const l of loans)
      if (l.name.toLowerCase().includes(term)) out.push({ label: l.name, sub: `Loan · ${money(l.outstanding, l.currency)}`, to: '/loans' })
    return out.slice(0, 8)
  }, [q, transactions, accounts, documents, notes, loans])

  const { settings: cfg, budgets, transactions: txns, analysis } = useStore()

  const alerts = useMemo(() => {
    const items: { text: string; tone: string; to: string }[] = []

    // Facts first: over-budget lines and overdue items, computed locally.
    for (const w of hardWarnings(txns, budgets, bills, loans, cfg)) {
      items.push({ text: `${w.title} — ${w.detail}`, tone: 'rose', to: '/budget' })
    }

    // Then anything the AI analysis flagged as a warning.
    for (const i of analysis?.insights ?? []) {
      if (i.kind !== 'warning') continue
      items.push({ text: `${i.title} — ${i.detail}`, tone: 'rose', to: '/' })
    }

    for (const d of documents) {
      const st = docStatus(d.expiry)
      if (st !== 'Valid')
        items.push({ text: `${d.name} ${st === 'Expired' ? 'has expired' : `expires in ${daysLeft(d.expiry)} days`}`, tone: st === 'Expired' ? 'rose' : 'amber', to: '/documents' })
    }
    for (const l of loans)
      if (l.status === 'Overdue') items.push({ text: `${l.name} payment is overdue`, tone: 'rose', to: '/loans' })
      else if (l.status === 'Due Soon') items.push({ text: `${l.name} due on ${fmtDate(l.nextPayment)}`, tone: 'amber', to: '/loans' })
    for (const b of bills)
      if (b.status === 'Overdue') items.push({ text: `${b.name} bill is overdue`, tone: 'rose', to: '/bills' })
    return items
  }, [documents, loans, bills, txns, budgets, cfg, analysis])

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-[#e8edf5] pad-safe-top">
      <div className="h-16 px-4 lg:px-6 flex items-center gap-3">
        <button onClick={onMenu} className="lg:hidden h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 cursor-pointer">
          <Menu size={18} />
        </button>

        <div className="relative flex-1 max-w-xl">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search transactions, accounts, documents, notes…"
            className="w-full h-10 rounded-xl bg-slate-50 border border-transparent pl-10 pr-3 sm:pr-16 text-[13px] outline-none transition
                       placeholder:text-slate-400 focus:bg-white focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10"
          />
          <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
          {open && hits.length > 0 && (
            <div className="absolute top-12 left-0 right-0 card p-1.5 z-40 animate-pop max-h-80 overflow-y-auto scroll-thin">
              {hits.map((h, i) => (
                <button
                  key={i}
                  onMouseDown={() => {
                    nav(h.to)
                    setQ('')
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <p className="text-[13px] font-semibold text-slate-800">{h.label}</p>
                  <p className="text-[11px] text-slate-500">{h.sub}</p>
                </button>
              ))}
            </div>
          )}
          {open && q.trim().length >= 2 && hits.length === 0 && (
            <div className="absolute top-12 left-0 right-0 card px-4 py-3 text-[12px] text-slate-400 z-40 animate-pop">
              No results for “{q}”
            </div>
          )}
        </div>

        <div className="hidden xl:flex items-center gap-2 h-10 px-3 rounded-xl border border-[#e2e8f0] bg-white text-[12px] font-semibold text-slate-600">
          <CalendarDays size={14} className="text-slate-400" />
          {fmtDate(settings.periodStart)} – {fmtDate(settings.periodEnd)}
        </div>

        <div className="relative hidden sm:block">
          <select
            value={settings.baseCurrency}
            onChange={(e) => updateSettings({ baseCurrency: e.target.value as Currency })}
            className="h-10 rounded-xl border border-[#e2e8f0] bg-white pl-3 pr-8 text-[12px] font-semibold text-slate-600 outline-none appearance-none cursor-pointer focus:border-brand-300"
          >
            <option value="AED">AED</option>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <InstallAppButton />

        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative h-10 w-10 grid place-items-center rounded-xl border border-[#e2e8f0] bg-white text-slate-500 hover:bg-slate-50 cursor-pointer"
          >
            <Bell size={16} />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4.5 min-w-4.5 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
                {alerts.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-12 w-80 card p-2 z-40 animate-pop">
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-[13px] font-bold text-slate-800">Notifications</p>
                <button onClick={() => setBellOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto scroll-thin">
                {alerts.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-slate-400">All clear 🎉</p>}
                {alerts.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      nav(a.to)
                      setBellOpen(false)
                    }}
                    className="w-full text-left flex gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: a.tone === 'rose' ? '#f43f5e' : '#f59e0b' }} />
                    <span className="text-[12px] text-slate-600 leading-snug">{a.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2.5 h-10 pl-1.5 pr-3 rounded-xl border border-[#e2e8f0] bg-white hover:bg-slate-50 cursor-pointer"
          >
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-cyan-400 grid place-items-center text-white text-[12px] font-bold">
              {settings.userName.charAt(0)}
            </span>
            <span className="hidden md:block leading-tight text-left">
              <span className="block text-[12px] font-bold text-slate-800">{settings.userName}</span>
              <span className="block text-[10px] text-slate-400">{settings.accountLabel}</span>
            </span>
            <ChevronDown size={13} className="text-slate-400 hidden md:block" />
          </button>

          {userOpen && (
            <div className="absolute right-0 top-12 w-64 card p-2 z-40 animate-pop">
              <div className="px-2.5 py-2 border-b border-[#f1f5f9] mb-1">
                <p className="text-[13px] font-bold text-slate-800">{settings.userName}</p>
                <p className="text-[11px] text-slate-400 truncate">{userEmail ?? settings.accountLabel}</p>
              </div>

              <div className="px-2.5 py-2 flex items-start gap-2 text-[11px]">
                {!hasSupabase ? (
                  <>
                    <CloudOff size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <span className="text-slate-500">Local mode — data stays in this browser.</span>
                  </>
                ) : syncError ? (
                  <>
                    <CloudOff size={13} className="text-rose-500 mt-0.5 shrink-0" />
                    <span className="text-rose-600">Sync failed: {syncError}</span>
                  </>
                ) : (
                  <>
                    <Check size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-slate-500">
                      Synced{lastSynced ? ` at ${new Date(lastSynced).toLocaleTimeString()}` : ''}
                    </span>
                  </>
                )}
              </div>

              <button
                onClick={() => { setUserOpen(false); nav('/settings') }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Settings
              </button>

              {hasSupabase && (
                <button
                  onClick={async () => { setUserOpen(false); await supabase?.auth.signOut() }}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer inline-flex items-center gap-2"
                >
                  <LogOut size={13} /> Sign Out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
