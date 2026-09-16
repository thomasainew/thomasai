import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronDown, FileText, Loader2, Plus, ScanLine, Sparkles, Trash2, Upload } from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'
import { PURCHASE_CATEGORIES, readFileAsDataUrl, scanBill } from '@/lib/gemini'
import { money, TODAY } from '@/lib/format'
import { accountLabel, methodFor, paymentAccounts, round2 } from '@/lib/accounting'
import { WEIGHT_UNITS, type Account, type Currency, type Transaction, type WeightUnit } from '@/types'

const MAX_MB = 8
type SaleType = 'weight' | 'each' | 'package'

interface Row {
  id: string
  include: boolean
  item: string
  category: string
  saleType: SaleType
  /** For "weight": the raw amount in weightUnit, e.g. 500 for "500 g". Otherwise a count. */
  qty: number
  weightUnit: WeightUnit
  /** Unit price: per weightUnit's base unit (kg or L) when weight-priced, per unit otherwise. */
  rate: number
  person: string
}

const CATEGORY_ICON: Record<string, string> = {
  Electronics: '🔌', Furniture: '🛋️', Appliances: '🧺', Groceries: '🛒', Kids: '🧸',
  Automotive: '🚗', Business: '💼', Clothing: '👕', Health: '💊', Other: '📦',
}

// Weight/volume units normalise to a single base unit (kg or L) so a rate
// entered "per kg" prices a 500 g line correctly without the user converting.
const TO_KG: Partial<Record<WeightUnit, number>> = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 }
const TO_L: Partial<Record<WeightUnit, number>> = { L: 1, ml: 0.001 }
const baseUnit = (u: WeightUnit) => (u in TO_KG ? 'kg' : u in TO_L ? 'L' : u)
const baseQty = (u: WeightUnit, qty: number) => qty * (TO_KG[u] ?? TO_L[u] ?? 1)

function lineTotal(r: Row): number {
  const qty = r.saleType === 'weight' ? baseQty(r.weightUnit, r.qty) : r.qty
  return round2(qty * r.rate)
}

function calcText(r: Row): string {
  if (r.saleType === 'weight') {
    const q = baseQty(r.weightUnit, r.qty)
    return `${q} ${baseUnit(r.weightUnit)} × AED ${r.rate} = AED ${lineTotal(r)}`
  }
  return `${r.qty} × AED ${r.rate} = AED ${lineTotal(r)}`
}

const newRow = (id: string, person: string): Row => ({
  id, include: true, item: '', category: PURCHASE_CATEGORIES[0], saleType: 'each', qty: 1, weightUnit: 'kg', rate: 0, person,
})

