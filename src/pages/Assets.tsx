import { useEffect, useMemo, useState } from 'react'
import { Coins, History, ImagePlus, Landmark, Loader2, Pencil, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, Empty, PageHeader, StatCard } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { CloudImage } from '@/components/FileLink'
import { fmtDate, money, toBase, TODAY } from '@/lib/format'
import { ASSET_CATEGORIES, CATEGORY_ICON, inrWords, linkedDebt, ownedShare, valuationAge, valuationSteps } from '@/lib/assets'
import { KARATS, fetchGoldRate, goldHoldingValue, type GoldMeta, type GoldRateQuote } from '@/lib/gold'
import { removeFile, storageReady, uploadFile } from '@/lib/storage'
import { resizeImage } from '@/lib/image'
import { readFileAsDataUrl } from '@/lib/gemini'
import type { Asset, Currency } from '@/types'

const DEFAULT_DUTY = 6

const blank = () => ({
  name: '', category: 'Property', custom: '', owner: '', purchaseDate: '', purchasePrice: '', currency: 'AED' as Currency,
  currentValue: '', ownershipPct: '100', linkedLoanId: '', notes: '',
  grams: '', karat: '22', makingCharges: '', rateMode: 'live' as GoldMeta['rateMode'], manualRate: '',
})

/** "Estimate" is always shown: these are opinions of value, not market prices you can bank. */
const Est = () => <span className="chip bg-amber-50 text-amber-700">Estimate</span>

