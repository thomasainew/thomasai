import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, Bot, Globe2, Loader2, Pencil, Plus, Send, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PageHeader, Card, Switch } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { askEmployee, hasGemini, readFileAsDataUrl, type AskTurn } from '@/lib/gemini'
import { buildSnapshot } from '@/lib/financials'
import { resizeImage } from '@/lib/image'
import { convert, TODAY } from '@/lib/format'
import type { AIEmployee, Currency } from '@/types'

const LANGUAGES = ['English', 'Malayalam', 'Arabic', 'Hindi']
const AVATARS = ['🤖', '📊', '💼', '🧮', '🏦', '📈', '🧑‍💻', '🛡️']

const blank = (): Omit<AIEmployee, 'id'> => ({
  name: '', role: '', personality: '', knowledgeArea: '', language: 'English', avatar: '🤖', active: true,
})

const STARTERS: Omit<AIEmployee, 'id'>[] = [
  { name: 'Ana', role: 'Financial Research Analyst', personality: 'Precise, calm, always cites the figures behind a claim.', knowledgeArea: 'Budgeting, loans, spending trends, general market and financial-planning context.', language: 'English', avatar: '📊', active: true },
  { name: 'Mira', role: 'Household Budget Coach', personality: 'Warm and encouraging, focused on small consistent habits.', knowledgeArea: 'Monthly budgeting, savings habits, spending categories.', language: 'English', avatar: '💼', active: true },
]

