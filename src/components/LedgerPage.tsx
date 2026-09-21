import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownCircle, ArrowUpCircle, BarChart3, CalendarDays, LayoutGrid, Lightbulb, Pencil, Plus, Star, Target,
  Trash2, X,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, PageHeader, Progress, StatCard, Empty } from '@/components/ui/Primitives'
import { Donut, DonutLegend, SingleBars, PALETTE } from '@/components/charts/Charts'
import { TransactionModal } from '@/components/TransactionModal'
import { ReceiptList } from '@/components/ReceiptList'
import { ReceiptModal } from '@/components/ReceiptModal'
import { groupReceipts, type ReceiptEntry } from '@/lib/receipts'
import { fmtDate, money, monthLabel, pct, toBase } from '@/lib/format'
import { CURRENT_MONTH, PREV_MONTH, byAccount, byCategory, byMethod, currentMonthLabel, inMonth, isEarned, isSpend, monthlySeries, seriesRange, spendValue, totals } from '@/lib/selectors'
import type { Transaction, TxnType } from '@/types'

export function LedgerPage({ type }: { type: TxnType }) {
  const nav = useNavigate()
  const isIncome = type === 'income'
  const { transactions, accounts, receipts, settings, removeTransaction, removeReceipt } = useStore()
  const [receiptModal, setReceiptModal] = useState(false)
  const [editingReceipt, setEditingReceipt] = useState<ReceiptEntry | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [tab, setTab] = useState<'overview' | 'category' | 'account' | 'trend'>('overview')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [banner, setBanner] = useState(true)
  const [q, setQ] = useState('')

  const t = useMemo(() => totals(transactions), [transactions])
  const prev = useMemo(() => totals(transactions, PREV_MONTH), [transactions])
  const cats = useMemo(() => byCategory(transactions, type), [transactions, type])
  const accs = useMemo(() => byAccount(transactions, type, accounts), [transactions, accounts, type])
  const methods = useMemo(() => byMethod(transactions), [transactions])
  const series = useMemo(
    () => monthlySeries(transactions).map((m) => ({ month: m.month, value: isIncome ? m.income : m.expenses })),
    [transactions, isIncome],
  )

  const current = isIncome ? t.income : t.expenses
  const previous = isIncome ? prev.income : prev.expenses
  const allTime = useMemo(
    () =>
      transactions.reduce(
        (a, x) => a + (isIncome ? (isEarned(x) ? toBase(x.amount, x.currency) : 0) : spendValue(x)),
        0,
      ),
    [transactions, isIncome],
  )
  const delta = previous ? Math.round(((current - previous) / previous) * 100) : 0
  const target = isIncome ? settings.monthlyIncomeTarget : settings.monthlyBudget
  const avg = Math.round(series.reduce((a, m) => a + m.value, 0) / series.length)
  const avgDelta = avg ? Math.round(((current - avg) / avg) * 100) : 0
  const top = cats[0]

  const rows = useMemo(
    () =>
      transactions
        // Income lists earned income only; the expense list also carries refunds
        // (as negatives) and asset purchases (flagged), never borrowed money.
        .filter((x) => (isIncome ? isEarned(x) : isSpend(x) || (x.kind ?? 'normal') === 'asset_purchase'))
        .filter((x) =>
          q.trim().length < 2
            ? true
            : `${x.description} ${x.category} ${x.store ?? ''} ${x.brand ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, isIncome, q],
  )
  // Expenses are listed one row per receipt; income stays one row per entry.
  const entries = useMemo(() => groupReceipts(rows, receipts), [rows, receipts])
  const monthRows = isIncome ? rows.filter((r) => r.date.startsWith(CURRENT_MONTH)) : entries.filter((e) => e.date.startsWith(CURRENT_MONTH))
  const deleteEntry = (e: ReceiptEntry) => {
    const what = e.receiptId ? `this receipt and its ${e.items.length} item${e.items.length === 1 ? '' : 's'}` : 'this entry'
    if (!window.confirm(`Delete ${what}? Account balances and reports update automatically.`)) return
    if (e.receiptId) removeReceipt(e.receiptId)
    else removeTransaction(e.items[0].id)
  }

  const accent = isIncome ? '#22c55e' : '#f43f5e'
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'category', label: 'By Category' },
    { key: 'account', label: 'By Account' },
    { key: 'trend', label: 'Monthly Trend' },
  ] as const

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title={isIncome ? 'Income Dashboard' : 'Expenses Dashboard'}
        subtitle={
          isIncome
            ? 'Track and manage all your income in one place.'
            : 'Track and manage your spending for a healthier financial life.'
        }
        actions={
          <div className="flex gap-2">
            {!isIncome && (
              <button className="btn-ghost" onClick={() => { setEditingReceipt(null); setReceiptModal(true) }}>
                <Plus size={15} /> Add Receipt
              </button>
            )}
            <button
              className={isIncome ? 'btn-green' : 'btn-rose'}
              onClick={() => {
                setEditing(null)
                setModal(true)
              }}
            >
              <Plus size={15} /> {isIncome ? 'Add Income' : 'Add Expense'}
            </button>
          </div>
        }
      />

      <div className="flex gap-1 flex-wrap border-b border-[#e8edf5]">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`px-4 h-10 text-[13px] font-semibold border-b-2 transition cursor-pointer ${
              tab === x.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isIncome ? 'Total Income (All Time)' : 'Total Expenses (All Time)'}
          value={money(allTime)}
          icon={isIncome ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
          tint={accent}
          footer={
            <span className={delta >= 0 === isIncome ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% <span className="text-slate-400 font-normal">vs last month</span>
            </span>
          }
        />
        <StatCard
          label={isIncome ? 'This Month Income' : 'This Month Expenses'}
          value={money(current)}
          icon={<CalendarDays size={20} />}
          tint="#3b82f6"
          footer={
            <div>
              <div className="flex justify-between gap-1 text-[9.5px] text-slate-400 mb-1 whitespace-nowrap">
                <span>{isIncome ? 'Target' : 'Budget'}: {money(target)}</span>
                <span className="font-bold text-slate-500">{pct(current, target)}%</span>
              </div>
              <Progress value={current} max={target} color={accent} height={5} />
            </div>
          }
        />
        <StatCard
          label={isIncome ? 'Average Monthly Income' : 'Average Monthly Expense'}
          value={money(avg)}
          icon={<BarChart3 size={20} />}
          tint="#8b5cf6"
          footer={
            <span className={avgDelta >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
              {avgDelta >= 0 ? '↑' : '↓'} {Math.abs(avgDelta)}%{' '}
              <span className="text-slate-400 font-normal">this month vs 9-month average</span>
            </span>
          }
        />
        <StatCard
          label={isIncome ? 'Highest Income Source' : 'Highest Expense Category'}
          value={top?.name ?? '—'}
          icon={<Star size={20} />}
          tint="#f59e0b"
          footer={<span className="text-slate-400">{top ? `${money(top.value)} (${pct(top.value, current)}%)` : '—'}</span>}
        />
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
            <Card className="xl:col-span-5">
              <CardHead title={isIncome ? 'Monthly Income Trend' : 'Monthly Expense Trend'} right={<span className="chip bg-slate-100 text-slate-500">This Year</span>} />
              <div className="px-3 pb-4">
                <SingleBars data={series} color="#3b82f6" highlight={monthLabel(CURRENT_MONTH)} />
              </div>
            </Card>

            <Card className="xl:col-span-4">
              <CardHead title={isIncome ? 'Income by Category' : 'Expenses by Category'} />
              <div className="px-5 pb-5 flex flex-col sm:flex-row items-center gap-4">
                <Donut data={cats} size={165} centerValue={money(current)} centerLabel="This Month" />
                <div className="flex-1 w-full">
                  <DonutLegend data={cats} total={current} showValue={false} />
                </div>
              </div>
            </Card>

            <Card className="xl:col-span-3">
              <CardHead title={isIncome ? 'Income by Account' : 'Expenses by Payment Method'} />
              <div className="px-5 pb-5 space-y-3.5">
                {(isIncome ? accs : methods).slice(0, 6).map((a, i) => (
                  <div key={a.name}>
                    <div className="flex items-center gap-2 text-[12px] mb-1.5">
                      <span className="flex-1 truncate text-slate-600 font-medium">{a.name}</span>
                      <span className="font-bold text-slate-500 tabular-nums">{pct(a.value, current)}%</span>
                    </div>
                    <Progress value={a.value} max={current} color={PALETTE[i % PALETTE.length]} height={7} />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
            <Card className="xl:col-span-8">
              <CardHead
                title={isIncome ? 'Recent Income Transactions' : 'Expenses by Receipt'}
                right={
                  <input
                    className="input h-9 w-52 text-[12px]"
                    placeholder="Search…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                }
              />
              {!isIncome && (
                <>
                  <ReceiptList
                    entries={showAll ? entries : entries.slice(0, 20)}
                    accounts={accounts}
                    onEditItem={(t) => { setEditing(t); setModal(true) }}
                    onEditReceipt={(e) => { setEditingReceipt(e); setReceiptModal(true) }}
                    onDeleteReceipt={deleteEntry}
                    onDeleteItem={(t) => window.confirm('Delete this item?') && removeTransaction(t.id)}
                  />
                  {entries.length === 0 && <Empty text="No expenses yet." />}
                  {entries.length > 20 && (
                    <button onClick={() => setShowAll((v) => !v)} className="w-full py-3 text-[12.5px] font-semibold text-brand-600 hover:bg-slate-50 cursor-pointer">
                      {showAll ? 'Show fewer' : `Show all ${entries.length} entries`}
                    </button>
                  )}
                </>
              )}
              <div className={`overflow-x-auto scroll-thin ${isIncome ? '' : 'hidden'}`}>
                <table className="w-full min-w-[720px]">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Description</th>
                      <th className="th">Category</th>
                      <th className="th">Account</th>
                      <th className="th">Person</th>
                      <th className="th text-right">Amount</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {rows.slice(0, 14).map((r) => (
                      <tr key={r.id} className="row-hover">
                        <td className="td text-slate-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="td font-semibold text-slate-800">{r.description}</td>
                        <td className="td text-slate-500">{r.category}</td>
                        <td className="td text-slate-500">{accounts.find((a) => a.id === r.accountId)?.name ?? '—'}</td>
                        <td className="td text-slate-500">{r.person ?? 'Me'}</td>
                        <td className="td text-right font-bold tabular-nums" style={{ color: accent }}>
                          {money(r.amount, r.currency)}
                        </td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => { setEditing(r); setModal(true) }}
                              className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => removeTransaction(r.id)}
                              className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && <Empty text="No transactions yet." />}
              </div>
            </Card>

            <div className="xl:col-span-4 space-y-4">
              <Card>
                <CardHead
                  title={isIncome ? 'Income Targets' : 'Budget Status'}
                  right={
                    <button
                      onClick={() => nav(isIncome ? '/settings' : '/budget')}
                      className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 cursor-pointer"
                    >
                      Edit
                    </button>
                  }
                />
                <div className="px-5 pb-5 flex items-center gap-4">
                  <Donut
                    data={[
                      { name: isIncome ? 'Achieved' : 'Spent', value: Math.min(current, target) },
                      { name: 'Remaining', value: Math.max(0, target - current) },
                    ]}
                    colors={['#22c55e', '#e8edf5']}
                    size={130}
                    innerRatio={0.74}
                    centerValue={`${pct(current, target)}%`}
                    centerLabel={money(current)}
                  />
                  <div className="flex-1 space-y-2.5 text-[12.5px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{isIncome ? 'Monthly Target' : 'Monthly Budget'}</span>
                      <span className="font-bold text-slate-800">{money(target)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{isIncome ? 'Actual Income' : 'Total Spent'}</span>
                      <span className="font-bold text-slate-800">{money(current)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Remaining</span>
                      <span className="font-bold text-emerald-600">{money(Math.max(0, target - current))}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-[#f1f5f9]">
                      <span className="text-slate-500">Transactions</span>
                      <span className="font-bold text-slate-800">{monthRows.length}</span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHead title="Quick Actions" />
                <div className="px-5 pb-5 grid grid-cols-2 gap-2.5">
                  {[
                    { icon: <Plus size={15} />, label: isIncome ? 'Add Income' : 'Add Expense', action: () => { setEditing(null); setModal(true) } },
                    { icon: <BarChart3 size={15} />, label: 'View Report', action: () => nav('/reports') },
                    { icon: <Target size={15} />, label: isIncome ? 'Set Target' : 'Set Budget', action: () => nav(isIncome ? '/settings' : '/budget') },
                    { icon: <LayoutGrid size={15} />, label: 'Categories', action: () => setTab('category') },
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={a.action}
                      className="h-14 rounded-xl border border-[#e8edf5] flex items-center gap-2.5 px-3 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-brand-200 transition cursor-pointer"
                    >
                      <span className="h-8 w-8 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0">{a.icon}</span>
                      <span className="text-left leading-tight">{a.label}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'category' && (
        <Card>
          <CardHead title={`${isIncome ? 'Income' : 'Expenses'} by Category`} sub={currentMonthLabel()} />
          <div className="px-5 pb-5 space-y-4">
            {cats.map((c, i) => (
              <div key={c.name}>
                <div className="flex items-center gap-3 mb-1.5 text-[13px]">
                  <span className="flex-1 font-semibold text-slate-700">{c.name}</span>
                  <span className="text-slate-500 tabular-nums">{money(c.value)}</span>
                  <span className="w-10 text-right font-bold text-slate-400 tabular-nums">{pct(c.value, current)}%</span>
                </div>
                <Progress value={c.value} max={current} color={PALETTE[i % PALETTE.length]} height={9} />
              </div>
            ))}
            {cats.length === 0 && <Empty text="No data for this month." />}
          </div>
        </Card>
      )}

      {tab === 'account' && (
        <Card>
          <CardHead title={`${isIncome ? 'Income' : 'Expenses'} by Account`} sub={currentMonthLabel()} />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[520px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Account</th>
                  <th className="th text-right">Amount (AED)</th>
                  <th className="th">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {accs.map((a, i) => (
                  <tr key={a.name} className="row-hover">
                    <td className="td font-semibold text-slate-800">{a.name}</td>
                    <td className="td text-right font-bold tabular-nums">{money(a.value)}</td>
                    <td className="td w-1/3">
                      <div className="flex items-center gap-2">
                        <Progress value={a.value} max={current} color={PALETTE[i % PALETTE.length]} height={7} />
                        <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{pct(a.value, current)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'trend' && (
        <Card>
          <CardHead title="Monthly Trend" sub={seriesRange()} />
          <div className="px-3 pb-4">
            <SingleBars data={series} color={accent} highlight={monthLabel(CURRENT_MONTH)} height={320} />
          </div>
          <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Highest', value: Math.max(...series.map((s) => s.value)) },
              { label: 'Lowest', value: Math.min(...series.map((s) => s.value)) },
              { label: 'Average', value: avg },
              { label: 'This Month', value: current },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">{s.label}</p>
                <p className="text-[15px] font-extrabold text-slate-800">{money(s.value)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {banner && (
        <div className={`card px-5 py-4 flex items-start gap-3 ${isIncome ? 'bg-emerald-50/60 border-emerald-100' : 'bg-rose-50/60 border-rose-100'}`}>
          <Lightbulb size={18} className={isIncome ? 'text-emerald-600 mt-0.5' : 'text-rose-600 mt-0.5'} />
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isIncome ? 'text-emerald-800' : 'text-rose-800'}`}>
              {isIncome ? 'Good progress!' : `You spent ${Math.abs(delta)}% ${delta >= 0 ? 'more' : 'less'} than last month.`}
            </p>
            <p className="text-[12px] text-slate-600 mt-0.5">
              {isIncome
                ? `Your income is ${Math.abs(delta)}% ${delta >= 0 ? 'higher' : 'lower'} than last month. You need ${money(Math.max(0, target - current))} more to reach your monthly target.`
                : `Your expenses changed by ${money(Math.abs(current - previous))} compared to last month. Biggest category: ${top?.name ?? '—'}.`}
            </p>
          </div>
          <button onClick={() => setBanner(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={15} />
          </button>
        </div>
      )}

      <TransactionModal open={modal} onClose={() => setModal(false)} type={type} editing={editing} />
      <ReceiptModal open={receiptModal} onClose={() => setReceiptModal(false)} editing={editingReceipt} />
    </div>
  )
}

/** Total of all transactions of a type, in AED — exported for reuse. */
export function ledgerTotal(txns: Transaction[], type: TxnType) {
  return type === 'income'
    ? inMonth(txns).filter(isEarned).reduce((a, t) => a + toBase(t.amount, t.currency), 0)
    : inMonth(txns).reduce((a, t) => a + spendValue(t), 0)
}
