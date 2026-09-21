import { useMemo, useState } from 'react'
import { Download, Filter, Printer, RotateCcw } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty } from '@/components/ui/Primitives'
import { addMonths, fmtDate, money, toBase, TODAY } from '@/lib/format'
import {
  applyFilter, buildPrintHtml, describeFilter, groupRows, receiptSummaries, sortRows, toRows, totalsOf,
  type ExpenseFilter, type GroupBy, type SortKey,
} from '@/lib/expenseQuery'

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: 'none', label: 'No grouping' }, { key: 'category', label: 'Category' }, { key: 'store', label: 'Supermarket' },
  { key: 'brand', label: 'Brand' }, { key: 'item', label: 'Item name' }, { key: 'method', label: 'Payment method' },
  { key: 'account', label: 'Account' }, { key: 'person', label: 'Person' }, { key: 'month', label: 'Month' }, { key: 'date', label: 'Date' },
]
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Date' }, { key: 'item', label: 'Item name' }, { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' }, { key: 'store', label: 'Supermarket' }, { key: 'method', label: 'Payment method' },
  { key: 'account', label: 'Account' }, { key: 'person', label: 'Person' }, { key: 'amount', label: 'Amount' },
]

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b))

/**
 * Combined filters, grouping, sorting and printing over every expense item.
 * Everything shown — including the totals and the printouts — comes from the
 * one filtered list, so a printed report always matches what is on screen.
 */
