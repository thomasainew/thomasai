import { db, hasSupabase } from '@/lib/supabase'
import { useStore } from '@/store/useStore'

export const STORAGE_BUCKET = 'cloudbasket'
export const MAX_UPLOAD_MB = 10

const ALLOWED = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/gif', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv',
]

/** Files need the cloud: a signed-in session on a database that has run migration 0015. */
export function storageReady() {
  const s = useStore.getState()
  return hasSupabase && Boolean(s.userId) && s.schemaV2 && Boolean(s.ownerId)
}

export function checkFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `“${file.name}” is over ${MAX_UPLOAD_MB} MB.`
  if (file.type && !ALLOWED.includes(file.type)) return `“${file.name}” is a type that can't be stored here (use images, PDF, Word, Excel or text).`
  return null
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)

/**
 * Upload into the private bucket under "<household owner>/<folder>/…". The
 * database policies decide who may read or write that folder, not this code.
 */
export async function uploadFile(file: File, folder: string) {
  const problem = checkFile(file)
  if (problem) throw new Error(problem)
  if (!storageReady()) throw new Error('Cloud storage needs you to be signed in and the database update (0015) applied.')
  const ownerId = useStore.getState().ownerId!
  const path = `${ownerId}/${folder}/${Date.now().toString(36)}-${safeName(file.name)}`
  const { error } = await db().storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return { path, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size }
}

/** A short-lived link. `download` forces a save-as with that filename. */
export async function signedUrl(path: string, download?: string | boolean, expiresIn = 300) {
  const { data, error } = await db().storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresIn, download ? { download } : undefined)
  if (error) throw error
  return data.signedUrl
}

export async function removeFile(path: string) {
  const { error } = await db().storage.from(STORAGE_BUCKET).remove([path])
  if (error) throw error
}

export const canPreview = (mime?: string) => Boolean(mime && (mime.startsWith('image/') || mime === 'application/pdf'))

export function fmtSize(bytes?: number) {
  if (!bytes) return ''
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
