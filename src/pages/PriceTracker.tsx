import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Combine, Minus, Plus, Tags, Target, Trash2, TrendingDown, TrendingUp, Undo2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, StatCard } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { addMonths, fmtDate, money, monthLabel, TODAY } from '@/lib/format'
import { buildPriceItems, cheapestStore, priceChange, type PriceItem } from '@/lib/prices'

type Period = 'month' | 'last' | '3m' | 'year' | 'custom'

function range(p: Period, from: string, to: string) {
  const cur = TODAY.slice(0, 7)
  if (p === 'month') return { from: `${cur}-01`, to: `${cur}-31` }
  if (p === 'last') {
    const m = addMonths(cur, -1)
    return { from: `${m}-01`, to: `${m}-31` }
  }
  if (p === '3m') return { from: `${addMonths(cur, -2)}-01`, to: `${cur}-31` }
  if (p === 'year') return { from: `${TODAY.slice(0, 4)}-01-01`, to: `${TODAY.slice(0, 4)}-12-31` }
  return { from, to }
}

/** Price with the correct unit label, e.g. "AED 12.00 / kg". */
const rateText = (p: PriceItem['latest']) =>
  `${money(p.rate.value, p.currency, 2)} / ${p.rate.per === 'unit' ? 'unit' : p.rate.per}`

