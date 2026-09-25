import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle, AlertTriangle, ArrowDown, ArrowUp, Banknote, CalendarDays, CheckCircle2, ChevronDown, CreditCard,
  FileText, ImageUp, Landmark, Loader2, Plus, RefreshCw, Save, ScanLine, Signal, Trash2, Upload, X,
} from 'lucide-react'
import { PURCHASE_CATEGORIES, readFileAsDataUrl, scanBill } from '@/lib/gemini'
import { money } from '@/lib/format'
import { methodFor, round2 } from '@/lib/accounting'
import { useStore } from '@/store/useStore'
import {
  PACK_DETAIL_UNITS, UOMS, beforeVat, checkLine, encodeLineNotes, lineTotal, packConflicts, packLabel, packTotal, vatOf,
  type BillLine, type LineCheck, type LineStatus,
} from '@/lib/billScan'
import type { Account, AccountType, Currency, PackUnit, Transaction } from '@/types'

const MAX_MB = 8
const DRAFT_KEY = 'cb.billScanDraft'
const DEFAULT_VAT: Record<Currency, number> = { AED: 5, INR: 0, USD: 0 } as Record<Currency, number>
const CURRENCY_NAMES: Record<string, string> = { AED: 'UAE Dirham', INR: 'Indian Rupee', USD: 'US Dollar' }

const PAYMENT_TYPES: { type: AccountType; label: string; hint: string; icon: typeof Banknote }[] = [
  { type: 'cash', label: 'Cash', hint: 'Cash account', icon: Banknote },
  { type: 'bank', label: 'Bank Account', hint: 'Bank account', icon: Landmark },
  { type: 'card', label: 'Credit Card', hint: 'Credit card account', icon: CreditCard },
]

const STATUS: Record<LineStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  matched: { label: 'Matched', cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  new: { label: 'New Item', cls: 'bg-blue-50 text-blue-700', icon: CheckCircle2 },
  increased: { label: 'Price Increased', cls: 'bg-amber-50 text-amber-700', icon: AlertTriangle },
  decreased: { label: 'Price Decreased', cls: 'bg-emerald-50 text-emerald-700', icon: ArrowDown },
  'different-pack': { label: 'Different pack size', cls: 'bg-amber-50 text-amber-700', icon: AlertTriangle },
  review: { label: 'Needs Review', cls: 'bg-rose-50 text-rose-700', icon: AlertCircle },
}

interface Meta {
  store: string
  invoiceNumber: string
  date: string
  branch: string
  salesperson: string
  currency: Currency
  /** Grand total printed on the bill, for a sanity check against the lines. */
  printedTotal: number
  person: string
}

interface Draft {
  savedAt: string
  meta: Meta
  rows: BillLine[]
  accountType: AccountType | ''
  accountId: string
  fileName?: string
  preview?: string
}

const emptyMeta = (person: string): Meta => ({
  store: '', invoiceNumber: '', date: '', branch: '', salesperson: '', currency: 'AED', printedTotal: 0, person,
})

const newLine = (id: string, vatPct: number): BillLine => ({
  id, include: true, code: '', item: '', category: PURCHASE_CATEGORIES[0], itemGroup: '',
  packCount: 0, packSize: 0, packUnit: 'g', uom: 'PCS', qty: 1, price: 0, vatPct,
})

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}
/** Saves with the bill image when it fits in storage, otherwise without it. */
function writeDraft(d: Draft): boolean {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    return true
  } catch {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, preview: undefined }))
      return true
    } catch {
      return false
    }
  }
}

/** Past values for a "Branch: X" style part of receipt notes. */
function notesValues(notes: (string | undefined)[], label: string): string[] {
  const out = new Set<string>()
  for (const n of notes) {
    for (const part of (n ?? '').split(' · ')) {
      if (part.startsWith(`${label}: `)) out.add(part.slice(label.length + 2).trim())
    }
  }
  return [...out].filter(Boolean).sort()
}

const num = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cell =
  'w-full h-8 rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] text-slate-700 outline-none transition ' +
  'hover:border-[#e2e8f0] focus:border-brand-400 focus:bg-white'

