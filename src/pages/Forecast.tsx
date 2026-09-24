import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, LayoutGrid, LineChart as LineChartIcon, Sparkles, Table as TableIcon } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, PageHeader, Badge } from '@/components/ui/Primitives'
import { TrendLine } from '@/components/charts/Charts'
import { TODAY, convert, money } from '@/lib/format'
import { buildSnapshot, situationColor, SITUATION_TONE } from '@/lib/financials'
import { buildForecast, forecastSuggestions, type ForecastMonth } from '@/lib/forecast'
import { incomeForMonth } from '@/lib/income'
import { DEFAULT_THEME } from '@/lib/theme'
import type { Currency, SettingsExtra } from '@/types'

const addMonth = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
const monthShort = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' })

type View = 'card' | 'table' | 'chart'

export default function Forecast() {
  const s = useStore()
  const { settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people, incomeSources, updateSettings } = s
  const [span, setSpan] = useState<6 | 12>(6)
  const [view, setView] = useState<View>('card')
  const reporting = settings.baseCurrency
  const toReport = (a: number, c: Currency) => convert(a, c, reporting)
  const show = (v: number) => money(convert(v, reporting, 'AED'))

  const snap = useMemo(
    () => buildSnapshot({ today: TODAY, settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people: people.map((p) => p.name), toReport, fx: convert }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people],
  )

  const startMonth = TODAY.slice(0, 7)
  const months = useMemo(() => Array.from({ length: span }, (_, i) => addMonth(startMonth, i)), [startMonth, span])

  const extra = settings.extra ?? {}
  const theme = { ...DEFAULT_THEME, ...(extra.theme ?? {}) }
  const baseBudget = toReport(settings.monthlyBudget, settings.baseCurrency)
  const baseIncome = settings.monthlyIncomeTarget > 0 ? toReport(settings.monthlyIncomeTarget, settings.baseCurrency) : snap.monthlyIncome

  const forecast = useMemo(() => {
    // Each month can have its own planned budget/income (Future Budget / Future Income);
    // buildForecast is a pure per-set calculation, so it is called once per month with
    // that month's own figures, which also lets a loan drop off partway through.
    const out: ForecastMonth[] = []
    for (const m of months) {
      const budget = extra.futureBudgets?.[m] !== undefined ? toReport(extra.futureBudgets[m], settings.baseCurrency) : baseBudget
      // Priority: an explicit override for this month, then Income Planning's own sources, then the flat fallback.
      const fromSources = incomeForMonth(incomeSources, m, toReport)
      const expectedIncome = extra.futureIncome?.[m] !== undefined
        ? toReport(extra.futureIncome[m], settings.baseCurrency)
        : fromSources > 0 ? fromSources : baseIncome
      const [row] = buildForecast({
        months: [m], today: TODAY, loans, bills, documents, notes, budgetItems, people: people.map((p) => p.name),
        txns: transactions, accounts, budget, expectedIncome, toReport,
      })
      out.push(row)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, loans, bills, documents, notes, budgetItems, accounts, transactions, people, incomeSources, extra.futureBudgets, extra.futureIncome, baseBudget, baseIncome])

  const suggestions = useMemo(() => forecastSuggestions(forecast, monthLabel), [forecast])

  const setFutureBudget = (m: string, baseAmount: number | undefined) => {
    const futureBudgets = { ...extra.futureBudgets }
    if (baseAmount === undefined) delete futureBudgets[m]
    else futureBudgets[m] = baseAmount
    updateSettings({ extra: { ...extra, futureBudgets } })
  }

  const chartData = forecast.map((f) => ({ month: monthShort(f.month), income: f.income, expenses: f.totalNeed, net: f.expectedBalance }))

  return (
    <div className="space-y-5 max-w-[1500px]">
      <PageHeader
        title="Financial Forecast & Suggestions"
        subtitle="Every month, recalculated live from your income, budget, loans, installments and planned payments."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-[#e2e8f0] p-0.5 bg-white">
              {([6, 12] as const).map((n) => (
                <button key={n} onClick={() => setSpan(n)} className={`h-9 px-3 rounded-md text-[12.5px] font-semibold cursor-pointer ${span === n ? 'bg-brand-600 text-white' : 'text-slate-500'}`}>
                  {n === 6 ? '6-Month' : '1-Year'}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-[#e2e8f0] p-0.5 bg-white">
              <button onClick={() => setView('card')} className={`h-9 w-9 grid place-items-center rounded-md cursor-pointer ${view === 'card' ? 'bg-brand-600 text-white' : 'text-slate-500'}`} title="Card view"><LayoutGrid size={15} /></button>
              <button onClick={() => setView('table')} className={`h-9 w-9 grid place-items-center rounded-md cursor-pointer ${view === 'table' ? 'bg-brand-600 text-white' : 'text-slate-500'}`} title="Table view"><TableIcon size={15} /></button>
              <button onClick={() => setView('chart')} className={`h-9 w-9 grid place-items-center rounded-md cursor-pointer ${view === 'chart' ? 'bg-brand-600 text-white' : 'text-slate-500'}`} title="Chart view"><LineChartIcon size={15} /></button>
            </div>
          </div>
        }
      />

      {suggestions.length > 0 && (
        <Card>
          <CardHead title="Financial Suggestions" sub="Based on your actual records only — never a generic tip." right={<Sparkles size={16} className="text-brand-500" />} />
          <div className="px-5 pb-5 space-y-2">
            {suggestions.map((t, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[12.5px] text-slate-700 leading-snug">
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-brand-50 text-brand-600 grid place-items-center text-[10px] font-bold">{i + 1}</span>
                {t}
              </div>
            ))}
          </div>
        </Card>
      )}

      {view === 'chart' && (
        <Card>
          <CardHead title={`${span}-Month Overview`} sub="Income, total monthly need and expected balance" />
          <div className="px-3 pb-4"><TrendLine data={chartData} height={280} /></div>
        </Card>
      )}

      {view === 'table' && (
        <Card>
          <CardHead title={`${span}-Month Overview`} />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Month</th>
                  <th className="th text-right">Income</th>
                  <th className="th text-right">Budget</th>
                  <th className="th text-right">EMI</th>
                  <th className="th text-right">Installments</th>
                  <th className="th text-right">Total Need</th>
                  <th className="th text-right">Balance</th>
                  <th className="th">Situation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {forecast.map((f) => (
                  <tr key={f.month} className="row-hover">
                    <td className="td font-semibold text-slate-800">{monthLabel(f.month)}</td>
                    <td className="td text-right tabular-nums">{show(f.income)}</td>
                    <td className="td text-right tabular-nums text-slate-500">{show(f.budget)}</td>
                    <td className="td text-right tabular-nums text-slate-500">{show(f.loanEmi)}</td>
                    <td className="td text-right tabular-nums text-slate-500">{show(f.installments)}</td>
                    <td className="td text-right font-semibold tabular-nums">{show(f.totalNeed)}</td>
                    <td className={`td text-right font-bold tabular-nums ${f.expectedBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{show(f.expectedBalance)}</td>
                    <td className="td"><Badge tone={SITUATION_TONE[f.situation]} color={situationColor(f.situation, theme.statusColors)}>{f.situation}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view === 'card' && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {forecast.map((f) => (
            <MonthCard key={f.month} f={f} show={show} extra={extra} baseBudget={settings.monthlyBudget} onEditBudget={(v) => setFutureBudget(f.month, v)} />
          ))}
        </div>
      )}

      <p className="text-[10.5px] text-slate-400">
        “Budget” for a future month can be planned ahead — edit any card's budget figure and it feeds straight back into this forecast, live.
      </p>
    </div>
  )
}

function MonthCard({
  f, show, extra, baseBudget, onEditBudget,
}: {
  f: ForecastMonth
  show: (v: number) => string
  extra: SettingsExtra
  baseBudget: number
  onEditBudget: (v: number | undefined) => void
}) {
  const overridden = extra.futureBudgets?.[f.month] !== undefined
  return (
    <Card>
      <CardHead title={monthLabel(f.month)} right={<Badge tone={SITUATION_TONE[f.situation]} color={situationColor(f.situation, extra.theme?.statusColors)}>{f.situation}</Badge>} />
      <div className="px-5 pb-5 space-y-2">
        <Row label="Income" value={show(f.income)} />
        <Row
          label="Budget"
          value={
            <input
              className="w-24 rounded-lg border border-[#e2e8f0] px-2 py-1 text-right text-[12.5px] font-semibold tabular-nums"
              type="number"
              defaultValue={overridden ? extra.futureBudgets![f.month] : baseBudget}
              onBlur={(e) => {
                const v = Number(e.target.value)
                onEditBudget(Number.isFinite(v) && v >= 0 ? v : undefined)
              }}
            />
          }
        />
        <Row label="Loan EMI" value={show(f.loanEmi)} />
        <Row label="Installments" value={show(f.installments)} />
        <Row label="Other Planned Payments" value={show(f.otherPlanned)} />
        <div className="border-t border-[#eef2f8] pt-2 mt-1">
          <Row label="Total Need" value={show(f.totalNeed)} bold />
          <Row label="Expected Balance" value={show(f.expectedBalance)} bold tone={f.expectedBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
        </div>
        {f.expectedBalance < 0 && (
          <div className="flex items-start gap-1.5 text-[11px] text-rose-600 pt-1">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Planned commitments exceed expected income this month.
          </div>
        )}
      </div>
    </Card>
  )
}

function Row({ label, value, bold, tone }: { label: string; value: ReactNode; bold?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${bold ? 'font-extrabold' : 'font-semibold'} ${tone ?? 'text-slate-800'}`}>{value}</span>
    </div>
  )
}
