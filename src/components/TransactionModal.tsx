import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Info, Keyboard, Loader2, Plus, Sparkles, Tag, Wand2, X,
} from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'
import { BillScanModal } from '@/components/BillScanModal'
import { TransferModal, type TransferPreset } from '@/components/TransferModal'
import { useStore } from '@/store/useStore'
import { hasGemini, parseQuickEntry, suggestCategory } from '@/lib/gemini'
import {
  buildIndex, historyExamples, suggestFromHistory, validate, type Suggestion,
} from '@/lib/categorise'
import { TODAY, fmtDate } from '@/lib/format'
import { categoriesOf, findCategoryByName, statementFor, subcategoriesOf } from '@/lib/selectors'
import { depositAccounts, methodFor, paymentAccounts } from '@/lib/accounting'
import { styleFor, maskNumber } from '@/data/banks'
import {
  PACK_UNITS, WEIGHT_UNITS, type Account, type Currency, type PackUnit, type Person, type Transaction, type TxnKind,
  type TxnType, type WeightUnit,
} from '@/types'

/** Used only until the user creates categories of their own. */
const FALLBACK_INCOME = ['Salary', 'Business Income', 'Investment', 'Other Income']
const FALLBACK_EXPENSE = [
  'Groceries', 'Home / Rent', 'Utilities', 'Transport', 'Health', 'Restaurants',
  'Shopping', 'Family Support', 'Personal', 'Subscriptions', 'Education', 'Loan Payment', 'Other',
]
const DEFAULT_PEOPLE = ['Me', 'Family', 'Others']

