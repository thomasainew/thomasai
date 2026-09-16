import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CalendarClock, HandCoins, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Card, CardHead, Empty, PageHeader, Progress, StatCard, statusTone } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { TransferModal } from '@/components/TransferModal'
import { daysLeft, fmtDate, money, pct, toBase, TODAY } from '@/lib/format'
import { loanSummary } from '@/lib/selectors'
import type { Currency, Loan } from '@/types'

export default function Loans() {
  const { loans, addLoan, updateLoan, removeLoan } = useStore()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Loan | null>(null)
  const [payFor, setPayFor] = useState<Loan | null>(null)

  const s = useMemo(() => loanSummary(loans), [loans])
  const totalPrincipal = s.active.reduce((a, l) => a + toBase(l.principal, l.currency), 0)
  const paidOff = totalPrincipal - s.outstanding

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Loans"
        subtitle="Track every loan, EMI and payment schedule across currencies."
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}>
            <Plus size={15} /> Add Loan
          </button>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Outstanding" value={money(s.outstanding)} icon={<Landmark size={20} />} tint="#ef4444"
          footer={<span className="text-slate-400">{s.active.length} active loans</span>} />
        <StatCard label="Monthly EMI" value={money(s.monthlyEmi)} icon={<Banknote size={20} />} tint="#3b82f6"
          footer={<span className="text-slate-400">Across all loans</span>} />
        <StatCard label="Due This Month" value={money(s.dueAmount)} icon={<CalendarClock size={20} />} tint="#f59e0b"
          footer={<span className="text-slate-400">{s.dueThisMonth.length} payments scheduled</span>} />
        <StatCard label="Paid Off" value={money(paidOff)} icon={<HandCoins size={20} />} tint="#10b981"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{pct(paidOff, totalPrincipal)}% of total borrowed</div><Progress value={paidOff} max={totalPrincipal} color="#10b981" height={5} /></div>} />
      </div>

      {s.overdue.length > 0 && (
        <div className="card px-5 py-4 flex items-center gap-3 bg-rose-50/60 border-rose-100">
          <AlertTriangle size={18} className="text-rose-600 shrink-0" />
          <p className="text-[13px] text-rose-800">
            <b>{s.overdue.length} loan payment{s.overdue.length > 1 ? 's are' : ' is'} overdue.</b>{' '}
            {s.overdue.map((l) => l.name).join(', ')} — settle to avoid extra charges.
          </p>
        </div>
      )}

      <Card>
        <CardHead title="Loan Tracker" sub="Outstanding balance, EMI and next payment date" />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th">Loan Name</th>
                <th className="th">Lender</th>
                <th className="th text-right">Principal</th>
                <th className="th text-right">Outstanding</th>
                <th className="th text-right">EMI</th>
                <th className="th text-right">Rate</th>
                <th className="th">Next Payment</th>
                <th className="th w-40">Repaid</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {loans.map((l) => {
                const repaid = l.principal - l.outstanding
                const dl = daysLeft(l.nextPayment)
                return (
                  <tr key={l.id} className="row-hover">
                    <td className="td font-semibold text-slate-800"><span className="mr-2">{l.icon}</span>{l.name}</td>
                    <td className="td text-slate-500">{l.lender}</td>
                    <td className="td text-right tabular-nums text-slate-500">{money(l.principal, l.currency)}</td>
                    <td className="td text-right font-bold tabular-nums">{money(l.outstanding, l.currency)}</td>
                    <td className="td text-right font-semibold tabular-nums">{money(l.emi, l.currency)}</td>
                    <td className="td text-right text-slate-500 tabular-nums">{l.rate}%</td>
                    <td className="td whitespace-nowrap">
                      <span className="text-slate-600">{fmtDate(l.nextPayment)}</span>
                      <span className={`block text-[10px] ${dl < 0 ? 'text-rose-500' : dl <= 10 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {dl < 0 ? `${Math.abs(dl)} days overdue` : `in ${dl} days`}
                      </span>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Progress value={repaid} max={l.principal} color="#10b981" height={7} />
                        <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{pct(repaid, l.principal)}%</span>
                      </div>
                    </td>
                    <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setPayFor(l)}
                          className="h-7 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer"
                        >
                          Pay
                        </button>
                        <button onClick={() => { setEditing(l); setModal(true) }} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => removeLoan(l.id)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {loans.length === 0 && <Empty text="No loans tracked." />}
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHead title="Upcoming Payments" sub="Next 3 months" />
          <div className="px-5 pb-5 space-y-3">
            {[...loans]
              .filter((l) => l.status !== 'Closed')
              .sort((a, b) => a.nextPayment.localeCompare(b.nextPayment))
              .map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl border border-[#eef2f8] px-3.5 py-3">
                  <span className="h-9 w-9 rounded-xl bg-slate-50 grid place-items-center text-[15px]">{l.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 truncate">{l.name}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(l.nextPayment)} · {l.lender}</p>
                  </div>
                  <span className="text-[13px] font-extrabold text-slate-800">{money(l.emi, l.currency)}</span>
                </div>
              ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Debt Breakdown" sub="Share of total outstanding (AED equivalent)" />
          <div className="px-5 pb-5 space-y-4">
            {s.active.map((l, i) => {
              const v = toBase(l.outstanding, l.currency)
              const colors = ['#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#10b981']
              return (
                <div key={l.id}>
                  <div className="flex items-center gap-2 text-[12.5px] mb-1.5">
                    <span className="flex-1 font-semibold text-slate-700">{l.name}</span>
                    <span className="text-slate-500 tabular-nums">{money(v)}</span>
                    <span className="w-10 text-right font-bold text-slate-400">{pct(v, s.outstanding)}%</span>
                  </div>
                  <Progress value={v} max={s.outstanding} color={colors[i % colors.length]} height={8} />
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <LoanModal
        open={modal}
        onClose={() => setModal(false)}
        editing={editing}
        onSave={(data) => (editing ? updateLoan(editing.id, data) : addLoan(data))}
      />

      {/* A loan payment is a transfer out of a real account, so it reduces
          both the loan's outstanding balance and the paying account's
          balance — see the corrections spec, problem 5. */}
      <TransferModal open={payFor !== null} onClose={() => setPayFor(null)} presetLoanId={payFor?.id} />
    </div>
  )
}

function LoanModal({
  open, onClose, editing, onSave,
}: {
  open: boolean
  onClose: () => void
  editing: Loan | null
  onSave: (l: any) => void
}) {
  const blank = {
    name: '', lender: '', principal: '', outstanding: '', emi: '', rate: '', nextPayment: TODAY,
    currency: 'AED' as Currency, status: 'On Track' as Loan['status'], icon: '🏦',
  }
  const [form, setForm] = useState(blank)

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? {
            name: editing.name, lender: editing.lender, principal: String(editing.principal),
            outstanding: String(editing.outstanding), emi: String(editing.emi), rate: String(editing.rate),
            nextPayment: editing.nextPayment, currency: editing.currency, status: editing.status, icon: editing.icon,
          }
        : blank,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const submit = () => {
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      lender: form.lender.trim() || '—',
      principal: Number(form.principal) || 0,
      outstanding: Number(form.outstanding) || 0,
      emi: Number(form.emi) || 0,
      rate: Number(form.rate) || 0,
      nextPayment: form.nextPayment,
      currency: form.currency,
      status: form.status,
      icon: form.icon || '🏦',
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Loan' : 'Add Loan'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>{editing ? 'Save Changes' : 'Add Loan'}</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Loan Name" className="col-span-2">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Personal Loan" autoFocus />
        </Field>
        <Field label="Lender"><input className="input" value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} placeholder="e.g. FAB" /></Field>
        <Field label="Icon"><input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={2} /></Field>
        <Field label="Principal"><input className="input" type="number" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></Field>
        <Field label="Outstanding"><input className="input" type="number" value={form.outstanding} onChange={(e) => setForm({ ...form, outstanding: e.target.value })} /></Field>
        <Field label="Monthly EMI"><input className="input" type="number" value={form.emi} onChange={(e) => setForm({ ...form, emi: e.target.value })} /></Field>
        <Field label="Interest Rate (%)"><input className="input" type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
        <Field label="Next Payment"><input className="input" type="date" value={form.nextPayment} onChange={(e) => setForm({ ...form, nextPayment: e.target.value })} /></Field>
        <Field label="Currency">
          <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
            <option>AED</option><option>INR</option><option>USD</option>
          </select>
        </Field>
        <Field label="Status" className="col-span-2">
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Loan['status'] })}>
            <option>On Track</option><option>Due Soon</option><option>Overdue</option><option>Closed</option>
          </select>
        </Field>
      </div>
    </Modal>
  )
}
