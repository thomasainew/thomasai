import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, Briefcase, Gauge, Heart, HelpCircle, Lightbulb, Loader2, Paperclip,
  Send, Sparkles, TrendingUp, Wand2,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PageHeader } from '@/components/ui/Primitives'
import { askAdvisors, hasGemini, type AdvisorTurn } from '@/lib/gemini'
import { buildSnapshot, hasEnoughData } from '@/lib/insights'
import type { AdvisorSpeaker } from '@/types'

const PERSONAS: Record<'achachan' | 'chachan', { name: string; tagline: string; emoji: string; color: string }> = {
  achachan: { name: 'അച്ചച്ചൻ', tagline: 'ജീവിതം, ഭാവി, അനുഭവങ്ങൾ', emoji: '👴', color: '#3b82f6' },
  chachan: { name: 'ചാച്ചൻ', tagline: 'ലോൺ, ഫിനാൻസ്, പ്ലാനിംഗ്', emoji: '👨‍💼', color: '#10b981' },
}

const TOPICS = [
  { icon: Briefcase, title: 'കരിയർ നിർദ്ദേശങ്ങൾ', sub: 'Career, Family, Business', tint: '#10b981', prompt: 'എന്റെ കരിയറും വരുമാനവും കണക്കിലെടുത്ത് എന്ത് ചെയ്യണം?' },
  { icon: Gauge, title: 'ബജറ്റ് ക്രമീകരണം', sub: 'Budget & Discipline', tint: '#3b82f6', prompt: 'എന്റെ ബജറ്റ് ശരിയായി പാലിക്കാൻ എന്ത് ചെയ്യണം?' },
  { icon: Lightbulb, title: 'ജീവിത മാർഗ്ഗനിർദ്ദേശം', sub: 'Life Guidance', tint: '#8b5cf6', prompt: 'എന്റെ സാമ്പത്തിക ജീവിതത്തിൽ ഇപ്പോൾ എന്തിനാണ് മുൻഗണന നൽകേണ്ടത്?' },
  { icon: TrendingUp, title: 'നിക്ഷേപ ആശയങ്ങൾ', sub: 'Investment Ideas', tint: '#f59e0b', prompt: 'ഇപ്പോൾ എനിക്ക് നല്ല നിക്ഷേപ ഓപ്ഷനുകൾ ഏതൊക്കെയാണ്?' },
]

const EXAMPLE_QUESTIONS = [
  'ഈ മാസം എവിടെയാണ് ഞാൻ ശ്രദ്ധിക്കേണ്ടത്?',
  'കടത്തിന്റെ കാര്യത്തിൽ ഞാൻ എന്ത് ചെയ്യണം?',
  'എങ്ങനെ സേവിംഗ്സ് തുടങ്ങാം?',
  'ഇപ്പോൾ ഇൻവെസ്റ്റ് ചെയ്യാൻ നല്ല options ഉണ്ടോ?',
]

function speakerMeta(from: AdvisorSpeaker, userName: string) {
  if (from === 'achachan') return { name: PERSONAS.achachan.name, emoji: PERSONAS.achachan.emoji, color: PERSONAS.achachan.color }
  if (from === 'chachan') return { name: PERSONAS.chachan.name, emoji: PERSONAS.chachan.emoji, color: PERSONAS.chachan.color }
  return { name: userName, emoji: userName.charAt(0).toUpperCase(), color: '#64748b' }
}

