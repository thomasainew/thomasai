import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, FileText, Link2, Loader2, Paperclip, Pencil, Plus, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Card, CardHead, Empty, PageHeader, Progress, StatCard, statusTone } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { FileActions } from '@/components/FileLink'
import { daysLeft, fmtDate, TODAY } from '@/lib/format'
import { docStatus } from '@/lib/selectors'
import { DOCUMENT_TYPES, hasGemini, readFileAsDataUrl, scanDocument } from '@/lib/gemini'
import { checkFile, fmtSize, removeFile, storageReady, uploadFile, MAX_UPLOAD_MB } from '@/lib/storage'
import type { Currency, Doc, DocLink } from '@/types'

const LINK_KINDS: { kind: DocLink['kind']; label: string }[] = [
  { kind: 'transaction', label: 'Transaction' }, { kind: 'account', label: 'Account' }, { kind: 'loan', label: 'Loan' },
  { kind: 'asset', label: 'Asset' }, { kind: 'property', label: 'Property' },
]

const blank = () => ({ name: '', type: 'Identity', expiry: TODAY, owner: 'Thomas', icon: '📄', renewalCost: '', renewalCurrency: 'AED' as Currency })

export default function Documents() {
  const { documents, accounts, loans, assets, transactions, people, addDocument, updateDocument, removeDocument } = useStore()
  const [filter, setFilter] = useState<'All' | 'Valid' | 'Expiring Soon' | 'Expired'>('All')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Doc | null>(null)
  const [form, setForm] = useState(blank())
  const [file, setFile] = useState<File | null>(null)
  const [links, setLinks] = useState<DocLink[]>([])
  const [linkKind, setLinkKind] = useState<DocLink['kind']>('account')
  const [linkId, setLinkId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const cloud = storageReady()

  const linkOptions = useMemo(() => {
    switch (linkKind) {
      case 'account': return accounts.map((a) => ({ id: a.id, label: a.name }))
      case 'loan': return loans.map((l) => ({ id: l.id, label: l.name }))
      case 'asset': return assets.filter((a) => a.category !== 'Property' && a.category !== 'Land').map((a) => ({ id: a.id, label: a.name }))
      case 'property': return assets.filter((a) => a.category === 'Property' || a.category === 'Land').map((a) => ({ id: a.id, label: a.name }))
      default: return transactions.slice(0, 80).map((t) => ({ id: t.id, label: `${fmtDate(t.date)} · ${t.description} · ${t.amount} ${t.currency}` }))
    }
  }, [linkKind, accounts, loans, assets, transactions])

  const labelFor = (l: DocLink) => {
    if (l.kind === 'account') return accounts.find((a) => a.id === l.id)?.name
    if (l.kind === 'loan') return loans.find((x) => x.id === l.id)?.name
    if (l.kind === 'transaction') return transactions.find((t) => t.id === l.id)?.description
    return assets.find((a) => a.id === l.id)?.name
  }

  const openNew = () => { setEditing(null); setForm(blank()); setFile(null); setLinks([]); setError(null); setScanError(null); setModal(true) }
  const openEdit = (d: Doc) => {
    setEditing(d)
    setForm({ name: d.name, type: d.type, expiry: d.expiry, owner: d.owner, icon: d.icon, renewalCost: d.renewalCost ? String(d.renewalCost) : '', renewalCurrency: d.renewalCurrency ?? 'AED' })
    setFile(null); setLinks(d.links ?? []); setError(null); setScanError(null); setModal(true)
  }

  /** Read a photo of a document straight into the form for review. */
  const scanInto = async (f: File | undefined) => {
    if (!f) return
    setScanError(null)
    if (f.size > 8 * 1024 * 1024) return setScanError('Please use an image under 8MB.')
    setScanning(true)
    abort.current = new AbortController()
    try {
      const found = await scanDocument(await readFileAsDataUrl(f), f.type || 'image/jpeg', abort.current.signal)
      setForm((x) => ({
        ...x, name: found.name || x.name, type: (DOCUMENT_TYPES as readonly string[]).includes(found.type) ? found.type : x.type,
        expiry: found.expiry || x.expiry, owner: found.owner || x.owner,
      }))
      setFile(f) // keep the scanned file as the attachment too
      if (!found.expiry) setScanError('No expiry date was visible — set it by hand below.')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setScanError(e instanceof Error ? e.message : String(e))
    }
    if (!editing) setModal(true)
    setScanning(false)
  }

  const enriched = useMemo(() => documents.map((d) => ({ ...d, live: docStatus(d.expiry), days: daysLeft(d.expiry) })).sort((a, b) => a.days - b.days), [documents])
  const list = enriched.filter((d) => (filter === 'All' ? true : d.live === filter))
  const counts = {
    valid: enriched.filter((d) => d.live === 'Valid').length,
    soon: enriched.filter((d) => d.live === 'Expiring Soon').length,
    expired: enriched.filter((d) => d.live === 'Expired').length,
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    const problem = checkFile(f)
    if (problem) return setError(problem)
    setError(null)
    setFile(f)
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    try {
      let fileFields: Partial<Doc> = {}
      if (file) {
        const up = await uploadFile(file, 'documents')
        fileFields = { storagePath: up.path, fileName: up.fileName, mimeType: up.mimeType, sizeBytes: up.sizeBytes, uploadedAt: new Date().toISOString() }
        if (editing?.storagePath) removeFile(editing.storagePath).catch(() => undefined) // replace, don't orphan
      }
      const payload = {
        name: form.name.trim(), type: form.type, expiry: form.expiry, owner: form.owner, status: docStatus(form.expiry), icon: form.icon || '📄',
        renewalCost: Number(form.renewalCost) > 0 ? Number(form.renewalCost) : undefined, renewalCurrency: form.renewalCurrency, links, ...fileFields,
      }
      if (editing) updateDocument(editing.id, payload)
      else addDocument(payload)
      setModal(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  const remove = async (d: Doc) => {
    if (!window.confirm(`Delete “${d.name}”${d.storagePath ? ' and its stored file' : ''}?`)) return
    if (d.storagePath) await removeFile(d.storagePath).catch(() => undefined)
    removeDocument(d.id)
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Documents"
        subtitle="Emirates ID, visa, licence, insurance, receipts — with files stored privately in the cloud."
        actions={
          <>
            {hasGemini && (
              <label className={`btn-ghost cursor-pointer ${scanning ? 'opacity-60 pointer-events-none' : ''}`}>
                {scanning ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                {scanning ? 'Reading…' : 'Scan Document'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => { scanInto(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            )}
            <button className="btn-primary" onClick={openNew}><Plus size={15} /> Add Document</button>
          </>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Documents" value={String(documents.length)} icon={<FileText size={20} />} tint="#3b82f6" footer={<span className="text-slate-400">{documents.filter((d) => d.storagePath).length} with a file attached</span>} />
        <StatCard label="Valid" value={String(counts.valid)} icon={<CheckCircle2 size={20} />} tint="#10b981"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{Math.round((counts.valid / (documents.length || 1)) * 100)}% in good standing</div><Progress value={counts.valid} max={documents.length || 1} color="#10b981" height={5} /></div>} />
        <StatCard label="Expiring Soon" value={String(counts.soon)} icon={<AlertTriangle size={20} />} tint="#f59e0b" footer={<span className="text-slate-400">Within 30 days</span>} />
        <StatCard label="Expired" value={String(counts.expired)} icon={<ShieldCheck size={20} />} tint="#ef4444" footer={<span className="text-slate-400">Needs renewal now</span>} />
      </div>

      {!cloud && (
        <div className="card px-5 py-3.5 bg-brand-50/60 border-brand-100 text-[12.5px] text-brand-900 flex items-start gap-2.5">
          <Paperclip size={16} className="mt-0.5 shrink-0" />
          <span>File upload needs cloud storage: sign in and apply the database update <b>0015_cloudbasket360_v2.sql</b>. You can still track documents and expiry dates without files.</span>
        </div>
      )}

      {counts.soon + counts.expired > 0 && (
        <div className="card px-5 py-4 flex items-start gap-3 bg-amber-50/60 border-amber-100">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[13px] text-amber-900">
            <b>{counts.soon + counts.expired} document{counts.soon + counts.expired > 1 ? 's need' : ' needs'} attention.</b>{' '}
            {enriched.filter((d) => d.live !== 'Valid').map((d) => `${d.name} (${d.days < 0 ? `${Math.abs(d.days)}d overdue` : `${d.days}d left`})`).join(', ')}
          </p>
        </div>
      )}

      <Card>
        <CardHead
          title="All Documents"
          right={
            <div className="flex gap-1 flex-wrap">
              {(['All', 'Valid', 'Expiring Soon', 'Expired'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`chip cursor-pointer transition ${filter === f ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f}</button>
              ))}
            </div>
          }
        />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[980px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th">Document</th><th className="th">Type</th><th className="th">File</th><th className="th">Uploaded</th>
                <th className="th">Linked to</th><th className="th">Expiry</th><th className="th">Status</th><th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {list.map((d) => (
                <tr key={d.id} className="row-hover">
                  <td className="td font-semibold text-slate-800"><span className="mr-2">{d.icon}</span>{d.name}<span className="block text-[11px] font-normal text-slate-400">{d.owner}</span></td>
                  <td className="td text-slate-500">{d.type}</td>
                  <td className="td text-[12px]">
                    {d.storagePath ? (
                      <div className="flex items-center gap-1.5">
                        <div className="min-w-0"><p className="font-semibold text-slate-700 truncate max-w-[180px]">{d.fileName}</p><p className="text-[10.5px] text-slate-400">{fmtSize(d.sizeBytes)}</p></div>
                        <FileActions path={d.storagePath} fileName={d.fileName} mimeType={d.mimeType} />
                      </div>
                    ) : <span className="text-slate-300">No file</span>}
                  </td>
                  <td className="td text-slate-500 text-[12px] whitespace-nowrap">{d.uploadedAt ? fmtDate(d.uploadedAt.slice(0, 10)) : '—'}</td>
                  <td className="td text-[11.5px]">
                    <div className="flex flex-wrap gap-1">
                      {(d.links ?? []).map((l) => <span key={`${l.kind}${l.id}`} className="chip bg-slate-100 text-slate-600"><Link2 size={10} /> {labelFor(l) ?? l.kind}</span>)}
                      {!(d.links ?? []).length && <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className={`td whitespace-nowrap text-[12px] ${d.days < 0 ? 'text-rose-600' : d.days <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {fmtDate(d.expiry)}<span className="block text-[10.5px]">{d.days < 0 ? `${Math.abs(d.days)}d overdue` : `${d.days} days`}</span>
                  </td>
                  <td className="td"><Badge tone={statusTone(d.live)}>{d.live}</Badge></td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(d)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => remove(d)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <Empty text="No documents in this view." />}
        </div>
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Document' : 'Add Document'}
        subtitle="Attach the file, track its expiry and link it to what it belongs to"
        width="max-w-2xl"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary disabled:opacity-50" disabled={saving || !form.name.trim()} onClick={save}>
              {saving && <Loader2 size={14} className="animate-spin" />} {editing ? 'Save' : 'Add Document'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {(scanError || error) && (
            <div className="col-span-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-900">{error ?? scanError}</p>
            </div>
          )}
          <Field label="File" className="col-span-2">
            <div className="flex items-center gap-3 flex-wrap">
              <label className={`btn-ghost h-9 cursor-pointer ${cloud ? '' : 'opacity-50 pointer-events-none'}`}>
                <Upload size={14} /> {file || editing?.storagePath ? 'Replace file' : 'Choose file'}
                <input type="file" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              <span className="text-[12px] text-slate-500 truncate">
                {file ? <b className="text-slate-700">{file.name}</b> : editing?.fileName ? editing.fileName : `Images, PDF, Word or Excel · up to ${MAX_UPLOAD_MB} MB`}
              </span>
              {file && <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={13} /></button>}
            </div>
          </Field>
          <Field label="Document Name" className="col-span-2"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emirates ID" autoFocus /></Field>
          <Field label="Type">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {['Identity', 'Immigration', 'Vehicle', 'Insurance', 'Business', 'Property', 'Receipt', 'Loan', 'Other'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Icon"><input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={2} /></Field>
          <Field label="Expiry Date"><input className="input" type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} /></Field>
          <Field label="Owner">
            <input className="input" list="doc-owners" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <datalist id="doc-owners">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </Field>
          <Field label="Renewal cost (optional)" className="col-span-2">
            <div className="flex gap-2">
              <input className="input flex-1" type="number" min="0" value={form.renewalCost} onChange={(e) => setForm({ ...form, renewalCost: e.target.value })} placeholder="Leave empty if unknown" />
              <select className="input w-24" value={form.renewalCurrency} onChange={(e) => setForm({ ...form, renewalCurrency: e.target.value as Currency })}><option>AED</option><option>INR</option><option>USD</option></select>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Used to suggest the renewal in the month it expires. Never guessed if left empty.</p>
          </Field>

          <div className="col-span-2 border-t border-[#eef2f8] pt-4">
            <p className="text-[12.5px] font-bold text-slate-700 mb-2">Linked to</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {links.map((l) => (
                <span key={`${l.kind}${l.id}`} className="chip bg-brand-50 text-brand-700 gap-1.5">
                  {l.kind}: {labelFor(l) ?? l.id}
                  <button onClick={() => setLinks(links.filter((x) => !(x.kind === l.kind && x.id === l.id)))} className="cursor-pointer text-brand-400 hover:text-rose-600"><X size={11} /></button>
                </span>
              ))}
              {links.length === 0 && <span className="text-[11.5px] text-slate-400">Not linked to anything yet.</span>}
            </div>
            <div className="flex gap-2">
              <select className="input h-9 w-36" value={linkKind} onChange={(e) => { setLinkKind(e.target.value as DocLink['kind']); setLinkId('') }}>
                {LINK_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
              <select className="input h-9 flex-1 min-w-0" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">Choose…</option>
                {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button className="btn-soft h-9" disabled={!linkId} onClick={() => { if (!links.some((l) => l.kind === linkKind && l.id === linkId)) setLinks([...links, { kind: linkKind, id: linkId }]); setLinkId('') }}>Link</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
