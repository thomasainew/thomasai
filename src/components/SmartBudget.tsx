import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CalendarClock, Plus, RotateCcw, Sparkles, Trash2, Wallet, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Card, CardHead, Empty, StatCard } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { PayModal } from '@/components/PaymentSchedule'
import { addMonths, fmtDate, money, monthLabel, toBase, TODAY, uid } from '@/lib/format'
import { addMonthsOptions, totals } from '@/lib/selectors'
import { buildMonthItems, summarizeBudget, type MonthItem } from '@/lib/smartBudget'
import type { Currency } from '@/types'

const SOURCE_LABEL: Record<MonthItem['sourceKind'], string> = {
  loan: 'Loan EMI', bill: 'Recurring bill', schedule: 'Payment schedule', document: 'Document expiry', note: 'Note / follow-up', manual: 'Added by you',
}
const TONE = { Suggested: 'violet', Planned: 'blue', Paid: 'green', Overdue: 'red', Dismissed: 'slate' } as const

/**
 * A month's budget, built from your loans, bills, payment schedules, documents
 * and notes. Confirmed payments are included automatically; things only
 * detected are Suggested until you approve them. "Deduct" here means only
 * "count it in this budget" — nothing on this page can move money.
 */
export function SmartBudget() {
  const { loans, bills, documents, notes, budgetItems, transactions, people, accounts, settings,
    saveBudgetItem, updateNote, payInstallment, payBudgetItem, removeBudgetItem } = useStore()
  const [month, setMonth] = useState(TODAY.slice(0, 7))
  const [edit, setEdit] = useState<MonthItem | null>(null)
  const [pay, setPay] = useState<MonthItem | null>(null)
  const [manual, setManual] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  const ctx = { today: TODAY, loans, bills, documents, notes, stored: budgetItems, txns: transactions, people: people.map((p) => p.name), accounts }
  const items = useMemo(() => buildMonthItems({ ...ctx, month }), [month, loans, bills, documents, notes, budgetItems, transactions, people, accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Expected income: the target you set, else what you actually earned on average lately.
  const expected = useMemo(() => {
    if (settings.monthlyIncomeTarget > 0) return { value: toBase(settings.monthlyIncomeTarget, settings.baseCurrency), source: 'your monthly income target' }
    const past = [1, 2, 3].map((i) => totals(transactions, addMonths(month, -i)).income).filter((v) => v > 0)
    return past.length ? { value: past.reduce((a, b) => a + b, 0) / past.length, source: `your average income over the last ${past.length} month${past.length > 1 ? 's' : ''}` } : { value: 0, source: 'nothing recorded yet — set an income target in Settings' }
  }, [settings, transactions, month])

  const actual = totals(transactions, month).expenses
  const sum = useMemo(() => summarizeBudget(items, { expectedIncome: expected.value, actualSpending: actual, toBase }), [items, expected.value, actual])

  const suggested = items.filter((i) => i.status === 'Suggested')
  const plan = items.filter((i) => i.status !== 'Suggested' && i.status !== 'Dismissed')
  const dismissed = items.filter((i) => i.status === 'Dismissed')

  // Upcoming payments & renewals over the next 30 days, across this and next month.
  const upcoming = useMemo(() => {
    const cur = TODAY.slice(0, 7)
    const all = [cur, addMonths(cur, 1)].flatMap((m) => buildMonthItems({ ...ctx, month: m }))
    const limit = new Date(TODAY + 'T00:00:00').getTime() + 30 * 86400000
    return all
      .filter((i) => i.status !== 'Paid' && i.status !== 'Dismissed' && i.dueDate && new Date(i.dueDate + 'T00:00:00').getTime() <= limit)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  }, [loans, bills, documents, notes, budgetItems, transactions]) // eslint-disable-line react-hooks/exhaustive-deps

  const base = (i: MonthItem) => ({ name: i.name, category: i.category, currency: i.currency, sourceKind: i.sourceKind, sourceId: i.sourceId, dueDate: i.dueDate, person: i.person, amount: i.amount })
  const decide = (i: MonthItem, patch: Parameters<typeof saveBudgetItem>[2]) => saveBudgetItem(i.month, i.sourceKey, patch, base(i))

  const approve = (i: MonthItem, amount?: number) => {
    const a = amount ?? i.amount
    if (a === undefined || !(a > 0)) return setEdit(i) // never invent one — ask
    decide(i, { status: 'Planned', amount: a })
  }

  const doPay = (i: MonthItem, p: { accountId: string; date: string; amount: number }) => {
    if (i.sourceKind === 'schedule' && i.sourceId) {
      const instId = i.sourceKey.split(':')[2]
      payInstallment(i.sourceId, instId, p)
    } else payBudgetItem({ month: i.month, sourceKey: i.sourceKey, name: i.name, category: i.category, currency: i.currency, person: i.person, sourceKind: i.sourceKind, sourceId: i.sourceId }, p)
  }

  const Row = ({ i }: { i: MonthItem }) => {
    const [amt, setAmt] = useState('')
    const overdue = i.status === 'Overdue'
    return (
      <tr className={`row-hover ${i.status === 'Dismissed' ? 'opacity-60' : ''}`}>
        <td className="td font-semibold text-slate-800">
          {i.name}
          <span className="block text-[11px] font-normal text-slate-400">{SOURCE_LABEL[i.sourceKind]} · {i.reason}</span>
        </td>
        <td className="td text-slate-500">{i.category}</td>
        <td className="td text-right tabular-nums">
          {i.amount !== undefined ? (
            <><b>{money(i.amount, i.currency)}</b>{i.edited && <span className="block text-[10px] text-amber-600">edited</span>}</>
          ) : i.status === 'Suggested' ? (
            <div className="flex items-center gap-1 justify-end">
              <input className="input h-8 w-24 text-right text-[12px]" type="number" min="0" placeholder="amount?" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </div>
          ) : <button onClick={() => setEdit(i)} className="text-[11.5px] font-semibold text-rose-600 underline cursor-pointer">Enter amount</button>}
        </td>
        <td className="td text-right tabular-nums text-slate-500">{i.actual !== undefined ? money(i.actual, i.currency) : '—'}</td>
        <td className="td whitespace-nowrap text-slate-500">{i.dueDate ? fmtDate(i.dueDate) : 'No date'}{overdue && <span className="block text-[10px] text-rose-500">overdue</span>}</td>
        <td className="td text-slate-500">{i.person ?? '—'}</td>
        <td className="td"><Badge tone={TONE[i.status]}>{i.status}</Badge></td>
        <td className="td">
          <div className="flex justify-end gap-1 flex-wrap">
            {i.status === 'Suggested' && (
              <button onClick={() => approve(i, amt ? Number(amt) : undefined)} className="h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-1"><Check size={11} /> Approve</button>
            )}
            {(i.status === 'Planned' || i.status === 'Overdue') && i.amount !== undefined && (
              <button onClick={() => setPay(i)} className="h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-1"><Wallet size={11} /> Paid</button>
            )}
            {i.status !== 'Dismissed' && <button onClick={() => setEdit(i)} className="h-7 px-2 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer">Edit</button>}
            {i.status === 'Dismissed' ? (
              <button onClick={() => decide(i, { status: i.sourceKind === 'document' || i.sourceKind === 'note' ? 'Suggested' : 'Planned' })} className="h-7 px-2 rounded-lg text-[11px] font-semibold text-brand-600 hover:bg-brand-50 cursor-pointer inline-flex items-center gap-1"><RotateCcw size={11} /> Restore</button>
            ) : i.status !== 'Paid' && (
              <button onClick={() => (i.sourceKind === 'manual' && i.stored ? removeBudgetItem(i.stored.id) : decide(i, { status: 'Dismissed' }))} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer" title={i.sourceKind === 'manual' ? 'Remove' : 'Dismiss'}>
                {i.sourceKind === 'manual' ? <Trash2 size={13} /> : <X size={13} />}
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const Table = ({ rows, empty }: { rows: MonthItem[]; empty: string }) => (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[980px]">
        <thead className="bg-slate-50/70">
          <tr><th className="th">Item</th><th className="th">Category</th><th className="th text-right">Planned</th><th className="th text-right">Actual paid</th><th className="th">Due</th><th className="th">Person</th><th className="th">Status</th><th className="th text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">{rows.map((i) => <Row key={i.key} i={i} />)}</tbody>
      </table>
      {rows.length === 0 && <Empty text={empty} />}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-[13px] text-slate-600 max-w-2xl">
            Built from your loans, recurring bills, payment schedules, documents and notes. Confirmed payments are
            included automatically; detected ones wait for your approval. Amounts are never guessed.
          </p>
        </div>
        <div className="flex gap-2">
          <select className="input h-10 w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            {[...addMonthsOptions(12).reverse(), addMonths(TODAY.slice(0, 7), 1), addMonths(TODAY.slice(0, 7), 2), addMonths(TODAY.slice(0, 7), 3)].filter((m, i, a) => a.indexOf(m) === i).sort().map((m) => (
              <option key={m} value={m}>{monthLabel(m)} {m.slice(0, 4)}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={() => setManual(true)}><Plus size={15} /> Add item</button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-6">
        <StatCard label="Expected Income" value={money(sum.expectedIncome)} icon={<Wallet size={20} />} tint="#10b981" footer={<span className="text-slate-400 text-[10px] leading-tight block">From {expected.source}</span>} />
        <StatCard label="Planned Expenses" value={money(sum.plannedExpenses)} icon={<CalendarClock size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">{sum.counts.Planned + sum.counts.Paid + sum.counts.Overdue} approved items</span>} />
        <StatCard label="Actual Spending" value={money(sum.actualSpending)} icon={<Wallet size={20} />} tint="#f43f5e" footer={<span className="text-slate-400">All expenses this month · {money(sum.paidOnPlan)} on plan</span>} />
        <StatCard label="Unpaid Commitments" value={money(sum.unpaidCommitments)} icon={<AlertTriangle size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">{sum.counts.Overdue} overdue</span>} />
        <StatCard label="Remaining Budget" value={money(sum.remaining)} icon={<Wallet size={20} />} tint="#8b5cf6" footer={<span className="text-slate-400">Income − spending so far</span>} />
        <StatCard label={sum.projected >= 0 ? 'Projected Surplus' : 'Projected Shortfall'} value={money(sum.projected)} icon={<Sparkles size={20} />} tint={sum.projected >= 0 ? '#10b981' : '#ef4444'} footer={<span className="text-slate-400">After unpaid commitments</span>} />
      </div>

      {(sum.needsInput > 0 || sum.pendingSuggestions > 0 || sum.counts.Suggested > 0) && (
        <div className="card px-5 py-3.5 bg-violet-50/60 border-violet-100 text-[12.5px] text-violet-900">
          <b>{sum.counts.Suggested}</b> suggestion{sum.counts.Suggested === 1 ? '' : 's'} waiting for you
          {sum.needsInput > 0 && <> · <b>{sum.needsInput}</b> need{sum.needsInput === 1 ? 's' : ''} an amount from you (left blank — never guessed)</>}
          {sum.pendingSuggestions > 0 && <> · {money(sum.pendingSuggestions)} not yet in the plan</>}
        </div>
      )}

      {suggested.length > 0 && (
        <Card>
          <CardHead title="Suggested — approve or dismiss" sub="Detected from your notes and document expiry dates" right={<Sparkles size={16} className="text-violet-500" />} />
          <Table rows={suggested} empty="" />
        </Card>
      )}

      <Card>
        <CardHead title={`${monthLabel(month)} ${month.slice(0, 4)} plan`} sub="Planned amounts are kept apart from what was actually paid" />
        <Table rows={plan} empty="Nothing planned for this month yet — add a loan, bill, payment schedule or an item of your own." />
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHead title="Upcoming payments & renewals" sub="Next 30 days" />
          <div className="px-5 pb-5 space-y-2">
            {upcoming.length === 0 && <p className="text-[12px] text-slate-400">Nothing due in the next 30 days.</p>}
            {upcoming.map((i) => {
              const d = Math.round((new Date(i.dueDate! + 'T00:00:00').getTime() - new Date(TODAY + 'T00:00:00').getTime()) / 86400000)
              return (
                <div key={i.key} className="flex items-center gap-3 rounded-xl border border-[#eef2f8] px-3.5 py-2.5">
                  <span className={`text-[11px] font-bold w-16 shrink-0 ${d < 0 ? 'text-rose-600' : d <= 7 ? 'text-amber-600' : 'text-slate-400'}`}>{d < 0 ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}</span>
                  <div className="flex-1 min-w-0"><p className="text-[12.5px] font-semibold text-slate-700 truncate">{i.name}</p><p className="text-[10.5px] text-slate-400">{fmtDate(i.dueDate!)} · {SOURCE_LABEL[i.sourceKind]}{i.person ? ` · ${i.person}` : ''}</p></div>
                  <span className="text-[12.5px] font-bold tabular-nums">{i.amount !== undefined ? money(i.amount, i.currency) : 'amount?'}</span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card>
          <CardHead title="How this is calculated" />
          <ul className="px-5 pb-5 text-[12px] text-slate-600 space-y-1.5 list-disc pl-9">
            <li><b>Loans</b> and <b>recurring bills</b> are included automatically in the month they fall due.</li>
            <li><b>Payment schedules</b> add only the instalment due that month — never the whole fee.</li>
            <li><b>Documents</b> nearing expiry and <b>notes</b> that look like fees appear as suggestions with any amount found; if none is found you enter it.</li>
            <li>When you record a payment (or a matching transaction exists) the item turns <b>Paid</b> and the expense is counted once — the plan never adds a second copy.</li>
            <li>“Deduct” means counted in this budget only. No bank payment is ever made from here.</li>
          </ul>
        </Card>
      </div>

      {dismissed.length > 0 && (
        <div>
          <button onClick={() => setShowDismissed((v) => !v)} className="text-[12px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">{showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed item{dismissed.length === 1 ? '' : 's'}</button>
          {showDismissed && <Card className="mt-2"><Table rows={dismissed} empty="" /></Card>}
        </div>
      )}

      <ItemModal
        open={edit !== null || manual}
        onClose={() => { setEdit(null); setManual(false) }}
        item={edit}
        month={month}
        people={people.map((p) => p.name)}
        onSave={(v) => {
          if (edit) {
            if (edit.sourceKind === 'schedule' && edit.sourceId) {
              // Change the schedule itself, so the schedule and the budget stay one record.
              const instId = edit.sourceKey.split(':')[2]
              const note = notes.find((n) => n.id === edit.sourceId)
              if (note) updateNote(note.id, { schedule: (note.schedule ?? []).map((x) => (x.id === instId ? { ...x, amount: v.amount ?? x.amount, dueDate: v.dueDate || x.dueDate } : x)) })
            } else decide(edit, { name: v.name, category: v.category, amount: v.amount, currency: v.currency, dueDate: v.dueDate || undefined, person: v.person || undefined, status: edit.status === 'Suggested' ? 'Suggested' : edit.status === 'Overdue' ? 'Planned' : (edit.status as 'Planned' | 'Paid') })
          } else {
            const id = uid('mi')
            saveBudgetItem(month, `manual:${id}`, { name: v.name, category: v.category, amount: v.amount, currency: v.currency, dueDate: v.dueDate || undefined, person: v.person || undefined, status: 'Planned', sourceKind: 'manual' })
          }
        }}
      />

      <PayModal
        open={pay !== null}
        onClose={() => setPay(null)}
        title={pay ? `${pay.name}${pay.dueDate ? ` · due ${fmtDate(pay.dueDate)}` : ''}` : ''}
        amount={pay?.amount}
        currency={pay?.currency ?? 'AED'}
        onConfirm={(p) => pay && doPay(pay, p)}
      />
    </div>
  )
}

function ItemModal({
  open, onClose, item, month, people, onSave,
}: {
  open: boolean
  onClose: () => void
  item: MonthItem | null
  month: string
  people: string[]
  onSave: (v: { name: string; category: string; amount?: number; currency: Currency; dueDate: string; person: string }) => void
}) {
  const [f, setF] = useState({ name: '', category: 'Other', amount: '', currency: 'AED' as Currency, dueDate: '', person: '' })
  const [key, setKey] = useState('')
  const now = item?.key ?? `new:${open}`
  if (open && key !== now) {
    setKey(now)
    setF(item
      ? { name: item.name, category: item.category, amount: item.amount !== undefined ? String(item.amount) : '', currency: item.currency, dueDate: item.dueDate ?? '', person: item.person ?? '' }
      : { name: '', category: 'Other', amount: '', currency: 'AED', dueDate: `${month}-01`, person: '' })
  }
  if (!open && key !== '') setKey('')
  const isSchedule = item?.sourceKind === 'schedule'
  const ok = f.name.trim() && (item ? true : Number(f.amount) > 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Edit budget item' : 'Add budget item'}
      subtitle={item ? `${SOURCE_LABEL[item.sourceKind]} · ${item.reason}` : `For ${monthLabel(month)} ${month.slice(0, 4)}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary disabled:opacity-50" disabled={!ok} onClick={() => { onSave({ name: f.name.trim(), category: f.category, amount: Number(f.amount) > 0 ? Number(f.amount) : undefined, currency: f.currency, dueDate: f.dueDate, person: f.person }); onClose() }}>Save</button></>}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2"><input className="input" value={f.name} disabled={isSchedule} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Amount">
          <div className="flex gap-2">
            <input className="input flex-1" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={item?.needsInput ? 'Enter the amount' : '0.00'} />
            <select className="input w-20" value={f.currency} disabled={isSchedule} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}><option>AED</option><option>INR</option><option>USD</option></select>
          </div>
        </Field>
        <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Category"><input className="input" value={f.category} disabled={isSchedule} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Person">
          <select className="input" value={f.person} disabled={isSchedule} onChange={(e) => setF({ ...f, person: e.target.value })}><option value="">—</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
        </Field>
        {isSchedule && <p className="col-span-2 text-[11.5px] text-slate-500">This comes from a payment schedule in Notes &amp; Follow Up — changing the amount or date here changes that instalment too, so the two never disagree.</p>}
      </div>
    </Modal>
  )
}
