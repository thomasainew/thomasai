import { useMemo, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead } from '@/components/ui/Primitives'
import { Field } from '@/components/ui/Modal'
import { readFileAsDataUrl } from '@/lib/gemini'
import { resizeImage } from '@/lib/image'
import { TODAY, convert } from '@/lib/format'
import { buildSnapshot } from '@/lib/financials'
import { DEFAULT_TIERS } from '@/lib/status'
import type { StatusTier } from '@/types'

async function photoFrom(file: File | undefined, size: number) {
  if (!file) return undefined
  return resizeImage(await readFileAsDataUrl(file), size)
}

/** Profile photo, three status photos and labels/thresholds — and exactly how the status is worked out. */
export function StatusTab() {
  const s = useStore()
  const { settings, updateSettings } = s
  const extra = settings.extra ?? {}
  const tiers: StatusTier[] = extra.statusTiers?.length ? extra.statusTiers : DEFAULT_TIERS
  const [err, setErr] = useState<string | null>(null)

  const save = (patch: Partial<typeof extra>) => updateSettings({ extra: { ...extra, ...patch } })
  const setTier = (key: StatusTier['key'], patch: Partial<StatusTier>) =>
    save({ statusTiers: tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)) })

  const snap = useMemo(
    () => buildSnapshot({ today: TODAY, settings, accounts: s.accounts, transactions: s.transactions, transfers: s.transfers, loans: s.loans, assets: s.assets, bills: s.bills, documents: s.documents, notes: s.notes, budgetItems: s.budgetItems, people: s.people.map((p) => p.name), toReport: (a, c) => convert(a, c, settings.baseCurrency), fx: convert }),
    [s.accounts, s.transactions, s.transfers, s.loans, s.assets, settings], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const cur = snap.status

  const pick = async (file: File | undefined, apply: (url: string) => void, size = 480) => {
    setErr(null)
    try {
      const url = await photoFrom(file, size)
      if (url) apply(url)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const Photo = ({ src, onPick, onClear, label }: { src?: string; onPick: (f: File | undefined) => void; onClear: () => void; label: string }) => (
    <div className="flex items-center gap-3">
      {src ? (
        <div className="relative"><img src={src} alt="" className="h-16 w-16 rounded-xl object-cover" /><button onClick={onClear} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white shadow grid place-items-center text-slate-500 hover:text-rose-600 cursor-pointer"><X size={11} /></button></div>
      ) : <div className="h-16 w-16 rounded-xl bg-slate-100 grid place-items-center text-slate-300 text-2xl">📷</div>}
      <label className="btn-ghost h-9 cursor-pointer"><Upload size={14} /> {src ? 'Change' : label}<input type="file" accept="image/*" className="hidden" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }} /></label>
    </div>
  )

  return (
    <div className="space-y-4">
      {err && <p className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12px] text-amber-900">{err}</p>}

      <Card>
        <CardHead title="Your photo" sub="Shown on your dashboard when a status has no photo of its own" />
        <div className="px-5 pb-5"><Photo src={extra.profilePhoto} label="Upload photo" onPick={(f) => pick(f, (u) => save({ profilePhoto: u }))} onClear={() => save({ profilePhoto: undefined })} /></div>
      </Card>

      <Card>
        <CardHead title="Financial status labels" sub="Three photos for three situations. Names and thresholds are yours to edit — they are personal dashboard labels, not official classifications." />
        <div className="px-5 pb-5 grid gap-4 lg:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.key} className={`rounded-xl border p-4 space-y-3 ${cur.tier.key === t.key ? 'border-brand-400 bg-brand-50/40' : 'border-[#e2e8f0]'}`}>
              {cur.tier.key === t.key && <span className="chip bg-brand-600 text-white">Current</span>}
              <Field label="Label"><input className="input" value={t.label} onChange={(e) => setTier(t.key, { label: e.target.value })} /></Field>
              <Field label={t.key === 'poor' ? 'Starts at score' : 'Starts at score (0–100)'}>
                <input className="input" type="number" min={0} max={100} disabled={t.key === 'poor'} value={t.from} onChange={(e) => setTier(t.key, { from: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
              </Field>
              <Photo src={t.photo} label="Upload photo" onPick={(f) => pick(f, (u) => setTier(t.key, { photo: u }))} onClear={() => setTier(t.key, { photo: undefined })} />
            </div>
          ))}
        </div>
        <div className="px-5 pb-5"><button className="btn-ghost" onClick={() => save({ statusTiers: DEFAULT_TIERS })}>Reset names and thresholds</button></div>
      </Card>

      <Card>
        <CardHead title="How your status is worked out" sub={`Right now: score ${cur.score}/100 → “${cur.tier.label}”`} />
        <div className="px-5 pb-5 grid gap-3 sm:grid-cols-2">
          {cur.parts.map((p) => (
            <div key={p.key} className="rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex justify-between text-[12.5px] font-bold text-slate-700"><span>{p.label}</span><span>{p.points} / {p.max}</span></div>
              <p className="text-[11.5px] text-slate-500 mt-1">{p.detail}</p>
            </div>
          ))}
          <div className="sm:col-span-2 text-[12px] text-slate-600 leading-relaxed space-y-1">
            <p>Four equal parts, 25 points each: <b>available funds</b> (months of spending covered, 6+ is full marks), <b>net worth</b> (compared with a year of spending, 5+ years is full marks), <b>saving</b> (share of income kept, 30%+ is full marks) and <b>debt burden</b> (share of income going to debt payments, 0% is full marks).</p>
            <p>Asset value alone cannot make the label “{tiers[2].label}”: cash, saving and debt count just as much. Averages use your last few months of income and spending.</p>
            {cur.caveats.length > 0 && <p className="text-amber-700"><b>Incomplete right now:</b> {cur.caveats.join(' ')}</p>}
          </div>
        </div>
      </Card>
    </div>
  )
}
