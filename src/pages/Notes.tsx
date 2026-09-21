import { Fragment, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Clock, ListTodo, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, Progress, StatCard } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { daysLeft, fmtDate, TODAY } from '@/lib/format'
import { PayModal, ScheduleEditor, ScheduleView } from '@/components/PaymentSchedule'
import { scheduleSummary } from '@/lib/schedules'
import type { Currency, Installment, Note } from '@/types'

const CATEGORIES: Note['category'][] = ['Personal', 'Work', 'Family', 'Car', 'Loan']

export default function Notes() {
  const { notes, people, transactions, addNote, updateNote, removeNote, toggleNote, payInstallment } = useStore()
  const txnIds = useMemo(() => new Set(transactions.map((t) => t.id)), [transactions])
  const [editing, setEditing] = useState<Note | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [payFor, setPayFor] = useState<{ note: Note; inst: Installment } | null>(null)
  const [schedule, setSchedule] = useState<Installment[]>([])
  const toggleOpen = (id: string) => setOpen((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [filter, setFilter] = useState<'All' | Note['category']>('All')
  const [showDone, setShowDone] = useState(true)
  const [modal, setModal] = useState(false)
  const blank = { title: '', category: 'Personal' as Note['category'], dueDate: TODAY, status: 'Pending' as Note['status'], person: '', amount: '', currency: 'AED' as Currency, feeCategory: '' }
  const [form, setForm] = useState(blank)

  const openNew = () => { setEditing(null); setForm(blank); setSchedule([]); setModal(true) }
  const openEdit = (n: Note) => {
    setEditing(n)
    setForm({ title: n.title, category: n.category, dueDate: n.dueDate, status: n.status, person: n.person ?? '', amount: n.amount !== undefined ? String(n.amount) : '', currency: n.currency ?? 'AED', feeCategory: n.feeCategory ?? '' })
    setSchedule(n.schedule ?? [])
    setModal(true)
  }

  const list = notes
    .filter((n) => (filter === 'All' ? true : n.category === filter))
    .filter((n) => (showDone ? true : !n.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate))

  const pending = notes.filter((n) => !n.done).length
  const done = notes.filter((n) => n.done).length
  const overdue = notes.filter((n) => !n.done && daysLeft(n.dueDate) < 0).length

  const save = () => {
    if (!form.title.trim()) return
    // With a schedule, the note's own date follows its earliest unpaid instalment.
    const sorted = [...schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const payload = {
      title: form.title.trim(), category: form.category, dueDate: sorted[0]?.dueDate ?? form.dueDate, status: form.status,
      person: form.person || undefined, amount: Number(form.amount) > 0 && !schedule.length ? Number(form.amount) : undefined,
      currency: form.currency, feeCategory: form.feeCategory.trim() || undefined,
      schedule: schedule.filter((i) => i.dueDate && i.amount > 0),
    }
    if (editing) updateNote(editing.id, payload)
    else addNote({ ...payload, done: false })
    setModal(false)
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Notes & Follow Up"
        subtitle="Reminders, follow-ups and to-dos tied to your money life."
        actions={<button className="btn-primary" onClick={openNew}><Plus size={15} /> Add Note</button>}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Notes" value={String(notes.length)} icon={<StickyNote size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">All follow-ups</span>} />
        <StatCard label="Pending" value={String(pending)} icon={<ListTodo size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">Still open</span>} />
        <StatCard label="Completed" value={String(done)} icon={<CheckCircle2 size={20} />} tint="#10b981"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{Math.round((done / (notes.length || 1)) * 100)}% done</div><Progress value={done} max={notes.length || 1} color="#10b981" height={5} /></div>} />
        <StatCard label="Overdue" value={String(overdue)} icon={<Clock size={20} />} tint="#ef4444" footer={<span className="text-slate-400">Past due date</span>} />
      </div>

      <Card>
        <CardHead
          title="All Notes"
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer">
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-brand-600 cursor-pointer" />
                Show completed
              </label>
              <div className="flex gap-1 flex-wrap">
                {(['All', ...CATEGORIES] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilter(c)}
                    className={`chip cursor-pointer transition ${filter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {c} ({c === 'All' ? notes.length : notes.filter((n) => n.category === c).length})
                  </button>
                ))}
              </div>
            </div>
          }
        />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[680px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th w-10"></th>
                <th className="th">Note</th>
                <th className="th">Category</th>
                <th className="th">Due Date</th>
                <th className="th">Status</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {list.map((n) => {
                const dl = daysLeft(n.dueDate)
                const sum = n.schedule?.length ? scheduleSummary(n, TODAY, (id) => txnIds.has(id)) : null
                const isOpen = open.has(n.id)
                return (
                  <Fragment key={n.id}>
                  <tr className="row-hover">
                    <td className="td">
                      <input type="checkbox" checked={n.done} onChange={() => toggleNote(n.id)} className="accent-brand-600 h-4 w-4 cursor-pointer" />
                    </td>
                    <td className={`td font-semibold ${n.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {sum && (
                        <button onClick={() => toggleOpen(n.id)} className="mr-1.5 text-slate-400 hover:text-slate-600 align-middle cursor-pointer">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                      {n.title}
                      {n.person && <span className="chip bg-violet-50 text-violet-700 ml-2">{n.person}</span>}
                      {sum && (
                        <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                          {sum.list.length} payments · paid {sum.paid.toLocaleString()} of {sum.total.toLocaleString()} {sum.list[0].currency} · outstanding {sum.outstanding.toLocaleString()}
                          {sum.nextDate ? ` · next ${fmtDate(sum.nextDate)}` : ' · all paid'}
                          {sum.overdue > 0 && <b className="text-rose-600"> · {sum.overdue} overdue</b>}
                        </span>
                      )}
                    </td>
                    <td className="td text-slate-500">{n.category}</td>
                    <td className="td whitespace-nowrap">
                      <span className="text-slate-600">{fmtDate(n.dueDate)}</span>
                      {!n.done && (
                        <span className={`block text-[10px] ${dl < 0 ? 'text-rose-500' : dl <= 7 ? 'text-amber-500' : 'text-slate-400'}`}>
                          {dl < 0 ? `${Math.abs(dl)} days overdue` : `in ${dl} days`}
                        </span>
                      )}
                    </td>
                    <td className="td">
                      <select
                        value={n.status}
                        onChange={(e) => updateNote(n.id, { status: e.target.value as Note['status'], done: e.target.value === 'Done' })}
                        className="text-[11px] font-bold rounded-full px-2.5 py-1 border-none outline-none cursor-pointer appearance-none"
                        style={{
                          background: n.status === 'Done' ? '#ecfdf5' : n.status === 'In Progress' ? '#eff6ff' : n.status === 'Planned' ? '#f5f3ff' : '#fffbeb',
                          color: n.status === 'Done' ? '#047857' : n.status === 'In Progress' ? '#1d4ed8' : n.status === 'Planned' ? '#6d28d9' : '#b45309',
                        }}
                      >
                        <option>Pending</option><option>In Progress</option><option>Planned</option><option>Done</option>
                      </select>
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(n)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><Pencil size={13} /></button>
                        <button onClick={() => removeNote(n.id)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                  {sum && isOpen && (
                    <tr key={`${n.id}-sched`}><td /><td colSpan={5} className="px-4 pb-4"><ScheduleView note={n} onPay={(inst) => setPayFor({ note: n, inst })} /></td></tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty text="Nothing here — add your first note." />}
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
        {CATEGORIES.map((c) => {
          const items = notes.filter((n) => n.category === c)
          const doneCount = items.filter((n) => n.done).length
          return (
            <Card key={c} className="card-pad">
              <p className="text-[13px] font-bold text-slate-800">{c}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-3">{doneCount} of {items.length} completed</p>
              <Progress value={doneCount} max={items.length || 1} color="#3b82f6" height={7} />
              <div className="mt-3 space-y-1.5">
                {items.filter((n) => !n.done).slice(0, 3).map((n) => (
                  <div key={n.id} className="flex items-center gap-2 text-[11.5px] text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                    <span className="truncate">{n.title}</span>
                  </div>
                ))}
                {items.filter((n) => !n.done).length === 0 && <p className="text-[11.5px] text-slate-300">All clear</p>}
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Note' : 'Add Note'}
        width="max-w-3xl"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>{editing ? 'Save Note' : 'Add Note'}</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Note" className="col-span-2">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Renew car insurance" autoFocus />
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Note['category'] })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Due Date"><input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Note['status'] })}>
              <option>Pending</option><option>In Progress</option><option>Planned</option><option>Done</option>
            </select>
          </Field>
          <Field label="Person (who it is for)">
            <select className="input" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}>
              <option value="">— none —</option>
              {people.map((p) => <option key={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Expense category (optional)">
            <input className="input" value={form.feeCategory} onChange={(e) => setForm({ ...form, feeCategory: e.target.value })} placeholder="e.g. Education" />
          </Field>
          {schedule.length === 0 && (
            <Field label="Single amount (optional)">
              <div className="flex gap-2">
                <input className="input flex-1" type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 1250" />
                <select className="input w-20" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}><option>AED</option><option>INR</option><option>USD</option></select>
              </div>
            </Field>
          )}
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
