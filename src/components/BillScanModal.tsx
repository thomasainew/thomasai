import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, FileText, Loader2, ScanLine, Trash2, Upload } from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'
import { PURCHASE_CATEGORIES, readFileAsDataUrl, scanBill, type ScannedItem } from '@/lib/gemini'
import { money, TODAY } from '@/lib/format'
import { accountLabel, methodFor, paymentAccounts } from '@/lib/accounting'
import { WEIGHT_UNITS, type Account, type Currency, type Transaction, type WeightUnit } from '@/types'

const MAX_MB = 8

interface Row extends ScannedItem {
  id: string
  include: boolean
}

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
  const [meta, setMeta] = useState({ store: '', date: '', currency: 'AED' as Currency, total: 0 })
  const [person, setPerson] = useState(people[0] ?? 'Me')
  // Deliberately not defaulted to an account: the scan/save actions stay
  // disabled until the user picks one, so an account is never silently
  // chosen for them — see the scanner validation rule in the corrections spec.
  const [accountId, setAccountId] = useState('')
  const eligibleAccounts = paymentAccounts(accounts)
  const abort = useRef<AbortController | null>(null)

  // Reset when the modal closes, and drop any in-flight request.
  useEffect(() => {
    if (open) return
    abort.current?.abort()
    setFile(null)
    setPreview(null)
    setRows(null)
    setError(null)
    setBusy(false)
    setAccountId('')
    setMeta({ store: '', date: '', currency: 'AED', total: 0 })
  }, [open])

  useEffect(() => setPerson(people[0] ?? 'Me'), [people])

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
      setRows(
        (bill.items ?? []).map((it, i) => ({
          id: `r${i}`,
          include: true,
          item: it.item ?? '',
          category: (PURCHASE_CATEGORIES as readonly string[]).includes(it.category) ? it.category : 'Other',
          qty: Number(it.qty) || 1,
          price: Number(it.price) || 0,
          weight: Number(it.weight) > 0 ? Number(it.weight) : undefined,
          weightUnit: (WEIGHT_UNITS as string[]).includes(it.weightUnit ?? '')
            ? (it.weightUnit as WeightUnit)
            : undefined,
        })),
      )
      if (!bill.items?.length) setError('No line items were found on that image. Try a sharper, straight-on photo.')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const patch = (id: string, p: Partial<Row>) =>
    setRows((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, ...p } : r)) : rs))

  const chosen = rows?.filter((r) => r.include && r.item.trim() && r.price > 0) ?? []
  /** Transactions carry their own currency, so the receipt's is kept as-is. */
  const lineTotal = (r: Row) => Math.round(r.price * r.qty * 100) / 100
  const chosenTotal = chosen.reduce((a, r) => a + lineTotal(r), 0)
  const account = accounts.find((a) => a.id === accountId)

  const confirm = () => {
    if (!account) return
    for (const r of chosen) {
      onAdd({
        type: 'expense',
        date: meta.date || TODAY,
        description: r.item.trim(),
        category: r.category,
        accountId,
        // amount is always the line total; qty is kept so unit price stays recoverable.
        amount: lineTotal(r),
        currency: meta.currency,
        person,
        // Derived from the chosen Paid from account — every line on one
        // receipt is one payment, so they all share the same source.
        method: methodFor(account.type),
        store: meta.store.trim() || undefined,
        qty: r.qty,
        weight: r.weight,
        weightUnit: r.weight ? ((r.weightUnit as WeightUnit) ?? 'kg') : undefined,
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
      width="max-w-3xl"
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

            <div className="flex flex-wrap items-end gap-3">
              {account && (
                <p className="text-[11.5px] text-slate-500 pb-2.5">
                  Paid from <b className="text-slate-700">{accountLabel(account)}</b>
                </p>
              )}
              <Field label="Person" className="w-44">
                <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
                  {(people.length ? people : ['Me', 'Family', 'Others']).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              {meta.total > 0 && (
                <p className="text-[11.5px] text-slate-500 pb-2.5">
                  Bill total read as <b className="text-slate-700">{money(meta.total, meta.currency)}</b>
                </p>
              )}
            </div>

            <div className="rounded-xl border border-[#e8edf5] overflow-x-auto scroll-thin">
              <table className="w-full min-w-[560px]">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="th w-10"></th>
                    <th className="th">Item</th>
                    <th className="th">Category</th>
                    <th className="th text-right w-20">Qty</th>
                    <th className="th text-right w-28">Unit price</th>
                    <th className="th text-right w-32">Weight</th>
                    <th className="th w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {rows.map((r) => (
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
                          className="input h-8 text-[12.5px]"
                          value={r.category}
                          onChange={(e) => patch(r.id, { category: e.target.value })}
                        >
                          {PURCHASE_CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="td">
                        <input
                          className="input h-8 text-[12.5px] text-right"
                          type="number"
                          min="1"
                          value={r.qty}
                          onChange={(e) => patch(r.id, { qty: Number(e.target.value) || 1 })}
                        />
                      </td>
                      <td className="td">
                        <input
                          className="input h-8 text-[12.5px] text-right"
                          type="number"
                          value={r.price}
                          onChange={(e) => patch(r.id, { price: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-1">
                          <input
                            className="input h-8 text-[12.5px] text-right w-16"
                            type="number"
                            step="0.001"
                            placeholder="—"
                            value={r.weight ?? ''}
                            onChange={(e) =>
                              patch(r.id, { weight: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                          />
                          <select
                            className="input h-8 text-[12px] w-16 px-1"
                            value={r.weightUnit ?? 'kg'}
                            onChange={(e) => patch(r.id, { weightUnit: e.target.value })}
                          >
                            {WEIGHT_UNITS.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="td">
                        <button
                          onClick={() => setRows((rs) => (rs ? rs.filter((x) => x.id !== r.id) : null))}
                          className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
