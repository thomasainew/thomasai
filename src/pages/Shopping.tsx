import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Loader2, Plus, Search, ShoppingCart, Sparkles, Trash2, Wallet, Wand2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, Progress, StatCard } from '@/components/ui/Primitives'
import { fmtDate, money, pct, TODAY, uid } from '@/lib/format'
import { budgetsWithSpend } from '@/lib/selectors'
import { buildPriceItems, freshness, searchItems, suggestMonthly, type PriceItem } from '@/lib/prices'
import { askShoppingAdvisor, hasGemini } from '@/lib/gemini'
import { useAdvisorProfile } from '@/components/AdvisorProfileCard'
import type { ShoppingListItem } from '@/types'

const FRESH_LABEL = { fresh: 'Recent price', aging: 'Older price', old: 'Old price — estimate' } as const
const FRESH_TONE = { fresh: 'bg-emerald-50 text-emerald-700', aging: 'bg-amber-50 text-amber-700', old: 'bg-rose-50 text-rose-700' } as const

export default function Shopping() {
  const { transactions, itemAliases, budgets: rawBudgets, settings, updateSettings, membership } = useStore()
  const profile = useAdvisorProfile()
  const [q, setQ] = useState('')
  const [manual, setManual] = useState({ name: '', qty: '1', price: '' })
  const [needQty, setNeedQty] = useState<Record<string, string>>({})
  const [ai, setAi] = useState<{ busy: boolean; text?: string; error?: string }>({ busy: false })

  // The list lives in settings, so it follows you to every device.
  const list: ShoppingListItem[] = settings.extra?.shoppingList ?? []
  const save = (next: ShoppingListItem[]) => {
    if (membership && !membership.canEdit) return
    updateSettings({ extra: { ...(settings.extra ?? {}), shoppingList: next } })
  }

  const items = useMemo(() => buildPriceItems(transactions, itemAliases), [transactions, itemAliases])
  const byName = useMemo(() => new Map(items.map((i) => [i.name.toLowerCase(), i])), [items])
  const results = useMemo(() => searchItems(items, q), [items, q])
  const needs = useMemo(() => suggestMonthly(items, TODAY), [items])

  const budgets = useMemo(() => budgetsWithSpend(transactions, rawBudgets), [transactions, rawBudgets])
  const grocery = budgets.find((b) => b.name.toLowerCase().includes('grocer'))
  const groceryLeft = grocery ? grocery.budgetBase - grocery.spent : 0

  const addFromHistory = (i: PriceItem, qty = 1) => {
    const l = i.latest
    const existing = list.find((x) => x.name.toLowerCase() === i.name.toLowerCase())
    if (existing) return save(list.map((x) => (x.id === existing.id ? { ...x, qty: x.qty + qty } : x)))
    save([...list, { id: uid('sl'), name: i.name, qty, price: l.packPrice, priceDate: l.date, currency: l.currency, brand: l.brand || undefined, store: l.store || undefined }])
  }
  const addManual = () => {
    if (!manual.name.trim()) return
    const hit = byName.get(manual.name.trim().toLowerCase())
    if (hit && !manual.price) return addFromHistory(hit, Number(manual.qty) || 1)
    save([...list, { id: uid('sl'), name: manual.name.trim(), qty: Number(manual.qty) || 1, price: Number(manual.price) || undefined, priceDate: manual.price ? TODAY : undefined }])
    setManual({ name: '', qty: '1', price: '' })
  }

  // Estimate: planned qty × latest known pack price. Anything priced from an old purchase is flagged.
  const rows = list.map((x) => {
    const total = x.price !== undefined ? x.price * x.qty : undefined
    const fresh = x.priceDate ? freshness(x.priceDate, TODAY) : undefined
    return { x, total, fresh }
  })
  const estimate = rows.reduce((n, r) => n + (r.total ?? 0), 0)
  const unpriced = rows.filter((r) => r.total === undefined).length
  const stale = rows.filter((r) => r.fresh === 'aging' || r.fresh === 'old')
  const pending = rows.filter((r) => !r.x.bought).reduce((n, r) => n + (r.total ?? 0), 0)

  const askAdvisor = async () => {
    setAi({ busy: true })
    try {
      const text = await askShoppingAdvisor(
        'Suggest what to buy this month, adjusting the usual quantities to my family and preferences.',
        { usualMonthly: needs.slice(0, 25).map((n) => ({ item: n.name, perMonth: n.perMonth, pack: n.unit, lastPrice: n.lastPrice, lastDate: n.latestDate, boughtTimes: n.purchases })), currentList: list.map((x) => ({ item: x.name, qty: x.qty })), groceryBudgetLeft: Math.round(groceryLeft) },
        profile,
      )
      setAi({ busy: false, text })
    } catch (e) {
      setAi({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const hasProfile = Boolean(profile.preferences || profile.familyNeeds)

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader title="Shopping Assistant" subtitle="Search everything you have bought, plan quantities and see the cost before you go." />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Estimated Total" value={money(estimate)} icon={<ShoppingCart size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">{list.length} items{unpriced ? ` · ${unpriced} without a price` : ''}</span>} />
        <StatCard label="Still To Buy" value={money(pending)} icon={<Plus size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">{rows.filter((r) => !r.x.bought).length} pending</span>} />
        <StatCard label="Picked Up" value={money(estimate - pending)} icon={<Check size={20} />} tint="#10b981" footer={<div><div className="text-[10px] text-slate-400 mb-1">{pct(estimate - pending, estimate || 1)}% of list</div><Progress value={estimate - pending} max={estimate || 1} color="#10b981" height={5} /></div>} />
        <StatCard label="Grocery Budget Left" value={money(groceryLeft)} icon={<Wallet size={20} />} tint={pending > groceryLeft && grocery ? '#ef4444' : '#8b5cf6'} footer={<span className={pending > groceryLeft && grocery ? 'text-rose-600 font-semibold' : 'text-slate-400'}>{grocery ? (pending > groceryLeft ? 'List exceeds budget' : 'Within budget') : 'No grocery budget set'}</span>} />
      </div>

      {stale.length > 0 && (
        <div className="card px-5 py-3 bg-amber-50/60 border-amber-100 flex items-start gap-2.5 text-[12.5px] text-amber-900">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <span><b>This is an estimate.</b> {stale.length} item{stale.length > 1 ? 's use' : ' uses'} a price from an older purchase ({stale.slice(0, 3).map((r) => `${r.x.name} — ${fmtDate(r.x.priceDate!)}`).join(', ')}{stale.length > 3 ? '…' : ''}). Shop prices may have changed.</span>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-8 space-y-4">
          <Card>
            <CardHead title="Find an item you have bought" sub="Every purchased item is searchable — latest price, date, brand, pack size and supermarket" />
            <div className="px-5 pb-4">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-10" placeholder="Search e.g. chapathi, rice, Almarai…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {q.trim() && results.length === 0 && <p className="text-[12px] text-slate-400 mt-3">Nothing bought under that name yet. Add it below with your own price.</p>}
              <div className="mt-3 space-y-2">
                {results.map((i) => {
                  const l = i.latest
                  const f = freshness(l.date, TODAY)
                  return (
                    <div key={i.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#eef2f8] px-3.5 py-2.5">
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-[13.5px] font-bold text-slate-800">{i.name}</p>
                        <p className="text-[11px] text-slate-400">{[l.brand, l.packSize ? `${l.packSize}${l.packUnit ?? ''} pack` : 'per unit', l.store].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[14px] font-extrabold tabular-nums">{money(l.packPrice, l.currency, 2)}</p>
                        <p className="text-[10.5px] text-slate-400">{fmtDate(l.date)}</p>
                      </div>
                      <span className={`chip ${FRESH_TONE[f]}`}>{FRESH_LABEL[f]}</span>
                      <button className="btn-soft h-8" onClick={() => addFromHistory(i)}><Plus size={13} /> Add</button>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Shopping List" sub="Enter planned quantities — the total is estimated from each item's latest price" />
            <div className="px-5 pb-3 flex flex-wrap gap-2">
              <input className="input flex-1 min-w-[180px]" placeholder="Add any item" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addManual()} />
              <input className="input w-20" type="number" min="1" placeholder="Qty" value={manual.qty} onChange={(e) => setManual({ ...manual, qty: e.target.value })} />
              <input className="input w-28" type="number" placeholder="Price (optional)" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} />
              <button className="btn-primary" onClick={addManual}><Plus size={15} /> Add</button>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[680px]">
                <thead className="bg-slate-50/70"><tr><th className="th w-10" /><th className="th">Item</th><th className="th text-right">Qty</th><th className="th text-right">Price / pack</th><th className="th">Price from</th><th className="th text-right">Estimate</th><th className="th w-10" /></tr></thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {rows.map(({ x, total, fresh }) => (
                    <tr key={x.id} className="row-hover">
                      <td className="td"><input type="checkbox" checked={Boolean(x.bought)} onChange={() => save(list.map((y) => (y.id === x.id ? { ...y, bought: !y.bought } : y)))} className="accent-brand-600 h-4 w-4 cursor-pointer" /></td>
                      <td className={`td font-semibold ${x.bought ? 'line-through text-slate-400' : 'text-slate-800'}`}>{x.name}<span className="block text-[11px] font-normal text-slate-400">{[x.brand, x.store].filter(Boolean).join(' · ')}</span></td>
                      <td className="td text-right"><input type="number" min="0" step="1" value={x.qty} onChange={(e) => save(list.map((y) => (y.id === x.id ? { ...y, qty: Math.max(0, Number(e.target.value) || 0) } : y)))} className="w-16 h-8 rounded-lg border border-slate-200 px-2 text-right tabular-nums" /></td>
                      <td className="td text-right tabular-nums">{x.price !== undefined ? money(x.price, x.currency ?? 'AED', 2) : <span className="text-slate-300">no price</span>}</td>
                      <td className="td text-[11.5px]">{x.priceDate ? <><span className="text-slate-500">{fmtDate(x.priceDate)}</span>{fresh && fresh !== 'fresh' && <span className={`chip ml-1.5 ${FRESH_TONE[fresh]}`}>older</span>}</> : '—'}</td>
                      <td className="td text-right font-bold tabular-nums">{total !== undefined ? money(total, x.currency ?? 'AED', 2) : '—'}</td>
                      <td className="td"><button onClick={() => save(list.filter((y) => y.id !== x.id))} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && <tfoot><tr className="bg-slate-50/70"><td className="td" colSpan={5}><b className="text-slate-700">Estimated total</b>{unpriced > 0 && <span className="text-[11px] text-slate-400 ml-2">({unpriced} item{unpriced > 1 ? 's' : ''} without a price not included)</span>}</td><td className="td text-right font-extrabold text-slate-900">{money(estimate, undefined, 2)}</td><td /></tr></tfoot>}
              </table>
              {list.length === 0 && <Empty text="Your list is empty — search above, or add the suggested monthly needs." />}
            </div>
          </Card>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHead
              title="Monthly needs"
              sub="From what you actually bought — adjust the numbers, then add"
              right={<button className="btn-soft h-8" disabled={!needs.length} onClick={() => needs.forEach((n) => { const it = byName.get(n.name.toLowerCase()); if (it) addFromHistory(it, Number(needQty[n.name]) || n.perMonth) })}>Add all</button>}
            />
            <div className="px-5 pb-4 space-y-2 max-h-[420px] overflow-y-auto scroll-thin">
              {needs.length === 0 && <p className="text-[12px] text-slate-400">Buy the same item a couple of times and its usual monthly quantity shows up here.</p>}
              {needs.map((n) => {
                const it = byName.get(n.name.toLowerCase())
                const qty = needQty[n.name] ?? String(n.perMonth)
                return (
                  <div key={n.name} className="rounded-xl border border-[#eef2f8] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-[12.5px] font-semibold text-slate-700 truncate">{n.name}</span>
                      <input type="number" min="0" className="w-14 h-8 rounded-lg border border-slate-200 px-2 text-right text-[12.5px] font-bold tabular-nums" value={qty} onChange={(e) => setNeedQty({ ...needQty, [n.name]: e.target.value })} />
                      <button className="h-8 w-8 grid place-items-center rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 cursor-pointer" onClick={() => it && addFromHistory(it, Number(qty) || 0)}><Plus size={14} /></button>
                    </div>
                    <p className="text-[10.5px] text-slate-400 mt-1">
                      About {n.perMonth} × {n.unit} a month · bought {n.purchases}× in {n.monthsCovered} months · last {money(n.lastPrice, n.currency, 2)} on {fmtDate(n.latestDate)}
                    </p>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card>
            <CardHead title="Ask your advisor" sub={hasProfile ? 'Uses your saved preferences and family needs' : 'Add preferences in your advisor profile for better suggestions'} right={<Sparkles size={16} className="text-brand-500" />} />
            <div className="px-5 pb-5 space-y-3">
              {hasProfile && (
                <div className="text-[11.5px] text-slate-500 rounded-lg bg-slate-50 px-3 py-2 leading-relaxed">
                  {profile.familyNeeds && <p><b>Family:</b> {profile.familyNeeds}</p>}
                  {profile.preferences && <p><b>Preferences:</b> {profile.preferences}</p>}
                </div>
              )}
              {hasGemini ? (
                <button className="btn-primary w-full" onClick={askAdvisor} disabled={ai.busy || needs.length === 0}>{ai.busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Suggest this month's shopping</button>
              ) : <p className="text-[11.5px] text-slate-400">The AI suggestion needs a Gemini key. The monthly needs above work without one.</p>}
              {ai.error && <p className="text-[11.5px] text-rose-600">{ai.error}</p>}
              {ai.text && <p className="text-[12px] text-slate-700 whitespace-pre-line leading-relaxed">{ai.text}</p>}
              <Link to="/ai-advisor" className="text-[11.5px] font-semibold text-brand-600">Edit my advisor profile →</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
