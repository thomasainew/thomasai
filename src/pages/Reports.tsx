import { useMemo, useState } from 'react'
import { BarChart3, Download, FileText, Landmark, PieChart as PieIcon, StickyNote, Tag } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Card, CardHead, PageHeader, Progress, StatCard, statusTone } from '@/components/ui/Primitives'
import { Donut, DonutLegend, PALETTE, TrendLine } from '@/components/charts/Charts'
import { TODAY, addMonths, daysLeft, fmtDate, money, monthLabel, pct, toBase } from '@/lib/format'
import { CURRENT_MONTH, byCategory, byTag, byPerson, docStatus, loanSummary, monthPlan, monthlySeries, seriesRange, totals } from '@/lib/selectors'

type Tab = 'summary' | 'category' | 'tags' | 'loans' | 'documents' | 'notes'

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'summary', label: 'Monthly Summary', icon: BarChart3 },
  { key: 'category', label: 'Category Report', icon: PieIcon },
  { key: 'tags', label: 'Tags Report', icon: Tag },
  { key: 'loans', label: 'Loan Report', icon: Landmark },
  { key: 'documents', label: 'Document Expiry', icon: FileText },
  { key: 'notes', label: 'Notes & Follow-up', icon: StickyNote },
]

export default function Reports() {
  const { transactions, loans, documents, notes, bills, budgets, goals } = useStore()
  const [tab, setTab] = useState<Tab>('summary')

  const t = useMemo(() => totals(transactions), [transactions])
  const series = useMemo(
    () => monthlySeries(transactions).map((m) => ({ ...m, net: m.income - m.expenses })),
    [transactions],
  )
  const expCats = useMemo(() => byCategory(transactions, 'expense'), [transactions])
  const incCats = useMemo(() => byCategory(transactions, 'income'), [transactions])
  const persons = useMemo(() => byPerson(transactions), [transactions])
  const ls = useMemo(() => loanSummary(loans), [loans])
  const plan = useMemo(() => monthPlan(transactions, loans, bills, goals), [transactions, loans, bills, goals])

  const exportCsv = () => {
    const rows = [
      ['Date', 'Type', 'Description', 'Category', 'Person', 'Method', 'Amount', 'Currency', 'Amount (AED)'],
      ...transactions.map((x) => [
        x.date, x.type, x.description, x.category, x.person ?? '', x.method ?? '',
        String(x.amount), x.currency, String(Math.round(toBase(x.amount, x.currency))),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `cloudbasket360-transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Reports"
        subtitle="Detailed insight into income, spending, loans, documents and follow-ups."
        actions={<button className="btn-ghost" onClick={exportCsv}><Download size={15} /> Export CSV</button>}
      />

      <div className="flex gap-1 flex-wrap border-b border-[#e8edf5]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 h-11 text-[13px] font-semibold border-b-2 transition cursor-pointer inline-flex items-center gap-2 ${
              tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={`Income (${monthLabel(CURRENT_MONTH)})`} value={money(t.income)} icon={<BarChart3 size={20} />} tint="#22c55e" footer={<span className="text-slate-400">{transactions.filter((x) => x.type === 'income' && x.date.startsWith(CURRENT_MONTH)).length} entries</span>} />
            <StatCard label={`Expenses (${monthLabel(CURRENT_MONTH)})`} value={money(t.expenses)} icon={<BarChart3 size={20} />} tint="#f43f5e" footer={<span className="text-slate-400">{transactions.filter((x) => x.type === 'expense' && x.date.startsWith(CURRENT_MONTH)).length} entries</span>} />
            <StatCard label="Net Balance" value={money(t.net)} icon={<BarChart3 size={20} />} tint={t.net >= 0 ? '#3b82f6' : '#ef4444'} footer={<span className={t.net >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{t.net >= 0 ? 'Surplus' : 'Deficit'} this month</span>} />
            <StatCard label="Savings Rate" value={`${t.income ? Math.round((t.net / t.income) * 100) : 0}%`} icon={<BarChart3 size={20} />} tint="#8b5cf6" footer={<Progress value={Math.max(0, t.net)} max={t.income || 1} color="#8b5cf6" height={5} />} />
          </div>

          <Card>
            <CardHead title="Income, Expenses & Net Trend" sub={seriesRange()} />
            <div className="px-3 pb-4"><TrendLine data={series} height={300} /></div>
          </Card>

          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            <Card>
              <CardHead title="Month-by-Month Breakdown" />
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[420px]">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <th className="th">Month</th>
                      <th className="th text-right">Income</th>
                      <th className="th text-right">Expenses</th>
                      <th className="th text-right">Net</th>
                      <th className="th text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {series.map((m) => (
                      <tr key={m.month} className="row-hover">
                        <td className="td font-semibold text-slate-800">{m.month} 2026</td>
                        <td className="td text-right tabular-nums text-emerald-600 font-semibold">{money(m.income)}</td>
                        <td className="td text-right tabular-nums text-rose-600 font-semibold">{money(m.expenses)}</td>
                        <td className={`td text-right tabular-nums font-bold ${m.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{money(m.net)}</td>
                        <td className="td text-right tabular-nums text-slate-500">{m.income ? Math.round((m.net / m.income) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHead title="This Month Plan" sub="What you need to cover everything" />
              <div className="px-5 pb-5 space-y-2.5">
                {[
                  ['Required for Expenses', plan.requiredExpenses],
                  ['Upcoming Loan Payments', plan.upcomingLoans],
                  ['Upcoming Bills & Subscriptions', plan.upcomingBills],
                  ['Savings & Goals', plan.savings],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center text-[12.5px]">
                    <span className="flex-1 text-slate-600">{label}</span>
                    <span className="font-bold text-slate-800 tabular-nums">{Number(value).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-[#eef2f8] pt-2.5 flex items-center text-[13px]">
                  <span className="flex-1 font-bold text-slate-800">Total Required</span>
                  <span className="font-extrabold tabular-nums">{plan.totalRequired.toLocaleString()}</span>
                </div>
                <div className="flex items-center text-[12.5px]">
                  <span className="flex-1 text-slate-600">Expected Income</span>
                  <span className="font-bold tabular-nums">{plan.expectedIncome.toLocaleString()}</span>
                </div>
                <div className={`rounded-xl px-3 py-2.5 flex items-center text-[13px] ${plan.shortfall > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                  <span className={`flex-1 font-bold ${plan.shortfall > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {plan.shortfall > 0 ? 'Additional Income Needed' : 'You are fully covered'}
                  </span>
                  <span className={`font-extrabold tabular-nums ${plan.shortfall > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {plan.shortfall.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'category' && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
          <Card className="xl:col-span-4">
            <CardHead title="Expenses by Category" />
            <div className="px-5 pb-5 flex flex-col items-center gap-4">
              <Donut data={expCats} size={180} centerValue={money(t.expenses)} centerLabel="Spent" />
              <div className="w-full"><DonutLegend data={expCats} total={t.expenses} /></div>
            </div>
          </Card>
          <Card className="xl:col-span-4">
            <CardHead title="Income by Source" />
            <div className="px-5 pb-5 flex flex-col items-center gap-4">
              <Donut data={incCats} size={180} centerValue={money(t.income)} centerLabel="Earned" />
              <div className="w-full"><DonutLegend data={incCats} total={t.income} /></div>
            </div>
          </Card>
          <Card className="xl:col-span-4">
            <CardHead title="Spending by Person" />
            <div className="px-5 pb-5 flex flex-col items-center gap-4">
              <Donut data={persons} size={180} centerValue={money(t.expenses)} centerLabel="Total" />
              <div className="w-full"><DonutLegend data={persons} total={t.expenses} /></div>
            </div>
          </Card>

          <Card className="xl:col-span-12">
            <CardHead title="Budget vs Actual by Category" />
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="th">Category</th>
                    <th className="th text-right">Budget</th>
                    <th className="th text-right">Spent</th>
                    <th className="th text-right">Variance</th>
                    <th className="th w-56">Usage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {budgets.map((b) => {
                    const variance = b.budget - b.spent
                    return (
                      <tr key={b.id} className="row-hover">
                        <td className="td font-semibold text-slate-800"><span className="mr-2">{b.icon}</span>{b.name}</td>
                        <td className="td text-right tabular-nums text-slate-500">{money(b.budget)}</td>
                        <td className="td text-right tabular-nums font-bold">{money(b.spent)}</td>
                        <td className={`td text-right tabular-nums font-bold ${variance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {variance < 0 ? '-' : '+'}{money(Math.abs(variance))}
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <Progress value={b.spent} max={b.budget} color={b.color} height={7} />
                            <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{pct(b.spent, b.budget)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'tags' && <TagsReport />}

      {tab === 'loans' && (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Outstanding" value={money(ls.outstanding)} icon={<Landmark size={20} />} tint="#ef4444" footer={<span className="text-slate-400">{ls.active.length} active loans</span>} />
            <StatCard label="Monthly EMI" value={money(ls.monthlyEmi)} icon={<Landmark size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">Total commitment</span>} />
            <StatCard label="Due This Month" value={money(ls.dueAmount)} icon={<Landmark size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">{ls.dueThisMonth.length} payments</span>} />
            <StatCard label="Overdue" value={String(ls.overdue.length)} icon={<Landmark size={20} />} tint="#dc2626" footer={<span className="text-slate-400">Needs immediate action</span>} />
          </div>
          <Card>
            <CardHead title="Loan Report" sub="All loans with repayment progress" />
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[820px]">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="th">Loan</th>
                    <th className="th">Lender</th>
                    <th className="th text-right">Principal</th>
                    <th className="th text-right">Outstanding</th>
                    <th className="th text-right">EMI</th>
                    <th className="th w-48">Repaid</th>
                    <th className="th">Next Payment</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {loans.map((l) => (
                    <tr key={l.id} className="row-hover">
                      <td className="td font-semibold text-slate-800"><span className="mr-2">{l.icon}</span>{l.name}</td>
                      <td className="td text-slate-500">{l.lender}</td>
                      <td className="td text-right tabular-nums text-slate-500">{money(l.principal, l.currency)}</td>
                      <td className="td text-right tabular-nums font-bold">{money(l.outstanding, l.currency)}</td>
                      <td className="td text-right tabular-nums">{money(l.emi, l.currency)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <Progress value={l.principal - l.outstanding} max={l.principal} color="#10b981" height={7} />
                          <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{pct(l.principal - l.outstanding, l.principal)}%</span>
                        </div>
                      </td>
                      <td className="td text-slate-500 whitespace-nowrap">{fmtDate(l.nextPayment)}</td>
                      <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHead title="Document Expiry Report" sub="Sorted by urgency" />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[600px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Document</th>
                  <th className="th">Type</th>
                  <th className="th">Owner</th>
                  <th className="th">Expiry</th>
                  <th className="th">Days Left</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {[...documents]
                  .sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry))
                  .map((d) => {
                    const st = docStatus(d.expiry)
                    const dl = daysLeft(d.expiry)
                    return (
                      <tr key={d.id} className="row-hover">
                        <td className="td font-semibold text-slate-800"><span className="mr-2">{d.icon}</span>{d.name}</td>
                        <td className="td text-slate-500">{d.type}</td>
                        <td className="td text-slate-500">{d.owner}</td>
                        <td className="td text-slate-500 whitespace-nowrap">{fmtDate(d.expiry)}</td>
                        <td className={`td font-semibold tabular-nums ${dl < 0 ? 'text-rose-600' : dl <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                          {dl < 0 ? `${Math.abs(dl)} overdue` : `${dl} days`}
                        </td>
                        <td className="td"><Badge tone={statusTone(st)}>{st}</Badge></td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'notes' && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
          <Card className="xl:col-span-8">
            <CardHead title="Notes & Follow-up Report" />
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[560px]">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="th">Note</th>
                    <th className="th">Category</th>
                    <th className="th">Due Date</th>
                    <th className="th">Days Left</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {[...notes].sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate)).map((n) => {
                    const dl = daysLeft(n.dueDate)
                    return (
                      <tr key={n.id} className="row-hover">
                        <td className={`td font-semibold ${n.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{n.title}</td>
                        <td className="td text-slate-500">{n.category}</td>
                        <td className="td text-slate-500 whitespace-nowrap">{fmtDate(n.dueDate)}</td>
                        <td className={`td tabular-nums ${!n.done && dl < 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                          {n.done ? '—' : dl < 0 ? `${Math.abs(dl)} overdue` : `${dl} days`}
                        </td>
                        <td className="td"><Badge tone={statusTone(n.status)}>{n.status}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="xl:col-span-4">
            <CardHead title="By Category" />
            <div className="px-5 pb-5 space-y-4">
              {['Personal', 'Work', 'Family', 'Car', 'Loan'].map((c, i) => {
                const items = notes.filter((n) => n.category === c)
                const done = items.filter((n) => n.done).length
                return (
                  <div key={c}>
                    <div className="flex items-center gap-2 text-[12.5px] mb-1.5">
                      <span className="flex-1 font-semibold text-slate-700">{c}</span>
                      <span className="text-slate-400">{done}/{items.length} done</span>
                    </div>
                    <Progress value={done} max={items.length || 1} color={PALETTE[i % PALETTE.length]} height={7} />
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}


type TagPeriod = 'month' | 'last' | '3m' | 'year' | 'all'
const TAG_PERIODS: { key: TagPeriod; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: '3m', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

function tagRange(p: TagPeriod): { from?: string; to?: string; label: string } {
  if (p === 'month') return { from: `${CURRENT_MONTH}-01`, to: `${CURRENT_MONTH}-31`, label: monthLabel(CURRENT_MONTH) }
  if (p === 'last') {
    const m = addMonths(CURRENT_MONTH, -1)
    return { from: `${m}-01`, to: `${m}-31`, label: monthLabel(m) }
  }
  if (p === '3m') return { from: `${addMonths(CURRENT_MONTH, -2)}-01`, to: TODAY, label: 'Last 3 months' }
  if (p === 'year') return { from: `${TODAY.slice(0, 4)}-01-01`, to: TODAY, label: TODAY.slice(0, 4) }
  return { label: 'All time' }
}

/** Which Add Expense tags cost the most. */
function TagsReport() {
  const { transactions, settings } = useStore()
  const [period, setPeriod] = useState<TagPeriod>('month')
  const [showUnused, setShowUnused] = useState(false)
  const tags = settings.extra?.customTags ?? []
  const range = tagRange(period)
  const report = useMemo(() => byTag(transactions, tags, range.from, range.to), [transactions, tags, range.from, range.to])
  const used = report.tags.filter((r) => r.count > 0)
  const rows = showUnused ? report.tags : used
  const tagged = used.reduce((a, r) => a + r.total, 0)
  const all = tagged + report.untagged.total
  const top = used[0]
  const max = Math.max(1, ...used.map((r) => r.total))

  if (!tags.length) {
    return (
      <Card>
        <div className="px-5 py-10 text-center">
          <Tag size={26} className="mx-auto text-slate-300" />
          <p className="text-[14px] font-bold text-slate-800 mt-3">No tags yet</p>
          <p className="text-[12.5px] text-slate-500 mt-1">
            Create tags with <b>Add Tag</b> in Add Expense. Each expense saved with a tag is counted here.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {TAG_PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`h-8 px-3 rounded-lg text-[12px] font-semibold border transition cursor-pointer ${
              period === key ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-[#e2e8f0] text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Top tag (${range.label})`} value={top ? top.tag : '—'} icon={<Tag size={20} />} tint="#8b5cf6"
          footer={<span className="text-slate-400">{top ? `${money(top.total)} · ${top.count} expense${top.count === 1 ? '' : 's'}` : 'No tagged spending'}</span>} />
        <StatCard label="Tagged spending" value={money(tagged)} icon={<Tag size={20} />} tint="#f43f5e"
          footer={<span className="text-slate-400">{used.reduce((a, r) => a + r.count, 0)} expenses</span>} />
        <StatCard label="Share of all spending" value={`${all > 0 ? Math.round((tagged / all) * 100) : 0}%`} icon={<PieIcon size={20} />} tint="#3b82f6"
          footer={<span className="text-slate-400">Untagged: {money(report.untagged.total)}</span>} />
        <StatCard label="Tags used" value={`${used.length} / ${tags.length}`} icon={<Tag size={20} />} tint="#22c55e"
          footer={<span className="text-slate-400">{tags.length - used.length} with no spending</span>} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardHead title="Spending by Tag" sub={range.label} />
          <div className="px-5 pb-5 flex flex-col items-center gap-4">
            {used.length ? (
              <>
                <Donut data={used.map((r) => ({ name: r.tag, value: r.total }))} size={180} centerValue={money(tagged)} centerLabel="Tagged" />
                <div className="w-full"><DonutLegend data={used.map((r) => ({ name: r.tag, value: r.total }))} total={tagged} /></div>
              </>
            ) : (
              <p className="text-[12.5px] text-slate-500 py-8">No tagged expenses in this period.</p>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-8">
          <CardHead
            title="Tag Ranking"
            sub="Highest spending first"
            right={
              <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer">
                <input type="checkbox" className="accent-brand-600" checked={showUnused} onChange={() => setShowUnused(!showUnused)} />
                Show unused tags
              </label>
            }
          />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th w-10">#</th>
                  <th className="th">Tag</th>
                  <th className="th text-right">Spent</th>
                  <th className="th text-right">Expenses</th>
                  <th className="th text-right">Average</th>
                  <th className="th w-48">Share</th>
                  <th className="th">Last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {rows.map((r, i) => (
                  <tr key={r.tag} className="row-hover">
                    <td className="td text-slate-400 font-bold">{r.count ? i + 1 : '—'}</td>
                    <td className="td font-semibold text-slate-800">
                      <span className="inline-block h-2.5 w-2.5 rounded-full mr-2" style={{ background: r.count ? PALETTE[i % PALETTE.length] : '#cbd5e1' }} />
                      {r.tag}
                    </td>
                    <td className="td text-right tabular-nums font-bold">{money(r.total)}</td>
                    <td className="td text-right tabular-nums text-slate-500">{r.count}</td>
                    <td className="td text-right tabular-nums text-slate-500">{r.count ? money(r.total / r.count) : '—'}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Progress value={Math.max(0, r.total)} max={max} color={PALETTE[i % PALETTE.length]} height={7} />
                        <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{tagged > 0 ? Math.round((r.total / tagged) * 100) : 0}%</span>
                      </div>
                    </td>
                    <td className="td text-slate-500">{r.lastDate ? fmtDate(r.lastDate) : '—'}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={7} className="td text-center text-slate-400 py-8">No tagged expenses in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