export default function AIEmployees() {
  const s = useStore()
  const { settings, updateSettings, employeeMessages, addEmployeeMessage, clearEmployeeMessages } = s
  const employees = settings.extra?.aiEmployees ?? []

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<AIEmployee | null>(null)
  const [form, setForm] = useState(blank())
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(employees[0]?.id ?? null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!activeId && employees.length) setActiveId(employees[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [employeeMessages, busy])

  const active = employees.find((e) => e.id === activeId) ?? null
  const thread = useMemo(() => employeeMessages.filter((m) => m.employeeId === activeId), [employeeMessages, activeId])

  const saveEmployees = (next: AIEmployee[]) => updateSettings({ extra: { ...settings.extra, aiEmployees: next } })

  const openAdd = (preset?: Omit<AIEmployee, 'id'>) => { setEditing(null); setForm(preset ?? blank()); setPhotoError(null); setModal(true) }
  const openEdit = (e: AIEmployee) => { setEditing(e); setForm({ name: e.name, role: e.role, personality: e.personality ?? '', knowledgeArea: e.knowledgeArea ?? '', language: e.language, avatar: e.avatar, active: e.active }); setPhotoError(null); setModal(true) }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setPhotoError(null)
    try {
      const raw = await readFileAsDataUrl(file)
      const small = await resizeImage(raw)
      setForm((f) => ({ ...f, avatar: small }))
    } catch (e) { setPhotoError(e instanceof Error ? e.message : String(e)) }
  }

  const save = () => {
    if (!form.name.trim() || !form.role.trim()) return
    if (editing) saveEmployees(employees.map((e) => (e.id === editing.id ? { ...e, ...form, name: form.name.trim(), role: form.role.trim() } : e)))
    else {
      const item: AIEmployee = { ...form, id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: form.name.trim(), role: form.role.trim() }
      saveEmployees([...employees, item])
      setActiveId(item.id)
    }
    setModal(false)
  }

  const remove = (e: AIEmployee) => {
    if (!window.confirm(`Remove ${e.name}? This also clears the conversation with them.`)) return
    saveEmployees(employees.filter((x) => x.id !== e.id))
    clearEmployeeMessages(e.id)
    if (activeId === e.id) setActiveId(null)
  }

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || !active || busy || !hasGemini) return
    setInput('')
    setError(null)
    addEmployeeMessage({ employeeId: active.id, from: 'user', text: msg, at: new Date().toISOString() })
    setBusy(true)
    abort.current?.abort()
    abort.current = new AbortController()
    try {
      const st = useStore.getState()
      const toReport = (a: number, c: Currency) => convert(a, c, st.settings.baseCurrency)
      const household = buildSnapshot({
        today: TODAY, settings: st.settings, accounts: st.accounts, transactions: st.transactions, transfers: st.transfers,
        loans: st.loans, assets: st.assets, bills: st.bills, documents: st.documents, notes: st.notes,
        budgetItems: st.budgetItems, people: st.people.map((p) => p.name), toReport, fx: convert,
      })
      const facts = {
        currency: st.settings.baseCurrency, netWorth: household.netWorth.netWorth, availableFunds: household.availableFunds,
        debt: household.netWorth.liabilities, thisMonthIncome: household.plNow.income, thisMonthExpenses: household.plNow.expenses,
        cashFlow: household.cashFlow, statusLabel: household.status.tier.label,
        upcoming30Days: household.upcoming.slice(0, 6).map((u) => ({ name: u.name, due: u.dueDate, amount: u.amount })),
      }
      const history: AskTurn[] = []
      const raw = st.employeeMessages.filter((m) => m.employeeId === active.id).slice(-8)
      for (let i = 0; i < raw.length - 1; i += 2) {
        if (raw[i]?.from === 'user' && raw[i + 1]?.from === 'employee') history.push({ question: raw[i].text, answer: raw[i + 1].text })
      }
      const reply = await askEmployee(active, msg, facts, history, abort.current.signal)
      addEmployeeMessage({ employeeId: active.id, from: 'employee', text: reply, at: new Date().toISOString() })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="AI Employees"
        subtitle="Configurable characters with their own role and knowledge area — text-only for now."
        actions={<button className="btn-primary" onClick={() => openAdd()}><Plus size={15} /> Add AI Employee</button>}
      />

      {!hasGemini && (
        <div className="card px-4 py-3 flex items-start gap-2.5 bg-amber-50 border-amber-200">
          <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-amber-900">Gemini API key is not configured — set VITE_GEMINI_API_KEY to let AI employees reply.</p>
        </div>
      )}
      <div className="card px-4 py-3 flex items-start gap-2.5 bg-slate-50 border-[#eef2f8]">
        <Globe2 size={15} className="text-slate-400 mt-0.5 shrink-0" />
        <p className="text-[12px] text-slate-600">
          Text-only right now: no live voice and no live web research — those need a voice/search provider to be chosen first. Employees answer from your own records, plus general knowledge, and say plainly when they don't have live information.
        </p>
      </div>

      {employees.length === 0 ? (
        <Card className="p-8 text-center">
          <Bot size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-[13px] text-slate-500 mb-4">No AI employees yet.</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {STARTERS.map((st) => (
              <button key={st.role} className="btn-soft" onClick={() => openAdd(st)}>
                <Sparkles size={13} /> Quick add: {st.role}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 items-start">
          <div className="xl:col-span-4 space-y-3">
            {employees.map((e) => (
              <div key={e.id} onClick={() => setActiveId(e.id)} className={`card p-3.5 cursor-pointer transition ${activeId === e.id ? 'border-brand-400 ring-2 ring-brand-500/10' : ''}`}>
                <div className="flex items-center gap-3">
                  {e.avatar.startsWith('data:') ? <img src={e.avatar} alt={e.name} className="h-11 w-11 rounded-full object-cover shrink-0" /> : <span className="h-11 w-11 rounded-full bg-brand-50 grid place-items-center text-[20px] shrink-0">{e.avatar}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-extrabold text-slate-900 truncate">{e.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{e.role} · {e.language}</p>
                  </div>
                  <Switch checked={e.active} onChange={(v) => saveEmployees(employees.map((x) => (x.id === e.id ? { ...x, active: v } : x)))} />
                </div>
                <div className="flex items-center gap-1 mt-2 justify-end">
                  <button onClick={(ev) => { ev.stopPropagation(); openEdit(e) }} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><Pencil size={12} /></button>
                  <button onClick={(ev) => { ev.stopPropagation(); remove(e) }} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="xl:col-span-8">
            {active ? (
              <div className="card flex flex-col h-[560px]">
                <div className="px-5 py-3.5 border-b border-[#eef2f8] flex items-center gap-2.5">
                  {active.avatar.startsWith('data:') ? <img src={active.avatar} alt={active.name} className="h-9 w-9 rounded-full object-cover" /> : <span className="h-9 w-9 rounded-full bg-brand-50 grid place-items-center text-[16px]">{active.avatar}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-slate-900">{active.name}</p>
                    <p className="text-[11px] text-slate-400">{active.role}{active.knowledgeArea ? ` · ${active.knowledgeArea}` : ''}</p>
                  </div>
                </div>
                <div ref={scroller} className="flex-1 overflow-y-auto scroll-thin p-5 space-y-3">
                  {thread.length === 0 && <p className="text-[12.5px] text-slate-400 text-center py-8">Start the conversation with {active.name}.</p>}
                  {thread.map((m) => (
                    <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${m.from === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-50 border border-[#eef2f8] text-slate-700'}`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {busy && <div className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> {active.name} is thinking…</div>}
                  {error && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12px] text-amber-900">{error}</div>}
                </div>
                <div className="border-t border-[#eef2f8] p-3.5 flex items-center gap-2">
                  <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(input)} placeholder={`Ask ${active.name}…`} disabled={!hasGemini || busy} />
                  <button onClick={() => send(input)} disabled={!hasGemini || busy || !input.trim()} className="h-10 w-10 grid place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 cursor-pointer shrink-0">
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            ) : <Card className="p-8 text-center text-[12.5px] text-slate-400">Select an employee to chat.</Card>}
          </div>
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit AI Employee' : 'Add AI Employee'}
        footer={<><button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={save}>{editing ? 'Save Changes' : 'Add Employee'}</button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Avatar" className="col-span-2">
            <div className="flex items-center gap-3 flex-wrap">
              {form.avatar.startsWith('data:') ? (
                <div className="relative"><img src={form.avatar} alt="" className="h-14 w-14 rounded-full object-cover" /><button onClick={() => setForm({ ...form, avatar: '🤖' })} className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white shadow grid place-items-center text-slate-500 hover:text-rose-600 cursor-pointer"><X size={11} /></button></div>
              ) : (
                <span className="h-14 w-14 rounded-full bg-brand-50 grid place-items-center text-[26px]">{form.avatar}</span>
              )}
              {AVATARS.map((a) => (
                <button key={a} onClick={() => setForm({ ...form, avatar: a })} className={`h-9 w-9 rounded-full grid place-items-center text-[16px] cursor-pointer ${form.avatar === a ? 'ring-2 ring-brand-500 bg-brand-50' : 'bg-slate-50'}`}>{a}</button>
              ))}
              <label className="btn-ghost h-9 cursor-pointer"><Upload size={13} /> Photo<input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} /></label>
            </div>
            {photoError && <p className="text-[11px] text-rose-600 mt-1.5">{photoError}</p>}
          </Field>
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ana" autoFocus /></Field>
          <Field label="Role"><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Financial Research Analyst" /></Field>
          <Field label="Knowledge Area" className="col-span-2"><input className="input" value={form.knowledgeArea} onChange={(e) => setForm({ ...form, knowledgeArea: e.target.value })} placeholder="e.g. Budgeting, loans, spending trends" /></Field>
          <Field label="Personality" className="col-span-2"><textarea className="input min-h-[70px]" value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} placeholder="How they speak and behave" /></Field>
          <Field label="Language">
            <select className="input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
            <span className="text-[12.5px] font-semibold text-slate-600">Active</span>
            <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
