import { useEffect, useState } from 'react'
import { Check, Download, Loader2, Save } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead } from '@/components/ui/Primitives'
import { Field } from '@/components/ui/Modal'
import {
  DEFAULT_ANALYTICS, DEFAULT_SEO, ID_RULES, loadSiteConfig, saveSiteConfig, validId, type AnalyticsConfig, type SeoConfig,
} from '@/lib/siteConfig'

const PAGES = ['home', 'features', 'security', 'faq'] as const
const idKeys = Object.keys(ID_RULES) as (keyof typeof ID_RULES)[]

/**
 * Public-page search settings and marketing pixels. Only the public pages
 * (the sign-in landing, /features, /security, /faq) are indexed; the signed-in
 * app is marked noindex and never sends financial data to any of these services.
 */
export function SeoTab() {
  const { userId, schemaV2, membership } = useStore()
  const [seo, setSeo] = useState<SeoConfig>(DEFAULT_SEO)
  const [an, setAn] = useState<AnalyticsConfig>(DEFAULT_ANALYTICS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [page, setPage] = useState<(typeof PAGES)[number]>('home')

  useEffect(() => { loadSiteConfig().then((c) => { setSeo(c.seo); setAn(c.analytics) }) }, [])
  if (membership) return <Card className="card-pad text-[13px] text-slate-600">Only the account owner can change SEO and analytics settings.</Card>

  const p = seo.pages[page]
  const setPage_ = (patch: Partial<typeof p>) => setSeo({ ...seo, pages: { ...seo.pages, [page]: { ...p, ...patch } } })
  const bad = idKeys.filter((k) => !validId(k, an[k] as string | undefined))

  const save = async () => {
    if (bad.length) return setMsg({ ok: false, text: `Check the format of: ${bad.map((k) => ID_RULES[k].label).join(', ')}.` })
    if (!userId || !schemaV2) return setMsg({ ok: false, text: 'Saving needs a signed-in account on the updated database (migration 0015).' })
    setBusy(true); setMsg(null)
    try { await saveSiteConfig(userId, seo, an); setMsg({ ok: true, text: 'Saved. The sign-in page uses these on its next load.' }) }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }) }
    setBusy(false)
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(seo, null, 2) + '\n'], { type: 'application/json' }))
    a.download = 'seo.config.json'
    a.click()
  }

  const count = (s: string, max: number) => <span className={`text-[10.5px] ${s.length > max ? 'text-rose-600' : 'text-slate-400'}`}>{s.length}/{max}</span>

  return (
    <div className="space-y-4">
      <Card>
        <CardHead title="Page titles & descriptions" sub="What search engines and social previews show for each public page" />
        <div className="px-5 pb-5 space-y-4">
          <div className="flex gap-1.5 flex-wrap">
            {PAGES.map((k) => <button key={k} onClick={() => setPage(k)} className={`chip cursor-pointer ${page === k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{k === 'home' ? 'Home (sign-in)' : `/${k}`}</button>)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Page title"><input className="input" value={p.title} onChange={(e) => setPage_({ title: e.target.value })} />{count(p.title, 60)}</Field>
            <Field label="Canonical URL"><input className="input bg-slate-50" readOnly value={seo.baseUrl.replace(/\/$/, '') + (p.path === '/' ? '/' : p.path)} /></Field>
            <Field label="Meta description" className="md:col-span-2"><textarea className="input h-auto min-h-[64px] py-2" value={p.description} onChange={(e) => setPage_({ description: e.target.value })} />{count(p.description, 160)}</Field>
            <Field label="Social title (optional)"><input className="input" value={p.ogTitle ?? ''} onChange={(e) => setPage_({ ogTitle: e.target.value || undefined })} placeholder="Defaults to the page title" /></Field>
            <Field label="Social image (optional)"><input className="input" value={p.ogImage ?? ''} onChange={(e) => setPage_({ ogImage: e.target.value || undefined })} placeholder={seo.ogImage} /></Field>
            <Field label="Social description (optional)" className="md:col-span-2"><input className="input" value={p.ogDescription ?? ''} onChange={(e) => setPage_({ ogDescription: e.target.value || undefined })} /></Field>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] text-slate-400 mb-1">Search result preview</p>
            <p className="text-[16px] text-[#1a0dab] leading-tight">{p.title}</p>
            <p className="text-[12px] text-[#006621]">{seo.baseUrl.replace(/\/$/, '') + (p.path === '/' ? '' : p.path)}</p>
            <p className="text-[12.5px] text-slate-600">{p.description}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Site & verification" sub="Google Search Console and Bing Webmaster ownership tags" />
        <div className="px-5 pb-5 grid gap-4 md:grid-cols-2">
          <Field label="Site name"><input className="input" value={seo.siteName} onChange={(e) => setSeo({ ...seo, siteName: e.target.value })} /></Field>
          <Field label="Base URL"><input className="input" value={seo.baseUrl} onChange={(e) => setSeo({ ...seo, baseUrl: e.target.value })} /></Field>
          <Field label="Default social image"><input className="input" value={seo.ogImage} onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} /></Field>
          <Field label="Contact email (for Request Access)"><input className="input" type="email" value={seo.contactEmail ?? ''} onChange={(e) => setSeo({ ...seo, contactEmail: e.target.value })} placeholder="you@example.com" /></Field>
          <Field label="Google Search Console token"><input className="input" value={seo.googleVerification ?? ''} onChange={(e) => setSeo({ ...seo, googleVerification: e.target.value })} placeholder="content of google-site-verification" /></Field>
          <Field label="Bing Webmaster token"><input className="input" value={seo.bingVerification ?? ''} onChange={(e) => setSeo({ ...seo, bingVerification: e.target.value })} placeholder="content of msvalidate.01" /></Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Analytics & advertising pixels" sub="Public pages only — nothing from the signed-in app is ever sent" />
        <div className="px-5 pb-5 grid gap-4 md:grid-cols-2">
          {idKeys.map((k) => {
            const ok = validId(k, an[k] as string | undefined)
            return (
              <Field key={k} label={ID_RULES[k].label}>
                <input className={`input ${ok ? '' : 'border-rose-400'}`} value={(an[k] as string | undefined) ?? ''} onChange={(e) => setAn({ ...an, [k]: e.target.value.trim() || undefined })} placeholder={ID_RULES[k].example} />
                {!ok && <span className="text-[10.5px] text-rose-600">Expected a format like {ID_RULES[k].example}</span>}
              </Field>
            )
          })}
          <label className="md:col-span-2 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 cursor-pointer">
            <input type="checkbox" className="accent-brand-600 h-4 w-4 mt-0.5" checked={an.consentRequired} onChange={(e) => setAn({ ...an, consentRequired: e.target.checked })} />
            <span className="text-[12.5px] text-slate-700"><b>Ask visitors for consent first</b> (recommended, required in many regions)
              <span className="block text-[11.5px] text-slate-500">Nothing loads until they accept. Each event is sent once. The lead event fires when someone taps “Request Access”. There is no self-service sign-up, so no sign-up event exists to fire.</span></span>
          </label>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save settings</button>
        <button className="btn-ghost" onClick={download}><Download size={15} /> Download seo.config.json</button>
        {msg && <span className={`text-[12px] inline-flex items-center gap-1 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.ok && <Check size={13} />}{msg.text}</span>}
      </div>

      <Card className="card-pad text-[12px] text-slate-600 space-y-1.5 leading-relaxed">
        <p className="text-[13px] font-bold text-slate-800">What this does — and doesn't</p>
        <p>• The sign-in page applies these titles, descriptions and social tags when it loads, and the analytics settings take effect immediately for visitors.</p>
        <p>• Search engines mostly read the <b>static HTML</b> of each public page. The /features, /security and /faq pages, sitemap.xml and robots.txt are generated at build time from <code>seo.config.json</code> — download the file above, replace it in the project and redeploy for those to change.</p>
        <p>• The app itself lives behind sign-in with hash routes, is marked noindex, and is never crawled. Indexing takes time and rankings are never guaranteed.</p>
      </Card>
    </div>
  )
}
