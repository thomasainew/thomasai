import { useState } from 'react'
import { Loader2, RefreshCw, Save } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead } from '@/components/ui/Primitives'
import { Field } from '@/components/ui/Modal'
import { FX } from '@/data/seed'
import { TODAY, fmtDate, setFxRates } from '@/lib/format'
import type { Currency } from '@/types'

/** Reporting currency and the exchange rates every figure is converted with — each dated. */
export function RatesTab() {
  const { settings, updateSettings } = useStore()
  const saved = settings.extra?.fx
  const [inr, setInr] = useState(String(saved?.rates.INR ?? FX.INR))
  const [usd, setUsd] = useState(String(saved?.rates.USD ?? FX.USD))
  const [source, setSource] = useState(saved?.source ?? 'Built-in default')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const persist = (rates: Record<string, number>, src: string) => {
    setFxRates(rates)
    updateSettings({ extra: { ...(settings.extra ?? {}), fx: { rates: { AED: 1, ...rates }, date: TODAY, source: src } } })
    setSource(src)
    setMsg(`Saved — rates as of ${fmtDate(TODAY)}.`)
  }

  const fetchLive = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/AED')
      if (!r.ok) throw new Error(`Rate service returned ${r.status}`)
      const j = await r.json()
      const i = 1 / Number(j.rates?.INR)
      const u = 1 / Number(j.rates?.USD)
      if (!(i > 0) || !(u > 0)) throw new Error('The service did not return INR and USD rates.')
      setInr(i.toFixed(5)); setUsd(u.toFixed(4))
      persist({ INR: Number(i.toFixed(5)), USD: Number(u.toFixed(4)) }, `open.er-api.com, ${j.time_last_update_utc?.slice(0, 16) ?? TODAY}`)
    } catch (e) {
      setMsg(`${e instanceof Error ? e.message : e} — enter the rates by hand instead.`)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHead title="Reporting currency" sub="Totals, net worth and reports are shown in this currency" />
        <div className="px-5 pb-5 max-w-xs">
          <select className="input" value={settings.baseCurrency} onChange={(e) => updateSettings({ baseCurrency: e.target.value as Currency })}>
            <option>AED</option><option>INR</option><option>USD</option>
          </select>
        </div>
      </Card>
      <Card>
        <CardHead title="Exchange rates" sub={`Value of 1 unit in AED · set ${saved ? fmtDate(saved.date) : 'never (built-in defaults)'} · ${source}`} />
        <div className="px-5 pb-5 grid grid-cols-2 gap-4">
          <Field label="1 INR = ? AED"><input className="input" type="number" step="0.00001" value={inr} onChange={(e) => setInr(e.target.value)} /></Field>
          <Field label="1 USD = ? AED"><input className="input" type="number" step="0.0001" value={usd} onChange={(e) => setUsd(e.target.value)} /></Field>
          <div className="col-span-2 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => persist({ INR: Number(inr), USD: Number(usd) }, 'Entered by hand')} disabled={!(Number(inr) > 0) || !(Number(usd) > 0)}><Save size={15} /> Save rates</button>
            <button className="btn-ghost" onClick={fetchLive} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Fetch today's rates</button>
          </div>
          {msg && <p className="col-span-2 text-[12px] text-slate-600">{msg}</p>}
          <p className="col-span-2 text-[11.5px] text-slate-400">The date and source are kept with the rates and shown on the dashboard, so a figure can always be traced to the rate it used. Historical transactions are converted at the current rate when totals are shown.</p>
        </div>
      </Card>
    </div>
  )
}