export function BillScanModal({
  open,
  onClose,
  people,
  accounts,
  transactions,
}: {
  open: boolean
  onClose: () => void
  people: string[]
  accounts: Account[]
  /** Past expenses, used to flag price changes against the same item bought before. */
  transactions: Transaction[]
}) {
  const addReceipt = useStore((st) => st.addReceipt)
  const receipts = useStore((st) => st.receipts)
  const peopleList = people.length ? people : ['Me', 'Family', 'Others']

  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BillLine[] | null>(null)
  const [meta, setMeta] = useState<Meta>(emptyMeta(peopleList[0]))
  const [groupFilter, setGroupFilter] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  // Deliberately not defaulted: the scan/post actions stay disabled until an
  // account is chosen, so one is never silently picked for them.
  const [accountType, setAccountType] = useState<AccountType | ''>('')
  const [accountId, setAccountId] = useState('')
  const abort = useRef<AbortController | null>(null)

  const accountsOfType = (t: AccountType) => accounts.filter((a) => a.type === t)

  // Reset when the modal closes (dropping any in-flight request); look for a
  // saved draft when it opens.
  useEffect(() => {
    if (open) {
      setDraft(readDraft())
      return
    }
    abort.current?.abort()
    setFile(null)
    setFileName('')
    setPreview(null)
    setRows(null)
    setError(null)
    setBusy(false)
    setGroupFilter('')
    setAccountType('')
    setAccountId('')
    setMeta(emptyMeta(peopleList[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const suppliers = useMemo(() => [...new Set(receipts.map((r) => r.store).filter(Boolean))].sort(), [receipts])
  const branches = useMemo(() => notesValues(receipts.map((r) => r.notes), 'Branch'), [receipts])
  const salespeople = useMemo(() => notesValues(receipts.map((r) => r.notes), 'Salesperson'), [receipts])

  const choose = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)}MB — please use one under ${MAX_MB}MB.`)
      return
    }
    setFile(f)
    setFileName(f.name)
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
      const currency = known.includes(bill.currency as Currency) ? (bill.currency as Currency) : 'AED'
      setMeta((m) => ({
        ...m,
        store: bill.store ?? '',
        invoiceNumber: bill.invoiceNumber ?? '',
        date: bill.date ?? '',
        branch: bill.branch ?? m.branch,
        salesperson: bill.salesperson ?? m.salesperson,
        currency,
        printedTotal: Number(bill.total) || 0,
      }))
      setRows(
        (bill.items ?? []).map((it, i): BillLine => ({
          id: `r${i}`,
          include: true,
          code: it.itemCode?.trim() ?? '',
          item: it.item ?? '',
          brand: it.brand?.trim() || undefined,
          category: (PURCHASE_CATEGORIES as readonly string[]).includes(it.category) ? it.category : 'Other',
          itemGroup: it.itemGroup?.trim() ?? '',
          packCount: Number(it.packCount) || 0,
          packSize: Number(it.packSize) || 0,
          packUnit: (PACK_DETAIL_UNITS as string[]).includes(it.packUnit ?? '') ? (it.packUnit as PackUnit) : 'g',
          uom: it.uom?.trim().toUpperCase() || 'PCS',
          qty: Number(it.qty) || 1,
          price: Number(it.price) || 0,
          vatPct: it.vatRate != null && !Number.isNaN(Number(it.vatRate)) ? Number(it.vatRate) : DEFAULT_VAT[currency] ?? 0,
          flagged: Boolean(it.uncertain),
        })),
      )
      if (!bill.items?.length) setError('No line items were found on that image. Try a sharper, straight-on photo.')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const resumeDraft = () => {
    if (!draft) return
    setMeta(draft.meta)
    setRows(draft.rows)
    setAccountType(draft.accountType)
    setAccountId(draft.accountId)
    setFileName(draft.fileName ?? '')
    setPreview(draft.preview ?? null)
    setDraft(null)
  }

  const saveDraft = () => {
    if (!rows) return
    const ok = writeDraft({
      savedAt: new Date().toISOString(), meta, rows, accountType, accountId, fileName, preview: preview ?? undefined,
    })
    if (ok) onClose()
    else setError("The draft couldn't be saved in this browser's storage.")
  }

  const reject = () => {
    if (!window.confirm('Reject this scan? The extracted data will be discarded and nothing is posted.')) return
    clearDraft()
    onClose()
  }

  const patch = (id: string, p: Partial<BillLine>) =>
    setRows((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, ...p } : r)) : rs))
  const removeRow = (id: string) => setRows((rs) => (rs ? rs.filter((r) => r.id !== id) : rs))
  const addMissingItem = () => setRows((rs) => [...(rs ?? []), newLine(`m${Date.now()}`, DEFAULT_VAT[meta.currency] ?? 0)])

  const checks = useMemo(() => {
    const out = new Map<string, LineCheck>()
    for (const r of rows ?? []) out.set(r.id, checkLine(transactions, r))
    return out
  }, [rows, transactions])

  const all = rows ?? []
  const itemGroups = [...new Set(all.map((r) => r.itemGroup.trim()).filter(Boolean))].sort()
  const visible = groupFilter ? all.filter((r) => r.itemGroup.trim() === groupFilter) : all
  const chosen = all.filter((r) => r.include && r.item.trim() && r.price > 0 && r.qty > 0)
  const subtotal = round2(chosen.reduce((a, r) => a + beforeVat(r), 0))
  const vat = round2(chosen.reduce((a, r) => a + vatOf(r), 0))
  const grandTotal = round2(subtotal + vat)
  const vatRates = [...new Set(chosen.map((r) => r.vatPct))]
  const increased = chosen.filter((r) => checks.get(r.id)?.status === 'increased')
  const extraCost = round2(increased.reduce((a, r) => a + (checks.get(r.id)!.delta ?? 0) * r.qty, 0))
  const conflicts = packConflicts(all)
  const differentPack = all.filter((r) => checks.get(r.id)?.status === 'different-pack')
  const needsReview = chosen.filter((r) => checks.get(r.id)?.status === 'review')
  const account = accounts.find((a) => a.id === accountId)
  const totalGap = meta.printedTotal > 0 ? round2(meta.printedTotal - grandTotal) : 0
  const allSelected = visible.length > 0 && visible.every((r) => r.include)

  const missing = [
    !meta.store.trim() && 'supplier',
    !meta.date && 'invoice date',
    !account && 'payment account',
    !chosen.length && 'at least one item',
  ].filter(Boolean) as string[]

  const post = () => {
    if (missing.length || !account) return
    const store = meta.store.trim()
    const method = methodFor(account.type)
    addReceipt(
      {
        date: meta.date,
        store,
        accountId,
        person: meta.person,
        method,
        currency: meta.currency,
        notes: [
          meta.invoiceNumber.trim() ? `Invoice #${meta.invoiceNumber.trim()}` : null,
          meta.branch.trim() ? `Branch: ${meta.branch.trim()}` : null,
          meta.salesperson.trim() ? `Salesperson: ${meta.salesperson.trim()}` : null,
          `Scanned from ${fileName || 'a bill'}`,
        ]
          .filter(Boolean)
          .join(' · '),
      },
      chosen.map((r) => {
        const pack = packTotal(r)
        return {
          type: 'expense' as const,
          date: meta.date,
          description: r.item.trim(),
          category: r.category,
          subcategory: r.itemGroup.trim() || undefined,
          accountId,
          // What was actually paid for the line, VAT included — the receipt's
          // lines add up to its grand total.
          amount: lineTotal(r),
          currency: meta.currency,
          person: meta.person,
          method,
          store: store || undefined,
          brand: r.brand?.trim() || undefined,
          qty: r.qty,
          packSize: pack?.size,
          packUnit: pack?.unit,
          notes: encodeLineNotes({
            code: r.code.trim() || undefined,
            pack: packLabel(r) || undefined,
            uom: r.uom || undefined,
            vatPct: r.vatPct || undefined,
            invoice: meta.invoiceNumber.trim() || undefined,
          }),
        }
      }),
    )
    clearDraft()
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  // ------------------------------------------------------------- pieces ----

  const paymentMethod = (
    <section className="rounded-xl border border-[#e8edf5] bg-slate-50/40 p-3">
      <p className="text-[13.5px] font-bold text-slate-800 mb-2.5 px-1">Payment Method</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PAYMENT_TYPES.map(({ type, label, hint, icon: Icon }) => {
          const list = accountsOfType(type)
          const disabled = list.length === 0
          const active = accountType === type
          return (
            <div
              key={type}
              role="radio"
              aria-checked={active}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={() => {
                if (disabled || active) return
                setAccountType(type)
                setAccountId(list[0]?.id ?? '')
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !disabled && !active) {
                  e.preventDefault()
                  setAccountType(type)
                  setAccountId(list[0]?.id ?? '')
                }
              }}
              className={`rounded-xl border bg-white px-4 py-3 flex items-center gap-4 transition ${
                active ? 'border-brand-500 ring-1 ring-brand-500 bg-brand-50/30' : 'border-[#e2e8f0]'
              } ${disabled ? 'opacity-45 cursor-not-allowed' : active ? '' : 'cursor-pointer hover:border-slate-300'}`}
            >
              <span
                className={`h-[18px] w-[18px] rounded-full border-2 grid place-items-center shrink-0 ${
                  active ? 'border-brand-600' : 'border-slate-300'
                }`}
              >
                {active && <span className="h-2 w-2 rounded-full bg-brand-600" />}
              </span>
              <Icon size={30} strokeWidth={1.5} className="text-slate-700 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-slate-800">{label}</p>
                {active && list.length > 0 ? (
                  <div className="relative mt-1" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="input h-8 text-[12.5px] pr-8 appearance-none"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                    >
                      {list.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} {a.details && a.details !== '—' ? `···· ${a.details}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-2 text-slate-500 pointer-events-none" />
                  </div>
                ) : (
                  <p className="text-[12px] text-slate-500 truncate">{disabled ? 'No account yet' : hint}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )

  const errorBox = error && (
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2">
      <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
      <p className="text-[12px] text-amber-900">{error}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[1500px] card animate-pop max-h-[94vh] flex flex-col">
        {/* ------------------------------------------------------ title --- */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-3 border-b border-[#eef2f8]">
          <div>
            <h3 className="text-[22px] font-extrabold tracking-tight text-[#0b2a6b]">AI Bill Scanner</h3>
            <p className="text-[13.5px] text-slate-500 mt-0.5">
              {rows ? 'Invoice data extracted — review before posting' : 'Upload a bill photo and Gemini reads every line'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-lg text-brand-600 hover:bg-slate-100 cursor-pointer"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-4 overflow-y-auto scroll-thin space-y-3">
          {errorBox}

          {!rows ? (
            <>
              {draft && (
                <div className="rounded-xl bg-brand-50/70 border border-brand-100 px-3.5 py-2.5 flex flex-wrap items-center gap-3">
                  <Save size={15} className="text-brand-600 shrink-0" />
                  <p className="text-[12.5px] text-slate-700 flex-1 min-w-[200px]">
                    Saved draft{draft.meta.store ? ` from ${draft.meta.store}` : ''} · {draft.rows.length} item
                    {draft.rows.length === 1 ? '' : 's'} · saved {new Date(draft.savedAt).toLocaleString()}
                  </p>
                  <button className="btn-primary h-8 text-[12px]" onClick={resumeDraft}>Resume draft</button>
                  <button
                    className="btn-ghost h-8 text-[12px]"
                    onClick={() => { clearDraft(); setDraft(null) }}
                  >
                    Discard
                  </button>
                </div>
              )}

              <label
                className="block rounded-2xl border-2 border-dashed border-[#d7e0ee] bg-slate-50/50 hover:border-brand-300 transition cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files?.[0]) }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                  className="hidden"
                  onChange={(e) => choose(e.target.files?.[0])}
                />
                {preview && file?.type.startsWith('image/') ? (
                  <div className="flex items-center gap-5 p-4">
                    <img src={preview} alt="Bill preview" className="h-44 w-36 rounded-xl object-cover border border-[#e8edf5] bg-white" />
                    <div>
                      <p className="text-[13.5px] font-bold text-slate-800 inline-flex items-center gap-1.5">
                        <FileText size={14} /> {file.name}
                      </p>
                      <p className="text-[12px] text-slate-500 mt-1">{(file.size / 1024).toFixed(0)} KB · click or drop to change</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 grid place-items-center text-center">
                    <span className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mb-3">
                      <Upload size={22} />
                    </span>
                    <p className="text-[14px] font-bold text-slate-800">{file ? file.name : 'Drop a bill here, or click to choose'}</p>
                    <p className="text-[12px] text-slate-500 mt-1">
                      Photo, screenshot or PDF of a receipt, invoice or delivery note · up to {MAX_MB}MB
                    </p>
                  </div>
                )}
              </label>

              {paymentMethod}
              {!accountId && (
                <p className="text-[12px] text-slate-500 px-1">
                  Choose the account this bill was paid from before scanning — it applies to every line.
                </p>
              )}
            </>
          ) : (
            <>
              {/* ------------------------------------------------ header --- */}
              <div className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)_minmax(280px,390px)] items-start">
                <div className="rounded-xl border border-[#e8edf5] bg-slate-50/50 p-2.5 flex lg:flex-col items-center gap-3">
                  {preview && preview.startsWith('data:image') ? (
                    <img src={preview} alt="Bill" className="h-[170px] w-full max-w-[140px] rounded-lg object-cover bg-white" />
                  ) : (
                    <div className="h-[170px] w-full max-w-[140px] rounded-lg bg-white border border-[#e8edf5] grid place-items-center text-slate-300">
                      <FileText size={34} />
                    </div>
                  )}
                  <label className="text-[12.5px] font-semibold text-brand-600 inline-flex items-center gap-1.5 cursor-pointer hover:underline">
                    <ImageUp size={14} /> Change image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                      className="hidden"
                      onChange={async (e) => {
                        await choose(e.target.files?.[0])
                        setRows(null)
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-3">
                  <Labeled label="Supplier" required>
                    <input className="input" list="bs-suppliers" value={meta.store} onChange={(e) => setMeta({ ...meta, store: e.target.value })} />
                    <datalist id="bs-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
                  </Labeled>
                  <Labeled label="Invoice Number">
                    <input className="input" value={meta.invoiceNumber} onChange={(e) => setMeta({ ...meta, invoiceNumber: e.target.value })} />
                  </Labeled>
                  <Labeled label="Invoice Date" required>
                    <div className="relative">
                      <input className="input pr-9" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
                      <CalendarDays size={16} className="absolute right-3 top-3 text-slate-600 pointer-events-none" />
                    </div>
                  </Labeled>
                  <Labeled label="Branch">
                    <input className="input" list="bs-branches" value={meta.branch} onChange={(e) => setMeta({ ...meta, branch: e.target.value })} placeholder="e.g. Main Branch" />
                    <datalist id="bs-branches">{branches.map((s) => <option key={s} value={s} />)}</datalist>
                  </Labeled>
                  <Labeled label="Currency" required>
                    <SelectBox
                      value={meta.currency}
                      onChange={(v) => setMeta({ ...meta, currency: v as Currency })}
                      options={['AED', 'INR', 'USD'].map((c) => ({ value: c, label: `${c} - ${CURRENCY_NAMES[c]}` }))}
                    />
                  </Labeled>
                  <Labeled label="Item Group / Category">
                    <SelectBox
                      value={groupFilter}
                      onChange={setGroupFilter}
                      options={[{ value: '', label: 'All Categories' }, ...itemGroups.map((g) => ({ value: g, label: g }))]}
                    />
                  </Labeled>
                  <Labeled label="Supplier Salesperson">
                    <input className="input" list="bs-sales" value={meta.salesperson} onChange={(e) => setMeta({ ...meta, salesperson: e.target.value })} />
                    <datalist id="bs-sales">{salespeople.map((s) => <option key={s} value={s} />)}</datalist>
                  </Labeled>
                  <Labeled label="Expense For">
                    <SelectBox
                      value={meta.person}
                      onChange={(v) => setMeta({ ...meta, person: v })}
                      options={peopleList.map((p) => ({ value: p, label: p }))}
                    />
                  </Labeled>
                </div>

                <div className="rounded-xl border border-[#dfe7f3] bg-[#f4f7fc] overflow-hidden">
                  <p className="px-4 py-3 text-[15px] font-bold text-slate-800 border-b border-[#e3eaf5]">Invoice Summary</p>
                  <div className="px-4 py-3 space-y-3 text-[13.5px]">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-bold text-slate-800">{money(subtotal, meta.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">VAT{vatRates.length === 1 ? ` (${vatRates[0]}%)` : ''}</span>
                      <span className="font-bold text-slate-800">{money(vat, meta.currency)}</span>
                    </div>
                  </div>
                  <div className="px-4 py-3.5 bg-[#e9effa] flex items-center justify-between">
                    <span className="text-[15px] font-bold text-slate-800">Grand Total</span>
                    <span className="text-[22px] font-extrabold text-[#0b2a6b]">{money(grandTotal, meta.currency)}</span>
                  </div>
                  {Math.abs(totalGap) >= 0.05 && (
                    <p className="px-4 py-2 text-[11.5px] text-amber-800 bg-amber-50 border-t border-amber-100">
                      Bill shows {money(meta.printedTotal, meta.currency)} — {money(Math.abs(totalGap), meta.currency)}{' '}
                      {totalGap > 0 ? 'more' : 'less'} than the selected lines.
                    </p>
                  )}
                </div>
              </div>

              {/* ----------------------------------------------- banners --- */}
              {(conflicts.length > 0 || differentPack.length > 0) && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2 flex items-center gap-2.5">
                  <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                  <p className="text-[12.5px] text-amber-900">
                    Pack size is part of the item identity.{' '}
                    {conflicts.length > 0
                      ? conflicts.map((c) => c.join(' and ')).join('; ') + ' will not be merged.'
                      : `${differentPack.length} item${differentPack.length === 1 ? ' was' : 's were'} bought before at a different pack size, so ${differentPack.length === 1 ? 'its' : 'their'} price is not compared.`}
                  </p>
                </div>
              )}
              {increased.length > 0 && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2 flex items-center gap-2.5">
                  <Signal size={17} className="text-rose-600 shrink-0" />
                  <p className="text-[13px] text-rose-700 font-semibold">
                    {increased.length} price increase{increased.length === 1 ? '' : 's'} detected
                    <span className="mx-2">•</span>
                    <span className="text-slate-800">Total additional cost: </span>
                    <span className="text-rose-600">{money(extraCost, meta.currency)}</span>
                  </p>
                </div>
              )}

              {paymentMethod}

              {/* ------------------------------------------------- table --- */}
              <div className="rounded-xl border border-[#e2e8f0] overflow-x-auto scroll-thin">
                <table className="w-full min-w-[1380px] text-[12.5px]">
                  <thead className="bg-[#f4f7fc]">
                    <tr className="text-left text-[12px] font-semibold text-slate-700">
                      <th className="px-3 py-2.5 w-14">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-brand-600 h-4 w-4"
                            checked={allSelected}
                            onChange={() => {
                              const ids = new Set(visible.map((r) => r.id))
                              setRows((rs) => rs && rs.map((r) => (ids.has(r.id) ? { ...r, include: !allSelected } : r)))
                            }}
                          />
                          Select
                        </label>
                      </th>
                      <th className="px-2 py-2.5 w-[88px]">Item Code</th>
                      <th className="px-2 py-2.5 min-w-[170px]">Item Name</th>
                      <th className="px-2 py-2.5 w-[170px]">Carton / Pack Details</th>
                      <th className="px-2 py-2.5 w-[74px]">UOM</th>
                      <th className="px-2 py-2.5 w-[62px] text-center">Qty</th>
                      <th className="px-2 py-2.5 w-[76px] text-right">Old Price</th>
                      <th className="px-2 py-2.5 w-[86px] text-right">New Price</th>
                      <th className="px-2 py-2.5 w-[96px] text-center">Increase Amount</th>
                      <th className="px-2 py-2.5 w-[82px] text-center">Variation %</th>
                      <th className="px-2 py-2.5 w-[86px] text-right">Before VAT</th>
                      <th className="px-2 py-2.5 w-[58px] text-center">VAT %</th>
                      <th className="px-2 py-2.5 w-[86px] text-right">Total</th>
                      <th className="px-2 py-2.5 w-[160px]">Item Group / Category</th>
                      <th className="px-2 py-2.5 w-[150px]">Status</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f7]">
                    {visible.map((r) => {
                      const check = checks.get(r.id)
                      const st = STATUS[check?.status ?? 'new']
                      const up = (check?.delta ?? 0) > 0
                      const down = (check?.delta ?? 0) < 0
                      return (
                        <tr key={r.id} className={`group ${r.include ? '' : 'opacity-45'}`}>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={r.include}
                              onChange={() => patch(r.id, { include: !r.include })}
                              className="accent-brand-600 h-4 w-4 cursor-pointer"
                              aria-label={`Include ${r.item || 'item'}`}
                            />
                          </td>
                          <td className="px-1 py-1.5">
                            <input className={`${cell} tabular-nums`} value={r.code} onChange={(e) => patch(r.id, { code: e.target.value })} placeholder="—" />
                          </td>
                          <td className="px-1 py-1.5">
                            <input className={cell} value={r.item} onChange={(e) => patch(r.id, { item: e.target.value })} placeholder="Item name" />
                          </td>
                          <td className="px-1 py-1.5">
                            <div className="flex items-center gap-0.5">
                              <input
                                className={`${cell} w-10 text-right px-1`}
                                type="number"
                                min="0"
                                value={r.packCount || ''}
                                placeholder="1"
                                onChange={(e) => patch(r.id, { packCount: Number(e.target.value) || 0 })}
                                aria-label="Packs per unit"
                              />
                              <span className="text-slate-400">×</span>
                              <input
                                className={`${cell} w-14 text-right px-1`}
                                type="number"
                                min="0"
                                value={r.packSize || ''}
                                placeholder="size"
                                onChange={(e) => patch(r.id, { packSize: Number(e.target.value) || 0 })}
                                aria-label="Pack size"
                              />
                              <select
                                className={`${cell} w-12 px-0.5`}
                                value={r.packUnit}
                                onChange={(e) => patch(r.id, { packUnit: e.target.value as PackUnit })}
                                aria-label="Pack unit"
                              >
                                {PACK_DETAIL_UNITS.map((u) => <option key={u}>{u}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="px-1 py-1.5">
                            <select className={cell} value={r.uom} onChange={(e) => patch(r.id, { uom: e.target.value })}>
                              {[...new Set([...UOMS, r.uom])].map((u) => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-1 py-1.5">
                            <input
                              className={`${cell} text-center tabular-nums`}
                              type="number"
                              min="0"
                              step="any"
                              value={r.qty}
                              onChange={(e) => patch(r.id, { qty: Number(e.target.value) || 0 })}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                            {check?.oldPrice != null ? num(check.oldPrice) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-1 py-1.5">
                            <input
                              className={`${cell} text-right tabular-nums`}
                              type="number"
                              min="0"
                              step="any"
                              value={r.price}
                              onChange={(e) => patch(r.id, { price: Number(e.target.value) || 0 })}
                            />
                          </td>
                          <td
                            className={`px-2 py-1.5 text-center tabular-nums font-semibold ${up ? 'text-rose-600' : down ? 'text-emerald-600' : 'text-slate-600'}`}
                          >
                            {check?.delta == null ? (
                              <span className="text-slate-300 font-normal">—</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                {up && <ArrowUp size={14} strokeWidth={2.5} />}
                                {down && <ArrowDown size={14} strokeWidth={2.5} />}
                                {up ? '+' : ''}{num(check.delta)}
                              </span>
                            )}
                          </td>
                          <td className={`px-2 py-1.5 text-center tabular-nums font-semibold ${up ? 'text-rose-600' : down ? 'text-emerald-600' : 'text-slate-600'}`}>
                            {check?.deltaPct == null ? (
                              <span className="text-slate-300 font-normal">—</span>
                            ) : (
                              `${up ? '+' : ''}${check.deltaPct.toFixed(2)}%`
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{num(beforeVat(r))}</td>
                          <td className="px-1 py-1.5">
                            <div className="flex items-center justify-center">
                              <input
                                className={`${cell} w-10 text-right px-1 tabular-nums`}
                                type="number"
                                min="0"
                                step="any"
                                value={r.vatPct}
                                onChange={(e) => patch(r.id, { vatPct: Number(e.target.value) || 0 })}
                                aria-label="VAT percent"
                              />
                              <span className="text-slate-500">%</span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">{num(lineTotal(r))}</td>
                          <td className="px-1 py-1.5">
                            <input
                              className={cell}
                              list="bs-groups"
                              value={r.itemGroup}
                              onChange={(e) => patch(r.id, { itemGroup: e.target.value })}
                              placeholder={r.category}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              title={
                                check?.status === 'review'
                                  ? r.flagged
                                    ? 'The AI was unsure about this line. Check it against the bill, then click to mark it reviewed.'
                                    : 'Item name, quantity and price are all needed.'
                                  : check?.priorDate
                                    ? `Compared with the purchase on ${check.priorDate}`
                                    : undefined
                              }
                              onClick={() => r.flagged && patch(r.id, { flagged: false })}
                              className={`chip ${st.cls} text-[11.5px] font-semibold ${r.flagged ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              <st.icon size={13} /> {st.label}
                            </button>
                          </td>
                          <td className="pr-2 py-1.5">
                            <button
                              onClick={() => removeRow(r.id)}
                              className="h-7 w-7 grid place-items-center rounded-lg text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                              aria-label="Remove line"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {!visible.length && (
                      <tr>
                        <td colSpan={16} className="px-4 py-8 text-center text-[12.5px] text-slate-400">
                          No items{groupFilter ? ` in ${groupFilter}` : ''} — use Add Missing Item.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <datalist id="bs-groups">{itemGroups.map((g) => <option key={g} value={g} />)}</datalist>
              </div>
              {groupFilter && (
                <p className="text-[11.5px] text-slate-500 px-1">
                  Showing {visible.length} of {all.length} lines. Totals and posting always cover every selected line.
                </p>
              )}
              {needsReview.length > 0 && (
                <p className="text-[11.5px] text-rose-700 px-1">
                  {needsReview.length} selected line{needsReview.length === 1 ? ' needs' : 's need'} review — lines missing a
                  name, qty or price are left out when posting.
                </p>
              )}
            </>
          )}
        </div>

        {/* ------------------------------------------------------ footer --- */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#eef2f8] flex flex-wrap items-center gap-3">
          {rows ? (
            <>
              <button className="btn-primary h-11 px-5 text-[13.5px]" onClick={addMissingItem}>
                <Plus size={17} /> Add Missing Item
              </button>
              <button
                className="btn-ghost h-11 px-5 text-[13.5px] text-brand-600 disabled:opacity-50"
                disabled={busy || !file}
                title={!file ? 'Choose the bill image again to rescan a saved draft' : undefined}
                onClick={extract}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Rescan
              </button>
              <div className="flex-1" />
              {missing.length > 0 && (
                <p className="text-[11.5px] text-slate-500 w-full sm:w-auto sm:max-w-[220px] sm:text-right">
                  Needs {missing.join(', ')}
                </p>
              )}
              <button className="btn-ghost h-11 px-6 text-[13.5px] font-bold" onClick={saveDraft}>
                Save Draft
              </button>
              <button
                className="btn h-11 px-6 text-[13.5px] font-bold bg-white border border-rose-400 text-rose-600 hover:bg-rose-50"
                onClick={reject}
              >
                <Trash2 size={16} /> Reject Scan
              </button>
              <button className="btn-primary h-11 px-7 text-[13.5px] disabled:opacity-50" disabled={missing.length > 0} onClick={post}>
                Post Expense — {money(grandTotal, meta.currency)}
              </button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <button className="btn-ghost h-11 px-5" onClick={onClose}>Cancel</button>
              <button className="btn-primary h-11 px-6 disabled:opacity-50" disabled={!file || busy || !accountId} onClick={extract}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
                {busy ? 'Reading bill…' : 'Extract details'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Labeled({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[12.5px] font-medium text-slate-600 mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function SelectBox({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select className="input pr-9 appearance-none" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="absolute right-3 top-3 text-slate-600 pointer-events-none" />
    </div>
  )
}
