import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, MessageCircleQuestion, Save, Upload, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PageHeader } from '@/components/ui/Primitives'
import { readFileAsDataUrl } from '@/lib/gemini'
import { resizeImage } from '@/lib/image'
import { PERSONA_QUESTIONS } from '@/lib/advisorPersona'
import type { AdvisorPersona } from '@/types'

const DEFAULTS: Record<AdvisorPersona['id'], { name: string; emoji: string; color: string }> = {
  achachan: { name: 'അച്ചച്ചൻ', emoji: '👴', color: '#3b82f6' },
  chachan: { name: 'ചാച്ചൻ', emoji: '👨‍💼', color: '#10b981' },
}

function PersonaCard({ id }: { id: AdvisorPersona['id'] }) {
  const { advisorPersonas, upsertAdvisorPersona } = useStore()
  const saved = advisorPersonas.find((p) => p.id === id)
  const base = DEFAULTS[id]

  const [name, setName] = useState(saved?.name ?? base.name)
  const [photo, setPhoto] = useState(saved?.photo ?? '')
  // Keyed by question so answers line up even if a saved persona predates a later question being added.
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(PERSONA_QUESTIONS.map((q) => [q, saved?.qa?.find((x) => x.question === q)?.answer ?? ''])),
  )
  const [instructions, setInstructions] = useState(saved?.instructions ?? '')
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setName(saved?.name ?? base.name)
    setPhoto(saved?.photo ?? '')
    setAnswers(Object.fromEntries(PERSONA_QUESTIONS.map((q) => [q, saved?.qa?.find((x) => x.question === q)?.answer ?? ''])))
    setInstructions(saved?.instructions ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const raw = await readFileAsDataUrl(file)
      const small = await resizeImage(raw)
      setPhoto(small)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const answered = Object.values(answers).filter((a) => a.trim()).length

  const save = () => {
    upsertAdvisorPersona({
      id,
      name: name.trim() || base.name,
      photo: photo || undefined,
      qa: PERSONA_QUESTIONS.map((question) => ({ question, answer: answers[question] ?? '' })),
      instructions: instructions.trim() || undefined,
    })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1800)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        {photo ? (
          <div className="relative">
            <img src={photo} alt={name} className="h-16 w-16 rounded-full object-cover" />
            <button
              onClick={() => setPhoto('')}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white shadow grid place-items-center text-slate-500 hover:text-rose-600 cursor-pointer"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <span
            className="h-16 w-16 rounded-full grid place-items-center text-[26px] shrink-0"
            style={{ background: `${base.color}1a` }}
          >
            {base.emoji}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold text-slate-900">{name}</p>
          <label className="mt-1.5 btn-ghost h-8 text-[11.5px] cursor-pointer inline-flex">
            <Upload size={13} /> {photo ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>
        </div>
        <span className="chip bg-slate-100 text-slate-500 text-[10px] font-bold shrink-0">
          {answered}/{PERSONA_QUESTIONS.length} answered
        </span>
      </div>

      {error && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2 mb-3">
          <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[12px] text-amber-900">{error}</p>
        </div>
      )}

      <label className="label">Name</label>
      <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder={base.name} />

      <div className="flex items-center gap-2 mb-2">
        <MessageCircleQuestion size={14} className="text-brand-600" />
        <p className="text-[12.5px] font-bold text-slate-800">Get to know {name}</p>
      </div>
      <div className="space-y-3 mb-4">
        {PERSONA_QUESTIONS.map((q) => (
          <div key={q}>
            <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">{q}</label>
            <textarea
              className="input min-h-[52px] resize-y text-[12.5px]"
              value={answers[q] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))}
              placeholder="Your answer…"
            />
          </div>
        ))}
      </div>

      <label className="label">Anything else? (optional)</label>
      <textarea
        className="input min-h-[70px] resize-y"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder='e.g. "Speak a bit more strictly about loans." or "Keep replies shorter."'
      />
      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
        This is not model fine-tuning — every answer here is added to {name}'s prompt each time they reply, so Gemini
        reads it fresh each time rather than "learning" it permanently.
      </p>

      <button className="btn-primary w-full mt-4 disabled:opacity-60" onClick={save}>
        <Save size={14} /> {savedFlash ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}

export default function TrainAdvisors() {
  return (
    <div className="space-y-5 max-w-[1100px]">
      <PageHeader
        title="Train Advisors"
        subtitle="Answer a few questions about Achachan and Chachan — it shapes how they reply, in Malayalam, to your real figures."
        actions={
          <Link to="/ai-advisor" className="btn-ghost">
            <ArrowLeft size={15} /> Back to AI Advisor
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <PersonaCard id="achachan" />
        <PersonaCard id="chachan" />
      </div>
    </div>
  )
}