export function TransactionModal({
  open,
  onClose,
  type,
  editing,
}: {
  open: boolean
  onClose: () => void
  type: TxnType
  editing?: Transaction | null
}) {
  const {
    accounts, people, categories, subcategories, transactions, settings, addTransaction, updateTransaction, updateSettings,
  } = useStore()
  const [scan, setScan] = useState(false)
  /** Repayments and borrowing are transfers, not transactions — hand off to that form. */
  const [transferPreset, setTransferPreset] = useState<TransferPreset | null>(null)
  const [kind, setKind] = useState<TxnKind>('normal')

  // ---- natural-language entry
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickText, setQuickText] = useState('')
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickError, setQuickError] = useState<string | null>(null)

  // ---- category suggestion
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [dismissed, setDismissed] = useState(false)
  /** Once the category is chosen by hand, stop moving it underneath them. */
  const touched = useRef(false)

  const isIncome = type === 'income'
  const cats = useMemo(() => categoriesOf(categories, type), [categories, type])
  const catNames = cats.length ? cats.map((c) => c.name) : isIncome ? FALLBACK_INCOME : FALLBACK_EXPENSE

  // Income can only land in a bank or cash account; an expense can also be
  // charged to a card. Never the generic account list — see lib/accounting.ts.
  const eligibleAccounts = useMemo(
    () => (isIncome ? depositAccounts(accounts) : paymentAccounts(accounts)),
    [accounts, isIncome],
  )
  // Starred accounts only (Accounts page) — falls back to every eligible account when none are starred.
  const quickPickIds = settings.extra?.quickPickAccountIds ?? []
  const pickerAccounts = useMemo(() => {
    const starred = quickPickIds.length ? eligibleAccounts.filter((a) => quickPickIds.includes(a.id)) : []
    return starred.length ? starred : eligibleAccounts
  }, [eligibleAccounts, quickPickIds])

  const blank = {
    description: '',
    amount: '',
    date: TODAY,
    category: catNames[0] ?? '',
    subcategory: '',
    accountId: pickerAccounts[0]?.id ?? '',
    currency: 'AED' as Currency,
    person: people[0]?.name ?? 'Me',
    store: '',
    brand: '',
    qty: '',
    packSize: '',
    packUnit: 'g' as PackUnit,
    refundOf: '',
    weight: '',
    weightUnit: 'kg' as WeightUnit,
    notes: '',
  }
  const [form, setForm] = useState(blank)

  // What the carousel actually shows: the starred set, plus whatever is already
  // selected (e.g. editing a transaction on an account that isn't starred).
  const displayAccounts = useMemo(() => {
    if (pickerAccounts.some((a) => a.id === form.accountId)) return pickerAccounts
    const selected = eligibleAccounts.find((a) => a.id === form.accountId)
    return selected ? [selected, ...pickerAccounts] : pickerAccounts
  }, [pickerAccounts, eligibleAccounts, form.accountId])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        description: editing.description,
        amount: String(editing.amount),
        date: editing.date,
        category: editing.category,
        subcategory: editing.subcategory ?? '',
        accountId: editing.accountId,
        currency: editing.currency,
        person: editing.person ?? DEFAULT_PEOPLE[0],
        store: editing.store ?? '',
        brand: editing.brand ?? '',
        qty: editing.qty ? String(editing.qty) : '',
        packSize: editing.packSize ? String(editing.packSize) : '',
        packUnit: editing.packUnit ?? 'g',
        refundOf: editing.refundOf ?? '',
        weight: editing.weight ? String(editing.weight) : '',
        weightUnit: editing.weightUnit ?? 'kg',
        notes: editing.notes ?? '',
      })
    } else {
      setForm({ ...blank, category: catNames[0] ?? '', accountId: pickerAccounts[0]?.id ?? '' })
    }
    setKind(editing?.kind ?? 'normal')
    setTransferPreset(null)
    touched.current = Boolean(editing)
    setDismissed(false)
    setSuggestion(null)
    setQuickOpen(false)
    setQuickText('')
    setQuickError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, type])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  /** Changing category invalidates whatever sub-category was chosen. */
  const setCategory = (name: string) => setForm((f) => ({ ...f, category: name, subcategory: '' }))

  const pickCategory = (name: string) => {
    touched.current = true
    setCategory(name)
  }

  const activeCat = findCategoryByName(categories, type, form.category)
  const subs = useMemo(() => subcategoriesOf(subcategories, activeCat?.id), [subcategories, activeCat])

  // What this person has categorised before, used to guess without a network call.
  const index = useMemo(() => buildIndex(transactions, type), [transactions, type])
  const optionsForModel = useMemo(
    () =>
      (cats.length ? cats : catNames.map((n) => ({ id: n, name: n }))).map((c) => ({
        name: c.name,
        subcategories: subcategoriesOf(subcategories, 'id' in c ? (c as { id: string }).id : undefined).map((x) => x.name),
      })),
    [cats, catNames, subcategories],
  )

  /**
   * Suggest a category from the description. History answers instantly and for
   * free; the model is only asked when nothing similar has been recorded, and
   * only after a longer pause so typing does not spend quota.
   */
  useEffect(() => {
    if (!open) return
    const description = form.description.trim()
    if (description.length < 3) {
      setSuggestion(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const local = validate(
      suggestFromHistory(description, index, form.store),
      categories, subcategories, type, catNames,
    )
    if (local) {
      setSuggestion(local)
      return () => { cancelled = true }
    }

    setSuggestion(null)
    if (!hasGemini) return () => { cancelled = true }

    const timer = setTimeout(async () => {
      const guess = await suggestCategory(
        description, optionsForModel, historyExamples(index), controller.signal,
      )
      if (cancelled || !guess || guess.confidence < 0.5) return
      setSuggestion(
        validate(
          { category: guess.category, subcategory: guess.subcategory, confidence: guess.confidence, source: 'token' },
          categories, subcategories, type, catNames,
        ) ?? null,
      )
    }, 900)

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.description, form.store, index, type])

  /** Apply a confident suggestion only while the category is untouched. */
  useEffect(() => {
    if (!suggestion || touched.current || dismissed) return
    if (suggestion.confidence < 0.75) return
    setForm((f) =>
      f.category === suggestion.category && (f.subcategory || !suggestion.subcategory)
        ? f
        : { ...f, category: suggestion.category, subcategory: suggestion.subcategory ?? '' },
    )
  }, [suggestion, dismissed])

  const runQuick = async () => {
    const text = quickText.trim()
    if (!text || quickBusy) return
    setQuickBusy(true)
    setQuickError(null)
    try {
      const parsed = await parseQuickEntry(text, {
        today: TODAY,
        currency: settings.baseCurrency,
        categories: optionsForModel,
        people: people.length ? people.map((p) => p.name) : DEFAULT_PEOPLE,
      })
      touched.current = Boolean(parsed.category)
      setForm((f) => ({
        ...f,
        description: parsed.description || f.description,
        amount: String(parsed.amount),
        date: parsed.date || f.date,
        category: parsed.category || f.category,
        subcategory: parsed.subcategory ?? '',
        currency: (parsed.currency as Currency) || f.currency,
        store: parsed.store ?? f.store,
        person: parsed.person || f.person,
      }))
      setQuickOpen(false)
      setQuickText('')
    } catch (e) {
      setQuickError(e instanceof Error ? e.message : String(e))
    }
    setQuickBusy(false)
  }

  const account = accounts.find((a) => a.id === form.accountId)
  const usingCard = !isIncome && account?.type === 'card'
  const isRefund = kind === 'refund'
  // Past purchases a refund could reverse, newest first.
  const refundable = useMemo(
    () => transactions.filter((t) => t.type === 'expense' && (t.kind ?? 'normal') === 'normal').slice(0, 40),
    [transactions],
  )
  const cycle =
    usingCard && account?.statementDay && account?.dueDay
      ? statementFor(form.date, account.statementDay, account.dueDay)
      : null

  // Tags you have created by hand, kept apart from history so an item bought
  // only once still has a shortcut next time.
  const customTags = settings.extra?.customTags ?? []
  const addCustomTag = (name: string) => {
    if (!customTags.includes(name)) updateSettings({ extra: { ...settings.extra, customTags: [...customTags, name] } })
    setForm((f) => ({ ...f, description: name }))
  }

  const amountValid = Number(form.amount) > 0
  const canSave = form.description.trim().length > 0 && amountValid && Boolean(form.accountId)

  const submit = () => {
    if (!canSave || !account) return
    const payload = {
      // A refund is money coming back: it credits the account but reverses spending.
      type: (isRefund ? 'income' : type) as TxnType,
      kind: kind === 'normal' ? undefined : kind,
      date: form.date,
      description: form.description.trim(),
      category: form.category,
      subcategory: form.subcategory || undefined,
      accountId: form.accountId,
      amount: Number(form.amount),
      currency: form.currency,
      person: form.person,
      // Derived from the chosen account, never a separate choice — see the
      // FINAL ACCOUNTING RULE: the selected account IS the payment source.
      method: methodFor(account.type),
      store: form.store.trim() || undefined,
      brand: form.brand.trim() || undefined,
      qty: Number(form.qty) > 0 ? Number(form.qty) : undefined,
      packSize: Number(form.packSize) > 0 ? Number(form.packSize) : undefined,
      packUnit: Number(form.packSize) > 0 ? form.packUnit : undefined,
      refundOf: isRefund && form.refundOf ? form.refundOf : undefined,
      weight: Number(form.weight) > 0 ? Number(form.weight) : undefined,
      weightUnit: Number(form.weight) > 0 ? form.weightUnit : undefined,
      notes: form.notes.trim() || undefined,
    }
    if (editing) updateTransaction(editing.id, payload)
    else addTransaction(payload)
    onClose()
  }

  return (
    <>
      <Modal
        open={open && !scan && transferPreset === null}
        onClose={onClose}
        title={`${editing ? 'Edit' : 'Add'} ${isRefund ? 'Refund' : kind === 'asset_purchase' ? 'Asset Purchase' : isIncome ? 'Income' : 'Expense'}`}
        subtitle={isRefund ? 'Money back for an earlier purchase' : isIncome ? 'Record money coming in' : 'Record money going out'}
        width="max-w-2xl"
        footer={
          <>
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className={`${isIncome || isRefund ? 'btn-green' : 'btn-rose'} disabled:opacity-50`}
              disabled={!canSave}
              onClick={submit}
            >
              {editing ? 'Save Changes' : `Add ${isRefund ? 'Refund' : isIncome ? 'Income' : 'Expense'}`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Scan or describe — only when a key is configured. */}
          {!editing && hasGemini && (
            <div className="rounded-xl bg-brand-50/70 border border-brand-100 px-3 py-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {!isIncome && (
                  <button
                    onClick={() => setScan(true)}
                    className="btn bg-white text-brand-700 border border-brand-200 hover:bg-brand-50 h-9"
                  >
                    <Camera size={15} /> Scan with AI
                  </button>
                )}
                <button
                  onClick={() => {
                    setQuickOpen((v) => !v)
                    setQuickError(null)
                  }}
                  className={`btn h-9 border ${
                    quickOpen
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50'
                  }`}
                >
                  <Keyboard size={15} /> Type it
                </button>
                {!quickOpen && (
                  <p className="text-[12px] text-slate-600 flex-1 min-w-45">
                    {isIncome
                      ? 'Describe it in a sentence and we’ll fill the form.'
                      : 'Photograph the receipt, or just describe it in a sentence.'}
                  </p>
                )}
              </div>

              {quickOpen && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 bg-white"
                      value={quickText}
                      onChange={(e) => setQuickText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runQuick()}
                      placeholder={
                        isIncome
                          ? 'e.g. salary 8500 today'
                          : 'e.g. 240 groceries at Carrefour yesterday'
                      }
                      autoFocus
                    />
                    <button className="btn-primary disabled:opacity-50" disabled={!quickText.trim() || quickBusy} onClick={runQuick}>
                      {quickBusy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                      {quickBusy ? 'Reading…' : 'Fill'}
                    </button>
                  </div>
                  {quickError && <p className="text-[11.5px] text-rose-600">{quickError}</p>}
                  <p className="text-[11px] text-slate-500">
                    Include the amount. Dates like “yesterday” and “last Friday” are understood, and everything
                    stays editable below.
                  </p>
                </div>
              )}
            </div>
          )}

          <Field label="Person">
            <PersonPicker people={people} fallback={DEFAULT_PEOPLE} value={form.person} onChange={(n) => set('person', n)} />
          </Field>

          <Field label="Description">
            <div className="relative">
              <input
                className="input pr-9"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder={isIncome ? 'e.g. Salary, Restaurant sales' : 'e.g. Grocery purchase'}
                autoFocus
              />
              {form.description && (
                <button
                  onClick={() => set('description', '')}
                  aria-label="Clear description"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {isIncome ? 'e.g. Monthly salary, Catering order, Refund' : 'e.g. Grocery purchase, Carrefour, Lulu'}
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Currency">
              <select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                <option>AED</option>
                <option>INR</option>
                <option>USD</option>
              </select>
            </Field>

            <Field label="Date">
              <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Category">
              <select className="input" value={form.category} onChange={(e) => pickCategory(e.target.value)}>
                {catNames.length === 0 && <option value="">No categories yet</option>}
                {cats.length
                  ? cats.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.icon} {c.name}
                      </option>
                    ))
                  : catNames.map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>

            {suggestion && suggestion.category !== form.category && !dismissed && (
              <div className="col-span-2 -mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                <Sparkles size={13} className="text-brand-500 shrink-0" />
                <span className="text-slate-600">
                  Suggested: <b className="text-slate-800">{suggestion.category}</b>
                  {suggestion.subcategory ? ` · ${suggestion.subcategory}` : ''}
                  {suggestion.basis ? (
                    <span className="text-slate-400"> — like “{suggestion.basis}”</span>
                  ) : null}
                </span>
                <button
                  onClick={() => {
                    touched.current = true
                    setForm((f) => ({
                      ...f,
                      category: suggestion.category,
                      subcategory: suggestion.subcategory ?? '',
                    }))
                  }}
                  className="chip bg-brand-100 text-brand-700 hover:bg-brand-200 cursor-pointer"
                >
                  Use
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Dismiss suggestion"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <Field label="Sub-category" className="col-span-2">
              <select
                className="input disabled:bg-slate-50 disabled:text-slate-400"
                value={form.subcategory}
                disabled={subs.length === 0}
                onChange={(e) => set('subcategory', e.target.value)}
              >
                <option value="">
                  {subs.length
                    ? `All of ${form.category} — pick one (optional)`
                    : activeCat
                      ? `No sub-categories under ${form.category}`
                      : 'Create this category to add sub-categories'}
                </option>
                {subs.map((sc) => (
                  <option key={sc.id} value={sc.name}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </Field>

            {!isIncome && (
              <Field label="Tag (optional)" className="col-span-2">
                <TagPicker
                  customTags={customTags}
                  onPickCustom={(name) => setForm((f) => ({ ...f, description: name }))}
                  onCreate={addCustomTag}
                />
              </Field>
            )}

            <Field label={isIncome ? 'Deposit to' : 'Paid from'} className="col-span-2">
              {eligibleAccounts.length === 0 ? (
                <p className="text-[12.5px] text-slate-400 rounded-xl bg-slate-50 px-3.5 py-2.5">
                  {isIncome ? 'No bank or cash account yet — add one first.' : 'No accounts yet — add one first.'}
                </p>
              ) : (
                <AccountPicker accounts={displayAccounts} value={form.accountId} onChange={(id) => set('accountId', id)} />
              )}
              <p className="text-[11px] text-slate-400 mt-1">
                {isIncome
                  ? 'This account\'s balance increases by the amount above.'
                  : account?.type === 'card'
                    ? 'A card purchase increases what you owe. It is counted as spending once — paying the card later is a repayment, not a second expense.'
                    : account?.type === 'loan'
                      ? 'Spending borrowed money: it raises the loan\'s outstanding balance and counts as an expense once.'
                      : 'This account\'s balance goes down by the amount above.'}
              </p>
            </Field>

            {/* What kind of movement is this? Options follow the chosen account. */}
            {!isIncome && account && !editing && (
              <div className="col-span-2 -mt-1 flex flex-wrap items-center gap-2">
                {(account.type === 'card'
                  ? [
                      { k: 'normal', label: 'Purchase' },
                      { k: 'refund', label: 'Refund' },
                      { k: 'repay', label: 'Repayment' },
                    ]
                  : account.type === 'loan'
                    ? [
                        { k: 'normal', label: 'Loan-funded expense' },
                        { k: 'repay', label: 'Repayment / EMI' },
                        { k: 'borrow', label: 'Borrow money' },
                      ]
                    : [
                        { k: 'normal', label: 'Expense' },
                        { k: 'asset_purchase', label: 'Asset purchase' },
                      ]
                ).map((o) => {
                  const active = o.k === 'repay' || o.k === 'borrow' ? false : kind === o.k
                  return (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => {
                        if (o.k === 'repay')
                          setTransferPreset(
                            account.type === 'card'
                              ? { toAccountId: account.id, purpose: 'Credit card payment' }
                              : { toAccountId: account.id, purpose: 'Loan payment' },
                          )
                        else if (o.k === 'borrow') setTransferPreset({ fromAccountId: account.id, purpose: 'Loan drawdown' })
                        else setKind(o.k as TxnKind)
                      }}
                      className={`chip cursor-pointer transition ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {o.label}
                    </button>
                  )
                })}
                {kind === 'asset_purchase' && (
                  <span className="text-[11px] text-slate-500 basis-full">
                    Cash leaves the account, but this is kept as an asset — it is not counted as a household expense.
                  </span>
                )}
              </div>
            )}

            {isRefund && (
              <Field label="Refund of (optional)" className="col-span-2">
                <select className="input" value={form.refundOf} onChange={(e) => set('refundOf', e.target.value)}>
                  <option value="">Not linked to a specific purchase</option>
                  {refundable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {fmtDate(t.date)} · {t.description} · {t.amount} {t.currency}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  The money is credited back to this account and the spending in this category is reduced — it is
                  not counted as income.
                </p>
              </Field>
            )}
          </div>

          {/* Credit card statement context */}
          {usingCard && (
            <div className="rounded-xl bg-brand-50/60 border border-brand-100 p-3.5 space-y-3">
              <p className="text-[12px] font-bold text-slate-700">Credit Card</p>

              {cycle ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-white px-3 py-2.5">
                      <p className="text-[10.5px] text-slate-400 mb-1">Statement Period</p>
                      <p className="text-[12.5px] font-bold text-slate-800 inline-flex items-center gap-1.5">
                        <CalendarDays size={13} className="text-slate-400" />
                        {fmtDate(cycle.start).slice(0, 6)} – {fmtDate(cycle.end)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2.5">
                      <p className="text-[10.5px] text-slate-400 mb-1">Payment Due</p>
                      <p className="text-[12.5px] font-bold text-slate-800 inline-flex items-center gap-1.5">
                        <CalendarDays size={13} className="text-slate-400" />
                        {fmtDate(cycle.due)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11.5px] text-slate-600 flex items-start gap-1.5">
                    <Info size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    This expense appears on the statement closing {fmtDate(cycle.end)} and is due on{' '}
                    {fmtDate(cycle.due)}.
                  </p>
                </>
              ) : (
                <p className="text-[11.5px] text-slate-600 flex items-start gap-1.5">
                  <Info size={13} className="text-slate-400 mt-0.5 shrink-0" />
                  Set a statement day and due day on this card (Accounts → edit) to see its billing cycle.
                </p>
              )}
            </div>
          )}

          {!isIncome && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Store (optional)">
                <input
                  className="input"
                  value={form.store}
                  onChange={(e) => set('store', e.target.value)}
                  placeholder="e.g. Carrefour"
                />
              </Field>
              <Field label="Weight (optional)">
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.weight}
                    onChange={(e) => set('weight', e.target.value)}
                    placeholder="e.g. 10"
                  />
                  <select
                    className="input w-20"
                    value={form.weightUnit}
                    onChange={(e) => set('weightUnit', e.target.value)}
                  >
                    {WEIGHT_UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Brand (optional)">
                <input className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="e.g. Almarai" />
              </Field>
              <Field label="Quantity (optional)">
                <input className="input" type="number" min="0" step="0.01" value={form.qty} onChange={(e) => set('qty', e.target.value)} placeholder="e.g. 2" />
              </Field>
              <Field label="Pack size (optional)" className="col-span-2">
                <div className="flex gap-2">
                  <input className="input flex-1" type="number" min="0" step="0.001" value={form.packSize} onChange={(e) => set('packSize', e.target.value)} placeholder="e.g. 500" />
                  <select className="input w-24" value={form.packUnit} onChange={(e) => set('packUnit', e.target.value)}>
                    {PACK_UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Size of ONE pack. Used to compare prices per kg / litre / unit in the Price Tracker.
                </p>
              </Field>
            </div>
          )}

          <Field label="Notes (optional)">
            <input
              className="input"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Add a note…"
            />
          </Field>

          {categories.length === 0 && (
            <p className="text-[11.5px] text-slate-500 flex items-start gap-1.5">
              <Sparkles size={13} className="text-brand-500 mt-0.5 shrink-0" />
              These are the built-in categories. Create your own in Settings → Categories to add sub-categories.
            </p>
          )}
        </div>
      </Modal>

      <TransferModal
        open={transferPreset !== null}
        onClose={() => {
          setTransferPreset(null)
          onClose()
        }}
        preset={transferPreset}
      />

      <BillScanModal
        open={scan}
        onClose={() => {
          setScan(false)
          onClose()
        }}
        people={people.map((p) => p.name)}
        accounts={accounts}
        transactions={transactions}
      />
    </>
  )
}

/** Horizontal, scrollable strip of picker tiles with arrow buttons at each end. */
function ScrollRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollBy = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: 'smooth' })
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => scrollBy(-180)} className="shrink-0 h-8 w-8 grid place-items-center rounded-full border border-[#e2e8f0] text-slate-400 hover:bg-slate-50 hover:text-slate-600 cursor-pointer">
        <ChevronLeft size={15} />
      </button>
      <div ref={ref} className="flex-1 min-w-0 flex gap-2.5 overflow-x-auto scroll-thin scroll-smooth py-1">
        {children}
      </div>
      <button type="button" onClick={() => scrollBy(180)} className="shrink-0 h-8 w-8 grid place-items-center rounded-full border border-[#e2e8f0] text-slate-400 hover:bg-slate-50 hover:text-slate-600 cursor-pointer">
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

/** Visual "who is this for" picker — real people from the People library, with their own photos. */
function PersonPicker({
  people, fallback, value, onChange,
}: {
  people: Person[]
  fallback: string[]
  value: string
  onChange: (name: string) => void
}) {
  const items = people.length ? people : fallback.map((n) => ({ id: n, name: n, color: '#94a3b8', photo: undefined }) as Pick<Person, 'id' | 'name' | 'color' | 'photo'>)
  return (
    <ScrollRow>
      {items.map((p) => {
        const active = value === p.name
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.name)}
            className="shrink-0 flex flex-col items-center gap-1 w-16 cursor-pointer group"
          >
            <span className="relative">
              {p.photo ? (
                <img src={p.photo} alt={p.name} className={`h-12 w-12 rounded-full object-cover ring-2 transition ${active ? 'ring-brand-600' : 'ring-transparent group-hover:ring-brand-200'}`} />
              ) : (
                <span
                  className={`h-12 w-12 rounded-full grid place-items-center text-white font-bold text-[15px] ring-2 transition ${active ? 'ring-brand-600' : 'ring-transparent group-hover:ring-brand-200'}`}
                  style={{ background: p.color }}
                >
                  {p.name.charAt(0).toUpperCase()}
                </span>
              )}
              {active && (
                <span className="absolute -bottom-0.5 -right-0.5 h-4.5 w-4.5 rounded-full bg-brand-600 text-white grid place-items-center ring-2 ring-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={`text-[11px] font-semibold truncate w-full text-center ${active ? 'text-brand-700' : 'text-slate-600'}`}>{p.name}</span>
          </button>
        )
      })}
    </ScrollRow>
  )
}

/** Visual "paid from / deposit to" picker — every eligible account drawn as a small bank-styled tile. */
function AccountPicker({
  accounts, value, onChange,
}: {
  accounts: Account[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <ScrollRow>
      {accounts.map((a) => {
        const active = value === a.id
        const style = styleFor(a)
        const number = maskNumber(a.details, a.type === 'card' ? 'card' : 'account')
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a.id)}
            className={`shrink-0 w-36 rounded-xl p-2.5 text-left cursor-pointer transition ring-2 ${active ? 'ring-brand-600' : 'ring-transparent hover:ring-brand-200'}`}
            style={{ background: style.bg, color: style.fg }}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-[12px] font-black tracking-tight leading-tight truncate">{style.mark || a.name}</span>
              {active && (
                <span className="shrink-0 h-4 w-4 rounded-full bg-white/90 grid place-items-center">
                  <Check size={10} strokeWidth={3} className="text-brand-600" />
                </span>
              )}
            </div>
            <p className="text-[10px] opacity-80 truncate mt-0.5">{a.name}</p>
            {number && <p className="text-[10.5px] font-mono opacity-90 mt-1.5 tracking-wide">{number}</p>}
          </button>
        )
      })}
    </ScrollRow>
  )
}

/** Quick-fill "tag" picks — real items bought before in this category, never fabricated photos. */
function TagPicker({
  customTags, onPickCustom, onCreate,
}: {
  customTags: string[]
  onPickCustom: (name: string) => void
  onCreate: (name: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')

  const submit = () => {
    const name = text.trim()
    if (name) onCreate(name)
    setText('')
    setAdding(false)
  }

  return (
    <ScrollRow>
      {customTags.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onPickCustom(name)}
          className="shrink-0 w-20 flex flex-col items-center gap-1 rounded-xl border border-[#eef2f8] p-2 hover:border-brand-200 hover:bg-brand-50/30 transition cursor-pointer"
        >
          <span className="h-9 w-9 rounded-lg bg-violet-50 grid place-items-center text-[16px] shrink-0">
            <Tag size={15} className="text-violet-400" />
          </span>
          <span className="text-[10.5px] font-semibold text-slate-700 text-center leading-tight line-clamp-2">{name}</span>
        </button>
      ))}
      {adding ? (
        <div className="shrink-0 w-28 flex items-center gap-1">
          <input
            autoFocus
            className="input h-9 text-[11px] px-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') { setText(''); setAdding(false) }
            }}
            placeholder="Tag name"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="shrink-0 w-20 flex flex-col items-center gap-1 rounded-xl border border-dashed border-brand-300 p-2 hover:bg-brand-50/40 transition cursor-pointer"
        >
          <span className="h-9 w-9 rounded-lg bg-brand-50 grid place-items-center text-brand-600 shrink-0">
            <Plus size={16} />
          </span>
          <span className="text-[10.5px] font-semibold text-brand-700 text-center leading-tight">Add Tag</span>
        </button>
      )}
    </ScrollRow>
  )
}