export default function AIAdvisor() {
  const {
    settings, transactions, accounts, budgets, bills, loans, goals,
    advisorMessages, addAdvisorMessage,
  } = useStore()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<'achachan' | 'chachan'>('achachan')
  const abort = useRef<AbortController | null>(null)
  const seeded = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const snapshot = useMemo(
    () => buildSnapshot(transactions, accounts, budgets, bills, loans, goals, settings),
    [transactions, accounts, budgets, bills, loans, goals, settings],
  )
  const enoughData = hasEnoughData(snapshot)

  // A warm welcome the first time the chat is empty — static, so it costs no quota.
  useEffect(() => {
    if (seeded.current || advisorMessages.length > 0) return
    seeded.current = true
    const now = Date.now()
    addAdvisorMessage({
      from: 'achachan',
      text: `നമസ്കാരം ${settings.userName}, ഞാൻ ഇവിടെയുണ്ട് നിന്റെ സാമ്പത്തിക യാത്രയിൽ കൂടെ നിൽക്കാൻ. എന്തും ചോദിക്കൂ.`,
      at: new Date(now).toISOString(),
    })
    addAdvisorMessage({
      from: 'chachan',
      text: 'ഹായ്, ഞാൻ ചാച്ചൻ. നിന്റെ ചെലവുകളും ബജറ്റും നോക്കി കൃത്യമായ ഉപദേശം തരാൻ ഞാൻ തയ്യാറാണ്.',
      at: new Date(now + 500).toISOString(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [advisorMessages, busy])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy || !hasGemini) return
    setInput('')
    setError(null)
    addAdvisorMessage({ from: 'user', text: msg, at: new Date().toISOString() })
    setBusy(true)
    abort.current?.abort()
    abort.current = new AbortController()
    try {
      const history: AdvisorTurn[] = useStore.getState().advisorMessages.slice(-10).map((m) => ({ from: m.from, text: m.text }))
      const fresh = buildSnapshot(
        useStore.getState().transactions, useStore.getState().accounts, useStore.getState().budgets,
        useStore.getState().bills, useStore.getState().loans, useStore.getState().goals, useStore.getState().settings,
      )
      const reply = await askAdvisors(msg, fresh, history, abort.current.signal)
      const now = Date.now()
      addAdvisorMessage({ from: 'achachan', text: reply.achachan, at: new Date(now).toISOString() })
      addAdvisorMessage({ from: 'chachan', text: reply.chachan, at: new Date(now + 400).toISOString() })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const useSuggestion = (text: string) => {
    setInput(text)
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="AI Advisor"
        subtitle="ജീവിതത്തിലെ തീരുമാനങ്ങൾക്ക് നിങ്ങളോടൊപ്പം എന്നും"
        actions={
          <span className="chip bg-white border border-[#e2e8f0] text-slate-600 h-9 px-3.5 inline-flex items-center gap-2">
            <Sparkles size={13} className="text-amber-500" /> നല്ല ശീലങ്ങൾ, നല്ല ജീവിതം
            <Heart size={13} className="text-rose-500 fill-rose-500" />
          </span>
        }
      />

      {!hasGemini && (
        <div className="card px-4 py-3 flex items-start gap-2.5 bg-amber-50 border-amber-200">
          <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-amber-900">
            Gemini API key is not configured, so Achachan and Chachan can't reply yet — set VITE_GEMINI_API_KEY to enable this page.
          </p>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 items-start">
        <div className="xl:col-span-8 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]).map((key) => {
              const p = PERSONAS[key]
              const active = highlighted === key
              return (
                <button
                  key={key}
                  onClick={() => setHighlighted(key)}
                  className={`card p-4 text-left cursor-pointer transition ${active ? 'border-brand-400 ring-2 ring-brand-500/10' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-11 w-11 rounded-full grid place-items-center text-[20px] shrink-0"
                      style={{ background: `${p.color}1a` }}
                    >
                      {p.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-extrabold text-slate-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{p.tagline}</p>
                    </div>
                    <span className="chip bg-emerald-50 text-emerald-700 text-[10px] font-bold shrink-0 inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ഓൺലൈൻ
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="card flex flex-col h-[560px]">
            <div ref={scroller} className="flex-1 overflow-y-auto scroll-thin p-5 space-y-4">
              {!enoughData && (
                <p className="text-[12.5px] text-slate-500 text-center py-6">
                  വരുമാനമോ ചെലവോ രേഖപ്പെടുത്തിയാൽ അച്ചച്ചനും ചാച്ചനും നിന്റെ യഥാർത്ഥ കണക്കുകൾ വച്ച് സംസാരിക്കും.
                </p>
              )}

              {advisorMessages.map((m) => {
                const meta = speakerMeta(m.from, settings.userName)
                return (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <span
                      className="h-8 w-8 rounded-full grid place-items-center text-[14px] shrink-0"
                      style={{ background: `${meta.color}1a` }}
                    >
                      {meta.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl bg-slate-50 border border-[#eef2f8] px-3.5 py-2.5">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <p className="text-[12.5px] font-bold text-slate-800">{meta.name}</p>
                          <span className="text-[10px] text-slate-400 ml-auto shrink-0">
                            {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[13px] text-slate-700 leading-relaxed">{m.text}</p>
                      </div>
                    </div>
                  </div>
                )
              })}

              {busy && (
                <div className="flex items-center gap-2.5 text-[12.5px] text-slate-500 pl-1">
                  <Loader2 size={14} className="animate-spin" /> അച്ചച്ചനും ചാച്ചനും ആലോചിക്കുന്നു…
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2">
                  <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-amber-900">{error}</p>
                </div>
              )}
            </div>

            <div className="border-t border-[#eef2f8] p-3.5 flex items-center gap-2">
              <button className="h-10 w-10 grid place-items-center rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer shrink-0" title="Attach (coming soon)">
                <Paperclip size={16} />
              </button>
              <input
                ref={inputRef}
                className="input flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(input)}
                placeholder="ഇവിടെ സന്ദേശം ടൈപ്പ് ചെയ്യൂ…"
                disabled={!hasGemini || busy}
              />
              <button
                onClick={() => send(input)}
                disabled={!hasGemini || busy || !input.trim()}
                className="h-10 w-10 grid place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-500 to-cyan-400 grid place-items-center text-white shrink-0">
                <Wand2 size={15} />
              </span>
              <p className="text-[14px] font-bold text-slate-800">ഇന്ന് എന്തിൽ സഹായിക്കാം?</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {TOPICS.map((t) => (
                <button
                  key={t.title}
                  onClick={() => useSuggestion(t.prompt)}
                  className="rounded-xl border border-[#eef2f8] p-3 text-left hover:border-brand-200 hover:bg-brand-50/30 transition cursor-pointer"
                >
                  <span
                    className="h-8 w-8 rounded-lg grid place-items-center mb-2"
                    style={{ background: `${t.tint}1a`, color: t.tint }}
                  >
                    <t.icon size={15} />
                  </span>
                  <p className="text-[12px] font-bold text-slate-800 leading-tight">{t.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{t.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5">
            <p className="text-[11px] font-bold text-emerald-700 mb-2">ജ്ഞാനത്തിന്റെ ഒരു വാക്ക്</p>
            <p className="text-[15px] font-semibold text-slate-800 leading-snug">
              "ചെറിയ ശീലങ്ങൾ വലിയ ഭാവി ഉണ്ടാക്കുന്നു."
            </p>
            <p className="text-[11.5px] text-slate-500 mt-2">— അച്ചച്ചൻ</p>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle size={15} className="text-brand-600" />
              <p className="text-[13px] font-bold text-slate-800">ചോദിക്കാവുന്ന ഉദാഹരണങ്ങൾ</p>
            </div>
            <div className="space-y-1.5">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => useSuggestion(q)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-[12.5px] text-slate-600 hover:bg-slate-50 hover:text-brand-700 transition cursor-pointer flex items-center justify-between gap-2"
                >
                  {q} <span className="text-slate-300">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
