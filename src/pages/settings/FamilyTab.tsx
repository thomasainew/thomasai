import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, Loader2, Pencil, Plus, Trash2, UserCheck, UserX } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Badge, Card, CardHead, Empty } from '@/components/ui/Primitives'
import { Modal, Field } from '@/components/ui/Modal'
import { familyAdmin, listMembers } from '@/lib/sync'
import type { HouseholdMember } from '@/types'

export const SECTIONS: { key: string; label: string }[] = [
  { key: 'accounts', label: 'Accounts' }, { key: 'transactions', label: 'Income, expenses, transfers & reports' },
  { key: 'budget', label: 'Budget' }, { key: 'loans', label: 'Loans' }, { key: 'people', label: 'People' },
  { key: 'bills', label: 'Bills & subscriptions' }, { key: 'documents', label: 'Documents' }, { key: 'notes', label: 'Notes & follow-ups' },
  { key: 'goals', label: 'Savings goals' }, { key: 'shopping', label: 'Price tracker & shopping' }, { key: 'assets', label: 'Assets & properties' },
  { key: 'advisor', label: 'Family Advisor' },
]

const blank = { name: '', email: '', password: '', personName: '', canEdit: true, all: false, sections: ['transactions', 'shopping'] as string[], allAccounts: true, accountIds: [] as string[] }

/**
 * Separate logins for family members. What each can see or change is stored in
 * the database and enforced there (row level security), not merely hidden in
 * the menus: a member's requests for anything else are refused by the server.
 */
