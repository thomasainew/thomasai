import { useEffect, useState } from 'react'
import { Download, Eye, Loader2, X } from 'lucide-react'
import { canPreview, signedUrl } from '@/lib/storage'

/** Preview (images and PDFs) and download for a file in the private bucket. */
export function FileActions({ path, fileName, mimeType }: { path: string; fileName?: string; mimeType?: string }) {
  const [busy, setBusy] = useState<'dl' | 'view' | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const download = async () => {
    setBusy('dl'); setErr(null)
    try {
      const a = document.createElement('a')
      a.href = await signedUrl(path, fileName || true)
      a.click()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(null)
  }
  const view = async () => {
    setBusy('view'); setErr(null)
    try { setPreview(await signedUrl(path)) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(null)
  }
  useEffect(() => {
    if (!preview) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(null)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [preview])

  return (
    <>
      <div className="inline-flex items-center gap-1">
        {canPreview(mimeType) && (
          <button onClick={view} title="Preview" className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer">
            {busy === 'view' ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
          </button>
        )}
        <button onClick={download} title="Download" className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer">
          {busy === 'dl' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        </button>
        {err && <span className="text-[10.5px] text-rose-600 ml-1">{err}</span>}
      </div>
      {preview && (
        <div className="fixed inset-0 z-[70] bg-slate-900/70 p-4 grid place-items-center" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl animate-pop">
            <button onClick={() => setPreview(null)} className="absolute right-3 top-3 z-10 h-9 w-9 grid place-items-center rounded-full bg-white/90 shadow text-slate-600 hover:text-slate-900 cursor-pointer"><X size={17} /></button>
            {mimeType?.startsWith('image/') ? (
              <img src={preview} alt={fileName} className="w-full h-full object-contain bg-slate-50" />
            ) : (
              <iframe src={preview} title={fileName} className="w-full h-full" />
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Signed-URL image, for photo cards. */
export function CloudImage({ path, alt, className }: { path?: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (path) signedUrl(path, false, 3600).then((u) => live && setUrl(u)).catch(() => undefined)
    return () => { live = false }
  }, [path])
  if (!url) return <div className={`bg-gradient-to-br from-slate-100 to-slate-200 ${className ?? ''}`} aria-label={alt} />
  return <img src={url} alt={alt} className={className} loading="lazy" />
}