export default function Assets() {
  const { assets, assetValuations, goldRates, loans, people, addAsset, updateAsset, removeAsset, addValuation, removeValuation, addGoldRate, settings } = useStore()
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [valFor, setValFor] = useState<Asset | null>(null)
  const [histFor, setHistFor] = useState<Asset | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [rateMsg, setRateMsg] = useState<string | null>(null)

  const cats = useMemo(() => ['All', ...new Set([...ASSET_CATEGORIES, ...assets.map((a) => a.category)])], [assets])
  const list = assets.filter((a) => filter === 'All' || a.category === filter)

  const ownedBase = assets.reduce((n, a) => n + toBase(ownedShare(a), a.currency), 0)
  const grossBase = assets.reduce((n, a) => n + toBase(a.currentValue, a.currency), 0)
  const debtBase = assets.reduce((n, a) => {
    const l = linkedDebt(a, loans)
    return n + (l ? toBase(l.outstanding, l.currency) : 0)
  }, 0)
  const latestRate = [...goldRates].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]
  const hasGold = assets.some((a) => a.category === 'Gold')

  /** Fetch today's rate, log it, and revalue every live-priced gold holding. */
  const refreshGold = async (silent = false) => {
    setRefreshing(true); setRateMsg(null)
    try {
      const q = await fetchGoldRate(DEFAULT_DUTY)
      addGoldRate({ date: TODAY, perGram24k: q.perGram24k, currency: 'INR', source: q.source, manual: false, fetchedAt: q.fetchedAt })
      for (const a of assets.filter((x) => x.category === 'Gold')) {
        const m = a.meta as GoldMeta | undefined
        if (!m || m.rateMode === 'manual') continue
        const v = goldHoldingValue({ grams: m.grams, karat: m.karat, perGram24k: q.perGram24k, ownershipPct: a.ownershipPct })
        if (v.fullValue !== a.currentValue) addValuation({ assetId: a.id, date: TODAY, value: v.fullValue, currency: 'INR', source: 'gold-rate', rate: q.perGram24k, note: `24K ₹${q.perGram24k}/g` })
      }
      if (!silent) setRateMsg(`Updated: ₹${q.perGram24k.toLocaleString('en-IN')} per gram (24K), estimate.`)
    } catch (e) {
      setRateMsg(`${e instanceof Error ? e.message : String(e)} Enter a rate by hand on the gold asset instead.`)
    }
    setRefreshing(false)
  }

  // Keep gold current without asking: refresh on open when the last rate is over 6 hours old.
  useEffect(() => {
    if (!hasGold) return
    const age = latestRate ? Date.now() - new Date(latestRate.fetchedAt).getTime() : Infinity
    if (age > 6 * 3600 * 1000) refreshGold(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGold])

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Assets & Properties"
        subtitle="Property, gold, vehicles, electronics and investments — valued by your ownership share."
        actions={
          <div className="flex gap-2">
            {hasGold && <button className="btn-ghost" onClick={() => refreshGold(false)} disabled={refreshing}>{refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Update gold rate</button>}
            <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}><Plus size={15} /> Add Asset</button>
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Owned Value (my share)" value={money(ownedBase)} icon={<Landmark size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">Before related debt</span>} />
        <StatCard label="Full Value of Assets" value={money(grossBase)} icon={<Coins size={20} />} tint="#8b5cf6" footer={<span className="text-slate-400">{assets.length} asset{assets.length === 1 ? '' : 's'}</span>} />
        <StatCard label="Linked Loans" value={money(debtBase)} icon={<TrendingDown size={20} />} tint="#ef4444" footer={<span className="text-slate-400">Subtracted once, in net worth</span>} />
        <StatCard label="Owned, after linked debt" value={money(ownedBase - debtBase)} icon={<TrendingUp size={20} />} tint="#10b981" footer={<span className="text-slate-400">Estimate</span>} />
      </div>

      {hasGold && (
        <div className="card px-5 py-3.5 bg-amber-50/50 border-amber-100 text-[12.5px] text-amber-900 flex flex-wrap items-center gap-x-6 gap-y-1">
          <Coins size={16} className="text-amber-600" />
          {latestRate ? (
            <>
              <span><b>24K gold:</b> ₹{latestRate.perGram24k.toLocaleString('en-IN')} / gram</span>
              <span>{latestRate.manual ? 'Entered by hand' : 'Live estimate'} · updated {new Date(latestRate.fetchedAt).toLocaleString()}</span>
              <span className="text-[11.5px] text-amber-800/80">{latestRate.source}</span>
            </>
          ) : <span>No gold rate yet — press “Update gold rate”, or enter one on the asset.</span>}
          {rateMsg && <span className="basis-full text-[12px]">{rateMsg}</span>}
          <span className="basis-full text-[11.5px] text-amber-800/80">All gold values are estimates. Making charges and GST paid to a jeweller are not counted as recoverable gold value. India's import duty is assumed at {DEFAULT_DUTY}% on top of international spot — it is a setting-level assumption, not a quoted price; use a manual rate for your jeweller's or IBJA's figure.</span>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {cats.map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`chip cursor-pointer transition ${filter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card><Empty text="No assets yet — add a property, gold, a car or an investment." /></Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((a) => {
            const share = ownedShare(a)
            const loan = linkedDebt(a, loans)
            const age = valuationAge(a, TODAY)
            const gold = a.category === 'Gold' ? (a.meta as GoldMeta | undefined) : undefined
            const steps = valuationSteps(assetValuations.filter((v) => v.assetId === a.id))
            const last = steps[0]
            return (
              <div key={a.id} className="card overflow-hidden flex flex-col">
                <div className="relative h-40 bg-slate-100">
                  {a.photos[0] ? (
                    <CloudImage path={a.photos[0]} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-5xl bg-gradient-to-br from-brand-50 to-slate-100">{CATEGORY_ICON[a.category] ?? '📦'}</div>
                  )}
                  <span className="absolute left-3 top-3 chip bg-white/90 text-slate-700 shadow-sm">{CATEGORY_ICON[a.category] ?? '📦'} {a.category}</span>
                  {a.photos.length > 1 && <span className="absolute right-3 top-3 chip bg-black/50 text-white">+{a.photos.length - 1}</span>}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <p className="text-[15px] font-extrabold text-slate-900 leading-tight">{a.name}</p>
                  <p className="text-[11.5px] text-slate-400">{a.owner ? `Owner: ${a.owner}` : 'Owner not set'}{a.purchaseDate ? ` · bought ${fmtDate(a.purchaseDate)}` : ''}</p>

                  <div className="mt-3 rounded-xl bg-brand-50/60 px-3.5 py-2.5">
                    <div className="flex items-center justify-between"><span className="text-[10.5px] uppercase tracking-wide text-slate-500">My share · {a.ownershipPct}%</span><Est /></div>
                    <p className="text-[20px] font-extrabold text-brand-700 tabular-nums leading-tight">{money(share, a.currency)}</p>
                    {a.currency === 'INR' && share >= 100000 && <p className="text-[11px] text-slate-500">{inrWords(share)}</p>}
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                    <span className="text-slate-400">Full value</span><b className="text-right tabular-nums">{money(a.currentValue, a.currency)}</b>
                    {a.purchasePrice !== undefined && <><span className="text-slate-400">Bought for</span><b className="text-right tabular-nums">{money(a.purchasePrice, a.currency)}</b></>}
                    {loan && <><span className="text-slate-400">Linked loan</span><b className="text-right tabular-nums text-rose-600">{money(loan.outstanding, loan.currency)}</b></>}
                    {gold && <><span className="text-slate-400">Weight</span><b className="text-right">{gold.grams} g · {gold.karat}K</b></>}
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400">
                    Valued {a.valuationDate ? fmtDate(a.valuationDate) : 'never'}
                    {age > 180 && <b className="text-amber-600"> · out of date</b>}
                    {last?.delta !== undefined && (
                      <span className={last.delta >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}> · {last.delta >= 0 ? '▲' : '▼'} {money(Math.abs(last.delta), a.currency)} ({Math.abs(last.pct ?? 0)}%) since previous</span>
                    )}
                  </div>
                  {gold && <p className="text-[10.5px] text-slate-400 mt-1">{gold.rateMode === 'manual' ? `Manual rate ₹${gold.manualRate}/g (24K)` : 'Live rate'} · making charges not counted</p>}

                  <div className="mt-auto pt-3 flex items-center gap-1.5">
                    <button onClick={() => setValFor(a)} className="btn-soft h-8 flex-1 text-[12px]">Update value</button>
                    <button onClick={() => setHistFor(a)} title="Valuation history" className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"><History size={14} /></button>
                    <button onClick={() => { setEditing(a); setModal(true) }} title="Edit" className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"><Pencil size={14} /></button>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Delete ${a.name} and its valuation history?`)) return
                        for (const p of [...a.photos, ...a.attachments]) if (!p.startsWith('data:')) await removeFile(p).catch(() => undefined)
                        removeAsset(a.id)
                      }}
                      title="Delete" className="h-8 w-8 grid place-items-center rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    ><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AssetModal
        open={modal}
        onClose={() => setModal(false)}
        editing={editing}
        people={people.map((p) => p.name)}
        loans={loans.map((l) => ({ id: l.id, label: `${l.name} — ${l.lender}` }))}
        defaultCurrency={settings.baseCurrency}
        onSave={(data, gold) => {
          if (editing) {
            updateAsset(editing.id, data)
            // A changed value is a valuation, so the history keeps it.
            if (data.currentValue !== undefined && (data.currentValue !== editing.currentValue))
              addValuation({ assetId: editing.id, date: TODAY, value: data.currentValue, currency: data.currency ?? editing.currency, source: gold ? 'gold-rate' : 'manual', rate: gold?.rate, note: 'Edited' })
          } else {
            addAsset({ ...(data as Omit<Asset, 'id'>), valuationDate: data.valuationDate ?? TODAY })
          }
        }}
      />
      <ValuationModal asset={valFor} onClose={() => setValFor(null)} onSave={(v) => valFor && addValuation({ assetId: valFor.id, currency: valFor.currency, source: 'manual', ...v })} />
      <HistoryModal asset={histFor} onClose={() => setHistFor(null)} history={assetValuations} onRemove={removeValuation} />
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function AssetModal({
  open, onClose, editing, people, loans, defaultCurrency, onSave,
}: {
  open: boolean
  onClose: () => void
  editing: Asset | null
  people: string[]
  loans: { id: string; label: string }[]
  defaultCurrency: Currency
  onSave: (data: Partial<Asset> & { name: string; currency: Currency }, gold?: { rate: number }) => void
}) {
  const goldRates = useStore((s) => s.goldRates)
  const [f, setF] = useState(blank())
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [quote, setQuote] = useState<GoldRateQuote | null>(null)
  const [quoting, setQuoting] = useState(false)

  useEffect(() => {
    if (!open) return
    setErr(null); setQuote(null)
    if (editing) {
      const g = editing.meta as Partial<GoldMeta> | undefined
      const known = (ASSET_CATEGORIES as readonly string[]).includes(editing.category)
      setF({
        name: editing.name, category: known ? editing.category : 'Custom', custom: known ? '' : editing.category, owner: editing.owner ?? '',
        purchaseDate: editing.purchaseDate ?? '', purchasePrice: editing.purchasePrice !== undefined ? String(editing.purchasePrice) : '',
        currency: editing.currency, currentValue: String(editing.currentValue), ownershipPct: String(editing.ownershipPct),
        linkedLoanId: editing.linkedLoanId ?? '', notes: editing.notes ?? '',
        grams: g?.grams ? String(g.grams) : '', karat: String(g?.karat ?? 22), makingCharges: g?.makingCharges ? String(g.makingCharges) : '',
        rateMode: g?.rateMode ?? 'live', manualRate: g?.manualRate ? String(g.manualRate) : '',
      })
      setPhotos(editing.photos)
    } else {
      setF({ ...blank(), currency: defaultCurrency })
      setPhotos([])
    }
  }, [open, editing, defaultCurrency])

  const isGold = f.category === 'Gold'
  const category = f.category === 'Custom' ? f.custom.trim() || 'Other' : f.category
  const lastRate = [...goldRates].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]
  const rate = f.rateMode === 'manual' ? Number(f.manualRate) : quote?.perGram24k ?? lastRate?.perGram24k ?? 0
  const gold = isGold && Number(f.grams) > 0 && rate > 0
    ? goldHoldingValue({ grams: Number(f.grams), karat: Number(f.karat), perGram24k: rate, ownershipPct: Number(f.ownershipPct) || 100 })
    : null

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setErr(null)
    try {
      const out: string[] = []
      for (const file of [...files].slice(0, 4)) {
        if (storageReady()) out.push((await uploadFile(file, 'assets')).path)
        else out.push(await resizeImage(await readFileAsDataUrl(file), 640)) // no cloud storage: keep a small copy with the record
      }
      setPhotos((p) => [...p, ...out].slice(0, 6))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  const fetchQuote = async () => {
    setQuoting(true); setErr(null)
    try { setQuote(await fetchGoldRate(DEFAULT_DUTY)) } catch (e) { setErr(`${e instanceof Error ? e.message : e} — enter a manual rate below.`) }
    setQuoting(false)
  }

  const value = isGold ? gold?.fullValue ?? 0 : Number(f.currentValue) || 0
  const pct = Math.min(100, Math.max(0, Number(f.ownershipPct) || 0))
  const ok = f.name.trim() && pct > 0 && (isGold ? Boolean(gold) : value >= 0 && f.currentValue !== '')

  const submit = () => {
    if (!ok) return
    const meta: GoldMeta | undefined = isGold
      ? { grams: Number(f.grams), karat: Number(f.karat), makingCharges: Number(f.makingCharges) || undefined, rateMode: f.rateMode, manualRate: f.rateMode === 'manual' ? Number(f.manualRate) : undefined }
      : undefined
    onSave(
      {
        name: f.name.trim(), category, owner: f.owner || undefined, purchaseDate: f.purchaseDate || undefined,
        purchasePrice: f.purchasePrice !== '' ? Number(f.purchasePrice) : undefined,
        currency: isGold ? 'INR' : f.currency, currentValue: value, ownershipPct: pct, linkedLoanId: f.linkedLoanId || undefined,
        photos, attachments: editing?.attachments ?? [], notes: f.notes.trim() || undefined, meta, valuationDate: TODAY,
      },
      isGold ? { rate } : undefined,
    )
    if (isGold && !editing && f.rateMode === 'manual' && rate > 0) {
      useStore.getState().addGoldRate({ date: TODAY, perGram24k: rate, currency: 'INR', source: 'Entered by hand', manual: true, fetchedAt: new Date().toISOString() })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Asset' : 'Add Asset'}
      subtitle="Estimated value and your ownership share"
      width="max-w-2xl"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary disabled:opacity-50" disabled={!ok || busy} onClick={submit}>{editing ? 'Save' : 'Add Asset'}</button></>}
    >
      <div className="grid grid-cols-2 gap-4">
        {err && <p className="col-span-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12px] text-amber-900">{err}</p>}
        <Field label="Name" className="col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={isGold ? 'e.g. Wedding gold' : 'e.g. Kochi apartment'} autoFocus /></Field>
        <Field label="Category">
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}<option value="Custom">Custom…</option>
          </select>
        </Field>
        {f.category === 'Custom' ? (
          <Field label="Custom category"><input className="input" value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} placeholder="e.g. Art" /></Field>
        ) : (
          <Field label="Owner"><input className="input" list="asset-owners" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /><datalist id="asset-owners">{people.map((p) => <option key={p} value={p} />)}</datalist></Field>
        )}

        {isGold ? (
          <div className="col-span-2 rounded-xl bg-amber-50/50 border border-amber-100 p-3.5 grid grid-cols-2 gap-3">
            <Field label="Weight (grams)"><input className="input" type="number" min="0" step="0.01" value={f.grams} onChange={(e) => setF({ ...f, grams: e.target.value })} /></Field>
            <Field label="Purity (karat)"><select className="input" value={f.karat} onChange={(e) => setF({ ...f, karat: e.target.value })}>{KARATS.map((k) => <option key={k} value={k}>{k}K</option>)}</select></Field>
            <Field label="Ownership %"><input className="input" type="number" min="0" max="100" value={f.ownershipPct} onChange={(e) => setF({ ...f, ownershipPct: e.target.value })} /></Field>
            <Field label="Making charges paid (not counted)"><input className="input" type="number" min="0" value={f.makingCharges} onChange={(e) => setF({ ...f, makingCharges: e.target.value })} placeholder="optional" /></Field>
            <div className="col-span-2 flex flex-wrap items-center gap-2">
              {(['live', 'manual'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setF({ ...f, rateMode: m })} className={`chip cursor-pointer ${f.rateMode === m ? 'bg-brand-600 text-white' : 'bg-white border border-[#e2e8f0] text-slate-600'}`}>{m === 'live' ? 'Live rate' : 'Manual rate'}</button>
              ))}
              {f.rateMode === 'live' ? (
                <button type="button" className="btn-soft h-8" onClick={fetchQuote} disabled={quoting}>{quoting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Fetch rate</button>
              ) : (
                <input className="input h-8 w-48" type="number" min="0" placeholder="₹ per gram, 24K" value={f.manualRate} onChange={(e) => setF({ ...f, manualRate: e.target.value })} />
              )}
              <span className="text-[11.5px] text-slate-500">{rate > 0 ? `24K ₹${rate.toLocaleString('en-IN')}/g${quote ? ` · ${quote.source}` : ''}` : 'No rate yet'}</span>
            </div>
            {gold && (
              <div className="col-span-2 rounded-lg bg-white px-3 py-2.5 text-[12px] text-slate-600">
                {f.grams} g × {f.karat}K → {gold.pureGrams} g pure gold × ₹{rate.toLocaleString('en-IN')} = <b>₹{gold.fullValue.toLocaleString('en-IN')}</b> full value · your {pct}% = <b className="text-brand-700">₹{gold.myShare.toLocaleString('en-IN')}</b> <Est />
              </div>
            )}
          </div>
        ) : (
          <>
            <Field label="Currency"><select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}><option>AED</option><option>INR</option><option>USD</option></select></Field>
            <Field label="Current estimated full value"><input className="input" type="number" min="0" value={f.currentValue} onChange={(e) => setF({ ...f, currentValue: e.target.value })} /></Field>
            <Field label="My ownership %"><input className="input" type="number" min="0" max="100" step="0.01" value={f.ownershipPct} onChange={(e) => setF({ ...f, ownershipPct: e.target.value })} /></Field>
            <div className="rounded-xl bg-brand-50/60 px-3.5 py-2 self-end">
              <p className="text-[10.5px] text-slate-500">My calculated share</p>
              <p className="text-[15px] font-extrabold text-brand-700 tabular-nums">{money(((Number(f.currentValue) || 0) * pct) / 100, f.currency)}</p>
            </div>
          </>
        )}

        <Field label="Purchase date"><input className="input" type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} /></Field>
        <Field label="Purchase price"><input className="input" type="number" min="0" value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: e.target.value })} /></Field>
        <Field label="Linked loan (optional)" className="col-span-2">
          <select className="input" value={f.linkedLoanId} onChange={(e) => setF({ ...f, linkedLoanId: e.target.value })}>
            <option value="">None</option>{loans.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="Photos" className="col-span-2">
          <div className="flex flex-wrap gap-2 items-center">
            {photos.map((p, i) => (
              <div key={p} className="relative h-16 w-16 rounded-lg overflow-hidden bg-slate-100">
                <CloudImage path={p} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white/90 grid place-items-center text-slate-600 cursor-pointer"><X size={10} /></button>
              </div>
            ))}
            <label className="h-16 w-16 rounded-lg border-2 border-dashed border-[#e2e8f0] grid place-items-center text-slate-400 hover:text-brand-600 hover:border-brand-300 cursor-pointer">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={17} />}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
            </label>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{storageReady() ? 'Stored privately in your cloud storage.' : 'Cloud storage is not available yet, so a small copy is kept with the record.'}</p>
        </Field>
        <Field label="Notes" className="col-span-2"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

