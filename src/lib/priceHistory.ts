import type { Transaction, WeightUnit } from '@/types'
import { round2 } from '@/lib/accounting'

export type PriceStatus = 'new' | 'matched' | 'increased' | 'decreased' | 'different-pack'

export interface PriceCheck {
  status: PriceStatus
  oldRate?: number
  newRate: number
  deltaAmount?: number
  deltaPct?: number
  priorDate?: string
}

const TO_KG: Partial<Record<WeightUnit, number>> = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 }
const TO_L: Partial<Record<WeightUnit, number>> = { L: 1, ml: 0.001 }
const normalizedQty = (unit: WeightUnit | undefined, qty: number) =>
  unit ? qty * (TO_KG[unit] ?? TO_L[unit] ?? 1) : qty

/** The effective unit price of a past transaction, in the same terms a scanned row uses. */
function pastRate(t: Transaction): number {
  if (t.weight) return t.amount / normalizedQty(t.weightUnit, t.weight)
  return t.amount / (t.qty || 1)
}

/**
 * Compare a scanned line's rate against the most recent past purchase of the
 * same item. Pack size is part of an item's identity — same name at a
 * different size is reported as "different-pack" rather than a numeric
 * comparison, since AED 20/kg and AED 20/450g are not the same claim.
 */
export function checkPrice(
  transactions: Transaction[],
  itemName: string,
  newRate: number,
  weight?: number,
  weightUnit?: WeightUnit,
): PriceCheck {
  const name = itemName.trim().toLowerCase()
  if (!name) return { status: 'new', newRate }

  const candidates = transactions
    .filter((t) => t.type === 'expense' && t.description.trim().toLowerCase() === name)
    .sort((a, b) => b.date.localeCompare(a.date))

  if (!candidates.length) return { status: 'new', newRate }

  const samePack = candidates.find((t) => (t.weight ?? undefined) === weight && (t.weightUnit ?? undefined) === weightUnit)
  if (!samePack) return { status: 'different-pack', newRate }

  const oldRate = round2(pastRate(samePack))
  const deltaAmount = round2(newRate - oldRate)
  const deltaPct = oldRate ? Math.round((deltaAmount / oldRate) * 1000) / 10 : 0

  if (Math.abs(deltaAmount) < 0.01) {
    return { status: 'matched', oldRate, newRate, deltaAmount: 0, deltaPct: 0, priorDate: samePack.date }
  }
  return { status: deltaAmount > 0 ? 'increased' : 'decreased', oldRate, newRate, deltaAmount, deltaPct, priorDate: samePack.date }
}
