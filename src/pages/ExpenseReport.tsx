import { useMemo, useState } from 'react'
import {
  ArrowDownCircle, CalendarDays, Download, FileSpreadsheet, Receipt, ScanLine, ShieldCheck, Store, Tag, Trash2, Pencil,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Card, CardHead, Empty, PageHeader, Progress, StatCard } from '@/components/ui/Primitives'
import { Donut, DonutLegend, PALETTE, SingleBars } from '@/components/charts/Charts'
import { TransactionModal } from '@/components/TransactionModal'
import { BillScanModal } from '@/components/BillScanModal'
import { StatementImportModal } from '@/components/StatementImportModal'
import { hasGemini } from '@/lib/gemini'
import { fmtDate, money, monthLabel, pct } from '@/lib/format'
import {
  CURRENT_MONTH, addMonthsOptions, byCategory, byMethod, byPerson, byStore, currentMonthLabel,
  expenseRows, expenseSummary, monthlySeries, warranties,
} from '@/lib/selectors'
import type { Transaction } from '@/types'

type Tab = 'overview' | 'category' | 'store' | 'items' | 'warranty'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'category', label: 'By Category' },
  { key: 'store', label: 'By Store' },
  { key: 'items', label: 'All Items' },
  { key: 'warranty', label: 'Warranties' },
]