function ValuationModal({ asset, onClose, onSave }: { asset: Asset | null; onClose: () => void; onSave: (v: { value: number; date: string; note?: string }) => void }) {
  const [value, setValue] = useState('')
  const [date, setDate] = useState(TODAY)
  const [note, setNote] = useState('')
  useEffect(() => { if (asset) { setValue(String(asset.currentValue)); setDate(TODAY); setNote('') } }, [asset])
  if (!asset) return null
  const isGold = asset.category === 'Gold'
  return (
    <Modal open onClose={onClose} title={`Update value — ${asset.name}`}
      subtitle="Adds a new valuation; the earlier ones stay in the history"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!(Number(value) >= 0) || value === ''} onClick={() => { onSave({ value: Number(value), date, note: note.trim() || undefined }); onClose() }}>Save valuation</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label={`New full value (${asset.currency})`}><input className="input" type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
        <Field label="Valuation date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note (optional)" className="col-span-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Broker estimate, market comparison" /></Field>
        <p className="col-span-2 text-[11.5px] text-slate-500">
          Values do not stay at the purchase price — vehicles and electronics usually fall, property may rise or fall.
          {isGold ? ' Gold normally updates itself from the gold rate; use this for a manual correction.' : ''} Your {asset.ownershipPct}% share of the new value is {money(((Number(value) || 0) * asset.ownershipPct) / 100, asset.currency)}.
        </p>
      </div>
    </Modal>
  )
}

