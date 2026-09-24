import { useState } from 'react'
import { Flag, PiggyBank, Plus, Target, Trash2, TrendingUp } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Empty, PageHeader, Progress, StatCard } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { daysLeft, fmtDate, money, pct, toBase } from '@/lib/format'
import type { Currency, Goal } from '@/types'

export default function Goals() {
  const { goals, addGoal, removeGoal, contributeGoal } = useStore()
  const [modal, setModal] = useState(false)
  const [contrib, setContrib] = useState<Goal | null>(null)
  const [amount, setAmount] = useState('')
  const [form, setForm] = useState({ name: '', target: '', saved: '', currency: 'AED' as Currency, deadline: '2027-12-31', icon: '🎯', color: '#3b82f6' })

  // Goals can be in different currencies, so totals are added up in AED (the
  // app's internal base) then shown in whatever currency Settings displays.
  const totalTarget = goals.reduce((a, g) => a + toBase(g.target, g.currency ?? 'AED'), 0)
  const totalSaved = goals.reduce((a, g) => a + toBase(g.saved, g.currency ?? 'AED'), 0)
  const completed = goals.filter((g) => g.saved >= g.target).length

  const save = () => {
    if (!form.name.trim() || !Number(form.target)) return
    addGoal({
      name: form.name.trim(), target: Number(form.target), saved: Number(form.saved) || 0, currency: form.currency,
      deadline: form.deadline, icon: form.icon || '🎯', color: form.color,
    })
    setForm({ name: '', target: '', saved: '', currency: 'AED', deadline: '2027-12-31', icon: '🎯', color: '#3b82f6' })
    setModal(false)
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Savings Goals"
        subtitle="Set targets, add contributions and watch your progress build."
        actions={<button className="btn-primary" onClick={() => setModal(true)}><Plus size={15} /> Add New Goal</button>}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Target" value={money(totalTarget)} icon={<Target size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">{goals.length} active goals</span>} />
        <StatCard label="Total Saved" value={money(totalSaved)} icon={<PiggyBank size={20} />} tint="#10b981"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{pct(totalSaved, totalTarget)}% of all targets</div><Progress value={totalSaved} max={totalTarget || 1} color="#10b981" height={5} /></div>} />
        <StatCard label="Remaining" value={money(Math.max(0, totalTarget - totalSaved))} icon={<TrendingUp size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">Left to save</span>} />
        <StatCard label="Goals Reached" value={String(completed)} icon={<Flag size={20} />} tint="#8b5cf6" footer={<span className="text-slate-400">of {goals.length} goals</span>} />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {goals.map((g) => {
          const p = pct(g.saved, g.target)
          const dl = daysLeft(g.deadline)
          const monthsLeft = Math.max(1, Math.round(dl / 30))
          const perMonth = Math.max(0, Math.round((g.target - g.saved) / monthsLeft))
          return (
            <Card key={g.id} className="card-pad">
              <div className="flex items-start gap-3">
                <span className="h-12 w-12 rounded-2xl grid place-items-center text-[20px] shrink-0" style={{ background: `${g.color}1a` }}>
                  {g.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-800 truncate">{g.name}</p>
                  <p className="text-[11.5px] text-slate-400">Target date {fmtDate(g.deadline)}</p>
                </div>
                <button onClick={() => removeGoal(g.id)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-600 cursor-pointer">
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="mt-4 flex items-end justify-between mb-2">
                <div>
                  <p className="text-[20px] font-extrabold text-slate-900 leading-none">{money(g.saved, g.currency ?? 'AED')}</p>
                  <p className="text-[11.5px] text-slate-400 mt-1">of {money(g.target, g.currency ?? 'AED')}</p>
                </div>
                <span className="text-[17px] font-extrabold" style={{ color: g.color }}>{p}%</span>
              </div>
              <Progress value={g.saved} max={g.target} color={g.color} height={9} />

              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 py-2">
                  <p className="text-[10.5px] text-slate-400">Remaining</p>
                  <p className="text-[13px] font-bold text-slate-700">{money(Math.max(0, g.target - g.saved), g.currency ?? 'AED')}</p>
                </div>
                <div className="rounded-xl bg-slate-50 py-2">
                  <p className="text-[10.5px] text-slate-400">Save / month</p>
                  <p className="text-[13px] font-bold text-slate-700">{money(perMonth, g.currency ?? 'AED')}</p>
                </div>
              </div>

              <button
                className="btn-soft w-full mt-3"
                onClick={() => { setContrib(g); setAmount(String(perMonth)) }}
              >
                <Plus size={14} /> Add Contribution
              </button>
            </Card>
          )
        })}
        {goals.length === 0 && (
          <Card className="sm:col-span-2 xl:col-span-3"><Empty text="No goals yet — create your first savings goal." /></Card>
        )}
      </div>

      <Card>
        <CardHead title="Goal Progress Summary" />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th">Goal</th>
                <th className="th text-right">Target</th>
                <th className="th text-right">Saved</th>
                <th className="th text-right">Remaining</th>
                <th className="th w-48">Progress</th>
                <th className="th">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {goals.map((g) => (
                <tr key={g.id} className="row-hover">
                  <td className="td font-semibold text-slate-800"><span className="mr-2">{g.icon}</span>{g.name}</td>
                  <td className="td text-right tabular-nums text-slate-500">{money(g.target, g.currency ?? 'AED')}</td>
                  <td className="td text-right tabular-nums font-bold">{money(g.saved, g.currency ?? 'AED')}</td>
                  <td className="td text-right tabular-nums text-slate-500">{money(Math.max(0, g.target - g.saved), g.currency ?? 'AED')}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Progress value={g.saved} max={g.target} color={g.color} height={7} />
                      <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{pct(g.saved, g.target)}%</span>
                    </div>
                  </td>
                  <td className="td text-slate-500 whitespace-nowrap">{fmtDate(g.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Add Savings Goal"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>Add Goal</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Goal Name" className="col-span-2">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emergency Fund" autoFocus />
          </Field>
          <Field label="Target Amount">
            <div className="flex gap-2">
              <input className="input flex-1" type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
              <select className="input w-20" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
                <option>AED</option><option>INR</option><option>USD</option>
              </select>
            </div>
          </Field>
          <Field label={`Already Saved (${form.currency})`}><input className="input" type="number" value={form.saved} onChange={(e) => setForm({ ...form, saved: e.target.value })} /></Field>
          <Field label="Target Date"><input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
          <Field label="Icon"><input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={2} /></Field>
          <Field label="Colour" className="col-span-2">
            <div className="flex gap-2 flex-wrap">
              {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#f43f5e'].map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`h-8 w-8 rounded-lg cursor-pointer ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={contrib !== null}
        onClose={() => setContrib(null)}
        title={`Add to ${contrib?.name ?? ''}`}
        subtitle={contrib ? `${money(contrib.saved, contrib.currency ?? 'AED')} saved of ${money(contrib.target, contrib.currency ?? 'AED')}` : ''}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setContrib(null)}>Cancel</button>
            <button
              className="btn-green"
              onClick={() => {
                if (contrib && Number(amount) > 0) contributeGoal(contrib.id, Number(amount))
                setContrib(null)
              }}
            >
              Add Contribution
            </button>
          </>
        }
      >
        <Field label={`Amount (${contrib?.currency ?? 'AED'})`}>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  )
}
