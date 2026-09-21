import { useEffect, useState } from 'react'
import { Check, ChevronDown, UserCog } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card } from '@/components/ui/Primitives'
import type { FamilyAdvisorProfile } from '@/types'

export const EMPTY_PROFILE: FamilyAdvisorProfile = {
  callMeBy: '', advisorName: '', answerOnlyWhenAddressed: false, character: '', preferences: '', familyNeeds: '', goals: '', responseStyle: '',
}

/** The saved profile, or an empty one. Both the Family Advisor and the Shopping Assistant read this. */
export function useAdvisorProfile(): FamilyAdvisorProfile {
  return useStore((s) => s.settings.extra?.advisorProfile) ?? EMPTY_PROFILE
}

/** Did the message address the advisor by name? Case-insensitive, matches inside a sentence. */
export function isAddressed(message: string, name: string) {
  const n = name.trim().toLowerCase()
  return n.length > 0 && message.toLowerCase().includes(n)
}

/**
 * Who you are, what your family needs, and what to call each other. Saved to
 * your account, so it follows you across devices and is used by the Family
 * Advisor and the Shopping Assistant.
 */
export function AdvisorProfileCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const saved = settings.extra?.advisorProfile ?? EMPTY_PROFILE
  const [open, setOpen] = useState(defaultOpen)
  const [f, setF] = useState<FamilyAdvisorProfile>(saved)
  const [done, setDone] = useState(false)
  useEffect(() => setF(saved), [JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(f) !== JSON.stringify(saved)
  const save = () => {
    updateSettings({ extra: { ...(settings.extra ?? {}), advisorProfile: f } })
    setDone(true)
    setTimeout(() => setDone(false), 1800)
  }
  const set = (k: keyof FamilyAdvisorProfile, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))
  const area = 'input h-auto min-h-[72px] py-2 leading-relaxed resize-y'

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer">
        <span className="h-9 w-9 rounded-xl bg-brand-50 text-brand-600 grid place-items-center"><UserCog size={18} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold text-slate-800">My profile for the advisor</span>
          <span className="block text-[11.5px] text-slate-500 truncate">
            {saved.callMeBy || saved.advisorName || saved.preferences ? `Called “${saved.callMeBy || '—'}” · advisor “${saved.advisorName || '—'}”` : 'Tell it who you are, your family’s needs and how you like answers'}
          </span>
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 grid gap-4 md:grid-cols-2 border-t border-[#f1f5f9] pt-4">
          <label className="block"><span className="label">What should the advisor call you?</span>
            <input className="input" value={f.callMeBy} onChange={(e) => set('callMeBy', e.target.value)} placeholder="e.g. Mon, Thomas Sir" /></label>
          <label className="block"><span className="label">What do you call the advisor?</span>
            <input className="input" value={f.advisorName} onChange={(e) => set('advisorName', e.target.value)} placeholder="e.g. Achachan" /></label>
          <label className="md:col-span-2 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 cursor-pointer">
            <input type="checkbox" className="accent-brand-600 h-4 w-4 mt-0.5" checked={f.answerOnlyWhenAddressed} onChange={(e) => set('answerOnlyWhenAddressed', e.target.checked)} />
            <span className="text-[12.5px] text-slate-700"><b>Reply only when I call it by name.</b>
              <span className="block text-[11.5px] text-slate-500">Messages that don't include “{f.advisorName || 'the name above'}” are saved in the chat but get no answer.</span></span>
          </label>
          <label className="block"><span className="label">My character</span>
            <textarea className={area} value={f.character} onChange={(e) => set('character', e.target.value)} placeholder="e.g. Careful with money, dislikes debt, likes clear numbers." /></label>
          <label className="block"><span className="label">Preferences</span>
            <textarea className={area} value={f.preferences} onChange={(e) => set('preferences', e.target.value)} placeholder="e.g. Vegetarian at home, prefers Almarai, buys in bulk when cheaper." /></label>
          <label className="block"><span className="label">Family needs</span>
            <textarea className={area} value={f.familyNeeds} onChange={(e) => set('familyNeeds', e.target.value)} placeholder="e.g. Family of 4, two school children, elderly parent's medicines." /></label>
          <label className="block"><span className="label">Goals</span>
            <textarea className={area} value={f.goals} onChange={(e) => set('goals', e.target.value)} placeholder="e.g. Clear the car loan by 2027, save for college fees." /></label>
          <label className="md:col-span-2 block"><span className="label">How should answers be given?</span>
            <input className="input" value={f.responseStyle} onChange={(e) => set('responseStyle', e.target.value)} placeholder="e.g. Short, in Malayalam, numbers first, one action step." /></label>
          <div className="md:col-span-2 flex items-center gap-3">
            <button className="btn-primary" onClick={save} disabled={!dirty}>{done ? <><Check size={15} /> Saved</> : 'Save profile'}</button>
            <span className="text-[11.5px] text-slate-400">Saved to your account and used on every device.</span>
          </div>
        </div>
      )}
    </Card>
  )
}