export default function PriceTracker() {
  const { transactions, itemAliases, addItemAlias, removeItemAlias, priceWatch, addPriceWatch, updatePriceWatch, removePriceWatch } =
    useStore()
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(`${TODAY.slice(0, 7)}-01`)
  const [to, setTo] = useState(TODAY)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeName, setMergeName] = useState('')
  const [watchOpen, setWatchOpen] = useState(false)
  const [watch, setWatch] = useState({ item: '', store: '', current: '', target: '' })

  const items = useMemo(() => buildPriceItems(transactions, itemAliases), [transactions, itemAliases])
  const { from: f, to: t } = range(period, from, to)

  const rows = useMemo(
    () =>
      items
        .filter((i) => !q.trim() || `${i.name} ${i.latest.brand} ${i.latest.store}`.toLowerCase().includes(q.trim().toLowerCase()))
        .map((i) => ({ item: i, change: priceChange(i, f, t), cheapest: cheapestStore(i) }))
        .sort((a, b) => Math.abs(b.change?.pct ?? 0) - Math.abs(a.change?.pct ?? 0) || a.item.name.localeCompare(b.item.name)),
    [items, q, f, t],
  )

  const up = rows.filter((r) => (r.change?.delta ?? 0) > 0)
  const down = rows.filter((r) => (r.change?.delta ?? 0) < 0)
  const worst = up.reduce<(typeof rows)[number] | undefined>((m, r) => (!m || (r.change!.pct > m.change!.pct) ? r : m), undefined)

  const togglePick = (name: string) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })

  const doMerge = () => {
    const target = mergeName.trim()
    if (!target) return
    // Every name on every selected item now resolves to the chosen one.
    for (const item of items.filter((i) => picked.has(i.name))) {
      for (const alias of new Set([item.name, ...item.aliases])) {
        if (alias.toLowerCase() !== target.toLowerCase()) addItemAlias({ alias, canonical: target })
      }
    }
    setPicked(new Set())
    setMergeOpen(false)
  }

  const saveWatch = () => {
    if (!watch.item.trim() || !Number(watch.current)) return
    addPriceWatch({
      item: watch.item.trim(), store: watch.store.trim() || '—', current: Number(watch.current),
      previous: Number(watch.current), target: Number(watch.target) || Number(watch.current), updated: TODAY,
    })
    setWatch({ item: '', store: '', current: '', target: '' })
    setWatchOpen(false)
  }

  const periodLabel = period === 'custom' ? `${fmtDate(f)} – ${fmtDate(t)}` : period === 'month' ? `${monthLabel(TODAY)} ${TODAY.slice(0, 4)}` : { last: 'Last month', '3m': 'Last 3 months', year: 'This year' }[period as 'last']

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Price Tracker"
        subtitle="Every item you buy is tracked automatically — repeat purchases build a dated price history."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input h-10 w-auto" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="month">This month</option>
              <option value="last">Last month</option>
              <option value="3m">Last 3 months</option>
              <option value="year">This year</option>
              <option value="custom">Custom range…</option>
            </select>
            {period === 'custom' && (
              <>
                <input type="date" className="input h-10 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
                <input type="date" className="input h-10 w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Items Tracked" value={String(items.length)} icon={<Tags size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">From your purchases</span>} />
        <StatCard label="Price Increases" value={String(up.length)} icon={<TrendingUp size={20} />} tint="#ef4444" footer={<span className="text-slate-400">{periodLabel}</span>} />
        <StatCard label="Price Decreases" value={String(down.length)} icon={<TrendingDown size={20} />} tint="#10b981" footer={<span className="text-slate-400">{periodLabel}</span>} />
        <StatCard
          label="Biggest Increase"
          value={worst ? `+${worst.change!.pct}%` : '—'}
          icon={<ArrowUp size={20} />}
          tint="#f59e0b"
          footer={<span className="text-slate-400 truncate block">{worst ? worst.item.name : 'Nothing rose in this period'}</span>}
        />
      </div>

      <Card>
        <CardHead
          title="Item Price History"
          sub={`Change over ${periodLabel}. Rates compare equal quantities (per kg / litre / unit); pack price is shown only where the pack size is the same.`}
          right={
            <div className="flex items-center gap-2">
              {picked.size > 1 && (
                <button className="btn-soft h-9" onClick={() => { setMergeName([...picked][0]); setMergeOpen(true) }}>
                  <Combine size={14} /> Merge {picked.size}
                </button>
              )}
              <input className="input h-9 w-56 text-[12px]" placeholder="Search item, brand, store…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          }
        />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th w-8" />
                <th className="th w-8" />
                <th className="th">Item</th>
                <th className="th">Last bought</th>
                <th className="th text-right">Pack price</th>
                <th className="th text-right">Rate</th>
                <th className="th text-right">Change ({periodLabel})</th>
                <th className="th">Cheapest seen</th>
                <th className="th text-right">Buys</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {rows.map(({ item, change, cheapest }) => {
                const isOpen = open === item.name
                const up = (change?.delta ?? 0) > 0
                const down = (change?.delta ?? 0) < 0
                return (
                  <Fragment key={item.name}>
                    <tr className="row-hover">
                      <td className="td"><input type="checkbox" className="accent-brand-600 h-4 w-4 cursor-pointer" checked={picked.has(item.name)} onChange={() => togglePick(item.name)} title="Select to merge duplicates" /></td>
                      <td className="td text-slate-400 cursor-pointer" onClick={() => setOpen(isOpen ? null : item.name)}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className="td font-semibold text-slate-800 cursor-pointer" onClick={() => setOpen(isOpen ? null : item.name)}>
                        {item.name}
                        <span className="block text-[11px] font-normal text-slate-400">
                          {item.category}{item.latest.brand ? ` · ${item.latest.brand}` : ''}
                          {item.latest.packSize ? ` · ${item.latest.packSize}${item.latest.packUnit ?? ''}` : ''}
                        </span>
                      </td>
                      <td className="td text-slate-500 text-[12px] whitespace-nowrap">{fmtDate(item.latest.date)}<span className="block text-slate-400">{item.latest.store || '—'}</span></td>
                      <td className="td text-right font-bold tabular-nums">{money(item.latest.packPrice, item.latest.currency, 2)}</td>
                      <td className="td text-right text-slate-500 tabular-nums text-[12px]">{rateText(item.latest)}</td>
                      <td className={`td text-right font-bold tabular-nums ${up ? 'text-rose-600' : down ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {change ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            {up ? <ArrowUp size={12} /> : down ? <ArrowDown size={12} /> : <Minus size={12} />}
                            {money(Math.abs(change.delta), change.currency, 2)} ({up ? '+' : down ? '-' : ''}{Math.abs(change.pct)}%)
                            <span className="block text-[10px] font-normal text-slate-400 basis-full">{change.basis}: {change.start} → {change.end}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-normal">No comparison</span>
                        )}
                      </td>
                      <td className="td text-[12px] text-slate-500">
                        {cheapest ? <>{cheapest.store}<span className="block text-slate-400">{money(cheapest.rate.value, cheapest.currency, 2)} / {cheapest.rate.per}</span></> : '—'}
                      </td>
                      <td className="td text-right text-slate-500 tabular-nums">{item.points.length}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/60">
                        <td />
                        <td colSpan={8} className="px-4 py-3">
                          <table className="w-full text-[12.5px]">
                            <thead>
                              <tr className="text-[10.5px] uppercase tracking-wide text-slate-400">
                                <th className="text-left py-1 font-semibold">Date</th>
                                <th className="text-left py-1 font-semibold">Supermarket</th>
                                <th className="text-left py-1 font-semibold">Brand</th>
                                <th className="text-right py-1 font-semibold">Qty × pack</th>
                                <th className="text-right py-1 font-semibold">Pack price</th>
                                <th className="text-right py-1 font-semibold">Rate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...item.points].reverse().map((p) => (
                                <tr key={p.txnId} className="border-t border-[#eef2f8] text-slate-700">
                                  <td className="py-1.5">{fmtDate(p.date)}</td>
                                  <td className="py-1.5">{p.store || '—'}</td>
                                  <td className="py-1.5">{p.brand || '—'}</td>
                                  <td className="py-1.5 text-right tabular-nums">{p.qty}× {p.packSize ? `${p.packSize}${p.packUnit ?? ''}` : 'unit'}</td>
                                  <td className="py-1.5 text-right font-semibold tabular-nums">{money(p.packPrice, p.currency, 2)}</td>
                                  <td className="py-1.5 text-right text-slate-500 tabular-nums">{money(p.rate.value, p.currency, 2)} / {p.rate.per}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {item.aliases.length > 1 && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
                              Merged names:
                              {item.aliases.map((a) => (
                                <span key={a} className="chip bg-white border border-[#e2e8f0] text-slate-600">{a}</span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && <Empty text="No purchases yet — every item you record in Expenses appears here automatically." />}
        </div>
      </Card>

      {itemAliases.length > 0 && (
        <Card>
          <CardHead title="Merged Names" sub="Duplicate spellings combined into one item — undo any time" />
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {itemAliases.map((a) => (
              <span key={a.id} className="chip bg-slate-100 text-slate-600 gap-2">
                {a.alias} → <b>{a.canonical}</b>
                <button onClick={() => removeItemAlias(a.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer" title="Undo merge"><Undo2 size={12} /></button>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHead
          title="Target Watchlist"
          sub="Optional — set a target price for an item you are waiting on"
          right={<button className="btn-soft h-9" onClick={() => setWatchOpen(true)}><Plus size={14} /> Watch item</button>}
        />
        <div className="px-5 pb-5 space-y-2">
          {priceWatch.length === 0 && <p className="text-[12px] text-slate-400">Nothing on the watchlist.</p>}
          {priceWatch.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#eef2f8] px-3.5 py-2.5 text-[12.5px]">
              <Target size={14} className="text-amber-500" />
              <span className="flex-1 font-semibold text-slate-700">{p.item} <span className="font-normal text-slate-400">· {p.store}</span></span>
              <input
                type="number"
                value={p.current}
                onChange={(e) => updatePriceWatch(p.id, { previous: p.current, current: Number(e.target.value) || 0, updated: TODAY })}
                className="w-24 h-8 rounded-lg border border-slate-200 px-2 text-right font-bold tabular-nums"
              />
              <span className={p.current <= p.target ? 'chip bg-emerald-50 text-emerald-700' : 'text-slate-400 tabular-nums'}>
                {p.current <= p.target ? '🎯 target reached' : `target ${money(p.target)}`}
              </span>
              <button onClick={() => removePriceWatch(p.id)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title="Merge duplicate items"
        subtitle="All selected names become one item with a single price history"
        footer={<><button className="btn-ghost" onClick={() => setMergeOpen(false)}>Cancel</button><button className="btn-primary" onClick={doMerge}>Merge</button></>}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">{[...picked].map((n) => <span key={n} className="chip bg-slate-100 text-slate-600">{n}</span>)}</div>
          <Field label="Keep this name">
            <input className="input" value={mergeName} onChange={(e) => setMergeName(e.target.value)} />
          </Field>
          <p className="text-[11.5px] text-slate-500">Existing purchases are not changed — only how they are grouped. You can undo the merge below the table.</p>
        </div>
      </Modal>

      <Modal
        open={watchOpen}
        onClose={() => setWatchOpen(false)}
        title="Watch an item"
        footer={<><button className="btn-ghost" onClick={() => setWatchOpen(false)}>Cancel</button><button className="btn-primary" onClick={saveWatch}>Watch</button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Item" className="col-span-2"><input className="input" value={watch.item} onChange={(e) => setWatch({ ...watch, item: e.target.value })} autoFocus /></Field>
          <Field label="Store"><input className="input" value={watch.store} onChange={(e) => setWatch({ ...watch, store: e.target.value })} /></Field>
          <Field label="Current price"><input className="input" type="number" value={watch.current} onChange={(e) => setWatch({ ...watch, current: e.target.value })} /></Field>
          <Field label="Target price"><input className="input" type="number" value={watch.target} onChange={(e) => setWatch({ ...watch, target: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  )
}