export function FamilyTab() {
  const { schemaV2, membership, accounts, people } = useStore()
  const [list, setList] = useState<HouseholdMember[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState<'new' | HouseholdMember | null>(null)
  const [reset, setReset] = useState<HouseholdMember | null>(null)
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [newPw, setNewPw] = useState('')

  const load = useCallback(async () => {
    if (!schemaV2 || membership) return setLoading(false)
    setLoading(true)
    try { setList(await listMembers()); setErr(null) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }, [schemaV2, membership])
  useEffect(() => { load() }, [load])

  if (membership) return <Card className="card-pad"><p className="text-[13px] text-slate-600">Only the account owner can manage family users.</p></Card>
  if (!schemaV2) {
    return (
      <Card className="card-pad flex gap-3 items-start">
        <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-[13px] text-slate-700">
          <p className="font-bold text-slate-900">Database update needed</p>
          <p className="mt-1">Family users need the new tables and permissions. Run <b>supabase/migrations/0015_cloudbasket360_v2.sql</b> in the Supabase SQL Editor, deploy the <b>family-admin</b> edge function, then reload.</p>
        </div>
      </Card>
    )
  }

  const openNew = () => { setF(blank); setErr(null); setModal('new') }
  const openEdit = (m: HouseholdMember) => {
    setF({ name: m.name, email: m.email, password: '', personName: m.personName ?? '', canEdit: m.canEdit, all: m.sections.includes('*'), sections: m.sections.filter((s) => s !== '*'), allAccounts: !m.accountIds, accountIds: m.accountIds ?? [] })
    setErr(null); setModal(m)
  }
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const submit = async () => {
    setBusy(true); setErr(null)
    const perms = { personName: f.personName || undefined, canEdit: f.canEdit, sections: f.all ? ['*'] : f.sections, accountIds: f.allAccounts ? null : f.accountIds }
    try {
      if (modal === 'new') await familyAdmin({ action: 'create', name: f.name.trim(), email: f.email.trim(), password: f.password, ...perms })
      else if (modal) await familyAdmin({ action: 'update', memberId: modal.memberId, name: f.name.trim(), ...perms })
      setModal(null)
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try { await fn(); await load() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead title="Family users" sub="Each person signs in with their own email and password" right={<button className="btn-primary h-9" onClick={openNew}><Plus size={14} /> Add family user</button>} />
        {err && <p className="mx-5 mb-3 rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-[12px] text-rose-700">{err}</p>}
        {loading ? <div className="p-8 grid place-items-center"><Loader2 className="animate-spin text-slate-400" /></div> : list.length === 0 ? (
          <Empty text="No family users yet. Add your wife or anyone who should have their own login." />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50/70"><tr><th className="th">Name</th><th className="th">Login</th><th className="th">Can access</th><th className="th">Status</th><th className="th text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {list.map((m) => (
                  <tr key={m.memberId} className="row-hover">
                    <td className="td font-semibold text-slate-800">{m.name}<span className="block text-[11px] font-normal text-slate-400">{m.personName ? `Person: ${m.personName}` : 'Not linked to a person'}</span></td>
                    <td className="td text-slate-500 text-[12.5px]">{m.email}</td>
                    <td className="td text-[12px] text-slate-600">
                      {m.sections.includes('*') ? 'Everything' : m.sections.map((s) => SECTIONS.find((x) => x.key === s)?.label ?? s).join(', ') || 'Nothing'}
                      <span className="block text-[11px] text-slate-400">{m.accountIds ? `${m.accountIds.length} account${m.accountIds.length === 1 ? '' : 's'} only` : 'All accounts'} · {m.canEdit ? 'can edit' : 'view only'}</span>
                    </td>
                    <td className="td"><Badge tone={m.active ? 'green' : 'slate'}>{m.active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button title="Edit access" onClick={() => openEdit(m)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><Pencil size={13} /></button>
                        <button title={m.active ? 'Make inactive' : 'Make active'} onClick={() => act(() => familyAdmin({ action: 'setActive', memberId: m.memberId, active: !m.active }))} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 cursor-pointer">{m.active ? <UserX size={13} /> : <UserCheck size={13} />}</button>
                        <button title="Reset password" onClick={() => { setReset(m); setNewPw('') }} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><KeyRound size={13} /></button>
                        <button title="Remove" onClick={() => window.confirm(`Remove ${m.name}? Their login is deleted; your data is untouched.`) && act(() => familyAdmin({ action: 'remove', memberId: m.memberId }))} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 pb-4 text-[11.5px] text-slate-400 mt-2">Inactive users cannot sign in. Permissions are checked by the database on every request, so hiding a menu is never the only protection.</p>
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'new' ? 'Add family user' : 'Edit access'}
        width="max-w-2xl"
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={busy || !f.name.trim() || (modal === 'new' && (!f.email || f.password.length < 8))} onClick={submit}>{busy && <Loader2 size={14} className="animate-spin" />} {modal === 'new' ? 'Create user' : 'Save'}</button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          {err && <p className="col-span-2 rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-[12px] text-rose-700">{err}</p>}
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Linked person">
            <select className="input" value={f.personName} onChange={(e) => setF({ ...f, personName: e.target.value })}><option value="">— none —</option>{people.map((p) => <option key={p.id}>{p.name}</option>)}</select>
          </Field>
          {modal === 'new' && (
            <>
              <Field label="Email (login)"><input className="input" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Password (min 8)"><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            </>
          )}
          <div className="col-span-2 space-y-2">
            <p className="text-[12.5px] font-bold text-slate-700">What can they see?</p>
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-brand-600" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} /> Everything</label>
            {!f.all && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {SECTIONS.map((s) => <label key={s.key} className="flex items-center gap-2 text-[12px] text-slate-600"><input type="checkbox" className="accent-brand-600" checked={f.sections.includes(s.key)} onChange={() => setF({ ...f, sections: toggle(f.sections, s.key) })} /> {s.label}</label>)}
              </div>
            )}
            <label className="flex items-center gap-2 text-[12.5px] pt-1"><input type="checkbox" className="accent-brand-600" checked={f.canEdit} onChange={(e) => setF({ ...f, canEdit: e.target.checked })} /> Can add, edit and delete (untick for view-only)</label>
          </div>
          <div className="col-span-2 space-y-2">
            <p className="text-[12.5px] font-bold text-slate-700">Which accounts?</p>
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-brand-600" checked={f.allAccounts} onChange={(e) => setF({ ...f, allAccounts: e.target.checked })} /> All accounts</label>
            {!f.allAccounts && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 max-h-40 overflow-y-auto">
                {accounts.map((a) => <label key={a.id} className="flex items-center gap-2 text-[12px] text-slate-600"><input type="checkbox" className="accent-brand-600" checked={f.accountIds.includes(a.id)} onChange={() => setF({ ...f, accountIds: toggle(f.accountIds, a.id) })} /> {a.name}{a.owner ? ` · ${a.owner}` : ''}</label>)}
              </div>
            )}
            <p className="text-[11px] text-slate-400">Transactions and transfers are limited to the accounts you tick; the database refuses everything else.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={reset !== null}
        onClose={() => setReset(null)}
        title={`Reset password — ${reset?.name ?? ''}`}
        footer={<><button className="btn-ghost" onClick={() => setReset(null)}>Cancel</button><button className="btn-primary" disabled={newPw.length < 8} onClick={() => reset && act(async () => { await familyAdmin({ action: 'resetPassword', memberId: reset.memberId, password: newPw }); setReset(null) })}>Set password</button></>}
      >
        <Field label="New password (min 8)"><input className="input" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus /></Field>
        <p className="text-[11.5px] text-slate-500 mt-2">Tell them the new password; they can change it themselves in Settings → Security.</p>
      </Modal>
    </div>
  )
}
