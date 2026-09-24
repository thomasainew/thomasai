import { useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, ListChecks, Pencil, Plus, ReceiptText, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, Progress, StatCard, Switch } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { ScheduleEditor, ScheduleView, PayModal } from '@/components/PaymentSchedule'
import { installmentStatus, scheduleSummary } from '@/lib/schedules'
import { fmtDate, money, TODAY, uid } from '@/lib/format'
import { DEFAULT_THEME } from '@/lib/theme'
import type { Currency, Installment, Note } from '@/types'

const CATEGORIES = ['Education', 'Home / Rent', 'Insurance', 'Government & Renewals', 'Vehicle', 'Other']

const blank = () => ({
  title: '', category: 'Other', person: '', extraCharge: '', autoAddToBudget: true,
  genTotal: '', genCount: '4', genStart: TODAY, currency: 'AED' as Currency,
})

export default function Installments() {
  const { notes, people, transactions, settings, addNote, updateNote, removeNote, payInstallment } = useStore()
  const catColor = (settings.extra?.theme?.categoryColors ?? DEFAULT_THEME.categoryColors).installment
  const txnIds = useMemo(() => new Set(transactions.map((t) => t.id)), [transactions])
  const plans = useMemo(() => notes.filter((n) => (n.schedule?.length ?? 0) > 0), [notes])

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)
  const [schedule, setSchedule] = useState<Installment[]>([])
  const [form, setForm] = useState(blank())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<{ note: Note; inst: Installment } | null>(null)

  const summaries = useMemo(
    () => new Map(plans.map((n) => [n.id, scheduleSummary(n, TODAY, (id) => txnIds.has(id))])),
    [plans, txnIds],
  )

  const totals = useMemo(() => {
    let total = 0, paid = 0, outstanding = 0
    for (const s of summaries.values()) { total += s.total; paid += s.paid; outstanding += s.outstanding }
    const nextDates = [...summaries.values()].map((s) => s.nextDate).filter(Boolean).sort() as string[]
    return { total, paid, outstanding, next: nextDates[0], active: [...summaries.values()].filter((s) => s.outstanding > 0).length }
  }, [summaries])

  const openAdd = () => { setEditing(null); setForm(blank()); setSchedule([]); setModal(true) }
  const openEdit = (n: Note) => {
    setEditing(n)
    setForm({ ...blank(), title: n.title, category: n.category, person: n.person ?? '', extraCharge: n.extraCharge !== undefined ? String(n.extraCharge) : '', autoAddToBudget: n.autoAddToBudget !== false })
    setSchedule(n.schedule ?? [])
    setModal(true)
  }

  // "Total AED 3,000, monthly AED 500, start 15 Oct" → the schedule itself, evenly split.
  const generate = () => {
    const total = Number(form.genTotal)
    const count = Math.max(1, Math.round(Number(form.genCount)) || 1)
    if (!total || total <= 0) return
    const per = Math.round((total / count) * 100) / 100
    const start = new Date(form.genStart + 'T00:00:00')
    const rows: Installment[] = Array.from({ length: count }, (_, i) => {
      const d = new Date(start)
      d.setMonth(d.getMonth() + i)
      const dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const amount = i === count - 1 ? Math.round((total - per * (count - 1)) * 100) / 100 : per
      return { id: uid('in'), label: `Installment ${i + 1}`, dueDate, amount, currency: form.currency, remindDays: 7 }
    })
    setSchedule(rows)
  }

  const save = () => {
    if (!form.title.trim() || schedule.length === 0) return
    const payload = {
      title: form.title.trim(), category: 'Loan' as Note['category'], dueDate: [...schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0].dueDate,
      status: 'Pending' as Note['status'], person: form.person || undefined, feeCategory: form.category,
      extraCharge: Number(form.extraCharge) > 0 ? Number(form.extraCharge) : undefined,
      autoAddToBudget: form.autoAddToBudget, schedule: schedule.filter((i) => i.dueDate && i.amount > 0),
    }
    if (editing) updateNote(editing.id, payload)
    else addNote({ ...payload, done: false })
    setModal(false)
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Installments"
        subtitle="Fees and purchases paid in parts — each installment becomes its own reminder and lands in the budget of the month it falls due."
        actions={<button className="btn-primary" onClick={openAdd}><Plus size={15} /> Add Installment Plan</button>}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Plans" value={String(totals.active)} icon={<ListChecks size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">{plans.length} total</span>} />
        <StatCard label="Total Committed" value={money(totals.total)} icon={<ReceiptText size={20} />} tint={catColor} />
        <StatCard label="Paid So Far" value={money(totals.paid)} icon={<CheckCircle2 size={20} />} tint="#10b981"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{totals.total ? Math.round((totals.paid / totals.total) * 100) : 0}% of committed</div><Progress value={totals.paid} max={totals.total || 1} color="#10b981" height={5} /></div>} />
        <StatCard label="Remaining" value={money(totals.outstanding)} icon={<CalendarClock size={20} />} tint="#f59e0b"
          footer={<span className="text-slate-400">{totals.next ? `Next due ${fmtDate(totals.next)}` : 'Nothing due'}</span>} />
      </div>

      {plans.length === 0 ? (
        <Card><div className="py-10"><Empty text="No installment plans yet — add one for a fee, purchase or bill paid in parts." /></div></Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {plans.map((n) => {
            const sum = summaries.get(n.id)!
            const isOpen = expanded === n.id
            return (
              <Card key={n.id}>
                <CardHead
                  title={n.title}
                  sub={`${n.feeCategory ?? n.category}${n.person ? ` · ${n.person}` : ''}${n.extraCharge ? ` · +${money(n.extraCharge, sum.list[0]?.currency)} interest/extra` : ''}`}
                  right={
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(n)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => removeNote(n.id)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  }
                />
                <div className="px-5 pb-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="flex-1 text-[11.5px] text-slate-500">
                      {money(sum.paid, sum.list[0]?.currency)} of {money(sum.total, sum.list[0]?.currency)} paid
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">{sum.total ? Math.round((sum.paid / sum.total) * 100) : 0}%</span>
                  </div>
                  <Progress value={sum.paid} max={sum.total || 1} color="#10b981" height={7} />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {[
                      ['Remaining', money(sum.outstanding, sum.list[0]?.currency)],
                      ['Next Payment', sum.next ? money(sum.next.amount, sum.next.currency) : '—'],
                      ['Next Date', sum.nextDate ? fmtDate(sum.nextDate) : 'All paid'],
                      ['Remaining Installments', String(sum.list.filter((i) => installmentStatus(i, TODAY, (id) => txnIds.has(id)) !== 'Paid').length)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                        <p className="text-[9.5px] text-slate-400">{k}</p>
                        <p className="text-[12px] font-extrabold text-slate-800">{v}</p>
                      </div>
                    ))}
                  </div>
                  {sum.overdue > 0 && <p className="text-[11px] font-semibold text-rose-600 mt-2">{sum.overdue} overdue</p>}
                  <button onClick={() => setExpanded(isOpen ? null : n.id)} className="mt-3 text-[12px] font-semibold text-brand-600 hover:text-brand-700 cursor-pointer">
                    {isOpen ? 'Hide payment history' : 'Show payment history'}
                  </button>
                  {isOpen && <div className="mt-3"><ScheduleView note={n} onPay={(inst) => setPayFor({ note: n, inst })} /></div>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Installment Plan' : 'Add Installment Plan'}
        width="max-w-3xl"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>{editing ? 'Save Changes' : 'Add Plan'}</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Installment Name" className="col-span-2">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. School Fee" autoFocus />
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Person (who it is for)">
            <select className="input" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}>
              <option value="">— none —</option>
              {people.map((p) => <option key={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Interest / Extra Charge (optional)"><input className="input" type="number" min="0" value={form.extraCharge} onChange={(e) => setForm({ ...form, extraCharge: e.target.value })} /></Field>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
            <span className="text-[12.5px] font-semibold text-slate-600">Auto Add to Budget</span>
            <Switch checked={form.autoAddToBudget} onChange={(v) => setForm({ ...form, autoAddToBudget: v })} />
          </div>

          <div className="col-span-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3.5">
            <p className="text-[11.5px] font-bold text-brand-800 mb-2 flex items-center gap-1.5"><Sparkles size={13} /> Auto-create the schedule</p>
            <div className="grid grid-cols-4 gap-2">
              <input className="input h-9" type="number" min="0" placeholder="Total amount" value={form.genTotal} onChange={(e) => setForm({ ...form, genTotal: e.target.value })} />
              <input className="input h-9" type="number" min="1" placeholder="No. of installments" value={form.genCount} onChange={(e) => setForm({ ...form, genCount: e.target.value })} />
              <input className="input h-9" type="date" value={form.genStart} onChange={(e) => setForm({ ...form, genStart: e.target.value })} />
              <button type="button" className="btn-soft h-9" onClick={generate}>Generate</button>
            </div>
          </div>

          <div className="col-span-2 border-t border-[#eef2f8] pt-4">
            <ScheduleEditor value={schedule} onChange={setSchedule} defaultCurrency={form.currency} />
          </div>
        </div>
      </Modal>

      <PayModal
        open={payFor !== null}
        onClose={() => setPayFor(null)}
        title={payFor ? `${payFor.note.title} — ${payFor.inst.label}` : ''}
        amount={payFor?.inst.amount}
        currency={payFor?.inst.currency ?? 'AED'}
        onConfirm={(p) => payFor && payInstallment(payFor.note.id, payFor.inst.id, p)}
      />
    </div>
  )
}