export default function ExpenseReport() {
  const { transactions, people, accounts, addTransaction, removeTransaction } = useStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [scan, setScan] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [q, setQ] = useState('')

  const sum = useMemo(() => expenseSummary(transactions, month), [transactions, month])
  const rows = useMemo(() => expenseRows(transactions, month), [transactions, month])
  const cats = useMemo(() => byCategory(transactions, 'expense', month), [transactions, month])
  const stores = useMemo(() => byStore(transactions, month), [transactions, month])
  const methods = useMemo(() => byMethod(transactions, month), [transactions, month])
  const persons = useMemo(() => byPerson(transactions, month), [transactions, month])
  const series = useMemo(
    () => monthlySeries(transactions).map((m) => ({ month: m.month, value: m.expenses })),
    [transactions],
  )
  const wty = useMemo(() => warranties(transactions), [transactions])
  const months = useMemo(() => addMonthsOptions(12), [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return rows
    return rows.filter((r) =>
      `${r.description} ${r.category} ${r.subcategory ?? ''} ${r.store ?? ''} ${r.person ?? ''}`
        .toLowerCase()
        .includes(term),
    )
  }, [rows, q])

  const exportCsv = () => {
    const out = [
      ['Date', 'Item', 'Category', 'Sub-category', 'Store', 'Person', 'Method', 'Qty', 'Weight', 'Unit', 'Amount', 'Currency', 'Amount (AED)'],
      ...filtered.map((r) => [
        r.date, r.description, r.category, r.subcategory ?? '', r.store ?? '', r.person ?? '', r.method ?? '',
        r.qty ?? '', r.weight ?? '', r.weightUnit ?? '', r.amount, r.currency, Math.round(r.aed * 100) / 100,
      ]),
    ]
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `thomas-expenses-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—'

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Expense Report"
        subtitle="Every purchase and payment, broken down by category, store, person and method."
        actions={
          <>
            <select
              className="input h-10 w-auto"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Report month"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} {m.slice(0, 4)}
                </option>
              ))}
            </select>
            <button className="btn-ghost" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </button>
            {hasGemini && (
              <>
                <button className="btn-ghost" onClick={() => setImportOpen(true)} title="Read a bank or card statement">
                  <FileSpreadsheet size={15} /> Import Statement
                </button>
                <button className="btn-ghost" onClick={() => setScan(true)} title="Read a receipt photo with Gemini">
                  <ScanLine size={15} /> Scan Bill
                </button>
              </>
            )}
            <button
              className="btn-rose"
              onClick={() => {
                setEditing(null)
                setModal(true)
              }}
            >
              <Receipt size={15} /> Add Expense
            </button>
          </>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Spent in ${monthLabel(month)}`}
          value={money(sum.total)}
          icon={<ArrowDownCircle size={20} />}
          tint="#f43f5e"
          footer={
            sum.prev ? (
              <span className={sum.delta <= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                {sum.delta <= 0 ? '↓' : '↑'} {Math.abs(sum.delta)}%{' '}
                <span className="text-slate-400 font-normal">vs last month</span>
              </span>
            ) : (
              <span className="text-slate-400">{sum.count} entries</span>
            )
          }
        />
        <StatCard
          label="Entries"
          value={String(sum.count)}
          icon={<Tag size={20} />}
          tint="#3b82f6"
          footer={<span className="text-slate-400">{money(sum.average)} average</span>}
        />
        <StatCard
          label="Top Category"
          value={sum.topCategory?.name ?? '—'}
          icon={<CalendarDays size={20} />}
          tint="#8b5cf6"
          footer={
            <span className="text-slate-400">
              {sum.topCategory ? `${money(sum.topCategory.value)} · ${pct(sum.topCategory.value, sum.total)}%` : '—'}
            </span>
          }
        />
        <StatCard
          label="Top Store"
          value={sum.topStore?.name ?? '—'}
          icon={<Store size={20} />}
          tint="#f59e0b"
          footer={<span className="text-slate-400">{sum.topStore ? money(sum.topStore.value) : 'No store recorded'}</span>}
        />
      </div>

      <div className="flex gap-1 flex-wrap border-b border-[#e8edf5]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 h-10 text-[13px] font-semibold border-b-2 transition cursor-pointer ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.key === 'warranty' && wty.length > 0 ? ` (${wty.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
          <Card className="xl:col-span-5">
            <CardHead title="Monthly Spend" right={<span className="chip bg-slate-100 text-slate-500">9 months</span>} />
            <div className="px-3 pb-4">
              <SingleBars data={series} color="#f43f5e" highlight={monthLabel(month)} />
            </div>
          </Card>

          <Card className="xl:col-span-4">
            <CardHead title="By Category" sub={currentMonthLabel(month)} />
            <div className="px-5 pb-5 flex flex-col sm:flex-row items-center gap-4">
              <Donut data={cats} size={165} centerValue={money(sum.total)} centerLabel="Total" />
              <div className="flex-1 w-full">
                <DonutLegend data={cats} total={sum.total} showValue={false} />
              </div>
            </div>
          </Card>

          <Card className="xl:col-span-3">
            <CardHead title="By Person" sub={currentMonthLabel(month)} />
            <div className="px-5 pb-5 space-y-3.5">
              {persons.map((p, i) => (
                <div key={p.name}>
                  <div className="flex items-center gap-2 text-[12px] mb-1.5">
                    <span className="flex-1 truncate text-slate-600 font-medium">{p.name}</span>
                    <span className="font-bold text-slate-500 tabular-nums">{pct(p.value, sum.total)}%</span>
                  </div>
                  <Progress value={p.value} max={sum.total} color={PALETTE[i % PALETTE.length]} height={7} />
                </div>
              ))}
              {persons.length === 0 && <Empty text="No expenses this month." />}
            </div>
          </Card>

          <Card className="xl:col-span-6">
            <CardHead title="Payment Methods" sub={currentMonthLabel(month)} />
            <div className="px-5 pb-5 space-y-3.5">
              {methods.map((m, i) => (
                <div key={m.name}>
                  <div className="flex items-center gap-2 text-[12px] mb-1.5">
                    <span className="flex-1 truncate text-slate-600 font-medium">{m.name}</span>
                    <span className="text-slate-500 tabular-nums">{money(m.value)}</span>
                    <span className="font-bold text-slate-400 tabular-nums w-9 text-right">{pct(m.value, sum.total)}%</span>
                  </div>
                  <Progress value={m.value} max={sum.total} color={PALETTE[i % PALETTE.length]} height={7} />
                </div>
              ))}
              {methods.length === 0 && <Empty text="No expenses this month." />}
            </div>
          </Card>

          <Card className="xl:col-span-6">
            <CardHead title="Biggest Single Expense" sub={currentMonthLabel(month)} />
            <div className="px-5 pb-5">
              {sum.largest ? (
                <div className="rounded-xl bg-slate-50 px-4 py-3.5">
                  <p className="text-[15px] font-bold text-slate-800">{sum.largest.description}</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {fmtDate(sum.largest.date)} · {sum.largest.category}
                    {sum.largest.store ? ` · ${sum.largest.store}` : ''}
                  </p>
                  <p className="text-[22px] font-extrabold text-rose-600 mt-2">{money(sum.largest.aed)}</p>
                  <p className="text-[11.5px] text-slate-400 mt-1">
                    {pct(sum.largest.aed, sum.total)}% of the month · {money(sum.perDay)} average per active day
                  </p>
                </div>
              ) : (
                <Empty text="No expenses this month." />
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'category' && (
        <Card>
          <CardHead title="Spending by Category" sub={currentMonthLabel(month)} />
          <div className="px-5 pb-5 space-y-4">
            {cats.map((c, i) => (
              <div key={c.name}>
                <div className="flex items-center gap-3 mb-1.5 text-[13px]">
                  <span className="flex-1 font-semibold text-slate-700">{c.name}</span>
                  <span className="text-slate-500 tabular-nums">{money(c.value)}</span>
                  <span className="w-10 text-right font-bold text-slate-400 tabular-nums">{pct(c.value, sum.total)}%</span>
                </div>
                <Progress value={c.value} max={sum.total} color={PALETTE[i % PALETTE.length]} height={9} />
              </div>
            ))}
            {cats.length === 0 && <Empty text="No expenses this month." />}
          </div>
        </Card>
      )}

      {tab === 'store' && (
        <Card>
          <CardHead title="Spending by Store" sub={`${currentMonthLabel(month)} · scanned bills fill this in automatically`} />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[520px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Store</th>
                  <th className="th text-right">Spent</th>
                  <th className="th text-right">Entries</th>
                  <th className="th w-1/3">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {stores.map((s, i) => (
                  <tr key={s.name} className="row-hover">
                    <td className={`td font-semibold ${s.name === 'Unrecorded' ? 'text-slate-400 italic' : 'text-slate-800'}`}>
                      {s.name}
                    </td>
                    <td className="td text-right font-bold tabular-nums">{money(s.value)}</td>
                    <td className="td text-right tabular-nums text-slate-500">
                      {rows.filter((r) => ((r.store ?? '').trim() || 'Unrecorded') === s.name).length}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Progress value={s.value} max={sum.total} color={PALETTE[i % PALETTE.length]} height={7} />
                        <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{pct(s.value, sum.total)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stores.length === 0 && <Empty text="No expenses this month." />}
          </div>
        </Card>
      )}

      {tab === 'items' && (
        <Card>
          <CardHead
            title="All Expenses"
            sub={currentMonthLabel(month)}
            right={
              <input
                className="input h-9 w-52 text-[12px]"
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            }
          />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[860px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Item</th>
                  <th className="th">Category</th>
                  <th className="th">Store</th>
                  <th className="th">Account</th>
                  <th className="th">Person</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Weight</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {filtered.map((r) => (
                  <tr key={r.id} className="row-hover">
                    <td className="td text-slate-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="td font-semibold text-slate-800">{r.description}</td>
                    <td className="td text-slate-500">
                      {r.category}
                      {r.subcategory ? <span className="text-slate-400"> · {r.subcategory}</span> : null}
                    </td>
                    <td className="td text-slate-500">{r.store ?? '—'}</td>
                    <td className="td text-slate-500">{accountName(r.accountId)}</td>
                    <td className="td text-slate-500">{r.person ?? 'Me'}</td>
                    <td className="td text-right tabular-nums text-slate-500">{r.qty ?? '—'}</td>
                    <td className="td text-right tabular-nums text-slate-500 whitespace-nowrap">
                      {r.weight ? (
                        <span title={`${money(r.aed / r.weight)} per ${r.weightUnit}`}>
                          {r.weight} {r.weightUnit}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="td text-right font-bold tabular-nums text-rose-600">{money(r.amount, r.currency)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditing(r)
                            setModal(true)
                          }}
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
            {filtered.length === 0 && <Empty text={rows.length ? 'Nothing matches that search.' : 'No expenses this month.'} />}
          </div>
        </Card>
      )}

      {tab === 'warranty' && (
        <Card>
          <CardHead title="Warranties" sub="Anything you recorded a warranty length for, across all months" />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[620px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Item</th>
                  <th className="th">Store</th>
                  <th className="th">Bought</th>
                  <th className="th">Warranty</th>
                  <th className="th">Expires</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {wty.map((w) => (
                  <tr key={w.id} className="row-hover">
                    <td className="td font-semibold text-slate-800">{w.description}</td>
                    <td className="td text-slate-500">{w.store ?? '—'}</td>
                    <td className="td text-slate-500 whitespace-nowrap">{fmtDate(w.date)}</td>
                    <td className="td text-slate-500">{w.warrantyMonths} months</td>
                    <td className="td text-slate-500 whitespace-nowrap">{fmtDate(w.expires)}</td>
                    <td className="td">
                      {w.days < 0 ? (
                        <Badge tone="red">Expired</Badge>
                      ) : w.days <= 30 ? (
                        <Badge tone="amber">{w.days} days left</Badge>
                      ) : (
                        <Badge tone="green">{w.days} days left</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {wty.length === 0 && (
              <Empty text="Nothing under warranty — add a warranty length when recording an expense." />
            )}
          </div>
        </Card>
      )}

      <div className="card px-5 py-4 flex items-start gap-3 bg-brand-50/50 border-brand-100">
        <ShieldCheck size={17} className="text-brand-600 mt-0.5 shrink-0" />
        <p className="text-[12px] text-slate-600 leading-relaxed">
          Everything here reads from your expense transactions, so it always matches the Dashboard, Budget and Reports.
          {hasGemini ? ' Scanned bills land here as expenses and count towards your budget straight away.' : ''}
        </p>
      </div>

      <StatementImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      <BillScanModal
        open={scan}
        onClose={() => setScan(false)}
        people={people.map((p) => p.name)}
        accounts={accounts}
        transactions={transactions}
        onAdd={addTransaction}
      />

      <TransactionModal open={modal} onClose={() => setModal(false)} type="expense" editing={editing} />
    </div>
  )
}
