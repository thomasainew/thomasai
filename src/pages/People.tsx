import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PageHeader, StatCard } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { readFileAsDataUrl } from '@/lib/gemini'
import { resizeImage } from '@/lib/image'
import { fmtDate, money } from '@/lib/format'
import { byPerson, inMonth } from '@/lib/selectors'
import type { Person } from '@/types'

/** How this person's spend compares to the biggest spender this month. */
function spendTier(value: number, maxSpend: number): { label: string; tone: string } {
  if (value <= 0) return { label: 'LOW SPEND', tone: 'bg-emerald-50 text-emerald-700' }
  if (maxSpend > 0 && value >= maxSpend * 0.5) return { label: 'HIGH SPEND', tone: 'bg-rose-50 text-rose-700' }
  return { label: 'MEDIUM SPEND', tone: 'bg-amber-50 text-amber-700' }
}

const blankForm = () => ({ name: '', relation: '', phone: '', color: '#3b82f6', photo: '' })

export default function People() {
  const { people, transactions, addPerson, updatePerson, removePerson } = useStore()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Person | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'spend'>('name')
  const [form, setForm] = useState(blankForm())
  const [photoError, setPhotoError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const spending = useMemo(() => byPerson(transactions), [transactions])
  const totalSpent = spending.reduce((a, p) => a + p.value, 0)
  const theyOwe = people.reduce((a, p) => a + p.theyOwe, 0)
  const iOwe = people.reduce((a, p) => a + p.iOwe, 0)
  const maxSpend = spending.reduce((m, p) => Math.max(m, p.value), 0)

  const spendOf = (name: string) => spending.find((s) => s.name === name)?.value ?? 0

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

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = people.filter((p) => !term || p.name.toLowerCase().includes(term) || p.relation.toLowerCase().includes(term))
    list = [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : spendOf(b.name) - spendOf(a.name)))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, q, sort, spending])

  const selectedPerson = people.find((p) => p.name === selected) ?? null
  const personTxns = useMemo(
    () => (selected ? inMonth(transactions).filter((t) => t.person === selected).slice(0, 6) : []),
    [selected, transactions],
  )

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

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="People"
        subtitle="See who you spend on, who owes you, and who you owe."
        actions={<button className="btn-primary" onClick={openAdd}><Plus size={15} /> Add Person</button>}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="People Tracked" value={String(people.length)} icon={<Users size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">Family, friends & business</span>} />
        <StatCard label="Spent This Month" value={money(totalSpent)} icon={<ArrowUpRight size={20} />} tint="#f43f5e" footer={<span className="text-slate-400">Across all people</span>} />
        <StatCard label="They Owe Me" value={money(theyOwe)} icon={<ArrowDownLeft size={20} />} tint="#10b981" footer={<span className="text-slate-400">{people.filter((p) => p.theyOwe > 0).length} people</span>} />
        <StatCard label="I Owe" value={money(iOwe)} icon={<ArrowUpRight size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">{people.filter((p) => p.iOwe > 0).length} people</span>} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 items-start">
        <div className="xl:col-span-8 card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="card-title">People & Balances</h3>
              <p className="text-[11.5px] text-slate-500 mt-0.5">Your people, their contact details, and latest balances.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search people…"
                  className="h-9 w-44 rounded-xl border border-[#e2e8f0] bg-white pl-8 pr-3 text-[12.5px] outline-none focus:border-brand-300"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as 'name' | 'spend')}
                className="h-9 rounded-xl border border-[#e2e8f0] bg-white px-2.5 text-[12.5px] font-medium text-slate-600 outline-none cursor-pointer"
              >
                <option value="name">Sort by name</option>
                <option value="spend">Sort by spend</option>
              </select>
            </div>
          </div>

          {visible.length === 0 && <p className="py-10 text-center text-[13px] text-slate-400">No people match “{q}”.</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((p) => {
              const spend = spendOf(p.name)
              const tier = spendTier(spend, maxSpend)
              const isMe = p.name.toLowerCase() === 'me'
              const isSelected = selected === p.name
              return (
                <div
                  key={p.id}
                  onClick={() => setSelected(p.name)}
                  className={`rounded-2xl border p-4 cursor-pointer transition ${
                    isSelected ? 'border-brand-400 ring-2 ring-brand-500/10 bg-brand-50/30' : 'border-[#eef2f8] hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar p={p} />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-bold text-slate-800 truncate flex items-center gap-1.5">
                          {p.name}
                          {isMe && <span className="chip bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0">You</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{p.relation}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`chip text-[10px] font-bold ${tier.tone}`}>{tier.label}</span>
                      <CardMenu p={p} scope="list" />
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(p.name) }}
                    className="w-full h-8 rounded-lg bg-brand-50 text-brand-700 text-[11.5px] font-bold hover:bg-brand-100 cursor-pointer mb-3"
                  >
                    View Details →
                  </button>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#f1f5f9] text-center">
                    <div>
                      <p className="text-[9.5px] text-slate-400">Spent (Month)</p>
                      <p className="text-[12.5px] font-bold text-slate-800 tabular-nums">{money(spend)}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] text-slate-400">They Owe Me</p>
                      <p className={`text-[12.5px] font-bold tabular-nums ${p.theyOwe ? 'text-emerald-600' : 'text-slate-800'}`}>{money(p.theyOwe)}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] text-slate-400">I Owe</p>
                      <p className={`text-[12.5px] font-bold tabular-nums ${p.iOwe ? 'text-rose-600' : 'text-slate-800'}`}>{money(p.iOwe)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="xl:col-span-4 card p-5">
          {!selectedPerson ? (
            <p className="py-10 text-center text-[13px] text-slate-400">Select a person to see their details.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Avatar p={selectedPerson} size={48} />
                  <div>
                    <p className="text-[15px] font-extrabold text-slate-900 flex items-center gap-1.5">
                      {selectedPerson.name}
                      {selectedPerson.name.toLowerCase() === 'me' && (
                        <span className="chip bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0">You</span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-slate-400">{selectedPerson.relation}</p>
                  </div>
                </div>
                <CardMenu p={selectedPerson} scope="detail" />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="rounded-xl bg-rose-50/60 p-2.5 text-center">
                  <ArrowUpRight size={13} className="text-rose-500 mx-auto mb-1" />
                  <p className="text-[9.5px] text-slate-500">Spent This Month</p>
                  <p className="text-[12.5px] font-bold text-slate-800 tabular-nums">{money(spendOf(selectedPerson.name))}</p>
                </div>
                <div className="rounded-xl bg-emerald-50/60 p-2.5 text-center">
                  <ArrowDownLeft size={13} className="text-emerald-500 mx-auto mb-1" />
                  <p className="text-[9.5px] text-slate-500">They Owe Me</p>
                  <p className="text-[12.5px] font-bold text-slate-800 tabular-nums">{money(selectedPerson.theyOwe)}</p>
                </div>
                <div className="rounded-xl bg-amber-50/60 p-2.5 text-center">
                  <ArrowUpRight size={13} className="text-amber-500 mx-auto mb-1" />
                  <p className="text-[9.5px] text-slate-500">I Owe</p>
                  <p className="text-[12.5px] font-bold text-slate-800 tabular-nums">{money(selectedPerson.iOwe)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <p className="text-[12.5px] font-bold text-slate-800">Recent Transactions</p>
                <Link to="/expenses" className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700">View All</Link>
              </div>
              <div className="space-y-1">
                {personTxns.length === 0 && <p className="py-6 text-center text-[12px] text-slate-400">No transactions this month.</p>}
                {personTxns.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b border-[#f8fafc] last:border-0">
                    <span
                      className="h-8 w-8 rounded-full grid place-items-center shrink-0 text-[13px]"
                      style={{ background: `${selectedPerson.color}1a` }}
                    >
                      {t.type === 'income' ? '💰' : '🧾'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-slate-800 truncate">{t.description}</p>
                      <p className="text-[10.5px] text-slate-400">{fmtDate(t.date)}</p>
                    </div>
                    <span className={`text-[12.5px] font-bold tabular-nums shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.type === 'income' ? '+' : '-'}{money(t.amount, t.currency)}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                to="/expenses"
                className="mt-4 h-9 w-full rounded-xl bg-brand-50 text-brand-700 text-[12.5px] font-bold flex items-center justify-center gap-1.5 hover:bg-brand-100 transition"
              >
                View All Transactions →
              </Link>
            </>
          )}
        </div>
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