export function ExpenseExplorer() {
  const { transactions, accounts, itemAliases } = useStore()
  const [f, setF] = useState<ExpenseFilter>({ from: `${addMonths(TODAY.slice(0, 7), 0)}-01`, to: TODAY })
  const [minS, setMinS] = useState('')
  const [maxS, setMaxS] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [view, setView] = useState<'items' | 'receipts'>('items')

  const all = useMemo(() => toRows(transactions, accounts, itemAliases, (a, c) => toBase(a, c)), [transactions, accounts, itemAliases])
  const filter: ExpenseFilter = { ...f, min: minS === '' ? undefined : Number(minS), max: maxS === '' ? undefined : Number(maxS) }
  const rows = useMemo(() => sortRows(applyFilter(all, filter), sortKey, dir), [all, f, minS, maxS, sortKey, dir])
  const totals = totalsOf(rows)
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy])
  const receipts = useMemo(() => receiptSummaries(rows), [rows])

  const opt = {
    category: uniq(all.map((r) => r.category)), brand: uniq(all.map((r) => r.brand)), store: uniq(all.map((r) => r.store)),
    method: uniq(all.map((r) => r.method)), person: uniq(all.map((r) => r.person)),
  }
  const set = (patch: Partial<ExpenseFilter>) => setF((x) => ({ ...x, ...patch }))
  const reset = () => { setF({}); setMinS(''); setMaxS('') }
  const active = describeFilter(filter, accounts)

  const print = (mode: 'summary' | 'detail') => {
    const html = buildPrintHtml({
      title: mode === 'summary' ? 'Expense Report — Receipt Summary' : 'Expense Report — Detailed Items',
      subtitle: `${fmtDate(f.from ?? TODAY)}${f.to ? ` – ${fmtDate(f.to)}` : ''}`,
      mode, filters: active, groupBy: mode === 'detail' ? groupBy : 'none', rows,
      currency: 'AED', fmt: (n) => money(n, undefined, 2), fmtDate, generatedOn: new Date().toLocaleString(),
    })
    const w = window.open('', '_blank')
    if (!w) return alert('Please allow pop-ups to print the report.')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
  }

  const exportCsv = () => {
    const out = [
      ['Date', 'Item', 'Brand', 'Category', 'Supermarket', 'Payment method', 'Account', 'Person', 'Receipt', 'Amount (AED)'],
      ...rows.map((r) => [r.date, r.item, r.brand, r.category, r.store, r.method, r.accountName, r.person, r.receiptId ?? '', r.amount.toFixed(2)]),
      ['', '', '', '', '', '', '', '', 'TOTAL', totals.total.toFixed(2)],
    ]
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `cloudbasket360-expense-report-${TODAY}.csv`
    a.click()
  }

  const Sel = ({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (v: string) => void }) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input h-9" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          title="Filters"
          sub="Combine any of these — totals, groups and printouts all follow them"
          right={<button className="btn-ghost h-9" onClick={reset}><RotateCcw size={14} /> Reset</button>}
        />
        <div className="px-5 pb-5 grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
          <label className="block"><span className="label">From</span><input type="date" className="input h-9" value={f.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
          <label className="block"><span className="label">To</span><input type="date" className="input h-9" value={f.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
          <label className="block col-span-2"><span className="label">Item name contains</span><input className="input h-9" value={f.item ?? ''} onChange={(e) => set({ item: e.target.value || undefined })} placeholder="e.g. chapathi" /></label>
          <Sel label="Category" value={f.category} options={opt.category.map((c) => [c, c])} onChange={(v) => set({ category: v || undefined })} />
          <Sel label="Brand" value={f.brand} options={opt.brand.map((c) => [c, c])} onChange={(v) => set({ brand: v || undefined })} />
          <Sel label="Supermarket / shop" value={f.store} options={opt.store.map((c) => [c, c])} onChange={(v) => set({ store: v || undefined })} />
          <Sel label="Payment method" value={f.method} options={opt.method.map((c) => [c, c])} onChange={(v) => set({ method: v || undefined })} />
          <Sel label="Account" value={f.accountId} options={accounts.map((a) => [a.id, a.name])} onChange={(v) => set({ accountId: v || undefined })} />
          <Sel label="Person" value={f.person} options={opt.person.map((c) => [c, c])} onChange={(v) => set({ person: v || undefined })} />
          <label className="block"><span className="label">Amount min</span><input type="number" className="input h-9" value={minS} onChange={(e) => setMinS(e.target.value)} /></label>
          <label className="block"><span className="label">Amount max</span><input type="number" className="input h-9" value={maxS} onChange={(e) => setMaxS(e.target.value)} /></label>
          <label className="flex items-end gap-2 pb-2 text-[12px] font-semibold text-slate-600">
            <input type="checkbox" className="accent-brand-600 h-4 w-4" checked={Boolean(f.includeAssets)} onChange={(e) => set({ includeAssets: e.target.checked })} />
            Include asset purchases
          </label>
        </div>
      </Card>

      <Card>
        <div className="px-5 py-4 flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="label">Group by</span>
              <select className="input h-9 w-44" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>{GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
            </label>
            <label className="block"><span className="label">Sort by</span>
              <select className="input h-9 w-44" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>{SORTS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
            </label>
            <button className="btn-ghost h-9" onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>{dir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button>
            <div className="flex rounded-lg border border-[#e2e8f0] p-0.5">
              {(['items', 'receipts'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`h-8 px-3 rounded-md text-[12px] font-semibold cursor-pointer ${view === v ? 'bg-brand-600 text-white' : 'text-slate-500'}`}>
                  {v === 'items' ? 'Items' : 'Receipts'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost h-9" onClick={exportCsv}><Download size={14} /> CSV</button>
            <button className="btn-ghost h-9" onClick={() => print('summary')} disabled={!rows.length}><Printer size={14} /> Print receipt summary</button>
            <button className="btn-primary h-9" onClick={() => print('detail')} disabled={!rows.length}><Printer size={14} /> Print detailed items</button>
          </div>
        </div>

        <div className="mx-5 mb-4 rounded-xl bg-brand-50/60 border border-brand-100 px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-1">
          <Filter size={15} className="text-brand-600" />
          <span className="text-[12.5px] text-slate-600"><b className="text-slate-900 text-[15px]">{money(totals.total, undefined, 2)}</b> total</span>
          <span className="text-[12.5px] text-slate-600"><b className="text-slate-900">{totals.count}</b> items</span>
          <span className="text-[12.5px] text-slate-600"><b className="text-slate-900">{totals.receipts}</b> receipts / entries</span>
          {active.length > 0 && <span className="text-[11.5px] text-slate-500">{active.join(' · ')}</span>}
        </div>

        {rows.length === 0 ? (
          <Empty text="No expenses match these filters." />
        ) : view === 'receipts' ? (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50/70"><tr><th className="th">Date</th><th className="th">Supermarket</th><th className="th">Person</th><th className="th">Account</th><th className="th text-right">Items</th><th className="th text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {receipts.map((r) => (
                  <tr key={r.key} className="row-hover"><td className="td text-slate-500 whitespace-nowrap">{fmtDate(r.date)}</td><td className="td font-semibold text-slate-800">{r.store}</td><td className="td text-slate-500">{r.person}</td><td className="td text-slate-500">{r.account}</td><td className="td text-right tabular-nums">{r.items.length}</td><td className="td text-right font-bold tabular-nums">{money(r.total, undefined, 2)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50/70"><td className="td font-bold" colSpan={4}>Total</td><td className="td text-right font-bold">{totals.count}</td><td className="td text-right font-extrabold">{money(totals.total, undefined, 2)}</td></tr></tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            {groups.map((g) => (
              <div key={g.key}>
                {groupBy !== 'none' && (
                  <div className="px-5 py-2 bg-slate-50 border-y border-[#eef2f8] flex justify-between text-[12.5px] font-bold text-slate-700">
                    <span>{g.key}</span><span>{g.count} item{g.count === 1 ? '' : 's'} · {money(g.total, undefined, 2)}</span>
                  </div>
                )}
                <table className="w-full min-w-[900px]">
                  {groupBy === 'none' && (
                    <thead className="bg-slate-50/70"><tr><th className="th">Date</th><th className="th">Item</th><th className="th">Brand</th><th className="th">Category</th><th className="th">Supermarket</th><th className="th">Payment</th><th className="th">Account</th><th className="th">Person</th><th className="th text-right">Amount</th></tr></thead>
                  )}
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {g.rows.map((r) => (
                      <tr key={r.id} className="row-hover text-[12.5px]">
                        <td className="td text-slate-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="td font-semibold text-slate-800">{r.item}{r.kind === 'refund' && <span className="chip bg-emerald-50 text-emerald-700 ml-2">Refund</span>}{r.kind === 'asset' && <span className="chip bg-violet-50 text-violet-700 ml-2">Asset</span>}</td>
                        <td className="td text-slate-500">{r.brand || '—'}</td><td className="td text-slate-500">{r.category}</td><td className="td text-slate-500">{r.store || '—'}</td>
                        <td className="td text-slate-500">{r.method || '—'}</td><td className="td text-slate-500">{r.accountName}</td><td className="td text-slate-500">{r.person}</td>
                        <td className={`td text-right font-bold tabular-nums ${r.amount < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>{money(r.amount, undefined, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="px-5 py-3 flex justify-end text-[13px] font-extrabold text-slate-900 border-t border-[#eef2f8]">Total {money(totals.total, undefined, 2)}</div>
          </div>
        )}
      </Card>
    </div>
  )
}
