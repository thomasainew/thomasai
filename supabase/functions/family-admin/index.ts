// Family user administration.
//
// Creating a login, switching it off, or resetting its password needs the
// Supabase SERVICE ROLE key, which must never reach a browser. So the browser
// calls this function with the signed-in user's token, and the function:
//   1. verifies who is calling (from the token, not from anything in the body);
//   2. refuses unless the caller is a household OWNER (not themselves a member);
//   3. only ever touches members whose owner_id is that caller.
//
// Deploy:  supabase functions deploy family-admin
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SECTIONS = ['accounts', 'transactions', 'budget', 'loans', 'people', 'bills', 'documents', 'notes', 'goals', 'shopping', 'assets', 'advisor']
const cleanSections = (s: unknown): string[] =>
  Array.isArray(s) ? s.filter((x) => x === '*' || SECTIONS.includes(x)) : []
const cleanAccounts = (a: unknown): string[] | null =>
  a === null || a === undefined ? null : Array.isArray(a) ? a.map(String) : null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // 1. who is calling?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller, error: authError } = await admin.auth.getUser(token)
  if (authError || !caller?.user) return json({ error: 'Not signed in.' }, 401)
  const owner = caller.user

  // 2. must be an owner, not a family member
  const { data: asMember } = await admin.from('household_members').select('owner_id').eq('member_id', owner.id).maybeSingle()
  if (asMember) return json({ error: 'Only the account owner can manage family users.' }, 403)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  // 3. a helper that proves a member belongs to THIS owner
  const ownMember = async (memberId: unknown) => {
    if (typeof memberId !== 'string') return null
    const { data } = await admin.from('household_members').select('*').eq('owner_id', owner.id).eq('member_id', memberId).maybeSingle()
    return data
  }

  switch (body.action) {
    case 'create': {
      const name = String(body.name ?? '').trim()
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      if (!name) return json({ error: 'Enter a name.' }, 400)
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
      if (password.length < 8) return json({ error: 'The password must be at least 8 characters.' }, 400)

      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name, household_owner: owner.id },
      })
      if (error || !created.user) return json({ error: error?.message ?? 'Could not create the user.' }, 400)

      const { error: insertError } = await admin.from('household_members').insert({
        owner_id: owner.id, member_id: created.user.id, name, email,
        person_name: body.personName ? String(body.personName) : null, active: true, can_edit: body.canEdit !== false,
        sections: cleanSections(body.sections), account_ids: cleanAccounts(body.accountIds),
      })
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id) // don't leave an orphan login
        return json({ error: insertError.message }, 400)
      }
      return json({ ok: true, memberId: created.user.id })
    }

    case 'update': {
      const m = await ownMember(body.memberId)
      if (!m) return json({ error: 'That family user was not found.' }, 404)
      const patch: Record<string, unknown> = {}
      if (typeof body.name === 'string') patch.name = body.name.trim()
      if (body.personName !== undefined) patch.person_name = body.personName ? String(body.personName) : null
      if (body.sections !== undefined) patch.sections = cleanSections(body.sections)
      if (body.accountIds !== undefined) patch.account_ids = cleanAccounts(body.accountIds)
      if (typeof body.canEdit === 'boolean') patch.can_edit = body.canEdit
      const { error } = await admin.from('household_members').update(patch).eq('owner_id', owner.id).eq('member_id', m.member_id)
      return error ? json({ error: error.message }, 400) : json({ ok: true })
    }

    case 'setActive': {
      const m = await ownMember(body.memberId)
      if (!m) return json({ error: 'That family user was not found.' }, 404)
      const active = Boolean(body.active)
      const { error } = await admin.from('household_members').update({ active }).eq('owner_id', owner.id).eq('member_id', m.member_id)
      if (error) return json({ error: error.message }, 400)
      // Also stop the login itself, so an inactive user cannot even sign in.
      await admin.auth.admin.updateUserById(m.member_id, { ban_duration: active ? 'none' : '876000h' })
      return json({ ok: true })
    }

    case 'resetPassword': {
      const m = await ownMember(body.memberId)
      if (!m) return json({ error: 'That family user was not found.' }, 404)
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'The password must be at least 8 characters.' }, 400)
      const { error } = await admin.auth.admin.updateUserById(m.member_id, { password })
      return error ? json({ error: error.message }, 400) : json({ ok: true })
    }

    case 'remove': {
      const m = await ownMember(body.memberId)
      if (!m) return json({ error: 'That family user was not found.' }, 404)
      await admin.from('household_members').delete().eq('owner_id', owner.id).eq('member_id', m.member_id)
      await admin.auth.admin.deleteUser(m.member_id)
      return json({ ok: true })
    }

    default:
      return json({ error: 'Unknown action.' }, 400)
  }
})
