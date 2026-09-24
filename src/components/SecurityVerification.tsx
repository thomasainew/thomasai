import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { CloudBasketMark } from '@/components/CloudBasketMark'
import { verificationChallenge, verificationCheck, type VerificationChallenge } from '@/lib/security'

/** Step 2 of login: pick the right person from a photo grid. See src/lib/security.ts. */
export function SecurityVerification({ onVerified, onSignOut }: { onVerified: () => void; onSignOut: () => void }) {
  const [challenge, setChallenge] = useState<VerificationChallenge | null | undefined>(undefined) // undefined = loading
  const [selected, setSelected] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [wrong, setWrong] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = async (excludeQuestionId?: string) => {
    setChallenge(undefined)
    setSelected(null)
    setError(null)
    try {
      const c = await verificationChallenge(excludeQuestionId)
      setChallenge(c)
      if (!c) onVerified() // nothing configured after all — do not block sign-in
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setChallenge(null)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async () => {
    if (!challenge || !selected || checking) return
    setChecking(true)
    setError(null)
    try {
      const ok = await verificationCheck(challenge.questionId, selected)
      if (ok) {
        onVerified()
        return
      }
      const next = wrong + 1
      setWrong(next)
      setSelected(null)
      if (next >= 2) {
        setError('That was not quite right. Here is a different question.')
        setWrong(0)
        await load(challenge.questionId)
      } else {
        setError('That is not the right person — have another look.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#eef5ff] lg:h-dvh lg:min-h-[640px] lg:overflow-hidden lg:flex">
      {/* ---- left brand panel (matches the sign-in screen's identity) ---- */}
      <div className="relative hidden lg:flex lg:w-[42%] lg:shrink-0 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b1b6b] via-[#123a9c] to-[#1f6bff] px-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-[#5ea3ff] blur-3xl" />
          <div className="absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-[#0b5cf0] blur-3xl" />
        </div>
        <div className="relative z-10 flex items-center gap-2.5 self-start">
          <CloudBasketMark className="h-11 w-auto" />
          <p className="text-[20px] font-bold leading-[0.95] tracking-tight text-white">Cloud<span className="text-[#9cc3ff]">Basket</span></p>
        </div>
        <div className="relative z-10 mt-16 grid h-56 w-56 place-items-center rounded-full border border-white/20 bg-white/5 shadow-[0_0_80px_-10px_rgba(94,163,255,0.6)] backdrop-blur">
          <div className="grid h-40 w-40 place-items-center rounded-full border border-white/25 bg-white/10">
            <ShieldCheck size={64} strokeWidth={1.3} className="text-white/90" />
          </div>
        </div>
        <p className="relative z-10 mt-10 max-w-[20rem] text-center text-[15px] font-medium leading-relaxed text-white/85">
          A quick check that it is really you, using the people you already know.
        </p>
      </div>

      {/* ---- verification card ---- */}
      <div className="relative flex flex-1 items-center justify-center p-5 lg:p-10">
        <div className="w-full max-w-[460px] rounded-3xl border border-white/80 bg-white/95 p-7 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[11.5px] font-bold text-brand-700">Step 2 of 2</span>
            <button onClick={onSignOut} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer">
              <LogOut size={13} /> Sign out
            </button>
          </div>

          <h1 className="text-[22px] font-extrabold tracking-tight text-[#0b1b6b]">Security Verification</h1>

          {challenge === undefined && (
            <div className="mt-10 grid place-items-center py-10">
              <Loader2 size={26} className="animate-spin text-brand-600" />
            </div>
          )}

          {challenge === null && !error && (
            <p className="mt-4 text-[13px] text-slate-500">Nothing to verify right now — continuing…</p>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12px] font-medium text-amber-800">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {challenge && (
            <>
              <p className="mt-2 text-[14px] leading-snug text-slate-700">{challenge.text}</p>

              <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#dce9fb] via-[#eef4fd] to-[#f6f9ff] p-3">
                <SceneBackdrop />
                <div className="relative grid grid-cols-4 gap-3 sm:gap-3.5">
                  {challenge.people.map((p, i) => {
                    const active = selected === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p.id)}
                        disabled={checking}
                        className="group flex flex-col items-center gap-1 cursor-pointer disabled:cursor-wait"
                      >
                        <span className="relative">
                          {p.photo ? (
                            <img
                              src={p.photo}
                              alt={p.name}
                              className={`h-14 w-14 rounded-full object-cover ring-2 transition sm:h-16 sm:w-16 ${active ? 'ring-brand-600' : 'ring-white group-hover:ring-brand-300'}`}
                            />
                          ) : (
                            <span
                              className={`grid h-14 w-14 place-items-center rounded-full bg-slate-300 text-[18px] font-bold text-white ring-2 transition sm:h-16 sm:w-16 ${active ? 'ring-brand-600' : 'ring-white group-hover:ring-brand-300'}`}
                            >
                              {p.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-600 shadow">
                            {i + 1}
                          </span>
                          {active && (
                            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white shadow">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="mt-3 text-[11.5px] font-semibold text-slate-500">Select the correct person</p>

              <button
                onClick={submit}
                disabled={!selected || checking}
                className="btn-primary mt-4 h-11 w-full disabled:opacity-50"
              >
                {checking ? <Loader2 size={16} className="animate-spin" /> : null}
                Verify &amp; Continue
              </button>

              <button
                onClick={() => load(challenge.questionId)}
                disabled={checking}
                className="mt-3 w-full text-center text-[12.5px] font-semibold text-brand-600 hover:text-brand-700 cursor-pointer"
              >
                Try another way
              </button>
            </>
          )}

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck size={13} /> Your account is protected
          </p>
        </div>
      </div>
    </div>
  )
}

/** Soft decorative pattern behind the photo grid — no fabricated photography, just texture. */
function SceneBackdrop() {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]">
      <circle cx="40" cy="30" r="70" fill="#bcd6fb" />
      <circle cx="380" cy="190" r="90" fill="#cfe2fc" />
      <path d="M0 180 L400 150 L400 220 L0 220 Z" fill="#ffffff" fillOpacity=".5" />
    </svg>
  )
}
