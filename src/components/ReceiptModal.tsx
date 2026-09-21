import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'
import { useStore } from '@/store/useStore'
import { accountLabel, methodFor, paymentAccounts } from '@/lib/accounting'
import { TODAY, money } from '@/lib/format'
import { categoriesOf } from '@/lib/selectors'
import { PACK_UNITS, type Currency, type PackUnit } from '@/types'
import type { ReceiptEntry } from '@/lib/receipts'

interface Line {
  key: number
  item: string
  brand: string
  category: string
  qty: string
  packSize: string
  packUnit: PackUnit
  price: string
}

let seq = 1
const blankLine = (category: string): Line => ({
  key: seq++, item: '', brand: '', category, qty: '1', packSize: '', packUnit: 'g', price: '',
})

/**
 * Enter a whole receipt by hand: who/where/when once, then every item. Saved as
 * ONE receipt; each item is still its own line for price tracking and reports.
 * Passing `editing` edits only the receipt's header (items are edited one by
 * one from the list), and the change flows to every line on it.
 */
export function ReceiptModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing?: ReceiptEntry | null
}) {
  const { accounts, people, categories, addReceipt, updateReceipt } = useStore()
  const eligible = useMemo(() => paymentAccounts(accounts).filter((a) => a.type !== 'loan'), [accounts])
  const cats = useMemo(() => categoriesOf(categories, 'expense').map((c) => c.name), [categories])
  const catList = cats.length ? cats : ['Groceries', 'Household', 'Personal', 'Other']

  const [store, setStore] = useState('')
  const [date, setDate] = useState(TODAY)
  const [accountId, setAccountId] = useState('')
  const [person, setPerson] = useState('Me')
  const [currency, setCurrency] = useState<Currency>('AED')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setStore(editing.header?.store ?? editing.store)
      setDate(editing.date)
      setAccountId(editing.accountId ?? '')
      setPerson(editing.person ?? 'Me')
      setCurrency(editing.currency)
      setNotes(editing.header?.notes ?? '')
      setLines([])
    } else {
      setStore('')
      setDate(TODAY)
      setAccountId(eligible[0]?.id ?? '')
      setPerson(people[0]?.name ?? 'Me')
      setCurrency('AED')
      setNotes('')
      setLines([blankLine(catList[0]), blankLine(catList[0])])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const valid = lines.filter((l) => l.item.trim() && Number(l.price) > 0)
  const total = valid.reduce((n, l) => n + Number(l.price), 0)
  const account = accounts.find((a) => a.id === accountId)
  const canSave = Boolean(store.trim()) && Boolean(account) && (editing ? true : valid.length > 0)

  const submit = () => {
    if (!canSave || !account) return
    if (editing?.receiptId) {
      updateReceipt(editing.receiptId, { store: store.trim(), date, accountId, person, method: methodFor(account.type), notes: notes.trim() || undefined })
    } else {
      addReceipt(
        { date, store: store.trim(), accountId, person, method: methodFor(account.type), currency, notes: notes.trim() || undefined },
        valid.map((l) => ({
          type: 'expense' as const,
          date,
          description: l.item.trim(),
          category: l.category,
          accountId,
          amount: Number(l.price),
          currency,
          person,
          method: methodFor(account.type),
          store: store.trim(),
          brand: l.brand.trim() || undefined,
          qty: Number(l.qty) > 0 ? Number(l.qty) : undefined,
          packSize: Number(l.packSize) > 0 ? Number(l.packSize) : undefined,
          packUnit: Number(l.packSize) > 0 ? l.packUnit : undefined,
        })),
      )
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Receipt' : 'Add Receipt'}
      subtitle={editing ? 'Store, date, person and payment apply to every item on it' : 'One shop visit, many items'}
      width="max-w-4xl"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary disabled:opacity-50" disabled={!canSave} onClick={submit}>
            {editing ? 'Save Receipt' : `Save Receipt · ${money(total, currency, 2)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Supermarket / shop">
            <input className="input" value={store} onChange={(e) => setStore(e.target.value)} placeholder="e.g. Carrefour" autoFocus />
          </Field>
          <Field label="Purchase date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Paid from">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {eligible.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
            </select>
          </Field>
          <Field label="Person">
            <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
              {(people.length ? people.map((p) => p.name) : ['Me']).map((n) => <option key={n}>{n}</option>)}
            </select>
          </Field>
        </div>

        {!editing && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-bold text-slate-700">Items</p>
              <div className="flex items-center gap-2">
                <select className="input h-8 w-20 text-[12px]" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  <option>AED</option><option>INR</option><option>USD</option>
                </select>
                <button className="btn-soft h-8" onClick={() => setLines((ls) => [...ls, blankLine(catList[0])])}>
                  <Plus size={13} /> Add item
                </button>
              </div>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-slate-400 text-left">
                    <th className="pb-1.5 font-semibold">Item</th>
                    <th className="pb-1.5 font-semibold">Brand</th>
                    <th className="pb-1.5 font-semibold">Category</th>
                    <th className="pb-1.5 font-semibold w-16">Qty</th>
                    <th className="pb-1.5 font-semibold w-36">Pack size</th>
                    <th className="pb-1.5 font-semibold w-28">Price</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key}>
                      <td className="pr-2 pb-2"><input className="input h-9" value={l.item} onChange={(e) => setLine(l.key, { item: e.target.value })} placeholder="Chapathi" /></td>
                      <td className="pr-2 pb-2"><input className="input h-9" value={l.brand} onChange={(e) => setLine(l.key, { brand: e.target.value })} /></td>
                      <td className="pr-2 pb-2">
                        <select className="input h-9" value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value })}>
                          {catList.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="pr-2 pb-2"><input className="input h-9" type="number" min="0" step="0.01" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></td>
                      <td className="pr-2 pb-2">
                        <div className="flex gap-1">
                          <input className="input h-9 flex-1 min-w-0" type="number" min="0" step="0.001" value={l.packSize} onChange={(e) => setLine(l.key, { packSize: e.target.value })} placeholder="500" />
                          <select className="input h-9 w-16 px-1" value={l.packUnit} onChange={(e) => setLine(l.key, { packUnit: e.target.value as PackUnit })}>
                            {PACK_UNITS.map((u) => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="pr-2 pb-2"><input className="input h-9" type="number" min="0" step="0.01" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} placeholder="Line total" /></td>
                      <td className="pb-2">
                        <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-slate-500">
              Price is the line total (quantity × pack price). The receipt total is the sum of the items — it is never
              added on top, so nothing is counted twice.
            </p>
          </>
        )}

        <Field label="Notes (optional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt number, occasion…" />
        </Field>
      </div>
    </Modal>
  )
}