export function BillScanModal({
  open,
  onClose,
  people,
  accounts,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  people: string[]
  accounts: Account[]
  /** Called once per confirmed line item, as an ordinary expense. */
  onAdd: (t: Omit<Transaction, 'id'>) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [meta, setMeta] = useState({ store: '', date: '', currency: 'AED' as Currency, total: 0 })
  // Deliberately not defaulted to an account: the scan/save actions stay
  // disabled until the user picks one, so an account is never silently
  // chosen for them — see the scanner validation rule in the corrections spec.
  const [accountId, setAccountId] = useState('')
  const eligibleAccounts = paymentAccounts(accounts)
  const peopleList = people.length ? people : ['Me', 'Family', 'Others']
  const abort = useRef<AbortController | null>(null)

  // Reset when the modal closes, and drop any in-flight request.
  useEffect(() => {
    if (open) return
    abort.current?.abort()
    setFile(null)
    setPreview(null)
    setRows(null)
    setCollapsed(new Set())
    setError(null)
    setBusy(false)
    setAccountId('')
    setMeta({ store: '', date: '', currency: 'AED', total: 0 })
  }, [open])

  const choose = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    setRows(null)
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)}MB — please use one under ${MAX_MB}MB.`)
      return
    }
    setFile(f)
    try {
      setPreview(await readFileAsDataUrl(f))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const extract = async () => {
    if (!file || !preview) return
    setBusy(true)
    setError(null)
    abort.current = new AbortController()
    try {
      const bill = await scanBill(preview, file.type || 'image/jpeg', abort.current.signal)
      const known = ['AED', 'INR', 'USD'] as const
      setMeta({
        store: bill.store ?? '',
        date: bill.date ?? '',
        currency: known.includes(bill.currency as Currency) ? (bill.currency as Currency) : 'AED',
        total: Number(bill.total) || 0,
      })
      const defaultPerson = peopleList[0]
      setRows(
        (bill.items ?? []).map((it, i): Row => {
          const weight = Number(it.weight) > 0 ? Number(it.weight) : undefined
          const weightUnit = (WEIGHT_UNITS as string[]).includes(it.weightUnit ?? '') ? (it.weightUnit as WeightUnit) : 'kg'
          return {
            id: `r${i}`,
            include: true,
            item: it.item ?? '',
            category: (PURCHASE_CATEGORIES as readonly string[]).includes(it.category) ? it.category : 'Other',
            saleType: weight ? 'weight' : 'each',
            qty: weight ?? (Number(it.qty) || 1),
            weightUnit,
            rate: Number(it.price) || 0,
            person: defaultPerson,
          }
        }),
      )
      if (!bill.items?.length) setError('No line items were found on that image. Try a sharper, straight-on photo.')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const patch = (id: string, p: Partial<Row>) =>
    setRows((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, ...p } : r)) : rs))

  const addMissingItem = () =>
    setRows((rs) => [...(rs ?? []), newRow(`m${Date.now()}`, peopleList[0])])

  const removeRow = (id: string) => setRows((rs) => (rs ? rs.filter((x) => x.id !== id) : null))

  const groups = useMemo(() => {
    if (!rows) return []
    const order: string[] = []
    const byCat = new Map<string, Row[]>()
    for (const r of rows) {
      if (!byCat.has(r.category)) { byCat.set(r.category, []); order.push(r.category) }
      byCat.get(r.category)!.push(r)
    }
    return order.map((category) => ({ category, items: byCat.get(category)! }))
  }, [rows])

  const chosen = (rows ?? []).filter((r) => r.include && r.item.trim() && r.rate > 0)
  const chosenTotal = chosen.reduce((a, r) => a + lineTotal(r), 0)
  const account = accounts.find((a) => a.id === accountId)

  const assignGroup = (category: string, person: string) =>
    setRows((rs) => (rs ? rs.map((r) => (r.category === category ? { ...r, person } : r)) : rs))

  const toggleCollapsed = (category: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      next.has(category) ? next.delete(category) : next.add(category)
      return next
    })

  const confirm = () => {
    if (!account) return
    for (const r of chosen) {
      onAdd({
        type: 'expense',
        date: meta.date || TODAY,
        description: r.item.trim(),
        category: r.category,
        accountId,
        amount: lineTotal(r),
        currency: meta.currency,
        person: r.person,
        // Derived from the chosen Paid from account — every line on one
        // receipt is one payment, so they all share the same source.
        method: methodFor(account.type),
        store: meta.store.trim() || undefined,
        qty: r.saleType === 'weight' ? undefined : r.qty,
        weight: r.saleType === 'weight' ? r.qty : undefined,
        weightUnit: r.saleType === 'weight' ? r.weightUnit : undefined,
        notes: `Scanned from ${file?.name ?? 'a bill'}`,
      })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan a Bill"
      subtitle="Upload a receipt photo and Gemini reads the line items"
      width="max-w-4xl"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {rows ? (
            <button className="btn-primary disabled:opacity-50" disabled={!chosen.length || !account} onClick={confirm}>
              <Check size={15} /> Add {chosen.length} expense{chosen.length === 1 ? '' : 's'}
              {chosen.length > 0 ? ` · ${money(chosenTotal, meta.currency)}` : ''}
            </button>
          ) : (
            <button className="btn-primary disabled:opacity-50" disabled={!file || busy || !accountId} onClick={extract}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />}
              {busy ? 'Reading bill…' : 'Extract details'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2">
            <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-amber-900">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Paid from" className="w-56">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">
                {eligibleAccounts.length === 0 ? 'No accounts yet — add one first' : 'Select an account'}
              </option>
              {eligibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
          </Field>
          <label className="btn-ghost cursor-pointer">
            <Upload size={15} /> {file ? 'Choose another' : 'Choose bill image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
              className="hidden"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </label>
          {file && (
            <span className="text-[12px] text-slate-500 inline-flex items-center gap-1.5 pb-2.5">
              <FileText size={13} /> {file.name} · {(file.size / 1024).toFixed(0)} KB
            </span>
          )}
        </div>
        {!accountId && (
          <p className="text-[11.5px] text-slate-500 -mt-2">
            Choose the account this bill was paid from before scanning — it can't be changed per line item.
          </p>
        )}

        {preview && file?.type.startsWith('image/') && (
          <img
            src={preview}
            alt="Bill preview"
            className="max-h-56 rounded-xl border border-[#e8edf5] object-contain bg-slate-50"
          />
        )}

        {!rows && !busy && (
          <p className="text-[12px] text-slate-500 leading-relaxed">
            Works with a photo or screenshot of a receipt, invoice or delivery note. Every extracted row is editable
            before anything is saved.
          </p>
        )}

        {rows && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Store">
                <input className="input" value={meta.store} onChange={(e) => setMeta({ ...meta, store: e.target.value })} />
              </Field>
              <Field label="Date">
                <input className="input" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
              </Field>
              <Field label="Bill currency">
                <select
                  className="input"
                  value={meta.currency}
                  onChange={(e) => setMeta({ ...meta, currency: e.target.value as Currency })}
                >
                  <option>AED</option>
                  <option>INR</option>
                  <option>USD</option>
                </select>
              </Field>
            </div>

            <div className="rounded-xl bg-brand-50/70 border border-brand-100 px-3.5 py-2.5 flex items-start gap-2.5">
              <Sparkles size={15} className="text-brand-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12.5px] font-bold text-slate-800">AI grouped {rows.length} item{rows.length === 1 ? '' : 's'}</p>
                <p className="text-[11.5px] text-slate-600 mt-0.5">Review each group and assign the items to the right person.</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 -mt-2">Default quantity is 1. Use g or kg for weighted items.</p>

            <div className="rounded-xl border border-[#e8edf5] overflow-x-auto scroll-thin">
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="th w-8"></th>
                    <th className="th">Item</th>
                    <th className="th w-28">Type</th>
                    <th className="th text-right w-32">Qty / Weight</th>
                    <th className="th text-right w-28">Rate</th>
                    <th className="th w-52">Calculation</th>
                    <th className="th w-32">Person</th>
                    <th className="th w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {groups.map(({ category, items }) => {
                    const isCollapsed = collapsed.has(category)
                    const groupTotal = items.reduce((a, r) => a + lineTotal(r), 0)
                    return (
                      <Fragment key={category}>
                        <tr className="bg-slate-50/60">
                          <td className="td" colSpan={2}>
                            <button
                              onClick={() => toggleCollapsed(category)}
                              className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer"
                            >
                              <ChevronDown size={14} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                              <span>{CATEGORY_ICON[category] ?? '📦'}</span>
                              {category} · {items.length} item{items.length === 1 ? '' : 's'}
                            </button>
                          </td>
                          <td className="td" colSpan={4}>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">Assign person to group</span>
                              <select
                                className="input h-7 text-[11.5px] w-32"
                                value=""
                                onChange={(e) => e.target.value && assignGroup(category, e.target.value)}
                              >
                                <option value="">Choose…</option>
                                {peopleList.map((p) => <option key={p}>{p}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="td text-right font-bold text-slate-700">{money(groupTotal, meta.currency)}</td>
                        </tr>
                        {!isCollapsed && items.map((r) => (
                          <tr key={r.id} className={r.include ? '' : 'opacity-40'}>
                            <td className="td">
                              <input
                                type="checkbox"
                                checked={r.include}
                                onChange={() => patch(r.id, { include: !r.include })}
                                className="accent-brand-600 h-4 w-4 cursor-pointer"
                              />
                            </td>
                            <td className="td">
                              <input
                                className="input h-8 text-[12.5px]"
                                value={r.item}
                                onChange={(e) => patch(r.id, { item: e.target.value })}
                              />
                            </td>
                            <td className="td">
                              <select
                                className="input h-8 text-[11.5px]"
                                value={r.saleType}
                                onChange={(e) => patch(r.id, { saleType: e.target.value as SaleType })}
                              >
                                <option value="weight">By weight</option>
                                <option value="each">Each</option>
                                <option value="package">Package</option>
                              </select>
                            </td>
                            <td className="td">
                              {r.saleType === 'weight' ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    className="input h-8 text-[12.5px] text-right w-14"
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={r.qty}
                                    onChange={(e) => patch(r.id, { qty: Number(e.target.value) || 0 })}
                                  />
                                  <select
                                    className="input h-8 text-[12px] w-16 px-1"
                                    value={r.weightUnit}
                                    onChange={(e) => patch(r.id, { weightUnit: e.target.value as WeightUnit })}
                                  >
                                    {WEIGHT_UNITS.map((u) => <option key={u}>{u}</option>)}
                                  </select>
                                </div>
                              ) : (
                                <input
                                  className="input h-8 text-[12.5px] text-right"
                                  type="number"
                                  min="1"
                                  value={r.qty}
                                  onChange={(e) => patch(r.id, { qty: Number(e.target.value) || 1 })}
                                />
                              )}
                            </td>
                            <td className="td">
                              <input
                                className="input h-8 text-[12.5px] text-right"
                                type="number"
                                value={r.rate}
                                onChange={(e) => patch(r.id, { rate: Number(e.target.value) || 0 })}
                              />
                              <p className="text-[9.5px] text-slate-400 text-right mt-0.5">
                                {r.saleType === 'weight' ? `/ ${baseUnit(r.weightUnit)}` : r.saleType === 'package' ? '/ package' : 'each'}
                              </p>
                            </td>
                            <td className="td text-[11px] text-slate-500 tabular-nums">{calcText(r)}</td>
                            <td className="td">
                              <select
                                className="input h-8 text-[11.5px]"
                                value={r.person}
                                onChange={(e) => patch(r.id, { person: e.target.value })}
                              >
                                {peopleList.map((p) => <option key={p}>{p}</option>)}
                              </select>
                            </td>
                            <td className="td">
                              <button
                                onClick={() => removeRow(r.id)}
                                className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={addMissingItem}
              className="btn-ghost h-9 text-[12.5px] inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Add missing item
            </button>

            {meta.total > 0 && (
              <p className="text-[11.5px] text-slate-500">
                Bill total read as <b className="text-slate-700">{money(meta.total, meta.currency)}</b>
              </p>
            )}
            <p className="text-[11.5px] text-slate-500">
              Check each row before saving — extraction is accurate but not guaranteed. Each row is saved as an
              expense, so it counts towards your budget and reports straight away.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
