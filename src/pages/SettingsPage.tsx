import { useState } from 'react'
import { Cloud, CloudOff, Database, Download, Loader2, LogOut, RefreshCw, RotateCcw, Save, Upload, User } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, PageHeader } from '@/components/ui/Primitives'
import { Field } from '@/components/ui/Modal'
import { money } from '@/lib/format'
import { hasSupabase, supabase } from '@/lib/supabase'
import { COLLECTIONS, pullAll, pushAll, replaceRemote, wipeRemote } from '@/lib/sync'
import type { Currency } from '@/types'
import { AppearanceTab } from '@/pages/settings/AppearanceTab'
import { StatusTab } from '@/pages/settings/StatusTab'
import { RatesTab } from '@/pages/settings/RatesTab'
import { SecurityTab } from '@/pages/settings/SecurityTab'
import { VerificationTab } from '@/pages/settings/VerificationTab'
import { FamilyTab } from '@/pages/settings/FamilyTab'
import { SeoTab } from '@/pages/settings/SeoTab'

function GeneralSettings() {
  const store = useStore()
  const { settings, updateSettings, clearAllData, userId, userEmail, syncError, lastSynced, hydrate } = store
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState<'push' | 'pull' | 'reset' | 'import' | null>(null)
  const [cloudMsg, setCloudMsg] = useState<string | null>(null)

  const flash = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const exportJson = () => {
    // Built from the collection list rather than a hand-written object, so a
    // collection added later cannot quietly go missing from backups — which is
    // exactly what happened to categories.
    const state = useStore.getState() as unknown as Record<string, unknown>
    const data: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      settings: store.settings,
    }
    for (const c of COLLECTIONS) data[c] = state[c] ?? []
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `cloudbasket360-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      let data: any
      try {
        data = JSON.parse(String(reader.result))
      } catch {
        alert('That file could not be read as a CloudBasket 360 backup.')
        return
      }
      // A stray JSON file would otherwise be merged straight into the store.
      const required = ['settings', 'accounts', 'transactions'] as const
      const shaped =
        data && typeof data === 'object' && !Array.isArray(data) &&
        required.every((k) => k in data) &&
        Array.isArray(data.accounts) && Array.isArray(data.transactions)
      if (!shaped) {
        alert('That file is not a CloudBasket 360 backup — expected settings, accounts and transactions.')
        return
      }

      useStore.setState(data)
      setCloudMsg(null)
      flash()

      if (!userId) return
      setBusy('import')
      try {
        await replaceRemote(useStore.getState(), userId)
        setCloudMsg('Backup imported and pushed to Supabase.')
        useStore.setState({ syncError: null, lastSynced: new Date().toISOString() })
      } catch (e) {
        useStore.setState({ syncError: e instanceof Error ? e.message : String(e) })
      }
      setBusy(null)
    }
    reader.readAsText(file)
  }

  const counts = [
    ['Accounts', store.accounts.length],
    ['Transactions', store.transactions.length],
    ['Budgets', store.budgets.length],
    ['Loans', store.loans.length],
    ['People', store.people.length],
    ['Bills', store.bills.length],
    ['Documents', store.documents.length],
    ['Notes', store.notes.length],
    ['Goals', store.goals.length],
    ['Price Watch', store.priceWatch.length],
    ['Categories', store.categories.length],
    ['Sub-categories', store.subcategories.length],
  ] as const

  return (
    <div className="space-y-5">
      
      {saved && (
        <div className="card px-5 py-3 bg-emerald-50/70 border-emerald-100 text-[13px] font-semibold text-emerald-800">
          ✅ Saved.
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHead title="Profile" sub="How CloudBasket 360 greets you" right={<User size={16} className="text-slate-400" />} />
          <div className="px-5 pb-5 grid grid-cols-2 gap-4">
            <Field label="Your Name" className="col-span-2">
              <input className="input" value={settings.userName} onChange={(e) => updateSettings({ userName: e.target.value })} />
            </Field>
            <Field label="Account Label" className="col-span-2">
              <input className="input" value={settings.accountLabel} onChange={(e) => updateSettings({ accountLabel: e.target.value })} placeholder="Personal Account" />
            </Field>
            <Field label="Phone Number" className="col-span-2">
              <input className="input" type="tel" value={settings.phone} onChange={(e) => updateSettings({ phone: e.target.value })} placeholder="+971 50 123 4567" />
            </Field>
            <Field label="Base Currency">
              <select className="input" value={settings.baseCurrency} onChange={(e) => updateSettings({ baseCurrency: e.target.value as Currency })}>
                <option>AED</option><option>INR</option><option>USD</option>
              </select>
            </Field>
            <div className="flex items-end">
              <button className="btn-primary w-full" onClick={flash}><Save size={15} /> Save Profile</button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Targets & Period" sub="Drives the dashboard progress bars and AI plan" />
          <div className="px-5 pb-5 grid grid-cols-2 gap-4">
            <Field label="Monthly Income Target (AED)">
              <input className="input" type="number" value={settings.monthlyIncomeTarget} onChange={(e) => updateSettings({ monthlyIncomeTarget: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Monthly Budget (AED)">
              <input className="input" type="number" value={settings.monthlyBudget} onChange={(e) => updateSettings({ monthlyBudget: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Period Start">
              <input className="input" type="date" value={settings.periodStart} onChange={(e) => updateSettings({ periodStart: e.target.value })} />
            </Field>
            <Field label="Period End">
              <input className="input" type="date" value={settings.periodEnd} onChange={(e) => updateSettings({ periodEnd: e.target.value })} />
            </Field>
            <div className="col-span-2 rounded-xl bg-slate-50 px-4 py-3 text-[12px] text-slate-600">
              Income target {money(settings.monthlyIncomeTarget)} · Budget {money(settings.monthlyBudget)} · Headroom{' '}
              <b className="text-slate-800">{money(settings.monthlyIncomeTarget - settings.monthlyBudget)}</b>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead
            title="Your Data"
            sub={userId ? 'Synced to Supabase, cached in this browser' : 'Stored locally in this browser'}
            right={<Database size={16} className="text-slate-400" />}
          />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {counts.map(([label, n]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-[16px] font-extrabold text-slate-800 leading-none">{n}</p>
                  <p className="text-[10.5px] text-slate-400 mt-1">{label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button className="btn-ghost" onClick={exportJson}><Download size={15} /> Export</button>
              <label className="btn-ghost cursor-pointer">
                <Upload size={15} /> Import
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
                />
              </label>
              <button
                className="btn bg-rose-50 text-rose-700 hover:bg-rose-100"
                disabled={busy !== null}
                onClick={async () => {
                  const where = userId ? 'from Supabase and this browser' : 'from this browser'
                  if (!confirm(`Delete every account, transaction, budget, loan, bill, document, note, goal and purchase ${where}? This cannot be undone — export a backup first if you want one.`)) return
                  clearAllData()
                  flash()
                  if (!userId) return
                  setBusy('reset'); setCloudMsg(null)
                  try {
                    await wipeRemote(userId)
                    setCloudMsg('All data cleared.')
                    useStore.setState({ syncError: null, lastSynced: new Date().toISOString() })
                  } catch (e) {
                    useStore.setState({ syncError: e instanceof Error ? e.message : String(e) })
                  }
                  setBusy(null)
                }}
              >
                {busy === 'reset' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Clear All
              </button>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-3 leading-relaxed">
              {userId
                ? 'Your rows live in Supabase; this browser keeps a local cache under thomas-finance-v1. Import and Reset apply to both.'
                : "Data lives in this browser's local storage under thomas-finance-v1. Export regularly if it matters — clearing site data wipes it."}
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHead
            title="Cloud Sync"
            sub={hasSupabase ? 'Your data is stored in your own Supabase project' : 'Not configured — running local-only'}
            right={hasSupabase ? <Cloud size={16} className="text-brand-500" /> : <CloudOff size={16} className="text-slate-400" />}
          />
          <div className="px-5 pb-5">
            {!hasSupabase && (
              <p className="text-[12.5px] text-slate-500 leading-relaxed">
                Add <code className="text-[11px]">VITE_SUPABASE_URL</code> and{' '}
                <code className="text-[11px]">VITE_SUPABASE_ANON_KEY</code> to <code className="text-[11px]">.env.local</code>,
                then restart the dev server to enable sign-in and cloud sync.
              </p>
            )}

            {hasSupabase && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                    <p className="text-[10.5px] text-slate-400">Signed in as</p>
                    <p className="text-[12.5px] font-bold text-slate-800 truncate">{userEmail ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                    <p className="text-[10.5px] text-slate-400">Status</p>
                    <p className={`text-[12.5px] font-bold ${syncError ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {syncError ? 'Sync error' : 'Connected'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                    <p className="text-[10.5px] text-slate-400">Last synced</p>
                    <p className="text-[12.5px] font-bold text-slate-800">
                      {lastSynced ? new Date(lastSynced).toLocaleTimeString() : '—'}
                    </p>
                  </div>
                </div>

                {(cloudMsg || syncError) && (
                  <div className={`rounded-xl px-3.5 py-2.5 text-[12px] mb-3 ${syncError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {syncError ?? cloudMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    className="btn-ghost"
                    disabled={busy !== null || !userId}
                    onClick={async () => {
                      if (!userId) return
                      setBusy('push'); setCloudMsg(null)
                      try {
                        await pushAll(useStore.getState(), userId)
                        setCloudMsg('Local data pushed to Supabase.')
                        useStore.setState({ syncError: null, lastSynced: new Date().toISOString() })
                      } catch (e) {
                        useStore.setState({ syncError: e instanceof Error ? e.message : String(e) })
                      }
                      setBusy(null)
                    }}
                  >
                    {busy === 'push' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Push to Cloud
                  </button>

                  <button
                    className="btn-ghost"
                    disabled={busy !== null || !userId}
                    onClick={async () => {
                      setBusy('pull'); setCloudMsg(null)
                      try {
                        hydrate(await pullAll())
                        setCloudMsg('Pulled the latest data from Supabase.')
                      } catch (e) {
                        useStore.setState({ syncError: e instanceof Error ? e.message : String(e) })
                      }
                      setBusy(null)
                    }}
                  >
                    {busy === 'pull' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Pull from Cloud
                  </button>

                  <button
                    className="btn bg-rose-50 text-rose-700 hover:bg-rose-100"
                    onClick={() => supabase?.auth.signOut()}
                  >
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>

                <p className="text-[11.5px] text-slate-400 mt-3 leading-relaxed">
                  Every add, edit and delete writes straight through to Postgres. Row level security scopes all twelve
                  tables to your user id, so the anon key in the bundle exposes nothing on its own.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'status', label: 'Profile & Status' },
  { key: 'appearance', label: 'Theme & Appearance' },
  { key: 'rates', label: 'Currency & Rates' },
  { key: 'family', label: 'Family Users' },
  { key: 'security', label: 'Security' },
  { key: 'verification', label: 'Verification Questions' },
  { key: 'seo', label: 'SEO & Analytics' },
] as const

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('general')
  return (
    <div className="space-y-5 max-w-[1200px]">
      <PageHeader title="Settings" subtitle="Profile, appearance, currency, family access, security and your data." />
      <div className="flex gap-1 flex-wrap border-b border-[#e8edf5]">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 h-10 text-[13px] font-semibold border-b-2 transition cursor-pointer ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'general' && <GeneralSettings />}
      {tab === 'status' && <StatusTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'rates' && <RatesTab />}
      {tab === 'family' && <FamilyTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'verification' && <VerificationTab />}
      {tab === 'seo' && <SeoTab />}
    </div>
  )
}
