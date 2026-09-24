import { useMemo, useState } from 'react'
import { Banknote, CalendarClock, Pencil, Plus, Repeat, Trash2, TrendingUp } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, StatCard, Switch } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { convert, fmtDate, money, TODAY } from '@/lib/format'
import { incomeForMonth } from '@/lib/income'
import { DEFAULT_THEME } from '@/lib/theme'
import type { Currency, IncomeFrequency, IncomeSource } from '@/types'

const CATEGORIES = ['Salary', 'Bonus', 'Other', 'Variable', 'One-Time']
const FREQUENCIES: IncomeFrequency[] = ['Monthly', 'Quarterly', 'Yearly', 'One-Time']

const addMonth = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

const blank = () => ({
  name: '', category: 'Salary', amount: '', currency: 'AED' as Currency, frequency: 'Monthly' as IncomeFrequency,
  startDate: TODAY, endDate: '', person: '', active: true, notes: '',
})

export default function IncomePlanning() {
  const { incomeSources, people, settings, addIncomeSource, updateIncomeSource, removeIncomeSource } = useStore()
  const reporting = settings.baseCurrency
  const toReport = (a: number, c: Currency) => convert(a, c, reporting)
  const show = (v: number) => money(convert(v, reporting, 'AED'))
  const catColor = (settings.extra?.theme?.categoryColors ?? DEFAULT_THEME.categoryColors).income

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<IncomeSource | null>(null)
  const [form, setForm] = useState(blank())

  const month = TODAY.slice(0, 7)
  const preview = useMemo(() => Array.from({ length: 6 }, (_, i) => addMonth(month, i)).map((m) => ({ month: m, amount: incomeForMonth(incomeSources, m, toReport) })), [incomeSources, month, reporting]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = incomeSources.filter((s) => s.active)
  const yearlyRecurring = active.filter((s) => s.frequency !== 'One-Time').reduce((n, s) => {
    const per = s.frequency === 'Monthly' ? 12 : s.frequency === 'Quarterly' ? 4 : 1
    return n + toReport(s.amount, s.currency) * per
  }, 0)

  const openAdd = () => { setEditing(null); setForm(blank()); setModal(true) }
  const openEdit = (s: IncomeSource) => {
    setEditing(s)
    setForm({ name: s.name, category: s.category, amount: String(s.amount), currency: s.currency, frequency: s.frequency, startDate: s.startDate, endDate: s.endDate ?? '', person: s.person ?? '', active: s.active, notes: s.notes ?? '' })
    setModal(true)
  }
  const save = () => {
    if (!form.name.trim() || !(Number(form.amount) > 0)) return
    const payload = {
      name: form.name.trim(), category: form.category, amount: Number(form.amount), currency: form.currency,
      frequency: form.frequency, startDate: form.startDate, endDate: form.endDate || undefined,
      person: form.person || undefined, active: form.active, notes: form.notes.trim() || undefined,
    }
    if (editing) updateIncomeSource(editing.id, payload)
    else addIncomeSource(payload)
    setModal(false)
  }

  return (
    <div className="space-y-5 max-w-[1400px]">
      <PageHeader
        title="Income Planning"
        subtitle="Salary, recurring and future income — feeds My Financial Status and the Financial Forecast for months that have not happened yet."
        actions={<button className="btn-primary" onClick={openAdd}><Plus size={15} /> Add Income Source</button>}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="This Month Expected" value={show(preview[0]?.amount ?? 0)} icon={<Banknote size={20} />} tint={catColor} />
        <StatCard label="Next Month Expected" value={show(preview[1]?.amount ?? 0)} icon={<CalendarClock size={20} />} tint={catColor} />
        <StatCard label="Active Sources" value={String(active.length)} icon={<TrendingUp size={20} />} tint="#8b5cf6" footer={<span className="text-slate-400">{incomeSources.length} total</span>} />
        <StatCard label="Recurring, Yearly" value={show(yearlyRecurring)} icon={<Repeat size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">Monthly/quarterly/yearly sources, annualised</span>} />
      </div>

      <Card>
        <CardHead title="Next 6 Months" sub="What Income Planning currently projects — this is what the Forecast uses unless you override a month there." />
        <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {preview.map((p) => (
            <div key={p.month} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] text-slate-400">{monthLabel(p.month)}</p>
              <p className="text-[13px] font-extrabold text-slate-800">{show(p.amount)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Income Sources" />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th">Name</th>
                <th className="th">Category</th>
                <th className="th text-right">Amount</th>
                <th className="th">Frequency</th>
                <th className="th">Starts</th>
                <th className="th">Ends</th>
                <th className="th">Person</th>
                <th className="th">Active</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {incomeSources.map((s) => (
                <tr key={s.id} className="row-hover">
                  <td className="td font-semibold text-slate-800">{s.name}</td>
                  <td className="td text-slate-500">{s.category}</td>
                  <td className="td text-right font-bold tabular-nums">{money(s.amount, s.currency)}</td>
                  <td className="td text-slate-500">{s.frequency}</td>
                  <td className="td text-slate-500">{fmtDate(s.startDate)}</td>
                  <td className="td text-slate-500">{s.endDate ? fmtDate(s.endDate) : '—'}</td>
                  <td className="td text-slate-500">{s.person ?? '—'}</td>
                  <td className="td"><Switch checked={s.active} onChange={(v) => updateIncomeSource(s.id, { active: v })} /></td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => removeIncomeSource(s.id)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {incomeSources.length === 0 && <Empty text="No income sources yet — add your salary or any recurring/future income." />}
        </div>
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Income Source' : 'Add Income Source'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>{editing ? 'Save Changes' : 'Add Source'}</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" className="col-span-2"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Salary" autoFocus /></Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Person (optional)">
            <select className="input" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}>
              <option value="">— household —</option>
              {people.map((p) => <option key={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Amount">
            <div className="flex gap-2">
              <input className="input flex-1" type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <select className="input w-20" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}><option>AED</option><option>INR</option><option>USD</option></select>
            </div>
          </Field>
          <Field label="Frequency">
            <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as IncomeFrequency })}>
              {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label={form.frequency === 'One-Time' ? 'Date' : 'Starts'}><input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          {form.frequency !== 'One-Time' && (
            <Field label="Ends (optional)"><input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          )}
          <Field label="Notes" className="col-span-2"><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
          <div className="col-span-2 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
            <span className="text-[12.5px] font-semibold text-slate-600">Active — included in the forecast</span>
            <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
