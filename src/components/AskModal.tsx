import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Send, Sparkles, User } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useStore } from '@/store/useStore'
import { askMoney, hasGemini, type AskTurn } from '@/lib/gemini'
import { buildFactsPack } from '@/lib/insights'

/** Shown until they have asked something of their own. */
const STARTERS = [
  'How much did I spend on eating out last quarter?',
  'Which month was my most expensive this year?',
  'Where does most of my money go?',
  'Am I saving enough to hit my goals?',
]

export function AskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { transactions, accounts, budgets, bills, loans, goals, settings } = useStore()
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<AskTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) return
    abort.current?.abort()
    setBusy(false)
    setError(null)
  }, [open])

  // Keep the newest answer in view as it arrives.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy])

  const hasData = transactions.length > 0

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setQuestion('')
    abort.current = new AbortController()
    try {
      const facts = buildFactsPack(transactions, accounts, budgets, bills, loans, goals, settings)
      const answer = await askMoney(q, facts, turns, abort.current.signal)
      setTurns((t) => [...t, { question: q, answer }])
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : String(e))
        setQuestion(q)
      }
    }
    setBusy(false)
  }

  if (!hasGemini) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ask CloudBasket 360"
      subtitle="Questions about your own figures, answered from your records"
      width="max-w-2xl"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary disabled:opacity-50"
            disabled={!question.trim() || busy || !hasData}
            onClick={() => ask(question)}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {busy ? 'Thinking…' : 'Ask'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {!hasData && (
          <p className="text-[12.5px] text-slate-500 py-6 text-center">
            Record some income or expenses first — there is nothing to ask about yet.
          </p>
        )}

        {hasData && (
          <>
            <div ref={scroller} className="max-h-[46vh] overflow-y-auto scroll-thin space-y-3 pr-1">
              {turns.length === 0 && !busy && (
                <div className="space-y-2">
                  <p className="text-[12px] text-slate-500">
                    Answers come from the last twelve months of your records — totals by month, category, merchant and
                    person. Try:
                  </p>
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="w-full text-left rounded-xl border border-[#eef2f8] px-3.5 py-2.5 text-[12.5px] text-slate-700 hover:bg-slate-50 hover:border-brand-200 transition cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {turns.map((t, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-start gap-2.5 justify-end">
                    <p className="text-[12.5px] text-slate-700 bg-slate-100 rounded-xl px-3.5 py-2 max-w-[80%]">
                      {t.question}
                    </p>
                    <span className="h-7 w-7 rounded-lg bg-slate-200 grid place-items-center text-slate-500 shrink-0">
                      <User size={14} />
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-cyan-400 grid place-items-center text-white shrink-0">
                      <Sparkles size={14} />
                    </span>
                    <p className="text-[12.5px] text-slate-700 leading-relaxed bg-brand-50/60 border border-brand-100 rounded-xl px-3.5 py-2.5 whitespace-pre-wrap">
                      {t.answer}
                    </p>
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2.5 text-[12.5px] text-slate-500">
                  <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-cyan-400 grid place-items-center text-white shrink-0">
                    <Loader2 size={14} className="animate-spin" />
                  </span>
                  Reading your records…
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2">
                <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[12px] text-amber-900">{error}</p>
              </div>
            )}

            <input
              className="input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask(question)}
              placeholder="Ask about your spending…"
              autoFocus
            />
            <p className="text-[10.5px] text-slate-400">
              Answered from monthly and category totals, not individual transactions. Check anything before acting on it.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
