import { useState } from 'react'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead } from '@/components/ui/Primitives'
import { Field } from '@/components/ui/Modal'
import { hasSupabase, supabase } from '@/lib/supabase'

/** Everyone — owner or family member — can change their own password here. */
export function SecurityTab() {
  const { userEmail, membership } = useStore()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const change = async () => {
    setMsg(null)
    if (pw.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters.' })
    if (pw !== pw2) return setMsg({ ok: false, text: 'The two passwords do not match.' })
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ ok: false, text: error.message })
    else { setMsg({ ok: true, text: 'Password changed. Use it next time you sign in.' }); setPw(''); setPw2('') }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHead title="Your sign-in" right={<ShieldCheck size={16} className="text-slate-400" />} />
        <div className="px-5 pb-5 text-[13px] text-slate-700 space-y-1">
          <p>Signed in as <b>{userEmail ?? 'local mode'}</b></p>
          {membership ? (
            <p className="text-[12px] text-slate-500">
              You are a family user. You can {membership.canEdit ? 'view and edit' : 'view'} {membership.sections.includes('*') ? 'all sections' : membership.sections.join(', ') || 'nothing yet'}
              {membership.accountIds ? ` and ${membership.accountIds.length} account${membership.accountIds.length === 1 ? '' : 's'}` : ''}. The owner controls this.
            </p>
          ) : <p className="text-[12px] text-slate-500">You are the account owner.</p>}
        </div>
      </Card>
      {hasSupabase && (
        <Card>
          <CardHead title="Change password" right={<KeyRound size={16} className="text-slate-400" />} />
          <div className="px-5 pb-5 grid grid-cols-2 gap-4">
            <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Repeat it"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <div className="col-span-2 flex items-center gap-3">
              <button className="btn-primary" onClick={change} disabled={busy || !pw}>{busy && <Loader2 size={14} className="animate-spin" />} Change password</button>
              {msg && <span className={`text-[12px] ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}
            </div>
            <p className="col-span-2 text-[11.5px] text-slate-400">Forgot yours? The owner can reset a family user's password from Settings → Family users. The owner's own reset goes through the sign-in email of your Supabase project.</p>
          </div>
        </Card>
      )}
    </div>
  )
}
