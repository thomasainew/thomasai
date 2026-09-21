import { db } from '@/lib/supabase'
import { MAPPERS, TABLES, V2_COLUMNS, V2_TABLES, settingsMapper, type Collection } from '@/lib/mappers'
import type { HouseholdMember, Settings } from '@/types'
import { SETTINGS } from '@/data/seed'

/** Every syncable collection. Backups and pushes both derive from this. */
export const COLLECTIONS = Object.keys(TABLES) as Collection[]

export interface RemoteData {
  settings: Settings
  accounts: any[]
  transactions: any[]
  transfers: any[]
  advisorMessages: any[]
  advisorPersonas: any[]
  budgets: any[]
  loans: any[]
  people: any[]
  bills: any[]
  documents: any[]
  notes: any[]
  goals: any[]
  priceWatch: any[]
  categories: any[]
  subcategories: any[]
  receipts: any[]
  itemAliases: any[]
  assets: any[]
  assetValuations: any[]
  goldRates: any[]
  budgetItems: any[]
}

// ---------------------------------------------------------------------------
// Session context. Two facts decide how every read and write behaves:
//  * schemaV2  — has migration 0015 been run on this database?
//  * ownerId   — whose data this is. A family member reads and writes the
//                household OWNER's rows (the database decides what they may do).
// ---------------------------------------------------------------------------
export interface SessionContext {
  schemaV2: boolean
  ownerId: string
  /** Set when the signed-in user is a household member rather than the owner. */
  membership: HouseholdMember | null
  /** The member has been switched off by the owner. */
  inactive: boolean
}

const ctx: { schemaV2: boolean; ownerId: string | null } = { schemaV2: false, ownerId: null }

export const isSchemaV2 = () => ctx.schemaV2

/** Work out the schema version and whose data the signed-in user is looking at. */
export async function resolveSession(userId: string): Promise<SessionContext> {
  const client = db()

  const version = await client.from('schema_info').select('version').maybeSingle()
  // A missing table means 0015 has not been run — compatibility mode.
  const schemaV2 = !version.error && (version.data?.version ?? 0) >= 15
  ctx.schemaV2 = schemaV2
  ctx.ownerId = userId

  if (!schemaV2) return { schemaV2, ownerId: userId, membership: null, inactive: false }

  const mem = await client.from('household_members').select('*').eq('member_id', userId).maybeSingle()
  if (mem.error || !mem.data) return { schemaV2, ownerId: userId, membership: null, inactive: false }

  const m = mem.data
  ctx.ownerId = m.owner_id
  return {
    schemaV2,
    ownerId: m.owner_id,
    inactive: !m.active,
    membership: {
      memberId: m.member_id,
      name: m.name,
      email: m.email,
      personName: m.person_name ?? undefined,
      active: Boolean(m.active),
      canEdit: Boolean(m.can_edit),
      sections: m.sections ?? [],
      accountIds: m.account_ids ?? null,
    },
  }
}

/** Drop columns / tables the database does not have yet, so a write never fails on them. */
function shapeRow(collection: Collection, row: Record<string, any>) {
  if (ctx.schemaV2) return row
  const out = { ...row }
  for (const col of V2_COLUMNS[collection] ?? []) delete out[col]
  return out
}

const activeCollections = () => COLLECTIONS.filter((c) => ctx.schemaV2 || !V2_TABLES.includes(c))

/** Read every table the signed-in user may see. RLS scopes the rows. */
export async function pullAll(): Promise<RemoteData> {
  const client = db()
  const cols = activeCollections()

  const settingsQuery = client.from('settings').select('*')
  const [settingsRes, ...rest] = await Promise.all([
    (ctx.ownerId ? settingsQuery.eq('user_id', ctx.ownerId) : settingsQuery).maybeSingle(),
    ...cols.map((c) => client.from(TABLES[c]).select('*')),
  ])

  if (settingsRes.error) throw settingsRes.error

  const out: any = {
    settings: settingsRes.data ? settingsMapper.from(settingsRes.data) : SETTINGS,
  }
  for (const c of COLLECTIONS) out[c] = []

  rest.forEach((res, i) => {
    if (res.error) throw res.error
    const key = cols[i]
    out[key] = (res.data ?? []).map(MAPPERS[key].from)
  })

  return out as RemoteData
}

