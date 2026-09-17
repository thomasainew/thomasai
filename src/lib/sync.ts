import { db } from '@/lib/supabase'
import { MAPPERS, TABLES, settingsMapper, type Collection } from '@/lib/mappers'
import type { Settings } from '@/types'
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
}

/** Read every table for the signed-in user. RLS scopes the rows, so no filter is needed. */
export async function pullAll(): Promise<RemoteData> {
  const client = db()

  const [settingsRes, ...rest] = await Promise.all([
    client.from('settings').select('*').maybeSingle(),
    ...COLLECTIONS.map((c) => client.from(TABLES[c]).select('*')),
  ])

  if (settingsRes.error) throw settingsRes.error

  const out: any = {
    settings: settingsRes.data ? settingsMapper.from(settingsRes.data) : SETTINGS,
  }

  rest.forEach((res, i) => {
    if (res.error) throw res.error
    const key = COLLECTIONS[i]
    out[key] = (res.data ?? []).map(MAPPERS[key].from)
  })

  return out as RemoteData
}

export async function upsertRow(collection: Collection, item: any, userId: string) {
  const row = { ...MAPPERS[collection].to(item), user_id: userId }
  const { error } = await db().from(TABLES[collection]).upsert(row)
  if (error) throw error
}

export async function deleteRow(collection: Collection, id: string) {
  const { error } = await db().from(TABLES[collection]).delete().eq('id', id)
  if (error) throw error
}

export async function upsertSettings(settings: Settings, userId: string) {
  const { error } = await db()
    .from('settings')
    .upsert({ ...settingsMapper.to(settings), user_id: userId })
  if (error) throw error
}

/** Push the entire local dataset up — used by "Sync to cloud" in Settings. */
export async function pushAll(state: any, userId: string) {
  const client = db()
  await upsertSettings(state.settings, userId)
  for (const c of COLLECTIONS) {
    const rows = (state[c] ?? []).map((r: any) => ({ ...MAPPERS[c].to(r), user_id: userId }))
    if (!rows.length) continue
    const { error } = await client.from(TABLES[c]).upsert(rows)
    if (error) throw error
  }
}

/** Delete every row this user owns, across all twelve tables. */
export async function wipeRemote(userId: string): Promise<void> {
  const client = db()
  for (const c of COLLECTIONS) {
    const { error } = await client.from(TABLES[c]).delete().eq('user_id', userId)
    if (error) throw error
  }
  const { error } = await client.from('settings').delete().eq('user_id', userId)
  if (error) throw error
}

/** Replace everything in the cloud with the given local state. */
export async function replaceRemote(state: any, userId: string): Promise<void> {
  await wipeRemote(userId)
  await pushAll(state, userId)
}
