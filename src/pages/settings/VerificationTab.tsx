import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Check, Copy, Eye, Loader2, Pencil, Plus, Shield, ShieldCheck, Shuffle, Trash2, Users,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, PageHeader, StatCard, Switch, Badge, Empty } from '@/components/ui/Primitives'
import { Field, Modal } from '@/components/ui/Modal'
import { listVerificationAttempts } from '@/lib/sync'
import type { Person, VerificationAttempt, VerificationQuestion } from '@/types'

const SCENES = ['Airport', 'Office', 'Family Gathering', 'Wedding', 'School', 'Neighbourhood']
const CHOICES = [6, 8, 10, 12]

type FormState = {
  question: string
  scene: string
  correctPersonId: string
  otherPersonIds: string[]
  status: 'Active' | 'Draft'
  numberOfChoices: number
  shufflePositions: boolean
  randomize: boolean
  avoidRepeatLast: boolean
}

const blankForm = (): FormState => ({
  question: '', scene: 'Airport', correctPersonId: '', otherPersonIds: [], status: 'Draft',
  numberOfChoices: 12, shufflePositions: true, randomize: true, avoidRepeatLast: true,
})

function Avatar({ p, size = 40 }: { p: Person; size?: number }) {
  return p.photo ? (
    <img src={p.photo} alt={p.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full grid place-items-center text-white font-bold shrink-0" style={{ background: p.color, width: size, height: size, fontSize: size * 0.4 }}>
      {p.name.charAt(0).toUpperCase()}
    </span>
  )
}

export function VerificationTab() {
  const { people, verificationQuestions, schemaV3, settings, updateSettings, addVerificationQuestion, updateVerificationQuestion, removeVerificationQuestion } = useStore()
  const [editing, setEditing] = useState<VerificationQuestion | null>(null)
  const [form, setForm] = useState<FormState>(blankForm())
  const [preview, setPreview] = useState<VerificationQuestion | null>(null)
  const [attempts, setAttempts] = useState<VerificationAttempt[] | null>(null)

  useEffect(() => {
    if (!schemaV3) return
    listVerificationAttempts().then(setAttempts).catch(() => setAttempts([]))
  }, [schemaV3])

  const enabled = settings.extra?.security?.enabled !== false
  const activeCount = verificationQuestions.filter((q) => q.status === 'Active').length
  const randomMode = verificationQuestions.length > 0 && verificationQuestions.every((q) => q.randomize)
  const totals = verificationQuestions.reduce((a, q) => ({ shown: a.shown + q.timesShown, correct: a.correct + q.timesCorrect }), { shown: 0, correct: 0 })
  const successRate = totals.shown ? Math.round((totals.correct / totals.shown) * 100) : null

  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown'

  const openAdd = () => { setEditing(null); setForm(blankForm()) }
  const openEdit = (q: VerificationQuestion) => {
    setEditing(q)
    setForm({
      question: q.question, scene: q.scene, correctPersonId: q.correctPersonId, otherPersonIds: q.otherPersonIds,
      status: q.status, numberOfChoices: q.numberOfChoices, shufflePositions: q.shufflePositions,
      randomize: q.randomize, avoidRepeatLast: q.avoidRepeatLast,
    })
  }
  const duplicate = (q: VerificationQuestion) => {
    addVerificationQuestion({
      question: `${q.question} (copy)`, scene: q.scene, correctPersonId: q.correctPersonId,
      otherPersonIds: q.otherPersonIds, status: 'Draft', numberOfChoices: q.numberOfChoices,
      shufflePositions: q.shufflePositions, randomize: q.randomize, avoidRepeatLast: q.avoidRepeatLast,
    })
  }
  const askDelete = (q: VerificationQuestion) => {
    if (!window.confirm(`Delete "${q.question}"? This cannot be undone.`)) return
    removeVerificationQuestion(q.id)
  }

  const toggleOther = (id: string) =>
    setForm((f) => ({ ...f, otherPersonIds: f.otherPersonIds.includes(id) ? f.otherPersonIds.filter((x) => x !== id) : [...f.otherPersonIds, id] }))

  const save = () => {
    if (!form.question.trim() || !form.correctPersonId) return
    const payload = {
      question: form.question.trim(), scene: form.scene, correctPersonId: form.correctPersonId,
      otherPersonIds: form.otherPersonIds.filter((id) => id !== form.correctPersonId), status: form.status,
      numberOfChoices: form.numberOfChoices, shufflePositions: form.shufflePositions,
      randomize: form.randomize, avoidRepeatLast: form.avoidRepeatLast,
    }
    if (editing) updateVerificationQuestion(editing.id, payload)
    else addVerificationQuestion(payload)
    setEditing(null)
    setForm(blankForm())
  }

  const previewPeople = useMemo(() => {
    if (!preview) return []
    const ids = [preview.correctPersonId, ...preview.otherPersonIds].slice(0, preview.numberOfChoices)
    return ids.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[]
  }, [preview, people])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Verification Questions"
        subtitle="Manage rotating security questions and face answers shown at step 2 of login."
        actions={
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] font-semibold text-slate-500">Require at login</span>
            <Switch checked={enabled} onChange={(v) => updateSettings({ extra: { ...settings.extra, security: { enabled: v } } })} />
          </div>
        }
      />

      {!schemaV3 && (
        <div className="card px-4 py-3 bg-brand-50 border-brand-200 text-[12.5px] text-brand-900">
          Run <b>supabase/migrations/0016_security_verification.sql</b> and deploy the{' '}
          <b>security-verify</b> edge function to store and use these questions.
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Questions" value={String(activeCount)} icon={<Shield size={18} />} tint="#3b82f6" footer={<span className="text-slate-400">{verificationQuestions.length} total</span>} />
        <StatCard label="People" value={String(people.length)} icon={<Users size={18} />} tint="#8b5cf6" footer={<span className="text-slate-400">In your People Library</span>} />
        <StatCard label="Random Mode" value={randomMode ? 'ON' : 'Mixed'} icon={<Shuffle size={18} />} tint="#10b981" />
        <StatCard label="Success Rate" value={successRate === null ? '—' : `${successRate}%`} icon={<ShieldCheck size={18} />} tint="#f59e0b" footer={<span className="text-slate-400">{totals.shown} shown</span>} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[1.4fr_1fr] items-start">
        {/* ---- question list ---- */}
        <Card>
          <CardHead title={`All Questions (${verificationQuestions.length})`} right={<button className="btn-primary h-9" onClick={openAdd}><Plus size={14} /> Add Question</button>} />
          <div className="px-5 pb-5 overflow-x-auto">
            {verificationQuestions.length === 0 ? (
              <Empty text="No questions yet — add one and select who the correct answer is." />
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-[#eef2f8]">
                    <th className="py-2 font-semibold">Question</th>
                    <th className="py-2 font-semibold">Correct Person</th>
                    <th className="py-2 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Last Used</th>
                    <th className="py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {verificationQuestions.map((q) => (
                    <tr key={q.id} className={`border-b border-[#f5f7fb] ${editing?.id === q.id ? 'bg-brand-50/50' : ''}`}>
                      <td className="py-2.5 pr-3 max-w-[220px]">
                        <p className="font-semibold text-slate-800 truncate">{q.question}</p>
                        <p className="text-[10.5px] text-slate-400">{q.scene}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          {people.find((p) => p.id === q.correctPersonId) && <Avatar p={people.find((p) => p.id === q.correctPersonId)!} size={22} />}
                          <span className="text-slate-700">{personName(q.correctPersonId)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3"><Badge tone={q.status === 'Active' ? 'green' : 'amber'}>{q.status}</Badge></td>
                      <td className="py-2.5 pr-3 text-slate-500">{q.lastUsedAt ? new Date(q.lastUsedAt).toLocaleDateString() : '—'}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button title="Preview" onClick={() => setPreview(q)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"><Eye size={13} /></button>
                          <button title="Edit" onClick={() => openEdit(q)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"><Pencil size={13} /></button>
                          <button title="Duplicate" onClick={() => duplicate(q)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"><Copy size={13} /></button>
                          <button title="Delete" onClick={() => askDelete(q)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* ---- question setup ---- */}
        <Card>
          <CardHead title="Question Setup" sub={editing ? 'Editing an existing question' : 'Add a new question'} />
          <div className="px-5 pb-5 space-y-4">
            <Field label="Question text">
              <input className="input" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Who studied with you at…?" />
            </Field>
            <Field label="Scene">
              <select className="input" value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })}>
                {SCENES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Select correct person">
              {form.correctPersonId && people.find((p) => p.id === form.correctPersonId) ? (
                <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 px-3 py-2">
                  <Avatar p={people.find((p) => p.id === form.correctPersonId)!} size={32} />
                  <span className="text-[12.5px] font-semibold text-emerald-800 flex-1">{personName(form.correctPersonId)}</span>
                  <button className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer" onClick={() => setForm({ ...form, correctPersonId: '' })}>Change</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto scroll-thin p-1">
                  {people.length === 0 && <p className="text-[12px] text-slate-400">Add people in the People page first.</p>}
                  {people.map((p) => (
                    <button key={p.id} onClick={() => setForm({ ...form, correctPersonId: p.id, otherPersonIds: form.otherPersonIds.filter((id) => id !== p.id) })} className="flex flex-col items-center gap-1 w-14 cursor-pointer">
                      <Avatar p={p} size={36} />
                      <span className="text-[10px] text-slate-500 truncate w-full text-center">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label={`Add other people (${form.otherPersonIds.length} selected)`}>
              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto scroll-thin p-1">
                {people.filter((p) => p.id !== form.correctPersonId).map((p) => {
                  const on = form.otherPersonIds.includes(p.id)
                  return (
                    <button key={p.id} onClick={() => toggleOther(p.id)} className="relative flex flex-col items-center gap-1 cursor-pointer">
                      <span className="relative">
                        <Avatar p={p} size={36} />
                        {on && <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-brand-600 text-white"><Check size={10} strokeWidth={3} /></span>}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate w-full text-center">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </Field>

            <div className="rounded-xl bg-slate-50 p-3.5 space-y-3">
              <p className="text-[11.5px] font-bold text-slate-600">Settings</p>
              <Row label="Randomize question each login"><Switch checked={form.randomize} onChange={(v) => setForm({ ...form, randomize: v })} /></Row>
              <Row label="Number of answer choices">
                <select className="input h-8 w-20 text-[12px]" value={form.numberOfChoices} onChange={(e) => setForm({ ...form, numberOfChoices: Number(e.target.value) })}>
                  {CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Row>
              <Row label="Shuffle people positions"><Switch checked={form.shufflePositions} onChange={(v) => setForm({ ...form, shufflePositions: v })} /></Row>
              <Row label="Avoid repeating last question"><Switch checked={form.avoidRepeatLast} onChange={(v) => setForm({ ...form, avoidRepeatLast: v })} /></Row>
              <Row label="Active (shown at login)"><Switch checked={form.status === 'Active'} onChange={(v) => setForm({ ...form, status: v ? 'Active' : 'Draft' })} /></Row>
            </div>

            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={!form.question || !form.correctPersonId} onClick={() => setPreview({ id: 'draft', timesShown: 0, timesCorrect: 0, ...form })}>
                <Eye size={14} /> Preview
              </button>
              <button className="btn-primary flex-1" disabled={!form.question.trim() || !form.correctPersonId} onClick={save}>
                {editing ? 'Save Changes' : 'Save Question'}
              </button>
            </div>
            {editing && (
              <button className="w-full text-center text-[11.5px] text-slate-400 hover:text-slate-600 cursor-pointer" onClick={() => { setEditing(null); setForm(blankForm()) }}>Cancel editing</button>
            )}
          </div>
        </Card>
      </div>

      {/* ---- login attempts ---- */}
      <Card>
        <CardHead title="Login Attempts" sub="Most recent verification attempts across your household" />
        <div className="px-5 pb-5">
          {!schemaV3 || attempts === null ? (
            <div className="py-6 text-center"><Loader2 size={18} className="animate-spin text-slate-300 mx-auto" /></div>
          ) : attempts.length === 0 ? (
            <Empty text="No attempts recorded yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-[#eef2f8]">
                    <th className="py-2 font-semibold">When</th>
                    <th className="py-2 font-semibold">Who</th>
                    <th className="py-2 font-semibold">Question</th>
                    <th className="py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.slice(0, 30).map((a) => (
                    <tr key={a.id} className="border-b border-[#f5f7fb]">
                      <td className="py-2 pr-3 text-slate-500">{new Date(a.at).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-slate-700 font-semibold">{a.memberName}</td>
                      <td className="py-2 pr-3 text-slate-600 max-w-[260px] truncate">{a.questionText}</td>
                      <td className="py-2"><Badge tone={a.correct ? 'green' : 'red'}>{a.correct ? 'Correct' : 'Wrong'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ---- preview modal ---- */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="Preview" subtitle="What the person signing in will see">
        {preview && (
          <div className="rounded-2xl bg-gradient-to-br from-[#dce9fb] via-[#eef4fd] to-[#f6f9ff] p-4">
            <p className="text-[13px] font-semibold text-slate-700 mb-3">{preview.question}</p>
            <div className="grid grid-cols-4 gap-3">
              {previewPeople.map((p, i) => (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <span className="relative">
                    <Avatar p={p} size={56} />
                    <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-600 shadow">{i + 1}</span>
                    {p.id === preview.correctPersonId && (
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow" title="Correct answer (only visible to you as admin)"><Check size={11} strokeWidth={3} /></span>
                    )}
                  </span>
                </div>
              ))}
              {previewPeople.length === 0 && <p className="col-span-4 text-[12px] text-slate-400">Select people to preview the grid.</p>}
            </div>
            <p className="mt-3 text-[10.5px] text-slate-500">The green check is shown only here, for you — never to the person signing in.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-slate-600">{label}</span>
      {children}
    </div>
  )
}