function HistoryModal({ asset, onClose, history, onRemove }: { asset: Asset | null; onClose: () => void; history: import('@/types').AssetValuation[]; onRemove: (id: string) => void }) {
  if (!asset) return null
  const steps = valuationSteps(history.filter((v) => v.assetId === asset.id))
  return (
    <Modal open onClose={onClose} title={`Valuation history — ${asset.name}`} subtitle="Every estimate, newest first" width="max-w-2xl"
      footer={<button className="btn-primary" onClick={onClose}>Close</button>}>
      {steps.length === 0 ? <Empty text="No valuations recorded yet." /> : (
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-[10.5px] uppercase tracking-wide text-slate-400 text-left"><th className="py-1.5 font-semibold">Date</th><th className="py-1.5 font-semibold text-right">Full value</th><th className="py-1.5 font-semibold text-right">My {asset.ownershipPct}%</th><th className="py-1.5 font-semibold text-right">Change</th><th className="py-1.5 font-semibold">Source</th><th /></tr></thead>
          <tbody>
            {steps.map(({ v, delta, pct }) => (
              <tr key={v.id} className="border-t border-[#eef2f8]">
                <td className="py-2 whitespace-nowrap">{fmtDate(v.date)}</td>
                <td className="py-2 text-right font-bold tabular-nums">{money(v.value, v.currency)}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">{money((v.value * asset.ownershipPct) / 100, v.currency)}</td>
                <td className={`py-2 text-right tabular-nums ${delta === undefined ? 'text-slate-300' : delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{delta === undefined ? '—' : `${delta >= 0 ? '+' : '−'}${money(Math.abs(delta), v.currency)} (${Math.abs(pct ?? 0)}%)`}</td>
                <td className="py-2 text-slate-500">{v.source === 'gold-rate' ? `Gold rate${v.rate ? ` ₹${v.rate}/g` : ''}` : v.source === 'purchase' ? 'Purchase' : 'Manual'}{v.note ? <span className="block text-[10.5px] text-slate-400">{v.note}</span> : null}</td>
                <td className="py-2 text-right"><button onClick={() => window.confirm('Remove this valuation?') && onRemove(v.id)} className="text-slate-300 hover:text-rose-600 cursor-pointer"><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
