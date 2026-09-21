// ============================================================================
// Price tracking, derived from purchases. Nothing is entered twice: every
// expense line with an item name IS a price point, so the tracker, the
// Shopping Assistant and the reports all read the same records.
//
// Pure (type imports only) so it can be unit-tested in plain Node.
// ============================================================================
import type { Currency, ItemAlias, Transaction } from '@/types'

export type RateUnit = 'kg' | 'L' | 'unit'

export interface Rate {
  /** Price per kg, per litre or per single unit, in the transaction's currency. */
  value: number
  per: RateUnit
}

export interface PricePoint {
  txnId: string
  date: string
  store: string
  brand: string
  currency: Currency
  /** What was paid for the whole line. */
  amount: number
  qty: number
  /** Price of ONE pack (or one loose unit). */
  packPrice: number
  packSize?: number
  packUnit?: string
  /** Comparable rate, when a size or weight is known; else per unit. */
  rate: Rate
  /** Total quantity bought in the rate's own unit (kg / L / units). */
  totalQty: number
}

export interface PriceItem {
  /** Canonical (merged) item name. */
  name: string
  category: string
  /** Every name that was merged into this item. */
  aliases: string[]
  /** Oldest first. */
  points: PricePoint[]
  latest: PricePoint
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const KG: Record<string, number> = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 }
const LITRE: Record<string, number> = { L: 1, ml: 0.001 }

/** Resolve a purchase's item name through the user's merge list. */
export function canonicalName(description: string, aliases: ItemAlias[]) {
  const key = norm(description)
  const hit = aliases.find((a) => norm(a.alias) === key)
  return hit ? hit.canonical.trim() : description.trim()
}

/**
 * The comparable rate for a purchase. Order of trust:
 * weight/volume bought → pack size × quantity → plain units.
 * A pack price (AED 6 for 500 g) and a rate (AED 12 per kg) are different
 * claims, so both are kept.
 */
export function rateOf(t: Transaction): { rate: Rate; totalQty: number; packPrice: number } {
  const qty = t.qty && t.qty > 0 ? t.qty : 1

  if (t.weight && t.weight > 0 && t.weightUnit) {
    const u = t.weightUnit
    if (KG[u]) {
      const kg = t.weight * KG[u]
      return { rate: { value: t.amount / kg, per: 'kg' }, totalQty: kg, packPrice: t.amount }
    }
    if (LITRE[u]) {
      const l = t.weight * LITRE[u]
      return { rate: { value: t.amount / l, per: 'L' }, totalQty: l, packPrice: t.amount }
    }
  }

  if (t.packSize && t.packSize > 0 && t.packUnit) {
    const u = t.packUnit
    const packPrice = t.amount / qty
    if (KG[u]) {
      const kg = t.packSize * qty * KG[u]
      return { rate: { value: t.amount / kg, per: 'kg' }, totalQty: kg, packPrice }
    }
    if (LITRE[u]) {
      const l = t.packSize * qty * LITRE[u]
      return { rate: { value: t.amount / l, per: 'L' }, totalQty: l, packPrice }
    }
    if (u === 'pcs') {
      const pcs = t.packSize * qty
      return { rate: { value: t.amount / pcs, per: 'unit' }, totalQty: pcs, packPrice }
    }
  }

  return { rate: { value: t.amount / qty, per: 'unit' }, totalQty: qty, packPrice: t.amount / qty }
}

