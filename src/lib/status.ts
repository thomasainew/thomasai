// The personal "financial status" shown on the dashboard.
//
// This is a DASHBOARD LABEL for the user's own motivation — not a social-class
// classification and not financial advice. It is computed from several
// things, never from asset value alone, and it says so when the inputs are
// incomplete or out of date.
import type { StatusTier } from '@/types'

// A trend, not a verdict: four stages of the same journey, not a judgment on
// who someone is. Every label and threshold below is editable in Settings.
export const DEFAULT_TIERS: StatusTier[] = [
  { key: 'pressure', label: 'Financial Pressure', from: 0 },
  { key: 'stable', label: 'Stable', from: 35 },
  { key: 'growing', label: 'Growing', from: 60 },
  { key: 'freedom', label: 'Financial Freedom', from: 85 },
]

const TONES = ['from-rose-500 to-orange-400', 'from-amber-500 to-yellow-400', 'from-brand-600 to-cyan-500', 'from-emerald-500 to-teal-400']

/** A gradient class for a tier, by its rank among the sorted tier list — not tied to any fixed key set. */
export function tierTone(tier: StatusTier, tiers: StatusTier[]) {
  const sorted = [...tiers].sort((a, b) => a.from - b.from)
  const rank = Math.max(0, sorted.findIndex((t) => t.key === tier.key))
  const bucket = Math.round((rank / Math.max(1, sorted.length - 1)) * (TONES.length - 1))
  return TONES[bucket]
}

export interface StatusInput {
  netWorth: number
  /** Average monthly earned income over recent months (reporting currency). */
  monthlyIncome: number
  monthlyExpenses: number
  /** Cash + bank balances you could spend. */
  availableFunds: number
  /** Monthly loan EMIs + card debt service. */
  monthlyDebtPayments: number
  totalDebt: number
  hasAccounts: boolean
  /** Months of income/expense history that actually exist. */
  monthsOfData: number
  /** Oldest asset valuation age in days (Infinity if a valued asset has none). */
  oldestValuationDays: number
  hasAssets: boolean
}

export interface StatusPart {
  key: string
  label: string
  points: number
  max: number
  detail: string
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Score out of 100 from four equal parts:
 *  1. Liquidity   — how many months of expenses your available funds cover (6+ months = full marks)
 *  2. Net worth   — net worth relative to a year of expenses (5+ years of expenses = full marks; negative = 0)
 *  3. Saving      — the share of income left after expenses (30%+ = full marks; deficit = 0)
 *  4. Debt burden — the share of income that goes to debt payments (0% = full marks; 50%+ = 0)
 */
export function statusScore(i: StatusInput): { score: number; parts: StatusPart[] } {
  const annualExpenses = i.monthlyExpenses * 12
  const liquidityMonths = i.monthlyExpenses > 0 ? i.availableFunds / i.monthlyExpenses : i.availableFunds > 0 ? 6 : 0
  const nwYears = annualExpenses > 0 ? i.netWorth / annualExpenses : i.netWorth > 0 ? 5 : 0
  const savingRate = i.monthlyIncome > 0 ? (i.monthlyIncome - i.monthlyExpenses) / i.monthlyIncome : 0
  const debtShare = i.monthlyIncome > 0 ? i.monthlyDebtPayments / i.monthlyIncome : i.totalDebt > 0 ? 1 : 0

  const parts: StatusPart[] = [
    { key: 'liquidity', label: 'Available funds', max: 25, points: clamp(liquidityMonths / 6, 0, 1) * 25, detail: `${liquidityMonths.toFixed(1)} months of expenses covered` },
    { key: 'networth', label: 'Net worth', max: 25, points: clamp(nwYears / 5, 0, 1) * 25, detail: i.netWorth < 0 ? 'Debts exceed what you own' : `${nwYears.toFixed(1)} years of expenses` },
    { key: 'saving', label: 'Saving', max: 25, points: clamp(savingRate / 0.3, 0, 1) * 25, detail: `${Math.round(savingRate * 100)}% of income kept` },
    { key: 'debt', label: 'Debt burden', max: 25, points: (1 - clamp(debtShare / 0.5, 0, 1)) * 25, detail: `${Math.round(debtShare * 100)}% of income goes to debt payments` },
  ].map((p) => ({ ...p, points: Math.round(p.points * 10) / 10 }))

  return { score: Math.round(parts.reduce((n, p) => n + p.points, 0)), parts }
}

/** The tier whose threshold the score has reached. Tiers may be edited, so sort by threshold. */
export function tierFor(score: number, tiers: StatusTier[]) {
  const sorted = [...tiers].sort((a, b) => a.from - b.from)
  let hit = sorted[0]
  for (const t of sorted) if (score >= t.from) hit = t
  return hit
}

/** Reasons the assessment may be off — shown next to the label. */
export function statusCaveats(i: StatusInput): string[] {
  const out: string[] = []
  if (!i.hasAccounts) out.push('No accounts added yet, so available funds and net worth are incomplete.')
  if (i.monthsOfData < 2) out.push('Fewer than two months of income and expenses recorded — averages are rough.')
  if (i.monthlyIncome <= 0) out.push('No income recorded recently, so saving and debt burden cannot be judged.')
  if (i.hasAssets && i.oldestValuationDays > 180) out.push('Some asset values are more than six months old — update them for a fair net worth.')
  return out
}
