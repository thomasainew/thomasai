import type { HouseholdMember } from '@/types'

/** Which permission section each screen belongs to. The database enforces the same sections. */
export const PATH_SECTION: Record<string, string> = {
  '/accounts': 'accounts', '/income': 'transactions', '/expenses': 'transactions', '/expense-report': 'transactions',
  '/categories': 'transactions', '/reports': 'transactions', '/profit-loss': 'transactions', '/budget': 'budget',
  '/loans': 'loans', '/people': 'people', '/bills': 'bills', '/calendar': 'bills', '/documents': 'documents',
  '/notes': 'notes', '/goals': 'goals', '/price-tracker': 'shopping', '/shopping': 'shopping', '/assets': 'assets',
  '/ai-advisor': 'advisor',
}

/**
 * Should this screen be offered to this user? The owner sees everything. This is
 * a convenience for the menus — the real protection is row level security in
 * the database, which refuses the data itself.
 */
export function canOpen(member: HouseholdMember | null, path: string) {
  if (!member) return true
  const base = '/' + path.replace(/^\//, '').split('/')[0]
  const section = PATH_SECTION[base]
  if (!section) return true // dashboard, settings
  return member.sections.includes('*') || member.sections.includes(section)
}