/** Every priced expense line, grouped under its canonical item name. */
export function buildPriceItems(txns: Transaction[], aliases: ItemAlias[]): PriceItem[] {
  const groups = new Map<string, { display: string; category: string; names: Set<string>; points: PricePoint[] }>()

  for (const t of txns) {
    if (t.type !== 'expense' || (t.kind ?? 'normal') === 'asset_purchase') continue
    if (!t.description.trim() || t.amount <= 0) continue

    const name = canonicalName(t.description, aliases)
    const key = norm(name)
    const { rate, totalQty, packPrice } = rateOf(t)
    const point: PricePoint = {
      txnId: t.id,
      date: t.date,
      store: t.store?.trim() ?? '',
      brand: t.brand?.trim() ?? '',
      currency: t.currency,
      amount: t.amount,
      qty: t.qty && t.qty > 0 ? t.qty : 1,
      packPrice,
      packSize: t.packSize,
      packUnit: t.packUnit,
      rate,
      totalQty,
    }
    const g = groups.get(key)
    if (g) {
      g.points.push(point)
      g.names.add(t.description.trim())
    } else groups.set(key, { display: name, category: t.category, names: new Set([t.description.trim()]), points: [point] })
  }

  return [...groups.values()]
    .map((g) => {
      const points = g.points.sort((a, b) => a.date.localeCompare(b.date))
      return { name: g.display, category: g.category, aliases: [...g.names], points, latest: points[points.length - 1] }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface PriceChange {
  /** What was compared: a per-kg/litre/unit rate, or the pack price. */
  basis: 'per kg' | 'per L' | 'per unit' | 'pack price'
  start: number
  end: number
  delta: number
  /** Percent, one decimal. */
  pct: number
  startDate: string
  endDate: string
  currency: Currency
  /** False when the item was bought in different pack sizes and only rates could be compared. */
  samePack: boolean
}

const RATE_LABEL: Record<RateUnit, PriceChange['basis']> = { kg: 'per kg', L: 'per L', unit: 'per unit' }
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * How an item's price moved over [from, to]. The start is the last purchase
 * BEFORE the period (or the first inside it if there was none); the end is the
 * last purchase inside it. Equivalent quantities are compared: per kg / L /
 * unit whenever both ends share a unit, otherwise nothing is claimed.
 */
export function priceChange(item: PriceItem, from: string, to: string): PriceChange | null {
  const inside = item.points.filter((p) => p.date >= from && p.date <= to)
  if (!inside.length) return null
  const before = item.points.filter((p) => p.date < from)
  const start = before[before.length - 1] ?? inside[0]
  const end = inside[inside.length - 1]
  if (start.txnId === end.txnId) return null
  if (start.currency !== end.currency) return null
  if (start.rate.per !== end.rate.per) return null

  const samePack = start.packSize === end.packSize && start.packUnit === end.packUnit
  // Same pack → the pack price is what the shelf shows, so say so. Otherwise compare the rate.
  const usePack = samePack && start.packSize !== undefined
  const a = usePack ? start.packPrice : start.rate.value
  const b = usePack ? end.packPrice : end.rate.value
  return {
    basis: usePack ? 'pack price' : RATE_LABEL[start.rate.per],
    start: r2(a),
    end: r2(b),
    delta: r2(b - a),
    pct: a ? Math.round(((b - a) / a) * 1000) / 10 : 0,
    startDate: start.date,
    endDate: end.date,
    currency: end.currency,
    samePack,
  }
}

/** Where an item is cheapest, per comparable rate, from its recent purchases. */
export function cheapestStore(item: PriceItem) {
  const per = item.latest.rate.per
  const best = new Map<string, PricePoint>()
  for (const p of item.points) {
    if (!p.store || p.rate.per !== per) continue
    const cur = best.get(p.store)
    if (!cur || p.date > cur.date) best.set(p.store, p)
  }
  return [...best.values()].sort((a, b) => a.rate.value - b.rate.value)[0]
}

// ---------------------------------------------------------------------------
// Shopping assistant
// ---------------------------------------------------------------------------
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}

export type Freshness = 'fresh' | 'aging' | 'old'

/** How much to trust a price: it is only an estimate once it is old. */
export function freshness(date: string, today: string): Freshness {
  const d = daysBetween(date, today)
  return d <= 30 ? 'fresh' : d <= 90 ? 'aging' : 'old'
}

/** Search every previously bought item by name, brand or store. */
export function searchItems(items: PriceItem[], query: string, limit = 12) {
  const q = norm(query)
  if (!q) return []
  const scored = items
    .map((i) => {
      const hay = norm(`${i.name} ${i.aliases.join(' ')} ${i.latest.brand} ${i.latest.store} ${i.category}`)
      const name = norm(i.name)
      const score = name === q ? 3 : name.startsWith(q) ? 2 : hay.includes(q) ? 1 : 0
      return { i, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i.name.localeCompare(b.i.name))
  return scored.slice(0, limit).map((x) => x.i)
}

export interface MonthlyNeed {
  name: string
  /** Packs (or units) per month, rounded up. */
  perMonth: number
  unit: string
  /** How many purchases the estimate rests on. */
  purchases: number
  monthsCovered: number
  lastPrice: number
  currency: Currency
  latestDate: string
}

/**
 * What the household tends to need each month, from what it actually bought:
 * total packs bought over the look-back window ÷ months covered. Items bought
 * only once are left out — one purchase is not a pattern.
 */
export function suggestMonthly(items: PriceItem[], today: string, lookbackDays = 120): MonthlyNeed[] {
  const out: MonthlyNeed[] = []
  for (const item of items) {
    const recent = item.points.filter((p) => daysBetween(p.date, today) <= lookbackDays)
    if (recent.length < 2) continue
    const first = recent[0].date
    const span = Math.max(30, daysBetween(first, today))
    const months = Math.max(1, Math.round((span / 30) * 10) / 10)
    const packs = recent.reduce((n, p) => n + p.qty, 0)
    out.push({
      name: item.name,
      perMonth: Math.max(1, Math.ceil(packs / months)),
      unit: item.latest.packSize ? `${item.latest.packSize}${item.latest.packUnit ?? ''} pack` : 'unit',
      purchases: recent.length,
      monthsCovered: months,
      lastPrice: item.latest.packPrice,
      currency: item.latest.currency,
      latestDate: item.latest.date,
    })
  }
  return out.sort((a, b) => b.perMonth * b.lastPrice - a.perMonth * a.lastPrice)
}
