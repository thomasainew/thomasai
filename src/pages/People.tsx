import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Pencil, Plus, Trash2, Upload, Users, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PageHeader, StatCard } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { readFileAsDataUrl } from '@/lib/gemini'
import { resizeImage } from '@/lib/image'
import { fmtDate, money, monthLabel, toBase } from '@/lib/format'
import { CURRENT_MONTH, addMonthsOptions } from '@/lib/selectors'
import { plEntries, summarise } from '@/lib/ledger'
import { peopleReport } from '@/lib/peopleStats'
import type { Person } from '@/types'

const blankForm = () => ({ name: '', relation: '', phone: '', color: '#3b82f6', photo: '' })

export default function People() {
  const { people, transactions, addPerson, updatePerson, removePerson } = useStore()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Person | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm())
  const [photoError, setPhotoError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Default to "Me" (or the first person) so the detail panel is never empty.
  useEffect(() => {
    if (selected || people.length === 0) return
    setSelected(people.find((p) => p.name.toLowerCase() === 'me')?.name ?? people[0].name)
  }, [people, selected])

  // Close the open card menu on an outside click or Escape.
  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpenMenu(null)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [openMenu])

  const visible = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people])

  const selectedPerson = people.find((p) => p.name === selected) ?? null
  const openAdd = () => {
    setEditing(null)
    setForm(blankForm())
    setPhotoError(null)
    setModal(true)
  }

  const openEdit = (p: Person) => {
    setEditing(p)
    setForm({ name: p.name, relation: p.relation, phone: p.phone ?? '', color: p.color, photo: p.photo ?? '' })
    setPhotoError(null)
    setOpenMenu(null)
    setModal(true)
  }

  const askDelete = (p: Person) => {
    setOpenMenu(null)
    if (!window.confirm(`Remove ${p.name}? This does not delete their past transactions.`)) return
    removePerson(p.id)
    if (selected === p.name) setSelected(null)
  }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setPhotoError(null)
    try {
      const raw = await readFileAsDataUrl(file)
      setForm((f) => ({ ...f, photo: raw }))
      const small = await resizeImage(raw)
      setForm((f) => ({ ...f, photo: small }))
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : String(e))
    }
  }

  const save = () => {
    if (!form.name.trim()) return
    const payload = {
      name: form.name.trim(),
      relation: form.relation.trim() || 'Contact',
      phone: form.phone,
      color: form.color,
      photo: form.photo || undefined,
    }
    if (editing) updatePerson(editing.id, payload)
    else addPerson({ ...payload, spent: 0, theyOwe: 0, iOwe: 0 })
    setModal(false)
  }

  const Avatar = ({ p, size = 44 }: { p: Person; size?: number }) =>
    p.photo ? (
      <img
        src={p.photo}
        alt={p.name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    ) : (
      <span
        className="rounded-full grid place-items-center text-white font-bold shrink-0"
        style={{ background: p.color, width: size, height: size, fontSize: size * 0.4 }}
      >
        {p.name.charAt(0).toUpperCase()}
      </span>
    )

  const CardMenu = ({ p, scope }: { p: Person; scope: 'list' | 'detail' }) => {
    const key = `${scope}:${p.id}`
    return (
    <div className="relative shrink-0" ref={openMenu === key ? menuRef : undefined}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === key ? null : key) }}
        className="h-6 w-6 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
      >
        <MoreHorizontal size={14} />
      </button>
      {openMenu === key && (
        <div className="absolute right-0 top-7 w-36 card p-1.5 z-20 animate-pop">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(p) }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-2"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); askDelete(p) }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer inline-flex items-center gap-2"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
    )
  }

  // ---- period + scope --------------------------------------------------------
  const { accounts, loans, transfers } = useStore()
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [scope, setScope] = useState<'individual' | 'household'>('individual')
  const range = { from: `${month}-01`, to: `${month}-31` }
  const names = useMemo(() => people.map((p) => p.name), [people])
  const report = useMemo(
    () =>
      peopleReport(
        plEntries(transactions, transfers, accounts, range),
        transfers, accounts, loans, names, (a, c) => toBase(a, c), range,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, transfers, accounts, loans, names, month],
  )
  const statOf = (name: string) => report.people.find((x) => x.name === name)
  const monthEntries = useMemo(() => plEntries(transactions, transfers, accounts, range), [transactions, transfers, accounts, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const scoped = scope === 'household' ? monthEntries : monthEntries.filter((e) => (e.person ?? 'Me') === selected)
  const detail = useMemo(() => summarise(scoped, (a, c) => toBase(a, c)), [scoped])
  const shownTransfers = scope === 'household' ? report.family : report.family.filter((f) => f.from === selected || f.to === selected)
  const monthOptions = useMemo(() => addMonthsOptions(12), [])

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="People"
        subtitle="Each person's income, expenses and transfers — kept separate, never double-counted."
        actions={
          <div className="flex flex-wrap gap-2">
            <select className="input h-10 w-auto" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Period">
              {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)} {m.slice(0, 4)}</option>)}
            </select>
            <div className="flex rounded-lg border border-[#e2e8f0] p-0.5 bg-white">
              {(['individual', 'household'] as const).map((v) => (
                <button key={v} onClick={() => setScope(v)} className={`h-9 px-3 rounded-md text-[12.5px] font-semibold cursor-pointer ${scope === v ? 'bg-brand-600 text-white' : 'text-slate-500'}`}>
                  {v === 'individual' ? 'Individual' : 'Combined household'}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={openAdd}><Plus size={15} /> Add Person</button>
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Household Income" value={money(report.household.income)} icon={<ArrowDownLeft size={20} />} tint="#10b981" footer={<span className="text-slate-400">Earned — excludes transfers and borrowing</span>} />
        <StatCard label="Household Expenses" value={money(report.household.expenses)} icon={<ArrowUpRight size={20} />} tint="#f43f5e" footer={<span className="text-slate-400">Each record counted once</span>} />
        <StatCard label="Net Surplus / Deficit" value={money(report.household.net)} icon={<Users size={20} />} tint={report.household.net >= 0 ? '#3b82f6' : '#ef4444'} footer={<span className="text-slate-400">Income − expenses</span>} />
        <StatCard label="Family Transfers" value={money(report.household.transfersOut)} icon={<ArrowUpRight size={20} />} tint="#8b5cf6" footer={<span className="text-slate-400">Moved between people — not income or expense</span>} />
      </div>

      {/* ---- compact person cards ------------------------------------------ */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
        {visible.map((p) => {
          const st = statOf(p.name)
          const active = scope === 'individual' && selected === p.name
          return (
            <div
              key={p.id}
              onClick={() => { setSelected(p.name); setScope('individual') }}
              className={`card p-3 cursor-pointer transition ${active ? 'ring-2 ring-brand-500 border-brand-200' : 'hover:border-brand-200'}`}
            >
              <div className="flex items-center gap-2.5">
                <Avatar p={p} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-slate-800 truncate leading-tight">{p.name}</p>
                  <p className="text-[10.5px] text-slate-400 truncate">{p.relation}</p>
                </div>
                <CardMenu p={p} scope="list" />
              </div>
              <div className="mt-2.5 space-y-1 text-[11.5px]">
                <div className="flex justify-between"><span className="text-slate-400">Income</span><b className="text-emerald-600 tabular-nums">{money(st?.income ?? 0)}</b></div>
                <div className="flex justify-between"><span className="text-slate-400">Expenses</span><b className="text-rose-600 tabular-nums">{money(st?.expenses ?? 0)}</b></div>
                <div className="flex justify-between"><span className="text-slate-400">Transfers</span>
                  <b className="text-violet-600 tabular-nums" title="In / out">+{money(st?.transfersIn ?? 0)} / −{money(st?.transfersOut ?? 0)}</b>
                </div>
              </div>
            </div>
          )
        })}
        {people.length === 0 && <p className="col-span-full text-[12.5px] text-slate-400">Add the people in your household to see their figures here.</p>}
      </div>

      {/* ---- detail ---------------------------------------------------------- */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            {scope === 'individual' && selectedPerson ? <Avatar p={selectedPerson} size={46} /> : <span className="h-11 w-11 rounded-full bg-brand-50 text-brand-600 grid place-items-center"><Users size={20} /></span>}
            <div>
              <p className="text-[16px] font-extrabold text-slate-900">{scope === 'household' ? 'Combined household' : selected ?? '—'}</p>
              <p className="text-[12px] text-slate-500">{monthLabel(month)} {month.slice(0, 4)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-right">
            <div><p className="text-[10.5px] text-slate-400 uppercase">{scope === 'individual' ? `${selected ?? ''} earned` : 'Earned'}</p><p className="text-[18px] font-extrabold text-emerald-600 tabular-nums">{money(detail.income)}</p></div>
            <div><p className="text-[10.5px] text-slate-400 uppercase">Spent</p><p className="text-[18px] font-extrabold text-rose-600 tabular-nums">{money(detail.expenses)}</p></div>
            <div><p className="text-[10.5px] text-slate-400 uppercase">Net</p><p className={`text-[18px] font-extrabold tabular-nums ${detail.net >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{money(detail.net)}</p></div>
          </div>
        </div>

        <div className="grid gap-5 mt-5 grid-cols-1 lg:grid-cols-3">
          <div>
            <p className="text-[12.5px] font-bold text-slate-700 mb-2">Income by source</p>
            {detail.incomeBySource.length === 0 && <p className="text-[12px] text-slate-400">No income recorded.</p>}
            {detail.incomeBySource.map((r) => (
              <div key={r.name} className="flex justify-between text-[12.5px] py-1 border-b border-[#f1f5f9]"><span className="text-slate-600">{r.name}</span><b className="tabular-nums">{money(r.value)}</b></div>
            ))}
          </div>
          <div>
            <p className="text-[12.5px] font-bold text-slate-700 mb-2">Expenses by category</p>
            {detail.expenseByCategory.length === 0 && <p className="text-[12px] text-slate-400">No expenses recorded.</p>}
            {detail.expenseByCategory.slice(0, 8).map((r) => (
              <div key={r.name} className="flex justify-between text-[12.5px] py-1 border-b border-[#f1f5f9]"><span className="text-slate-600">{r.name}</span><b className="tabular-nums">{money(r.value)}</b></div>
            ))}
          </div>
          <div>
            <p className="text-[12.5px] font-bold text-slate-700 mb-2">Transfers <span className="font-normal text-slate-400">(not income or expense)</span></p>
            {shownTransfers.length === 0 && <p className="text-[12px] text-slate-400">No transfers between people this month.</p>}
            {shownTransfers.map((f) => (
              <div key={f.id} className="rounded-lg bg-violet-50/60 px-3 py-2 mb-1.5 text-[12px]">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>{f.from} → {f.to}</span><span className="tabular-nums">{money(f.amount, f.currency)}</span>
                </div>
                <p className="text-[11px] text-slate-500">{fmtDate(f.date)} · out of {f.fromAccount}, into {f.toAccount}</p>
              </div>
            ))}
          </div>
        </div>
        {scope === 'household' && (
          <p className="text-[11.5px] text-slate-500 mt-4">
            Combined view adds each person once. A transfer between two of you leaves one account and arrives in the
            other, so it nets to nothing; borrowed money, loan principal and asset purchases are left out.
          </p>
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Person' : 'Add Person'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>{editing ? 'Save Changes' : 'Add Person'}</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Photo" className="col-span-2">
            <div className="flex items-center gap-3">
              {form.photo ? (
                <div className="relative">
                  <img src={form.photo} alt="" className="h-16 w-16 rounded-full object-cover" />
                  <button
                    onClick={() => setForm({ ...form, photo: '' })}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white shadow grid place-items-center text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <span
                  className="h-16 w-16 rounded-full grid place-items-center text-white font-bold text-xl shrink-0"
                  style={{ background: form.color }}
                >
                  {(form.name || '?').charAt(0).toUpperCase()}
                </span>
              )}
              <label className="btn-ghost h-9 cursor-pointer">
                <Upload size={14} /> {form.photo ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              </label>
            </div>
            {photoError && <p className="text-[11px] text-rose-600 mt-1.5">{photoError}</p>}
          </Field>
          <Field label="Name" className="col-span-2">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ahmed" autoFocus />
          </Field>
          <Field label="Relation"><input className="input" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="e.g. Business Partner" /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 …" /></Field>
          <Field label="Colour" className="col-span-2">
            <div className="flex gap-2 flex-wrap">
              {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'].map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`h-8 w-8 rounded-lg cursor-pointer ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
