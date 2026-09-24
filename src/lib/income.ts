// Planned/expected income — separate from recorded transactions (see
// src/pages/Income.tsx), this is what feeds My Financial Status and the
// Financial Forecast for months that have not happened yet.
// Pure (type imports only) so it is unit-tested in plain Node.
import type { Currency, IncomeSource } from '@/types'

const month = (d: string) => d.slice(0, 7)
const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1

/** Does this source produce a payment in the given yyyy-MM month? */
export function occursIn(src: Pick<IncomeSource, 'frequency' | 'startDate' | 'endDate' | 'active'>, ym: string): boolean {
  if (!src.active) return false
  if (monthIndex(ym) < monthIndex(month(src.startDate))) return false
  if (src.endDate && monthIndex(ym) > monthIndex(month(src.endDate))) return false
  const diff = monthIndex(ym) - monthIndex(month(src.startDate))
  switch (src.frequency) {
    case 'One-Time': return diff === 0
    case 'Monthly': return diff >= 0
    case 'Quarterly': return diff >= 0 && diff % 3 === 0
    case 'Yearly': return diff >= 0 && diff % 12 === 0
    default: return false
  }
}

/** Total expected income for a month, in each source's own currency converted by `toReport`. */
export function incomeForMonth(sources: IncomeSource[], ym: string, toReport: (amount: number, c: Currency) => number): number {
  return sources.filter((s) => occursIn(s, ym)).reduce((n, s) => n + toReport(s.amount, s.currency), 0)
}

export function incomeSourcesForMonth(sources: IncomeSource[], ym: string): IncomeSource[] {
  return sources.filter((s) => occursIn(s, ym))
}