const owner = (fallback: string) => ctx.ownerId ?? fallback

export async function upsertRow(collection: Collection, item: any, userId: string) {
  if (!ctx.schemaV2 && V2_TABLES.includes(collection)) return // table does not exist yet
  const row = shapeRow(collection, { ...MAPPERS[collection].to(item), user_id: owner(userId) })
  const { error } = await db().from(TABLES[collection]).upsert(row)
  if (error) throw error
}

export async function deleteRow(collection: Collection, id: string) {
  if (!ctx.schemaV2 && V2_TABLES.includes(collection)) return
  const { error } = await db().from(TABLES[collection]).delete().eq('id', id)
  if (error) throw error
}

export async function upsertSettings(settings: Settings, userId: string) {
  const row: Record<string, any> = { ...settingsMapper.to(settings), user_id: owner(userId) }
  if (!ctx.schemaV2) delete row.extra
  const { error } = await db().from('settings').upsert(row)
  if (error) throw error
}

/** Push the entire local dataset up — used by "Sync to cloud" in Settings. */
export async function pushAll(state: any, userId: string) {
  const client = db()
  await upsertSettings(state.settings, userId)
  for (const c of activeCollections()) {
    const rows = (state[c] ?? []).map((r: any) =>
      shapeRow(c, { ...MAPPERS[c].to(r), user_id: owner(userId) }),
    )
    if (!rows.length) continue
    const { error } = await client.from(TABLES[c]).upsert(rows)
    if (error) throw error
  }
}

/** Delete every row this user owns. */
export async function wipeRemote(userId: string): Promise<void> {
  const client = db()
  for (const c of activeCollections()) {
    const { error } = await client.from(TABLES[c]).delete().eq('user_id', owner(userId))
    if (error) throw error
  }
  const { error } = await client.from('settings').delete().eq('user_id', owner(userId))
  if (error) throw error
}

/** Replace everything in the cloud with the given local state. */
export async function replaceRemote(state: any, userId: string): Promise<void> {
  await wipeRemote(userId)
  await pushAll(state, userId)
}

// ---------------------------------------------------------------------------
// Household (family) users. Creating a login needs the service role, which
// must never reach the browser, so it goes through the `family-admin` edge
// function; that function checks the caller really is the household owner.
// ---------------------------------------------------------------------------
export async function listMembers(): Promise<HouseholdMember[]> {
  const { data, error } = await db().from('household_members').select('*').order('created_at')
  if (error) throw error
  return (data ?? []).map((m: any) => ({
    memberId: m.member_id, name: m.name, email: m.email, personName: m.person_name ?? undefined,
    active: Boolean(m.active), canEdit: Boolean(m.can_edit), sections: m.sections ?? [],
    accountIds: m.account_ids ?? null,
  }))
}

export type FamilyAction =
  | { action: 'create'; name: string; email: string; password: string; personName?: string; sections: string[]; accountIds: string[] | null; canEdit: boolean }
  | { action: 'update'; memberId: string; name?: string; personName?: string; sections?: string[]; accountIds?: string[] | null; canEdit?: boolean }
  | { action: 'setActive'; memberId: string; active: boolean }
  | { action: 'resetPassword'; memberId: string; password: string }
  | { action: 'remove'; memberId: string }

export async function familyAdmin(payload: FamilyAction) {
  const { data, error } = await db().functions.invoke('family-admin', { body: payload })
  if (error) {
    // The function returns { error } with a useful message; surface it.
    const detail = await (error as any).context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? error.message)
  }
  if ((data as any)?.error) throw new Error((data as any).error)
  return data
}
