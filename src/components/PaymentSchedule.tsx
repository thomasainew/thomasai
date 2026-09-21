import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Trash2, Wallet } from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Primitives'
import { useStore } from '@/store/useStore'
import { accountLabel, paymentAccounts } from '@/lib/accounting'
import { fmtDate, money, TODAY, uid } from '@/lib/format'
import { installmentStatus, scheduleSummary } from '@/lib/schedules'
import type { Currency, Installment, Note } from '@/types'

const tone = { Paid: 'green', Overdue: 'red', Planned: 'blue' } as const

/** Editable list of dated payments under one record — add, edit or remove instalments. */
export function ScheduleEditor({
  value,
  onChange,
  defaultCurrency = 'AED',
}: {
  value: Installment[]
  onChange: (v: Installment[]) => void
  defaultCurrency?: Currency
}) {
  const transactions = useStore((s) => s.transactions)
  const exists = useMemo(() => new Set(transactions.map((t) => t.id)), [transactions])
  const total = value.reduce((n, i) => n + (Number(i.amount) || 0), 0)

  const patch = (id: string, p: Partial<Installment>) => onChange(value.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const add = () => {
    const last = [...value].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).pop()
    let due = TODAY
    if (last) {
      const d = new Date(last.dueDate + 'T00:00:00')
      d.setMonth(d.getMonth() + 1)
      due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    onChange([
      ...value,
      { id: uid('in'), label: value.length === 0 ? 'First installment' : `Installment ${value.length + 1}`, dueDate: due, amount: last?.amount ?? 0, currency: last?.currency ?? defaultCurrency, remindDays: 7 },
    ])
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-bold text-slate-700">Payment schedule</p>
        <button type="button" className="btn-soft h-8" onClick={add}><Plus size={13} /> Add installment</button>
      </div>
      {value.length === 0 && (
        <p className="text-[11.5px] text-slate-500 rounded-lg bg-slate-50 px-3 py-2.5">
          For fees paid in parts (college, school, exam…), add each payment with its own date and amount. Each one
          becomes its own reminder and lands in the budget of the month it falls due.
        </p>
      )}
      {[...value].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((i) => {
        const status = installmentStatus(i, TODAY, (id) => exists.has(id))
        const paid = status === 'Paid'
        return (
          <div key={i.id} className="grid grid-cols-12 gap-2 items-center rounded-xl border border-[#eef2f8] p-2">
            <input className="input h-9 col-span-12 sm:col-span-3" value={i.label} onChange={(e) => patch(i.id, { label: e.target.value })} placeholder="Label" />
            <input className="input h-9 col-span-6 sm:col-span-3" type="date" value={i.dueDate} disabled={paid} onChange={(e) => patch(i.id, { dueDate: e.target.value })} />
            <div className="col-span-6 sm:col-span-3 flex gap-1">
              <input className="input h-9 flex-1 min-w-0" type="number" min="0" step="0.01" value={i.amount || ''} disabled={paid} onChange={(e) => patch(i.id, { amount: Number(e.target.value) || 0 })} placeholder="Amount" />
              <select className="input h-9 w-[4.2rem] px-1" value={i.currency} onChange={(e) => patch(i.id, { currency: e.target.value as Currency })}>
                <option>AED</option><option>INR</option><option>USD</option>
              </select>
            </div>
            <div className="col-span-8 sm:col-span-2 flex items-center gap-1.5">
              <Badge tone={tone[status]}>{status}</Badge>
              <input className="input h-9 w-14 px-2 text-[11px]" type="number" min="0" title="Remind this many days before" value={i.remindDays ?? 7} onChange={(e) => patch(i.id, { remindDays: Number(e.target.value) || 0 })} />
            </div>
            <button type="button" onClick={() => onChange(value.filter((x) => x.id !== i.id))} className="col-span-4 sm:col-span-1 h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer justify-self-end">
              <Trash2 size={13} />
            </button>
          </div>
        )
      })}
      {value.length > 0 && (
        <p className="text-[11.5px] text-slate-500 text-right">
          {value.length} installment{value.length === 1 ? '' : 's'} · total <b className="text-slate-800">{money(total, value[0].currency)}</b> · reminder days shown in the small box
        </p>
      )}
    </div>
  )
}

/** Read view of a note's schedule with totals and a Record payment action per instalment. */
export function ScheduleView({ note, onPay }: { note: Note; onPay: (i: Installment) => void }) {
  const transactions = useStore((s) => s.transactions)
  const exists = useMemo(() => new Set(transactions.map((t) => t.id)), [transactions])
  const sum = scheduleSummary(note, TODAY, (id) => exists.has(id))
  if (!sum.list.length) return null
  const cur = sum.list[0].currency

  return (
    <div className="rounded-xl bg-slate-50/70 p-3.5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[
          ['Total', money(sum.total, cur)], ['Paid', money(sum.paid, cur)],
          ['Outstanding', money(sum.outstanding, cur)], ['Next payment', sum.nextDate ? fmtDate(sum.nextDate) : 'All paid'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white px-3 py-2"><p className="text-[10.5px] text-slate-400">{k}</p><p className="text-[13px] font-extrabold text-slate-800">{v}</p></div>
        ))}
      </div>
      <table className="w-full text-[12.5px]">
        <thead><tr className="text-[10.5px] uppercase tracking-wide text-slate-400 text-left"><th className="py-1 font-semibold">Payment</th><th className="py-1 font-semibold">Due</th><th className="py-1 font-semibold text-right">Amount</th><th className="py-1 font-semibold">Status</th><th /></tr></thead>
        <tbody>
          {sum.list.map((i) => {
            const st = installmentStatus(i, TODAY, (id) => exists.has(id))
            return (
              <tr key={i.id} className="border-t border-[#e8edf5]">
                <td className="py-1.5 font-medium text-slate-700">{i.label}</td>
                <td className="py-1.5 text-slate-500">{fmtDate(i.dueDate)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{money(i.amount, i.currency)}</td>
                <td className="py-1.5"><Badge tone={tone[st]}>{st}</Badge>{st === 'Paid' && i.paidDate && <span className="text-[10.5px] text-slate-400 ml-1.5">{fmtDate(i.paidDate)}</span>}</td>
                <td className="py-1.5 text-right">
                  {st !== 'Paid' && (
                    <button onClick={() => onPay(i)} className="h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-1">
                      <Wallet size={11} /> Record payment
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Record that a payment was made. This CREATES the expense (once) and links it
 * to the item — it never moves money from a bank; it only records what you paid.
 */
export function PayModal({
  open, onClose, title, amount, currency, onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  amount?: number
  currency: Currency
  onConfirm: (p: { accountId: string; date: string; amount: number }) => void
}) {
  const accounts = useStore((s) => s.accounts)
  const eligible = useMemo(() => paymentAccounts(accounts), [accounts])
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(TODAY)
  const [amt, setAmt] = useState('')

  useEffect(() => {
    if (!open) return
    setAccountId(eligible[0]?.id ?? '')
    setDate(TODAY)
    setAmt(amount !== undefined ? String(amount) : '')
  }, [open, amount, eligible])

  const ok = Boolean(accountId) && Number(amt) > 0
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      subtitle={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-green disabled:opacity-50" disabled={!ok} onClick={() => { onConfirm({ accountId, date, amount: Number(amt) }); onClose() }}>
            <CheckCircle2 size={15} /> Record payment
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Paid from" className="col-span-2">
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {eligible.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
          </select>
        </Field>
        <Field label={`Amount paid (${currency})`}><input className="input" type="number" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Date paid"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <p className="col-span-2 text-[11.5px] text-slate-500">
          This records the expense in your accounts and marks the payment as paid everywhere it appears — once. It does
          not send money from any bank.
        </p>
      </div>
    </Modal>
  )
}
