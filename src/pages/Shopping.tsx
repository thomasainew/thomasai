import { useMemo, useState } from 'react'
import { Check, Lightbulb, Plus, ShoppingCart, Sparkles, Trash2, Wallet } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, Progress, StatCard } from '@/components/ui/Primitives'
import { money, pct, shortDate, TODAY } from '@/lib/format'
import { budgetsWithSpend, totals } from '@/lib/selectors'
import { uid } from '@/lib/format'

interface Item {
  id: string
  name: string
  qty: number
  price: number
  category: string
  bought: boolean
}

const SEED_LIST: Item[] = []

const STORAGE_KEY = 'thomas-shopping-list-v1'

function loadList(): Item[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return SEED_LIST
}

export default function Shopping() {
  const { budgets: rawBudgets, transactions, priceWatch } = useStore()
  const [items, setItems] = useState<Item[]>(loadList)
  const [form, setForm] = useState({ name: '', qty: '1', price: '', category: 'Groceries' })

  const persist = (next: Item[]) => {
    setItems(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const lineTotal = (i: Item) => i.qty * i.price
  const cartTotal = items.reduce((a, i) => a + lineTotal(i), 0)
  const boughtTotal = items.filter((i) => i.bought).reduce((a, i) => a + lineTotal(i), 0)
  const pendingTotal = cartTotal - boughtTotal

  const budgets = useMemo(() => budgetsWithSpend(transactions, rawBudgets), [transactions, rawBudgets])
  const grocery = budgets.find((b) => b.name.toLowerCase().includes('grocer'))
  const groceryLeft = grocery ? grocery.budget - grocery.spent : 0
  const t = useMemo(() => totals(transactions), [transactions])

  const add = () => {
    if (!form.name.trim()) return
    persist([
      ...items,
      { id: uid('i'), name: form.name.trim(), qty: Number(form.qty) || 1, price: Number(form.price) || 0, category: form.category, bought: false },
    ])
    setForm({ name: '', qty: '1', price: '', category: 'Groceries' })
  }

  const suggestions = useMemo(() => {
    const out: { icon: string; title: string; body: string; tone: string }[] = []
    if (grocery && pendingTotal > groceryLeft)
      out.push({
        icon: '⚠️',
        title: 'This list exceeds your grocery budget',
        body: `Your pending items total ${money(pendingTotal)} but only ${money(groceryLeft)} is left in the Grocery budget. Consider deferring ${items.filter((i) => !i.bought).sort((a, b) => lineTotal(b) - lineTotal(a))[0]?.name ?? 'the largest item'}.`,
        tone: 'amber',
      })
    const dropped = priceWatch.filter((p) => p.current < p.previous)
    if (dropped.length)
      out.push({
        icon: '📉',
        title: `${dropped.length} tracked item${dropped.length > 1 ? 's' : ''} dropped in price`,
        body: dropped.map((d) => `${d.item} at ${d.store} is now ${money(d.current)} (was ${money(d.previous)})`).join(' · '),
        tone: 'green',
      })
    if (t.net < 0)
      out.push({ icon: '🧮', title: 'You are spending more than you earn this month', body: `Net balance is ${money(t.net)}. Prioritise essentials on this list before non-urgent items.`, tone: 'rose' })
    else
      out.push({ icon: '✅', title: 'You have room this month', body: `Net balance is ${money(t.net)} — this list of ${money(pendingTotal)} fits comfortably.`, tone: 'green' })
    return out
  }, [grocery, groceryLeft, pendingTotal, priceWatch, t.net, items])

  const toneBg: Record<string, string> = {
    amber: 'bg-amber-50/70 border-amber-100',
    green: 'bg-emerald-50/70 border-emerald-100',
    rose: 'bg-rose-50/70 border-rose-100',
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Shopping Assistant"
        subtitle="Build your list, see the cost before you go, and shop within budget."
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="List Total" value={money(cartTotal)} icon={<ShoppingCart size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">{items.length} items</span>} />
        <StatCard label="Still To Buy" value={money(pendingTotal)} icon={<Plus size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">{items.filter((i) => !i.bought).length} items pending</span>} />
        <StatCard label="Already Picked" value={money(boughtTotal)} icon={<Check size={20} />} tint="#10b981"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{pct(boughtTotal, cartTotal)}% of list</div><Progress value={boughtTotal} max={cartTotal || 1} color="#10b981" height={5} /></div>} />
        <StatCard label="Grocery Budget Left" value={money(groceryLeft)} icon={<Wallet size={20} />} tint={pendingTotal > groceryLeft ? '#ef4444' : '#8b5cf6'}
          footer={<span className={pendingTotal > groceryLeft ? 'text-rose-600 font-semibold' : 'text-slate-400'}>{pendingTotal > groceryLeft ? 'List exceeds budget' : 'Within budget'}</span>} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHead title="Shopping List" sub="Tick items as you pick them up" />
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            <input className="input flex-1 min-w-[180px]" placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <input className="input w-20" type="number" min="1" placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <input className="input w-28" type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <select className="input w-36" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {['Groceries', 'Household', 'Kids', 'Personal', 'Electronics', 'Other'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="btn-primary" onClick={add}><Plus size={15} /> Add</button>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[600px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th w-10"></th>
                  <th className="th">Item</th>
                  <th className="th">Category</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Unit Price</th>
                  <th className="th text-right">Total</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {items.map((i) => (
                  <tr key={i.id} className="row-hover">
                    <td className="td">
                      <input
                        type="checkbox"
                        checked={i.bought}
                        onChange={() => persist(items.map((x) => (x.id === i.id ? { ...x, bought: !x.bought } : x)))}
                        className="accent-brand-600 h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className={`td font-semibold ${i.bought ? 'line-through text-slate-400' : 'text-slate-800'}`}>{i.name}</td>
                    <td className="td text-slate-500">{i.category}</td>
                    <td className="td text-right tabular-nums">{i.qty}</td>
                    <td className="td text-right tabular-nums text-slate-500">{money(i.price)}</td>
                    <td className="td text-right font-bold tabular-nums">{money(lineTotal(i))}</td>
                    <td className="td text-right">
                      <button onClick={() => persist(items.filter((x) => x.id !== i.id))} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer ml-auto">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50/70">
                    <td className="td" colSpan={5}><span className="font-bold text-slate-700">List Total</span></td>
                    <td className="td text-right font-extrabold text-slate-900">{money(cartTotal)}</td>
                    <td className="td"></td>
                  </tr>
                </tfoot>
              )}
            </table>
            {items.length === 0 && <Empty text="Your list is empty — add an item above." />}
          </div>
        </Card>

        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHead title="Suggestions" right={<Sparkles size={16} className="text-brand-500" />} />
            <div className="px-5 pb-5 space-y-3">
              {suggestions.map((s, i) => (
                <div key={i} className={`rounded-xl border px-3.5 py-3 ${toneBg[s.tone]}`}>
                  <p className="text-[12.5px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span>{s.icon}</span> {s.title}
                  </p>
                  <p className="text-[11.5px] text-slate-600 mt-1 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Tracked Prices" sub="Live from your Price Tracker" />
            <div className="px-5 pb-5 space-y-2.5">
              {priceWatch.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center gap-3 text-[12.5px]">
                  <span className="flex-1 truncate text-slate-700 font-medium">{p.item}</span>
                  <span className="text-[11px] text-slate-400">{p.store}</span>
                  <span className={`font-bold tabular-nums ${p.current < p.previous ? 'text-emerald-600' : 'text-slate-700'}`}>{money(p.current)}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="card px-5 py-4 flex items-start gap-3 bg-brand-50/50 border-brand-100">
            <Lightbulb size={17} className="text-brand-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-slate-600 leading-relaxed">
              Shopping on {shortDate(TODAY)}? Items you tick stay saved on this device, so you can build the list at
              home and check it off in the store.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
