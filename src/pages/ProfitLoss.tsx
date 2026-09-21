import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Download, FileSpreadsheet, Printer, Scale, X } from 'lucide-react'
import writeExcelFile from 'write-excel-file/browser'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, StatCard } from '@/components/ui/Primitives'
import { IncomeExpenseBars } from '@/components/charts/Charts'
import { addMonths, fmtDate, money, monthLabel, toBase, TODAY } from '@/lib/format'
import { addMonthsOptions } from '@/lib/selectors'
import { assetPurchases, debtMovements, plEntries, summarise, type PlEntry, type PlFilter } from '@/lib/ledger'
import { peopleReport } from '@/lib/peopleStats'

type Mode = 'month' | 'year' | 'custom'

const lastDay = (ym: string) => `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, '0')}`

/** The period, and the one immediately before it (same length) for comparison. */
function periods(mode: Mode, month: string, year: string, from: string, to: string) {
  if (mode === 'month') {
    const prev = addMonths(month, -1)
    return { cur: { from: `${month}-01`, to: lastDay(month) }, prev: { from: `${prev}-01`, to: lastDay(prev) }, label: `${monthLabel(month)} ${month.slice(0, 4)}`, prevLabel: `${monthLabel(prev)} ${prev.slice(0, 4)}` }
  }
  if (mode === 'year') {
    const py = String(Number(year) - 1)
    return { cur: { from: `${year}-01-01`, to: `${year}-12-31` }, prev: { from: `${py}-01-01`, to: `${py}-12-31` }, label: year, prevLabel: py }
  }
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)
  const pTo = new Date(new Date(from).getTime() - 86400000)
  const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { cur: { from, to }, prev: { from: iso(pFrom), to: iso(pTo) }, label: `${fmtDate(from)} – ${fmtDate(to)}`, prevLabel: 'previous period' }
}

function change(cur: number, prev: number) {
  const delta = cur - prev
  return { delta, pct: prev ? Math.round((delta / Math.abs(prev)) * 1000) / 10 : null }
}

