// ============================================================================
// AI Bill Scanner logic: carton / pack identity, per-line VAT and price
// comparison against past purchases.
//
// A scanned line is priced per UOM (one carton, one piece…). Its pack details
// ("20 × 450 g") are part of the item's identity: 20 × 400 g and 20 × 450 g
// of the same item are never compared or merged.
//
// Extra per-line facts that Transaction has no column for (item code, pack
// label, UOM, VAT %) ride in the line's notes, so no database change is
// needed. `amount` is always what was paid, VAT included.
//
// Pure (type imports only) so it can be unit-tested in plain Node.
// ============================================================================
import type { PackUnit, Transaction } from '@/types'

export const UOMS = ['CTN', 'BOX', 'PKT', 'PCS', 'BTL', 'KG', 'L', 'BAG', 'TIN'] as const
export const PACK_DETAIL_UNITS: PackUnit[] = ['g', 'kg', 'ml', 'L', 'pcs']

export type LineStatus = 'matched' | 'increased' | 'decreased' | 'different-pack' | 'new' | 'review'

export interface BillLine {
  id: string
  include: boolean
  code: string
  item: string
  brand?: string
  /** Broad purchase category (Groceries, Business…). */
  category: string
  /** Finer item group printed or inferred, e.g. "Frozen Chicken". Saved as the subcategory. */
  itemGroup: string
  /** Inner packs per UOM: the 20 in "20 × 450 g". 0 = no pack details. */
  packCount: number
  packSize: number
  packUnit: PackUnit
  uom: string
  qty: number
  /** Price of one UOM, before VAT. */
  price: number
  vatPct: number
  /** The AI could not read this line with confidence. */
  flagged?: boolean
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export const beforeVat = (l: Pick<BillLine, 'qty' | 'price'>) => round2(l.qty * l.price)
export const vatOf = (l: Pick<BillLine, 'qty' | 'price' | 'vatPct'>) => round2((beforeVat(l) * (l.vatPct || 0)) / 100)
export const lineTotal = (l: Pick<BillLine, 'qty' | 'price' | 'vatPct'>) => round2(beforeVat(l) + vatOf(l))

/** "20 × 450 g", or "" when the line states no pack. */
export function packLabel(l: Pick<BillLine, 'packCount' | 'packSize' | 'packUnit'>): string {
  if (!(l.packSize > 0)) return ''
  return l.packCount > 1 ? `${l.packCount} × ${l.packSize} ${l.packUnit}` : `${l.packSize} ${l.packUnit}`
}

/** Total content of one UOM in a base unit (g, ml or pcs), for Transaction.packSize. */
export function packTotal(l: Pick<BillLine, 'packCount' | 'packSize' | 'packUnit'>): { size: number; unit: PackUnit } | null {
  if (!(l.packSize > 0)) return null
  const count = l.packCount > 0 ? l.packCount : 1
  if (l.packUnit === 'kg') return { size: round2(count * l.packSize * 1000), unit: 'g' }
  if (l.packUnit === 'L') return { size: round2(count * l.packSize * 1000), unit: 'ml' }
  return { size: round2(count * l.packSize), unit: l.packUnit }
}

// --------------------------------------------------------- line notes ------

export interface LineFacts {
  code?: string
  pack?: string
  uom?: string
  vatPct?: number
}

export function encodeLineNotes(f: LineFacts & { invoice?: string }): string {
  return [
    f.code ? `Code ${f.code}` : null,
    f.pack ? `Pack ${f.pack}` : null,
    f.uom ? `UOM ${f.uom}` : null,
    f.vatPct ? `VAT ${f.vatPct}%` : null,
    f.invoice ? `Invoice ${f.invoice}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function decodeLineNotes(notes: string | undefined): LineFacts {
  const out: LineFacts = {}
  for (const part of (notes ?? '').split(' · ')) {
    const m = /^(Code|Pack|UOM|VAT) (.+)$/.exec(part.trim())
    if (!m) continue
    if (m[1] === 'Code') out.code = m[2]
    if (m[1] === 'Pack') out.pack = m[2]
    if (m[1] === 'UOM') out.uom = m[2]
    if (m[1] === 'VAT') out.vatPct = Number(m[2].replace('%', '')) || 0
  }
  return out
}

// ------------------------------------------------------- price check -------

export interface LineCheck {
  status: LineStatus
  oldPrice?: number
  /** New minus old price, per UOM, before VAT. */
  delta?: number
  deltaPct?: number
  priorDate?: string
}

/** Pack identity of a past purchase, comparable with {@link lineKey}. */
function pastKey(t: Transaction): string {
  const facts = decodeLineNotes(t.notes)
  if (facts.pack) return norm(facts.pack)
  if (t.packSize && t.packUnit) {
    const count = { kg: 1000, L: 1000 }[t.packUnit as 'kg' | 'L'] ?? 1
    const unit = t.packUnit === 'kg' ? 'g' : t.packUnit === 'L' ? 'ml' : t.packUnit
    return `=${round2(t.packSize * count)}${unit}`
  }
  return ''
}

function lineKeys(l: BillLine): string[] {
  const label = packLabel(l)
  if (!label) return ['']
  const total = packTotal(l)!
  return [norm(label), `=${total.size}${total.unit}`]
}

/** Past price of one UOM, before VAT. */
function pastPrice(t: Transaction): number {
  const vat = decodeLineNotes(t.notes).vatPct ?? 0
  return t.amount / (t.qty && t.qty > 0 ? t.qty : 1) / (1 + vat / 100)
}

/**
 * Compare a scanned line with the most recent past purchase of the same item —
 * matched by item code when both have one, otherwise by name — and the same
 * pack. Same item at another pack size is "different-pack", never a price change.
 */
export function checkLine(transactions: Transaction[], l: BillLine): LineCheck {
  if (l.flagged || !l.item.trim() || !(l.qty > 0) || !(l.price > 0)) return { status: 'review' }

  const name = norm(l.item)
  const code = l.code.trim()
  const candidates = transactions
    .filter((t) => {
      if (t.type !== 'expense') return false
      const pastCode = decodeLineNotes(t.notes).code
      if (code && pastCode) return pastCode === code
      return norm(t.description) === name
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  if (!candidates.length) return { status: 'new' }

  const keys = lineKeys(l)
  const same = candidates.find((t) => keys.includes(pastKey(t)))
  if (!same) return { status: 'different-pack' }

  const oldPrice = round2(pastPrice(same))
  const delta = round2(l.price - oldPrice)
  const deltaPct = oldPrice ? Math.round((delta / oldPrice) * 10000) / 100 : 0
  if (Math.abs(delta) < 0.01) return { status: 'matched', oldPrice, delta: 0, deltaPct: 0, priorDate: same.date }
  return { status: delta > 0 ? 'increased' : 'decreased', oldPrice, delta, deltaPct, priorDate: same.date }
}

/** Items on this bill that appear more than once at different pack sizes, e.g. ["20 × 400 g", "20 × 450 g"]. */
export function packConflicts(lines: BillLine[]): string[][] {
  const byItem = new Map<string, Set<string>>()
  for (const l of lines) {
    const label = packLabel(l)
    if (!label || !l.item.trim()) continue
    const key = l.code.trim() || norm(l.item)
    if (!byItem.has(key)) byItem.set(key, new Set())
    byItem.get(key)!.add(label)
  }
  return [...byItem.values()].filter((s) => s.size > 1).map((s) => [...s])
}
