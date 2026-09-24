import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Banknote, CalendarClock, ChevronDown, CreditCard, Info, Landmark, PiggyBank, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, StatCard } from '@/components/ui/Primitives'
import { TODAY, convert, fmtDate, greeting, money, toBase } from '@/lib/format'
import { buildSnapshot } from '@/lib/financials'
import { tierTone } from '@/lib/status'
import { docStatus } from '@/lib/selectors'
import type { Currency } from '@/types'

/**
 * The first thing you see after signing in: your photo and status, a plain
 * sentence about where you stand, and the figures behind it — net worth,
 * available funds, debt, upcoming payments, cash flow and this month's P&L.
 */
export function FinancialSnapshot() {
  const s = useStore()
  const { settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people, membership } = s
  const [why, setWhy] = useState(false)
  const reporting = settings.baseCurrency
  const toReport = (a: number, c: Currency) => convert(a, c, reporting)
  // Snapshot maths is done in the reporting currency, so display it directly.
  const show = (v: number) => money(convert(v, reporting, 'AED'))

  const snap = useMemo(
    () =>
      buildSnapshot({
        today: TODAY, settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems,
        people: people.map((p) => p.name), toReport, fx: convert,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people, reporting],
  )

  const extra = settings.extra ?? {}
  const nw = snap.netWorth.netWorth
  const lv = extra.lastVisit
  const baseline = lv ? (lv.date < TODAY ? { date: lv.date, netWorth: lv.netWorth } : lv.prev) : undefined
  const change = baseline ? nw - baseline.netWorth : undefined

  // Remember today's net worth once per day so the next visit can show the change.
  useEffect(() => {
    if (membership && !membership.canEdit) return
    if (!accounts.length && !assets.length) return
    if (lv?.date === TODAY) return
    s.updateSettings({ extra: { ...extra, lastVisit: { date: TODAY, netWorth: nw, prev: lv ? { date: lv.date, netWorth: lv.netWorth } : undefined } } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nw, lv?.date, accounts.length, assets.length])

  const { tier, score, parts, caveats } = snap.status
  const photo = tier.photo || extra.profilePhoto
  const name = settings.userName

  // Practical suggestions, from the records only.
  const tips = useMemo(() => {
    const out: string[] = []
    const overdue = snap.upcoming.filter((u) => u.status === 'Overdue')
    if (overdue.length) out.push(`${overdue.length} payment${overdue.length > 1 ? 's are' : ' is'} overdue (${overdue.slice(0, 2).map((o) => o.name).join(', ')}) — settle ${overdue.length > 1 ? 'them' : 'it'} first.`)
    if (snap.upcomingTotal > snap.availableFunds && snap.upcomingTotal > 0) out.push(`Payments due in 30 days (${show(snap.upcomingTotal)}) are more than your available funds (${show(snap.availableFunds)}).`)
    if (snap.plNow.net < 0) out.push(`You are spending ${show(Math.abs(snap.plNow.net))} more than you earn this month — check the biggest categories in the P&L.`)
    else if (snap.plNow.income > 0 && snap.plNow.net > 0) out.push(`You are ${show(snap.plNow.net)} ahead this month. Moving part of it to savings goals would lock it in.`)
    if (snap.netWorth.cardDebt > 0 && snap.netWorth.cardDebt > snap.availableFunds * 0.5) out.push(`Card debt is ${show(snap.netWorth.cardDebt)} — paying it down first saves the most on interest.`)
    const expiring = documents.filter((d) => docStatus(d.expiry) !== 'Valid').length
    if (expiring) out.push(`${expiring} document${expiring > 1 ? 's are' : ' is'} expiring or expired — renewals are planned in your monthly budget.`)
    return out.slice(0, 3)
  }, [snap, documents]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasAnything = accounts.length > 0 || assets.length > 0

  return (
    <div className="space-y-4">
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${tierTone(tier, snap.status.tiers)} text-white shadow-lg`}>
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -left-10 -bottom-24 h-56 w-56 rounded-full bg-white/5" />
        <div className="relative p-5 md:p-6 flex flex-col md:flex-row gap-5 md:items-center">
          <div className="flex items-center gap-4 shrink-0">
            {photo ? (
              <img src={photo} alt={tier.label} className="h-24 w-24 md:h-28 md:w-28 rounded-2xl object-cover ring-4 ring-white/30 shadow-lg" />
            ) : (
              <div className="h-24 w-24 md:h-28 md:w-28 rounded-2xl bg-white/20 ring-4 ring-white/30 grid place-items-center text-4xl font-black">{name.charAt(0).toUpperCase()}</div>
            )}
            <div className="md:hidden"><StatusPill label={tier.label} score={score} /></div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="hidden md:block mb-2"><StatusPill label={tier.label} score={score} /></div>
            <h2 className="text-[20px] md:text-[24px] font-extrabold leading-tight">{greeting()}, {name} 👋</h2>
            {hasAnything ? (
              <p className="text-[13.5px] text-white/90 mt-1.5 leading-relaxed max-w-3xl">
                Welcome back, {name}. Your estimated net worth is <b>{show(nw)}</b>, available balance is <b>{show(snap.availableFunds)}</b>,
                and outstanding debt is <b>{show(snap.netWorth.liabilities)}</b>. Your cash flow this month is{' '}
                <b>{snap.cashFlow >= 0 ? '+' : '−'}{show(Math.abs(snap.cashFlow))}</b>.
                {change !== undefined && (
                  <> Since {fmtDate(baseline!.date)} your net worth {change >= 0 ? 'is up' : 'is down'} <b>{show(Math.abs(change))}</b>.</>
                )}
              </p>
            ) : (
              <p className="text-[13.5px] text-white/90 mt-1.5 max-w-3xl">Add your accounts, loans and assets to see your net worth, available funds and status here.</p>
            )}
            {snap.upcoming.length > 0 && (
              <p className="text-[12.5px] text-white/85 mt-1.5">
                Next payment: <b>{snap.upcoming[0].name}</b> on {fmtDate(snap.upcoming[0].dueDate!)}
                {snap.upcoming[0].amount !== undefined ? ` (${money(snap.upcoming[0].amount, snap.upcoming[0].currency)})` : ''}
                {snap.upcoming.length > 1 ? ` · ${snap.upcoming.length - 1} more in 30 days` : ''}.
              </p>
            )}
            {tips.length > 0 && (
              <ul className="mt-2.5 space-y-1">
                {tips.map((t, k) => <li key={k} className="text-[12.5px] text-white/95 flex gap-2"><span>💡</span><span>{t}</span></li>)}
              </ul>
            )}
          </div>
        </div>
        <div className="relative px-5 md:px-6 pb-4 flex items-center justify-between gap-3 flex-wrap">
          <button onClick={() => setWhy((v) => !v)} className="text-[12px] font-semibold text-white/90 hover:text-white inline-flex items-center gap-1 cursor-pointer">
            <Info size={13} /> How is “{tier.label}” worked out? <ChevronDown size={13} className={why ? 'rotate-180' : ''} />
          </button>
          <span className="text-[10.5px] text-white/70">A personal dashboard label — not an official classification, and not financial advice.</span>
        </div>
      </div>

      {why && (
        <Card className="card-pad">
          <div className="flex flex-wrap gap-x-10 gap-y-3 items-start">
            <div className="grid grid-cols-2 gap-3 flex-1 min-w-[280px]">
              {parts.map((p) => (
                <div key={p.key} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <div className="flex justify-between text-[12px] font-bold text-slate-700"><span>{p.label}</span><span>{p.points}/{p.max}</span></div>
                  <div className="h-1.5 rounded-full bg-slate-200 mt-1.5"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(p.points / p.max) * 100}%` }} /></div>
                  <p className="text-[11px] text-slate-500 mt-1">{p.detail}</p>
                </div>
              ))}
            </div>
            <div className="text-[12px] text-slate-600 max-w-sm space-y-1.5">
              <p><b className="text-slate-800">Score {score}/100.</b> {snap.status.tiers.map((t) => `${t.label} from ${t.from}`).join(' · ')}.</p>
              <p>It weighs available funds, net worth against a year of spending, how much you keep from income, and how much income goes to debt — never asset value alone.</p>
              <Link to="/settings" className="text-brand-600 font-semibold">Review names, thresholds and photos in Settings →</Link>
            </div>
          </div>
        </Card>
      )}

      {caveats.length > 0 && hasAnything && (
        <div className="card px-5 py-3 bg-amber-50/60 border-amber-100 flex items-start gap-2.5 text-[12px] text-amber-900">
          <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <div><b>This assessment is incomplete.</b> {caveats.join(' ')}</div>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net Worth" value={show(nw)} icon={<Scale size={20} />} tint="#3b82f6"
          footer={<span className="text-slate-400 text-[10px] leading-tight block">Assets you own (incl. cash & bank) − debts</span>} />
        <StatCard label="Assets I Own" value={show(snap.netWorth.assetsOwned)} icon={<Landmark size={20} />} tint="#8b5cf6"
          footer={<Link to="/assets" className="text-brand-600 font-semibold">My ownership share →</Link>} />
        <StatCard label="Cash & Bank" value={show(snap.netWorth.cashAndBank)} icon={<Wallet size={20} />} tint="#10b981"
          footer={<span className="text-slate-400">Available funds {show(snap.availableFunds)}</span>} />
        <StatCard label="Outstanding Loans" value={show(snap.netWorth.loanDebt)} icon={<Banknote size={20} />} tint="#ef4444"
          footer={<Link to="/loans" className="text-brand-600 font-semibold">Loans →</Link>} />
        <StatCard label="Credit Card Debt" value={show(snap.netWorth.cardDebt)} icon={<CreditCard size={20} />} tint="#f59e0b"
          footer={<span className="text-slate-400">Unused limits are not counted</span>} />
        <StatCard label="Due in 30 Days" value={show(snap.upcomingTotal)} icon={<CalendarClock size={20} />} tint="#ec4899"
          footer={<Link to="/budget" className="text-brand-600 font-semibold">{snap.upcoming.length} EMI / bill / fee →</Link>} />
        <StatCard label="Cash Flow This Month" value={`${snap.cashFlow >= 0 ? '+' : '−'}${show(Math.abs(snap.cashFlow))}`} icon={snap.cashFlow >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />} tint={snap.cashFlow >= 0 ? '#10b981' : '#ef4444'}
          footer={<span className="text-slate-400 text-[10px] leading-tight block">Cash actually moved — includes borrowing and repayments</span>} />
        <StatCard label="Available Funds" value={show(snap.availableFunds)} icon={<PiggyBank size={20} />} tint="#06b6d4"
          footer={<span className="text-slate-400">Cash & bank you can spend</span>} />
      </div>

      <Link to="/profit-loss" className="card px-5 py-4 flex flex-wrap items-center gap-x-10 gap-y-2 hover:border-brand-200 transition">
        <div><p className="text-[13px] font-bold text-slate-800">This Month's Profit & Loss</p><p className="text-[11px] text-slate-400">Income − expenses. Differs from cash flow: borrowing, principal, transfers and asset purchases stay out.</p></div>
        <div className="flex gap-8 ml-auto text-right">
          <div><p className="text-[10.5px] text-slate-400 uppercase">Income</p><p className="text-[17px] font-extrabold text-emerald-600 tabular-nums">{show(snap.plNow.income)}</p></div>
          <div><p className="text-[10.5px] text-slate-400 uppercase">Expenses</p><p className="text-[17px] font-extrabold text-rose-600 tabular-nums">{show(snap.plNow.expenses)}</p></div>
          <div><p className="text-[10.5px] text-slate-400 uppercase">{snap.plNow.net >= 0 ? 'Net surplus' : 'Net deficit'}</p><p className={`text-[17px] font-extrabold tabular-nums ${snap.plNow.net >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{show(snap.plNow.net)}</p></div>
        </div>
        <span className="text-[12px] font-semibold text-brand-600">Full report →</span>
      </Link>

      <p className="text-[10.5px] text-slate-400">
        Reporting in {reporting} · exchange rates {settings.extra?.fx ? `as of ${fmtDate(settings.extra.fx.date)} (${settings.extra.fx.source})` : 'are the built-in defaults — set your own in Settings → Exchange rates'} · {toBase(1, 'INR').toFixed(4)} AED per ₹1.
      </p>
    </div>
  )
}

function StatusPill({ label, score }: { label: string; score: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur px-3 py-1 text-[12px] font-bold">
      <span className="h-2 w-2 rounded-full bg-white" /> {label} <span className="opacity-70 font-semibold">· {score}/100</span>
    </span>
  )
}