export default function ProfitLoss() {
  const { transactions, transfers, accounts, loans, people } = useStore()
  const [mode, setMode] = useState<Mode>('month')
  const [month, setMonth] = useState(TODAY.slice(0, 7))
  const [year, setYear] = useState(TODAY.slice(0, 4))
  const [from, setFrom] = useState(`${TODAY.slice(0, 7)}-01`)
  const [to, setTo] = useState(TODAY)
  const [person, setPerson] = useState('') // '' = combined household
  const [accountId, setAccountId] = useState('')
  const [category, setCategory] = useState('')
  const [drill, setDrill] = useState<{ title: string; entries: PlEntry[] } | null>(null)

  const per = periods(mode, month, year, from, to)
  const conv = (a: number, c: Parameters<typeof toBase>[1]) => toBase(a, c)
  const extra: Omit<PlFilter, 'from' | 'to'> = { person: person || undefined, accountId: accountId || undefined, category: category || undefined }

  const entries = useMemo(() => plEntries(transactions, transfers, accounts, { ...per.cur, ...extra }), [transactions, transfers, accounts, per.cur.from, per.cur.to, person, accountId, category]) // eslint-disable-line react-hooks/exhaustive-deps
  const prevEntries = useMemo(() => plEntries(transactions, transfers, accounts, { ...per.prev, ...extra }), [transactions, transfers, accounts, per.prev.from, per.prev.to, person, accountId, category]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = useMemo(() => summarise(entries, conv), [entries])
  const prev = useMemo(() => summarise(prevEntries, conv), [prevEntries])

  // Cash that moved WITHOUT touching the P&L.
  const outside = useMemo(() => {
    const debt = debtMovements(transfers, accounts, loans, per.cur, conv)
    const assets = assetPurchases(transactions, per.cur).reduce((n, t) => n + toBase(t.amount, t.currency), 0)
    const fam = peopleReport([], transfers, accounts, loans, [], conv, per.cur).household.transfersOut
    return { ...debt, assets, fam }
  }, [transactions, transfers, accounts, loans, per.cur.from, per.cur.to]) // eslint-disable-line react-hooks/exhaustive-deps

  // 12-month trend under the current filters.
  const trend = useMemo(() => {
    const end = mode === 'year' ? `${year}-12` : mode === 'month' ? month : from.slice(0, 7)
    return Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(end, i - 11)
      const s = summarise(plEntries(transactions, transfers, accounts, { from: `${m}-01`, to: lastDay(m), ...extra }), conv)
      return { month: monthLabel(m), income: Math.round(s.income), expenses: Math.round(s.expenses) }
    })
  }, [transactions, transfers, accounts, mode, month, year, from, person, accountId, category]) // eslint-disable-line react-hooks/exhaustive-deps

  const allCategories = useMemo(() => [...new Set(transactions.map((t) => t.category))].sort(), [transactions])
  const years = useMemo(() => [...new Set([TODAY.slice(0, 4), ...transactions.map((t) => t.date.slice(0, 4))])].sort().reverse(), [transactions])

  const openDrill = (title: string, pick: (e: PlEntry) => boolean) => setDrill({ title, entries: entries.filter(pick) })

  const inc = change(cur.income, prev.income)
  const exp = change(cur.expenses, prev.expenses)
  const net = change(cur.net, prev.net)

  const Delta = ({ c, goodWhenUp }: { c: ReturnType<typeof change>; goodWhenUp: boolean }) => {
    if (c.delta === 0) return <span className="text-slate-400">no change vs {per.prevLabel}</span>
    const good = (c.delta > 0) === goodWhenUp
    return (
      <span className={good ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
        {c.delta > 0 ? '↑' : '↓'} {money(Math.abs(c.delta))}{c.pct !== null ? ` (${Math.abs(c.pct)}%)` : ''}{' '}
        <span className="text-slate-400 font-normal">vs {per.prevLabel}</span>
      </span>
    )
  }

  // ---- exports ----------------------------------------------------------------
  const filterText = [
    person ? `Person: ${person}` : 'Combined household', accountId ? `Account: ${accounts.find((a) => a.id === accountId)?.name}` : '', category ? `Category: ${category}` : '',
  ].filter(Boolean)

  const printReport = () => {
    const rows = (r: { name: string; value: number }[]) => r.map((x) => `<tr><td>${x.name}</td><td class="n">${money(x.value, undefined, 2)}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Profit &amp; Loss — ${per.label}</title><style>
      @page{margin:14mm} body{font:12px/1.5 Inter,Segoe UI,Arial,sans-serif;color:#0f172a} h1{font-size:20px;margin:0} .sub{color:#64748b;margin:2px 0 14px}
      table{width:100%;border-collapse:collapse;margin:6px 0 16px} th{background:#f1f5f9;text-align:left;font-size:10.5px;text-transform:uppercase} th,td{padding:5px 7px;border-bottom:1px solid #e2e8f0} .n{text-align:right}
      h2{font-size:14px;border-bottom:2px solid #1f6bff;padding-bottom:3px;margin:16px 0 4px} .tot td{font-weight:800;background:#f8fafc} .k{display:flex;gap:28px;margin:8px 0 6px} .k div{font-size:11px;color:#64748b} .k b{display:block;font-size:17px;color:#0f172a}
    </style></head><body><h1>Profit &amp; Loss</h1><div class="sub">${per.label} · ${filterText.join(' · ')}</div>
    <div class="k"><div>Income<b>${money(cur.income, undefined, 2)}</b></div><div>Expenses<b>${money(cur.expenses, undefined, 2)}</b></div><div>Net surplus / deficit<b>${money(cur.net, undefined, 2)}</b></div><div>vs ${per.prevLabel}<b>${net.delta >= 0 ? '+' : '−'}${money(Math.abs(net.delta), undefined, 2)}</b></div></div>
    <h2>Income by source</h2><table><tbody>${rows(cur.incomeBySource)}<tr class="tot"><td>Total income</td><td class="n">${money(cur.income, undefined, 2)}</td></tr></tbody></table>
    <h2>Expenses by category</h2><table><tbody>${rows(cur.expenseByCategory)}<tr class="tot"><td>Total expenses (net of refunds)</td><td class="n">${money(cur.expenses, undefined, 2)}</td></tr></tbody></table>
    <h2>Cash movements outside the P&amp;L</h2><table><tbody><tr><td>Borrowed money received</td><td class="n">${money(outside.borrowed, undefined, 2)}</td></tr><tr><td>Loan principal repaid</td><td class="n">${money(outside.principalRepaid, undefined, 2)}</td></tr><tr><td>Assets purchased</td><td class="n">${money(outside.assets, undefined, 2)}</td></tr><tr><td>Transfers between family members</td><td class="n">${money(outside.fam, undefined, 2)}</td></tr></tbody></table>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) return alert('Please allow pop-ups to print the report.')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
  }

  const exportExcel = async () => {
    const H = (v: string) => ({ value: v, fontWeight: 'bold' as const })
    const N = (v: number) => ({ value: Math.round(v * 100) / 100, type: Number })
    await writeExcelFile([
      {
        sheet: 'Summary',
        columns: [{ width: 38 }, { width: 18 }, { width: 18 }],
        data: [
          [H('Profit & Loss'), H(per.label)],
          [{ value: filterText.join(' · ') }],
          [],
          [H('Line'), H('Amount (AED)'), H(`Previous (${per.prevLabel})`)],
          [{ value: 'Income' }, N(cur.income), N(prev.income)],
          [{ value: 'Expenses (net of refunds)' }, N(cur.expenses), N(prev.expenses)],
          [H('Net surplus / deficit'), N(cur.net), N(prev.net)],
          [],
          [H('Income by source')],
          ...cur.incomeBySource.map((r) => [{ value: r.name }, N(r.value)]),
          [],
          [H('Expenses by category')],
          ...cur.expenseByCategory.map((r) => [{ value: r.name }, N(r.value)]),
          [],
          [H('Outside the P&L (cash movements)')],
          [{ value: 'Borrowed money received' }, N(outside.borrowed)],
          [{ value: 'Loan principal repaid' }, N(outside.principalRepaid)],
          [{ value: 'Assets purchased' }, N(outside.assets)],
          [{ value: 'Family transfers' }, N(outside.fam)],
        ],
      },
      {
        sheet: 'Transactions',
        columns: [{ width: 12 }, { width: 10 }, { width: 34 }, { width: 22 }, { width: 14 }, { width: 22 }, { width: 14 }],
        data: [
          ['Date', 'Kind', 'Description', 'Category', 'Person', 'Account', 'Amount (AED)'].map(H),
          ...[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => [
            { value: e.date }, { value: e.kind }, { value: e.description }, { value: e.category }, { value: e.person ?? 'Me' },
            { value: accounts.find((a) => a.id === e.accountId)?.name ?? '' }, N((e.kind === 'refund' ? -1 : 1) * toBase(e.amount, e.currency)),
          ]),
        ],
      },
    ]).toFile(`cloudbasket360-pnl-${mode === 'month' ? month : mode === 'year' ? year : `${from}_${to}`}.xlsx`)
  }

  const years12 = addMonthsOptions(12)

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Monthly Profit & Loss"
        subtitle="Income − expenses for you and your family. Borrowing, loan principal, transfers and asset purchases are kept out."
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={printReport}><Printer size={15} /> Print / PDF</button>
            <button className="btn-ghost" onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>
          </div>
        }
      />

      <Card>
        <div className="p-4 grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8 items-end">
          <label className="block"><span className="label">Period</span>
            <select className="input h-9" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="month">Month</option><option value="year">Year</option><option value="custom">Custom range</option>
            </select>
          </label>
          {mode === 'month' && (
            <label className="block"><span className="label">Month</span>
              <select className="input h-9" value={month} onChange={(e) => setMonth(e.target.value)}>
                {years12.map((m) => <option key={m} value={m}>{monthLabel(m)} {m.slice(0, 4)}</option>)}
              </select>
            </label>
          )}
          {mode === 'year' && (
            <label className="block"><span className="label">Year</span>
              <select className="input h-9" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
            </label>
          )}
          {mode === 'custom' && (
            <>
              <label className="block"><span className="label">From</span><input type="date" className="input h-9" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="block"><span className="label">To</span><input type="date" className="input h-9" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </>
          )}
          <label className="block"><span className="label">View</span>
            <select className="input h-9" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Combined household</option>
              {people.map((p) => <option key={p.id} value={p.name}>{p.name} only</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Account</span>
            <select className="input h-9" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Category</span>
            <select className="input h-9" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>{allCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label="Income" value={money(cur.income)} icon={<ArrowDownRight size={20} />} tint="#10b981" footer={<Delta c={inc} goodWhenUp />} />
        <StatCard label="Expenses" value={money(cur.expenses)} icon={<ArrowUpRight size={20} />} tint="#f43f5e" footer={<Delta c={exp} goodWhenUp={false} />} />
        <StatCard label={cur.net >= 0 ? 'Net Surplus' : 'Net Deficit'} value={money(cur.net)} icon={<Scale size={20} />} tint={cur.net >= 0 ? '#3b82f6' : '#ef4444'} footer={<Delta c={net} goodWhenUp />} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHead title="Monthly trend" sub="Last 12 months, same filters" />
          <div className="px-3 pb-4"><IncomeExpenseBars data={trend} height={250} /></div>
        </Card>
        <Card className="xl:col-span-5">
          <CardHead title="Outside the P&L" sub="Cash that moved without being income or expense" />
          <div className="px-5 pb-5 space-y-2.5 text-[12.5px]">
            {[
              ['Borrowed money received', outside.borrowed, 'Debt goes up, cash goes up'],
              ['Loan principal repaid', outside.principalRepaid, 'Debt goes down (interest & fees are in expenses)'],
              ['Assets purchased', outside.assets, 'Kept as assets, not household spending'],
              ['Transfers between family', outside.fam, 'Out of one account, into another'],
            ].map(([label, v, hint]) => (
              <div key={label as string} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span><b className="text-slate-700">{label}</b><span className="block text-[11px] text-slate-400">{hint}</span></span>
                <b className="tabular-nums text-slate-800">{money(v as number)}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHead title="Income by source" sub="Click a line to see the transactions behind it" />
          <div className="px-5 pb-5">
            {cur.incomeBySource.length === 0 && <Empty text="No income in this period." />}
            {cur.incomeBySource.map((r) => (
              <button key={r.name} onClick={() => openDrill(`Income — ${r.name}`, (e) => e.kind === 'income' && e.category === r.name)} className="w-full flex justify-between py-2 border-b border-[#f1f5f9] text-[13px] hover:bg-slate-50 px-1 cursor-pointer">
                <span className="text-slate-700 font-medium">{r.name}</span><b className="tabular-nums text-emerald-600">{money(r.value)}</b>
              </button>
            ))}
            <button onClick={() => openDrill('All income', (e) => e.kind === 'income')} className="w-full flex justify-between pt-3 text-[13px] font-extrabold cursor-pointer"><span>Total income</span><span className="tabular-nums">{money(cur.income)}</span></button>
          </div>
        </Card>
        <Card>
          <CardHead title="Expenses by category" sub="Net of refunds · includes loan interest and fees" />
          <div className="px-5 pb-5">
            {cur.expenseByCategory.length === 0 && <Empty text="No expenses in this period." />}
            {cur.expenseByCategory.map((r) => (
              <button key={r.name} onClick={() => openDrill(`Expenses — ${r.name}`, (e) => e.kind !== 'income' && e.category === r.name)} className="w-full flex justify-between py-2 border-b border-[#f1f5f9] text-[13px] hover:bg-slate-50 px-1 cursor-pointer">
                <span className="text-slate-700 font-medium">{r.name}</span><b className="tabular-nums text-rose-600">{money(r.value)}</b>
              </button>
            ))}
            <button onClick={() => openDrill('All expenses', (e) => e.kind !== 'income')} className="w-full flex justify-between pt-3 text-[13px] font-extrabold cursor-pointer"><span>Total expenses</span><span className="tabular-nums">{money(cur.expenses)}</span></button>
            <p className="text-[11px] text-slate-400 mt-2">A receipt is counted through its items only; a card purchase once — paying the card is not a second expense.</p>
          </div>
        </Card>
      </div>

      {drill && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && setDrill(null)}>
          <div className="card w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col animate-pop">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#eef2f8]">
              <div>
                <p className="text-[15px] font-extrabold text-slate-900">{drill.title}</p>
                <p className="text-[11.5px] text-slate-500">{drill.entries.length} record{drill.entries.length === 1 ? '' : 's'} · {per.label}</p>
              </div>
              <button onClick={() => setDrill(null)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="overflow-auto scroll-thin">
              <table className="w-full">
                <thead className="bg-slate-50/70 sticky top-0"><tr><th className="th">Date</th><th className="th">Description</th><th className="th">Category</th><th className="th">Person</th><th className="th">Account</th><th className="th text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {[...drill.entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                    <tr key={e.id} className="text-[12.5px]">
                      <td className="td whitespace-nowrap text-slate-500">{fmtDate(e.date)}</td>
                      <td className="td font-semibold text-slate-800">{e.description}{e.kind === 'refund' && <span className="chip bg-emerald-50 text-emerald-700 ml-2">Refund</span>}{(e.kind === 'interest' || e.kind === 'fee') && <span className="chip bg-amber-50 text-amber-700 ml-2">Loan cost</span>}</td>
                      <td className="td text-slate-500">{e.category}</td><td className="td text-slate-500">{e.person ?? 'Me'}</td>
                      <td className="td text-slate-500">{accounts.find((a) => a.id === e.accountId)?.name ?? '—'}</td>
                      <td className={`td text-right font-bold tabular-nums ${e.kind === 'refund' ? 'text-emerald-600' : ''}`}>{money((e.kind === 'refund' ? -1 : 1) * toBase(e.amount, e.currency), undefined, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-[#eef2f8] flex justify-end text-[13px] font-extrabold">
              Total {money(drill.entries.reduce((n, e) => n + (e.kind === 'income' ? 1 : e.kind === 'refund' ? -1 : 1) * toBase(e.amount, e.currency), 0), undefined, 2)}
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Download size={12} /> Print / PDF opens your browser's print dialog — choose “Save as PDF”. Excel downloads a real .xlsx with a Summary and a Transactions sheet.</p>
    </div>
  )
}
