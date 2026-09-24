import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownCircle, ArrowUpCircle, Banknote, Gem, Landmark, PiggyBank, ReceiptText, Sparkles, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, PageHeader, Progress, Badge } from '@/components/ui/Primitives'
import { TODAY, convert, money } from '@/lib/format'
import { buildSnapshot, monthlySituation, situationColor, SITUATION_TONE } from '@/lib/financials'
import { DEFAULT_THEME } from '@/lib/theme'
import { tierTone } from '@/lib/status'
import { buildMonthItems } from '@/lib/smartBudget'
import { incomeForMonth } from '@/lib/income'
import type { Currency } from '@/types'

const addMonth = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function FinancialStatus() {
  const s = useStore()
  const { settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, budgets, people, incomeSources } = s
  const reporting = settings.baseCurrency
  const toReport = (a: number, c: Currency) => convert(a, c, reporting)
  const show = (v: number) => money(convert(v, reporting, 'AED'))

  const snap = useMemo(
    () => buildSnapshot({ today: TODAY, settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people: people.map((p) => p.name), toReport, fx: convert }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people],
  )

  const month = TODAY.slice(0, 7)
  const ctx = { today: TODAY, loans, bills, documents, notes, stored: budgetItems, txns: transactions, people: people.map((p) => p.name), accounts }

  const monthCard = useMemo(() => {
    const build = (m: string) => {
      const items = buildMonthItems({ ...ctx, month: m }).filter((i) => i.status !== 'Dismissed')
      const sum = (kind: string) => items.filter((i) => i.sourceKind === kind).reduce((n, i) => n + (i.amount !== undefined ? toReport(i.amount, i.currency) : 0), 0)
      const loanEmi = sum('loan')
      const installments = sum('schedule')
      const otherPlanned = sum('bill') + sum('document') + sum('note') + sum('manual')
      // What you have actually planned in Budget Categories, added up — not the separate flat Total Budget target.
      const budget = budgets.reduce((n, b) => n + toReport(b.budget, b.currency ?? 'AED'), 0)
      const totalNeed = budget + loanEmi + installments + otherPlanned
      const fromSources = incomeForMonth(incomeSources, m, toReport)
      const expectedIncome = fromSources > 0 ? fromSources
        : settings.monthlyIncomeTarget > 0 ? toReport(settings.monthlyIncomeTarget, settings.baseCurrency)
        : snap.monthlyIncome
      const expectedBalance = expectedIncome - totalNeed
      return { loanEmi, installments, otherPlanned, budget, totalNeed, expectedIncome, expectedBalance, situation: monthlySituation(expectedBalance, expectedIncome) }
    }
    const now = build(month)
    const prev = build(addMonth(month, -1))
    return { now, prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, bills, documents, notes, budgetItems, budgets, accounts, settings, incomeSources, snap.monthlyIncome, month])

  const { tier, score, tiers } = snap.status
  const sortedTiers = [...tiers].sort((a, b) => a.from - b.from)
  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const theme = { ...DEFAULT_THEME, ...(settings.extra?.theme ?? {}) }
  const cat = theme.categoryColors

  const trend: 'up' | 'down' | 'flat' =
    monthCard.now.expectedBalance > monthCard.prev.expectedBalance + 1 ? 'up'
      : monthCard.now.expectedBalance < monthCard.prev.expectedBalance - 1 ? 'down' : 'flat'

  // Four bars, each against a sensible ceiling so the shape is comparable month to month.
  const bars = [
    { label: 'Income', value: snap.plNow.income, max: Math.max(snap.plNow.income, monthCard.now.expectedIncome, 1), color: cat.income, icon: <ArrowUpCircle size={15} /> },
    { label: 'Spending', value: snap.plNow.expenses, max: Math.max(monthCard.now.expectedIncome, snap.plNow.expenses, 1), color: cat.budget, icon: <ArrowDownCircle size={15} /> },
    { label: 'Debt (EMI + commitments)', value: monthCard.now.loanEmi + monthCard.now.installments, max: Math.max(monthCard.now.expectedIncome, 1), color: cat.loan, icon: <Banknote size={15} /> },
    { label: 'Assets', value: snap.netWorth.assetsOwned, max: Math.max(snap.netWorth.assetsOwned, snap.netWorth.liabilities, monthCard.now.expectedIncome * 12, 1), color: '#3b82f6', icon: <Gem size={15} /> },
  ]

  return (
    <div className="space-y-5 max-w-[1400px]">
      <PageHeader title="My Financial Status" subtitle="Calculated automatically from your accounts, income, spending, loans and assets — updated every time a record changes." />

      {/* ---- hero: photo, tier, score ---- */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${tierTone(tier, tiers)} text-white shadow-xl`}>
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute -left-14 -bottom-28 h-64 w-64 rounded-full bg-white/5" />
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
          <ScoreRing score={score} photo={tier.photo || settings.extra?.profilePhoto} name={settings.userName} />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-white/75 uppercase tracking-wide">{monthLabel}</p>
            <h2 className="text-[26px] md:text-[32px] font-extrabold tracking-tight leading-tight mt-1">{tier.label}</h2>
            <p className="text-[13.5px] text-white/90 mt-2 max-w-xl leading-relaxed">
              Income {show(snap.plNow.income)} · Spending {show(snap.plNow.expenses)} · Monthly commitments {show(monthCard.now.loanEmi + monthCard.now.installments + monthCard.now.otherPlanned)} ·
              Expected balance <b>{show(monthCard.now.expectedBalance)}</b>.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/90">
              {trend === 'up' && <><TrendingUp size={14} /> Improving vs {new Date(addMonth(month, -1) + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</>}
              {trend === 'down' && <><TrendingDown size={14} /> Softer than {new Date(addMonth(month, -1) + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</>}
              {trend === 'flat' && <><Sparkles size={14} /> Steady vs last month</>}
            </div>
          </div>
        </div>

        {/* ---- stage progression ---- */}
        <div className="relative px-6 md:px-8 pb-6 flex items-center gap-1.5 overflow-x-auto scroll-thin">
          {sortedTiers.map((t, i) => (
            <div key={t.key} className="flex items-center gap-1.5 shrink-0">
              <div className={`rounded-xl px-3.5 py-2 text-[12px] font-bold whitespace-nowrap ${t.key === tier.key ? 'bg-white text-slate-900 shadow' : 'bg-white/15 text-white/80'}`}>
                {t.label}
              </div>
              {i < sortedTiers.length - 1 && <span className="text-white/50">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ---- four metric bars ---- */}
      <Card>
        <CardHead title="This month's shape" sub="Each bar against what it is being compared to — not a fixed target." />
        <div className="px-5 pb-5 grid gap-4 sm:grid-cols-2">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="flex items-center gap-2 mb-1.5">
                <span style={{ color: b.color }}>{b.icon}</span>
                <span className="flex-1 text-[12.5px] font-semibold text-slate-700">{b.label}</span>
                <span className="text-[12px] font-bold text-slate-500 tabular-nums">{show(b.value)}</span>
              </div>
              <Progress value={b.value} max={b.max} color={b.color} height={8} />
            </div>
          ))}
        </div>
      </Card>

      {/* ---- monthly figures card, matching the spec's worked example ---- */}
      <Card>
        <CardHead title={monthLabel} sub="This month's figures — the same numbers the Financial Forecast projects forward." right={<Badge tone={SITUATION_TONE[monthCard.now.situation]} color={situationColor(monthCard.now.situation, theme.statusColors)}>{monthCard.now.situation}</Badge>} />
        <div className="px-5 pb-5 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <Figure icon={<ArrowUpCircle size={16} />} label="Income" value={show(snap.plNow.income)} tint={cat.income} />
          <Figure icon={<ArrowDownCircle size={16} />} label="Spending" value={show(snap.plNow.expenses)} tint="#f43f5e" />
          <Figure icon={<Wallet size={16} />} label="Monthly Budget" value={show(monthCard.now.budget)} tint={cat.budget} />
          <Figure icon={<Landmark size={16} />} label="Loan EMI" value={show(monthCard.now.loanEmi)} tint={cat.loan} />
          <Figure icon={<ReceiptText size={16} />} label="Installments" value={show(monthCard.now.installments)} tint={cat.installment} />
          <Figure icon={<Banknote size={16} />} label="Other Planned Payments" value={show(monthCard.now.otherPlanned)} tint="#ec4899" />
          <Figure icon={<Gem size={16} />} label="Assets" value={show(snap.netWorth.assetsOwned)} tint="#3b82f6" />
          <Figure icon={<PiggyBank size={16} />} label="Available Funds (Savings)" value={show(snap.availableFunds)} tint="#06b6d4" />
        </div>
        <div className="px-5 pb-5 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-[#eef2f8] pt-4 mt-1">
          <div><p className="text-[10.5px] text-slate-400 uppercase">Total Monthly Need</p><p className="text-[17px] font-extrabold text-slate-900 tabular-nums">{show(monthCard.now.totalNeed)}</p></div>
          <div><p className="text-[10.5px] text-slate-400 uppercase">Expected Balance</p><p className={`text-[17px] font-extrabold tabular-nums ${monthCard.now.expectedBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{show(monthCard.now.expectedBalance)}</p></div>
          <Link to="/forecast" className="ml-auto text-[12.5px] font-semibold text-brand-600">See the 6/12-month forecast →</Link>
        </div>
      </Card>

      <p className="text-[10.5px] text-slate-400">
        “{tier.label}” is a personal dashboard label calculated from your own records — not an official classification, financial advice, or a judgment about you. Edit the stage names, thresholds and photos in Settings → Profile &amp; Status.
      </p>
    </div>
  )
}

function ScoreRing({ score, photo, name }: { score: number; photo?: string; name: string }) {
  const r = 46
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c
  return (
    <div className="relative h-28 w-28 md:h-32 md:w-32 shrink-0 mx-auto md:mx-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-700 ease-out" />
      </svg>
      <div className="absolute inset-2 rounded-full overflow-hidden grid place-items-center bg-white/15">
        {photo ? (
          <img src={photo} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[26px] font-black text-white">{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-slate-900 shadow">{score}/100</span>
    </div>
  )
}

function Figure({ icon, label, value, tint }: { icon: ReactNode; label: string; value: string; tint: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-1" style={{ color: tint }}>{icon}<span className="text-[10.5px] font-semibold text-slate-500 uppercase">{label}</span></div>
      <p className="text-[15px] font-extrabold text-slate-900 tabular-nums">{value}</p>
    </div>
  )
}
