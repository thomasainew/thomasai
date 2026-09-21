import type { Asset, AssetValuation, Currency, Loan } from '@/types'

const r2 = (n: number) => Math.round(n * 100) / 100

/** The owner's share of an asset's whole value — a Rs 1 crore property at 25% is Rs 25 lakh. */
export const ownedShare = (a: Pick<Asset, 'currentValue' | 'ownershipPct'>) => r2((a.currentValue * a.ownershipPct) / 100)

/** Total owned value across assets, in the reporting currency. Debt is NOT subtracted here. */
export function assetsOwned(assets: Asset[], toReport: (amount: number, c: Currency) => number) {
  return r2(assets.reduce((n, a) => n + toReport(ownedShare(a), a.currency), 0))
}

/** The loan tied to an asset, if any, and the user's exposure to it. */
export function linkedDebt(asset: Asset, loans: Loan[]) {
  const loan = asset.linkedLoanId ? loans.find((l) => l.id === asset.linkedLoanId) : undefined
  return loan && loan.status !== 'Closed' ? loan : undefined
}

export interface ValuationStep {
  v: AssetValuation
  /** Change from the previous valuation, in the asset's currency. */
  delta?: number
  pct?: number
}

/** Newest first, each with its change against the one before it. */
export function valuationSteps(history: AssetValuation[]): ValuationStep[] {
  const asc = [...history].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const steps = asc.map((v, i) => {
    const prev = asc[i - 1]
    return { v, delta: prev ? r2(v.value - prev.value) : undefined, pct: prev && prev.value ? Math.round(((v.value - prev.value) / prev.value) * 1000) / 10 : undefined }
  })
  return steps.reverse()
}

/** How stale an asset's estimate is, in days (Infinity when it has never been valued). */
export function valuationAge(asset: Asset, today: string) {
  if (!asset.valuationDate) return Infinity
  return Math.round((new Date(today + 'T00:00:00').getTime() - new Date(asset.valuationDate + 'T00:00:00').getTime()) / 86400000)
}

export const ASSET_CATEGORIES = ['Property', 'Land', 'Gold', 'Vehicle', 'Mobile & Electronics', 'Investment', 'Other'] as const
export const CATEGORY_ICON: Record<string, string> = {
  Property: '🏠', Land: '🌳', Gold: '🪙', Vehicle: '🚗', 'Mobile & Electronics': '📱', Investment: '📈', Other: '📦',
}

/** Indian digit grouping words: 2,500,000 → "₹25 lakh", 10,000,000 → "₹1 crore". */
export function inrWords(n: number) {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const fmt = (x: number) => (Math.round(x * 100) / 100).toString()
  if (a >= 1e7) return `${sign}₹${fmt(a / 1e7)} crore`
  if (a >= 1e5) return `${sign}₹${fmt(a / 1e5)} lakh`
  return `${sign}₹${fmt(a)}`
}
