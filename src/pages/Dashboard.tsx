import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, BarChart3, CreditCard, FileText, Landmark, Plus,
  Receipt, Sparkles, StickyNote, Users, Wallet, PieChart as PieIcon, X,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Badge, Progress, StatCard, ViewAll, statusTone } from '@/components/ui/Primitives'
import { Donut, DonutLegend, IncomeExpenseBars } from '@/components/charts/Charts'
import { TransactionModal } from '@/components/TransactionModal'
import { TransferModal } from '@/components/TransferModal'
import { TODAY, convert, daysLeft, fmtDate, greeting, money, pct } from '@/lib/format'
import { PREV_MONTH, accountTotals, availableMoney, budgetsWithSpend, byPerson, currentMonthLabel, docStatus, loanSummary, monthPlan, monthlySeries, netPosition, totals } from '@/lib/selectors'
import type { Currency, TxnType } from '@/types'

export default function Dashboard() {
  const { settings, transactions, accounts, budgets: rawBudgets, loans, documents, notes, goals, bills } = useStore()
  const [modal, setModal] = useState<TxnType | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [tipOpen, setTipOpen] = useState(true)
  const [noteFilter, setNoteFilter] = useState('All')

  const t = useMemo(() => totals(transactions), [transactions])
  const prev = useMemo(() => totals(transactions, PREV_MONTH), [transactions])
  const series = useMemo(() => monthlySeries(transactions), [transactions])
  const persons = useMemo(() => byPerson(transactions), [transactions])
  const plan = useMemo(() => monthPlan(transactions, loans, bills, goals), [transactions, loans, bills, goals])
  const ls = useMemo(() => loanSummary(loans), [loans])
  const budgets = useMemo(() => budgetsWithSpend(transactions, rawBudgets), [transactions, rawBudgets])

  // Liquid funds, debt and net position are kept as separate figures rather
  // than one blended "Total Balance" — see the corrections spec, problem 6.
  const available = availableMoney(accounts)
  const cardOutstanding = accountTotals(accounts).card
  const net = netPosition(accounts, loans)
  const netDelta = prev.net ? Math.round(((t.net - prev.net) / Math.abs(prev.net)) * 100) : 0
  const forOthers = persons.find((p) => p.name === 'Others')?.value ?? 0
  const othersCount = transactions.filter((x) => x.person === 'Others' || x.person === 'Family').length

  const personColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
  const noteCats = ['All', 'Personal', 'Work', 'Family']
  const visibleNotes = notes.filter((n) => (noteFilter === 'All' ? true : n.category === noteFilter)).slice(0, 5)

  return (
    <div className="space-y-5 max-w-[1600px]">
      {/* Greeting + AI banner */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            {greeting()}, {settings.userName} <span className="animate-pulse">👋</span>
          </h1>
          <p className="text-[12.5px] text-slate-500 mt-1">Here's your financial overview for {currentMonthLabel()}.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-green" onClick={() => setModal('income')}>
            <Plus size={15} /> Add Income
          </button>
          <button className="btn-rose" onClick={() => setModal('expense')}>
            <Plus size={15} /> Add Expense
          </button>
          <button className="btn-ghost" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight size={15} /> Transfer
          </button>
          <Link to="/bills" className="btn-ghost">
            <Receipt size={15} /> Manage Bills
          </Link>
        </div>
      </div>

      {tipOpen && plan.shortfall > 0 && (
        <div className="card px-5 py-4 flex flex-wrap items-center gap-4 bg-gradient-to-r from-brand-50/70 via-white to-white border-brand-100">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-400 grid place-items-center text-white shrink-0 shadow-lg shadow-brand-500/25">
            <Sparkles size={18} />
          </div>
          <p className="flex-1 min-w-[260px] text-[13px] text-slate-700 leading-relaxed">
            Based on your current spending and upcoming payments, you need at least{' '}
            <b className="text-brand-700">{money(plan.shortfall)}</b> more income this month to stay on track with your
            goals.
          </p>
          <Link to="/reports" className="btn-primary">
            View Plan
          </Link>
          <button onClick={() => setTipOpen(false)} className="btn-ghost px-3">
            <X size={14} /> Dismiss
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Available Money"
          value={money(available)}
          icon={<Wallet size={20} />}
          tint="#3b82f6"
          footer={
            <span className={netDelta >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
              {netDelta >= 0 ? '↑' : '↓'} {Math.abs(netDelta)}%{' '}
              <span className="text-slate-400 font-normal">vs last month</span>
            </span>
          }
        />
        <StatCard
          label="This Month Income"
          value={money(t.income)}
          icon={<ArrowUpCircle size={20} />}
          tint="#22c55e"
          footer={
            <div>
              <div className="flex justify-between gap-1 text-[9.5px] text-slate-400 mb-1 whitespace-nowrap">
                <span>Target: {money(settings.monthlyIncomeTarget)}</span>
                <span className="font-bold text-slate-500">{pct(t.income, settings.monthlyIncomeTarget)}%</span>
              </div>
              <Progress value={t.income} max={settings.monthlyIncomeTarget} color="#22c55e" height={5} />
            </div>
          }
        />
        <StatCard
          label="This Month Spent"
          value={money(t.expenses)}
          icon={<ArrowDownCircle size={20} />}
          tint="#f43f5e"
          footer={
            <div>
              <div className="flex justify-between gap-1 text-[9.5px] text-slate-400 mb-1 whitespace-nowrap">
                <span>Budget: {money(settings.monthlyBudget)}</span>
                <span className="font-bold text-slate-500">{pct(t.expenses, settings.monthlyBudget)}%</span>
              </div>
              <Progress value={t.expenses} max={settings.monthlyBudget} color="#f43f5e" height={5} />
            </div>
          }
        />
        <StatCard
          label="For Others"
          value={money(forOthers)}
          icon={<Users size={20} />}
          tint="#8b5cf6"
          footer={<span className="text-slate-400">{othersCount} transactions</span>}
        />
        <StatCard
          label="Loan Payments Due"
          value={money(ls.dueAmount)}
          icon={<Landmark size={20} />}
          tint="#a855f7"
          footer={<span className="text-slate-400">{ls.dueThisMonth.length} payments due</span>}
        />
        <StatCard
          label="Credit Card Outstanding"
          value={money(cardOutstanding)}
          icon={<CreditCard size={20} />}
          tint="#ef4444"
          footer={<span className="text-slate-400">What you owe across all cards</span>}
        />
        <StatCard
          label="Loans Outstanding"
          value={money(ls.outstanding)}
          icon={<Landmark size={20} />}
          tint="#f97316"
          footer={<span className="text-slate-400">{ls.active.length} active loan{ls.active.length === 1 ? '' : 's'}</span>}
        />
        <StatCard
          label="Net Position"
          value={money(net)}
          icon={<PieIcon size={20} />}
          tint={net >= 0 ? '#22c55e' : '#ef4444'}
          footer={<span className="text-slate-400">Available money, less cards and loans</span>}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHead title="Income vs Expenses" right={<span className="chip bg-slate-100 text-slate-500">This Year</span>} />
          <div className="px-3 pb-4 flex flex-col lg:flex-row gap-3">
            <div className="flex-1 min-w-0">
              <IncomeExpenseBars data={series} />
            </div>
            <div className="lg:w-[140px] shrink-0 space-y-3 px-2 pb-2 self-center">
              <div>
                <p className="text-[11px] text-slate-400">Total Income</p>
                <p className="text-[15px] font-extrabold text-slate-800">{money(t.income)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Total Expenses</p>
                <p className="text-[15px] font-extrabold text-slate-800">{money(t.expenses)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Difference</p>
                <p className={`text-[15px] font-extrabold ${t.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {money(t.net)}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHead title="Budget Progress" right={<ViewAll to="/budget" />} />
          <div className="px-5 pb-5 space-y-3.5">
            {budgets.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-[12.5px] text-slate-400">No budget categories yet.</p>
                <Link to="/budget" className="btn-soft mt-3 inline-flex"><Plus size={13} /> Create a budget</Link>
              </div>
            )}
            {budgets.slice(0, 6).map((b) => (
              <div key={b.id}>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-[15px] w-5">{b.icon}</span>
                  <span className="flex-1 text-[12.5px] font-semibold text-slate-700 truncate">{b.name}</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {b.spent.toLocaleString()} / {b.budget.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 w-9 text-right tabular-nums">
                    {pct(b.spent, b.budget)}%
                  </span>
                </div>
                <Progress value={b.spent} max={b.budget} color={b.color} height={7} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHead title="Spending by Person" right={<span className="chip bg-slate-100 text-slate-500">This Month</span>} />
          <div className="px-5 pb-5 flex flex-col sm:flex-row xl:flex-col items-center gap-4">
            <Donut
              data={persons}
              size={165}
              colors={personColors}
              centerValue={money(t.expenses)}
              centerLabel="Total Spent"
            />
            <div className="flex-1 w-full">
              <DonutLegend data={persons} total={t.expenses} colors={personColors} />
            </div>
          </div>
        </Card>
      </div>

      {/* Loans + converter + documents */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHead title="Loan Tracker" right={<ViewAll to="/loans" />} />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[520px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Loan Name</th>
                  <th className="th">Outstanding</th>
                  <th className="th">Next Payment</th>
                  <th className="th">Amount</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {loans.length === 0 && (
                  <tr><td className="td text-center text-slate-400 py-8" colSpan={5}>No loans tracked yet.</td></tr>
                )}
                {loans.map((l) => (
                  <tr key={l.id} className="row-hover">
                    <td className="td font-semibold text-slate-800">
                      <span className="mr-2">{l.icon}</span>
                      {l.name}
                    </td>
                    <td className="td font-bold">{money(l.outstanding, l.currency)}</td>
                    <td className="td text-slate-500">{fmtDate(l.nextPayment)}</td>
                    <td className="td font-semibold">{money(l.emi, l.currency)}</td>
                    <td className="td">
                      <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 flex gap-2 border-t border-[#f1f5f9]">
            <Link to="/loans" className="btn-soft">
              <Plus size={14} /> Add Loan
            </Link>
            <Link to="/reports" className="btn-ghost">
              View Loan Report
            </Link>
          </div>
        </Card>

        <div className="xl:col-span-3">
          <CurrencyConverter />
        </div>

        <Card className="xl:col-span-4">
          <CardHead title="Important Documents" right={<ViewAll to="/documents" />} />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[420px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Document</th>
                  <th className="th">Expiry Date</th>
                  <th className="th">Status</th>
                  <th className="th">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {documents.length === 0 && (
                  <tr><td className="td text-center text-slate-400 py-8" colSpan={4}>No documents tracked yet.</td></tr>
                )}
                {documents.slice(0, 6).map((d) => {
                  const st = docStatus(d.expiry)
                  const dl = daysLeft(d.expiry)
                  return (
                    <tr key={d.id} className="row-hover">
                      <td className="td font-semibold text-slate-800">
                        <span className="mr-2">{d.icon}</span>
                        {d.name}
                      </td>
                      <td className="td text-slate-500">{fmtDate(d.expiry)}</td>
                      <td className="td">
                        <Badge tone={statusTone(st)}>{st}</Badge>
                      </td>
                      <td className={`td font-semibold ${dl <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                        🔔 {dl} days
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 flex gap-2 border-t border-[#f1f5f9]">
            <Link to="/documents" className="btn-soft">
              <Plus size={14} /> Add Document
            </Link>
            <Link to="/calendar" className="btn-ghost">
              View Expiry Calendar
            </Link>
          </div>
        </Card>
      </div>

      {/* Notes + plan + goals */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHead title="Notes & Follow Up" right={<ViewAll to="/notes" />} />
          <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
            {noteCats.map((c) => {
              const count = c === 'All' ? notes.length : notes.filter((n) => n.category === c).length
              return (
                <button
                  key={c}
                  onClick={() => setNoteFilter(c)}
                  className={`chip cursor-pointer transition ${
                    noteFilter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c} ({count})
                </button>
              )
            })}
            <Link to="/notes" className="btn-soft h-7 px-3 ml-auto text-[11px]">
              <Plus size={12} /> Add Note
            </Link>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[480px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Note</th>
                  <th className="th">Category</th>
                  <th className="th">Due Date</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {visibleNotes.length === 0 && (
                  <tr><td className="td text-center text-slate-400 py-8" colSpan={4}>No notes yet.</td></tr>
                )}
                {visibleNotes.map((n) => (
                  <tr key={n.id} className="row-hover">
                    <td className={`td font-semibold ${n.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {n.title}
                    </td>
                    <td className="td text-slate-500">{n.category}</td>
                    <td className="td text-slate-500">{fmtDate(n.dueDate)}</td>
                    <td className="td">
                      <Badge tone={statusTone(n.status)}>{n.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHead
            title="💡 This Month Plan (AI Suggestion)"
            right={<ViewAll to="/reports" />}
            sub={`You need ${money(plan.shortfall)} more income this month to meet your budget, loans and goals.`}
          />
          <div className="px-5 pb-5 space-y-2.5">
            {[
              { icon: '🧾', label: 'Required for Expenses', value: plan.requiredExpenses },
              { icon: '🏦', label: 'Upcoming Loan Payments', value: plan.upcomingLoans },
              { icon: '📄', label: 'Upcoming Bills & Subscriptions', value: plan.upcomingBills },
              { icon: '🎯', label: 'Savings & Goals', value: plan.savings },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-2.5 text-[12.5px]">
                <span>{r.icon}</span>
                <span className="flex-1 text-slate-600">{r.label}</span>
                <span className="font-bold text-slate-800 tabular-nums">{r.value.toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t border-[#eef2f8] pt-2.5 flex items-center text-[13px]">
              <span className="flex-1 font-bold text-slate-800">Total Required</span>
              <span className="font-extrabold text-slate-900 tabular-nums">{plan.totalRequired.toLocaleString()}</span>
            </div>
            <div className="flex items-center text-[12.5px]">
              <span className="flex-1 text-slate-600">Expected Income</span>
              <span className="font-bold text-slate-800 tabular-nums">{plan.expectedIncome.toLocaleString()}</span>
            </div>
            <div className="rounded-xl bg-rose-50 px-3 py-2.5 flex items-center text-[13px]">
              <span className="flex-1 font-bold text-rose-700">Additional Income Needed</span>
              <span className="font-extrabold text-rose-700 tabular-nums">{plan.shortfall.toLocaleString()}</span>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHead title="Savings Goals" right={<ViewAll to="/goals" />} />
          <div className="px-5 pb-5 space-y-4">
            {goals.length === 0 && (
              <p className="text-[12.5px] text-slate-400 py-6 text-center">No savings goals yet.</p>
            )}
            {goals.slice(0, 4).map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <span
                  className="h-9 w-9 rounded-xl grid place-items-center text-[15px] shrink-0"
                  style={{ background: `${g.color}1a` }}
                >
                  {g.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-bold text-slate-800 truncate">{g.name}</p>
                  <p className="text-[11px] text-slate-400 mb-1.5 tabular-nums">
                    {g.saved.toLocaleString()} / {g.target.toLocaleString()}
                  </p>
                  <Progress value={g.saved} max={g.target} color={g.color} height={6} />
                </div>
                <span className="text-[11px] font-bold text-slate-500 tabular-nums">{pct(g.saved, g.target)}%</span>
              </div>
            ))}
            <Link to="/goals" className="btn-soft w-full">
              <Plus size={14} /> Add New Goal
            </Link>
          </div>
        </Card>
      </div>

      {/* Reports strip */}
      <Card>
        <CardHead
          title="📊 Reports"
          sub="Get detailed insights into your finances with comprehensive reports and analytics."
          right={<ViewAll to="/reports" />}
        />
        <div className="px-5 pb-5 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { icon: <BarChart3 size={18} />, title: 'Monthly Summary', desc: 'Income, expenses, savings and net balance overview.', color: '#10b981' },
            { icon: <PieIcon size={18} />, title: 'Category Report', desc: 'Detailed spending by category with trends and insights.', color: '#8b5cf6' },
            { icon: <Landmark size={18} />, title: 'Loan Report', desc: 'All loans and payments with upcoming dues.', color: '#3b82f6' },
            { icon: <FileText size={18} />, title: 'Document Expiry', desc: 'Track important document expiry dates and status.', color: '#f59e0b' },
            { icon: <StickyNote size={18} />, title: 'Notes & Follow-up', desc: 'Pending and completed notes with due dates.', color: '#ec4899' },
          ].map((r) => (
            <div key={r.title} className="rounded-2xl border border-[#eef2f8] p-4 hover:shadow-md transition-shadow">
              <span
                className="h-10 w-10 rounded-xl grid place-items-center mb-3"
                style={{ background: `${r.color}1a`, color: r.color }}
              >
                {r.icon}
              </span>
              <p className="text-[13px] font-bold text-slate-800">{r.title}</p>
              <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">{r.desc}</p>
              <Link
                to="/reports"
                className="mt-3 h-9 w-full rounded-xl text-white text-[12px] font-bold inline-flex items-center justify-center gap-1.5 transition hover:opacity-90"
                style={{ background: r.color }}
              >
                View Report →
              </Link>
            </div>
          ))}
        </div>
      </Card>

      <TransactionModal open={modal !== null} onClose={() => setModal(null)} type={modal ?? 'income'} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  )
}

function CurrencyConverter() {
  const [from, setFrom] = useState<Currency>('INR')
  const [to, setTo] = useState<Currency>('AED')
  const [amount, setAmount] = useState('1000')

  const result = convert(Number(amount) || 0, from, to)
  const rate = convert(1, from, to)

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  return (
    <Card className="h-full">
      <CardHead title="Currency Converter" />
      <div className="px-5 pb-5 space-y-3">
        <div>
          <label className="label">From</label>
          <div className="flex gap-2">
            <select className="input w-28" value={from} onChange={(e) => setFrom(e.target.value as Currency)}>
              <option>INR</option>
              <option>AED</option>
              <option>USD</option>
            </select>
            <input className="input flex-1 text-right font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <button
          onClick={swap}
          className="mx-auto h-9 w-9 grid place-items-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100 cursor-pointer transition"
        >
          <ArrowLeftRight size={15} />
        </button>
        <div>
          <label className="label">To</label>
          <div className="flex gap-2">
            <select className="input w-28" value={to} onChange={(e) => setTo(e.target.value as Currency)}>
              <option>AED</option>
              <option>INR</option>
              <option>USD</option>
            </select>
            <div className="input flex-1 flex items-center justify-end font-bold bg-slate-50">
              {result.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 text-center">
          1 {from} = {rate.toLocaleString('en-US', { maximumFractionDigits: 4 })} {to} · Updated {fmtDate(TODAY)}
        </p>
      </div>
    </Card>
  )
}
