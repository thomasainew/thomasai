// Step-2 login security verification ("which person…" photo questions).
//
// The correct answer must never reach the browser before it answers, so this
// function — not the client — reads verification_questions (service role,
// bypasses RLS) and only ever tells the browser whether its pick was right.
//
// Deploy:  supabase functions deploy security-verify
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller, error: authError } = await admin.auth.getUser(token)
  if (authError || !caller?.user) return json({ error: 'Not signed in.' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  // Whose People/questions apply: the caller's own (if owner), or their household owner's.
  const asMember = await admin.from('household_members').select('*').eq('member_id', caller.user.id).maybeSingle()
  const ownerId: string = asMember.data?.owner_id ?? caller.user.id
  const memberName: string =
    asMember.data?.name ?? caller.user.user_metadata?.name ?? caller.user.email ?? 'Unknown'

  switch (body.action) {
    case 'status': {
      const settingsRes = await admin.from('settings').select('extra').eq('user_id', ownerId).maybeSingle()
      const enabled = settingsRes.data?.extra?.security?.enabled !== false
      const countRes = await admin
        .from('verification_questions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ownerId)
        .eq('status', 'Active')
      const hasQuestions = (countRes.count ?? 0) > 0
      return json({ required: enabled && hasQuestions })
    }

    case 'challenge': {
      const qRes = await admin.from('verification_questions').select('*').eq('user_id', ownerId).eq('status', 'Active')
      if (qRes.error) return json({ error: qRes.error.message }, 400)
      const all = qRes.data ?? []
      if (!all.length) return json({ none: true })

      const excludeId = typeof body.excludeQuestionId === 'string' ? body.excludeQuestionId : null
      let pool = excludeId ? all.filter((q) => q.id !== excludeId) : all
      if (!pool.length) pool = all

      const anyRandomize = pool.some((q) => q.randomize !== false)
      const picked = anyRandomize
        ? pool[Math.floor(Math.random() * pool.length)]
        : [...pool].sort((a, b) => (a.last_used_at ?? '').localeCompare(b.last_used_at ?? ''))[0]

      const ids: string[] = [picked.correct_person_id, ...(Array.isArray(picked.other_person_ids) ? picked.other_person_ids : [])]
      const want = Math.max(2, Math.min(picked.number_of_choices ?? 12, ids.length))
      const limitedIds = ids.slice(0, want)

      const peopleRes = await admin.from('people').select('id, name, photo').eq('user_id', ownerId).in('id', limitedIds)
      if (peopleRes.error) return json({ error: peopleRes.error.message }, 400)
      const byId = new Map((peopleRes.data ?? []).map((p: any) => [p.id, p]))
      let people = limitedIds.map((id) => byId.get(id)).filter(Boolean) as { id: string; name: string; photo: string | null }[]
      if (picked.shuffle_positions !== false) people = shuffle(people)

      await admin
        .from('verification_questions')
        .update({ times_shown: (picked.times_shown ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq('user_id', ownerId)
        .eq('id', picked.id)

      return json({
        questionId: picked.id,
        text: picked.question,
        scene: picked.scene,
        people: people.map((p) => ({ id: p.id, name: p.name, photo: p.photo ?? null })),
      })
    }

    case 'check': {
      const questionId = String(body.questionId ?? '')
      const selectedPersonId = String(body.selectedPersonId ?? '')
      const qRes = await admin.from('verification_questions').select('*').eq('user_id', ownerId).eq('id', questionId).maybeSingle()
      if (qRes.error || !qRes.data) return json({ error: 'That question is no longer available.' }, 404)
      const q = qRes.data
      const correct = selectedPersonId === q.correct_person_id

      await admin
        .from('verification_questions')
        .update({ times_correct: (q.times_correct ?? 0) + (correct ? 1 : 0) })
        .eq('user_id', ownerId)
        .eq('id', questionId)

      await admin.from('verification_attempts').insert({
        id: crypto.randomUUID(),
        user_id: ownerId,
        member_id: caller.user.id,
        member_name: memberName,
        question_id: q.id,
        question_text: q.question,
        selected_person_id: selectedPersonId,
        correct,
      })

      return json({ correct })
    }

    default:
      return json({ error: 'Unknown action.' }, 400)
  }
})
