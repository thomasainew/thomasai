import type { Receipt, Transaction } from '@/types'
import { toBase } from '@/lib/format'

/**
 * One row in the Expenses list: a whole supermarket receipt, or a single
 * stand-alone expense. Two receipts from the same shop on the same day stay
 * separate because grouping is by receipt id, never by store + date.
 */
export interface ReceiptEntry {
  /** receiptId, or the transaction id for a stand-alone entry. */
  key: string
  receiptId?: string
  header?: Receipt
  date: string
  store: string
  person?: string
  accountId?: string
  method?: string
  items: Transaction[]
  /** Total in AED-equivalent, for sorting and summing across currencies. */
  totalBase: number
  /** Total in the receipt's own currency (all lines normally share one). */
  total: number
  currency: Transaction['currency']
  kind: 'receipt' | 'expense' | 'refund' | 'asset'
}

export function groupReceipts(txns: Transaction[], receipts: Receipt[]): ReceiptEntry[] {
  const headers = new Map(receipts.map((r) => [r.id, r]))
  const groups = new Map<string, Transaction[]>()
  const solo: Transaction[] = []

  for (const t of txns) {
    if (t.receiptId) {
      const g = groups.get(t.receiptId)
      if (g) g.push(t)
      else groups.set(t.receiptId, [t])
    } else solo.push(t)
  }

  const entries: ReceiptEntry[] = []

  for (const [id, items] of groups) {
    const h = headers.get(id)
    const first = items[0]
    const sign = (t: Transaction) => ((t.kind ?? 'normal') === 'refund' ? -1 : 1)
    entries.push({
      key: id,
      receiptId: id,
      header: h,
      date: h?.date ?? first.date,
      store: h?.store || first.store || first.description,
      person: h?.person ?? first.person,
      accountId: h?.accountId ?? first.accountId,
      method: h?.method ?? first.method,
      items: [...items].sort((a, b) => a.description.localeCompare(b.description)),
      total: items.reduce((n, t) => n + sign(t) * t.amount, 0),
      totalBase: items.reduce((n, t) => n + sign(t) * toBase(t.amount, t.currency), 0),
      currency: h?.currency ?? first.currency,
      kind: 'receipt',
    })
  }

  for (const t of solo) {
    const k = t.kind ?? 'normal'
    entries.push({
      key: t.id,
      date: t.date,
      store: t.store || t.description,
      person: t.person,
      accountId: t.accountId,
      method: t.method,
      items: [t],
      total: k === 'refund' ? -t.amount : t.amount,
      totalBase: k === 'refund' ? -toBase(t.amount, t.currency) : toBase(t.amount, t.currency),
      currency: t.currency,
      kind: k === 'refund' ? 'refund' : k === 'asset_purchase' ? 'asset' : 'expense',
    })
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key))
}
