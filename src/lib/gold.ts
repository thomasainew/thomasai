// Gold valuation. Pure maths + one network function.
//
// Value of a holding = grams × (24K rate per gram) × (karat ÷ 24), then the
// owner's percentage of that. Jewellery MAKING CHARGES and GST are what you
// pay a jeweller, not gold you can sell back, so they are never added to the
// value. Everything here is an ESTIMATE and is labelled as one in the UI.
import type { Currency } from '@/types'

export const KARATS = [24, 22, 21, 18, 14] as const
/** Purity as a fraction of pure gold: 22K = 22/24. */
export const purity = (karat: number) => Math.min(24, Math.max(1, karat)) / 24

export interface GoldMeta {
  grams: number
  karat: number
  /** Informational only — never counted as recoverable value. */
  makingCharges?: number
  rateMode: 'live' | 'manual'
  /** Per gram of 24K, in INR, used when rateMode is manual. */
  manualRate?: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function goldHoldingValue(input: { grams: number; karat: number; perGram24k: number; ownershipPct: number }) {
  const pureGrams = input.grams * purity(input.karat)
  const raw = pureGrams * input.perGram24k // unrounded, so the share isn't a rounding of a rounding
  const full = r2(raw)
  return {
    pureGrams: Math.round(pureGrams * 1000) / 1000,
    /** Per gram at this purity — the "22K rate". */
    perGramAtPurity: r2(input.perGram24k * purity(input.karat)),
    fullValue: full,
    myShare: r2((raw * input.ownershipPct) / 100),
  }
}

export interface GoldRateQuote {
  /** INR per gram of 24K gold, after the assumed import duty. */
  perGram24k: number
  currency: Currency
  /** International spot per troy ounce, USD. */
  spotUsdPerOz: number
  usdInr: number
  /** INR per gram straight from spot, before duty. */
  spotParityPerGram: number
  dutyPct: number
  source: string
  fetchedAt: string
}

const GRAMS_PER_OZ = 31.1034768

/** Turn spot + FX into an INR-per-gram estimate. Pure so it can be tested. */
export function quoteFromSpot(spotUsdPerOz: number, usdInr: number, dutyPct: number, source: string, fetchedAt: string): GoldRateQuote {
  const parity = (spotUsdPerOz / GRAMS_PER_OZ) * usdInr
  return {
    perGram24k: r2(parity * (1 + dutyPct / 100)),
    currency: 'INR',
    spotUsdPerOz: r2(spotUsdPerOz),
    usdInr: Math.round(usdInr * 10000) / 10000,
    spotParityPerGram: r2(parity),
    dutyPct,
    source,
    fetchedAt,
  }
}

/**
 * Live rate without any account or key: international spot gold (gold-api.com)
 * and the USD→INR rate (open.er-api.com), then India's import duty on top,
 * because Indian gold prices sit above spot by roughly that. The duty % is a
 * setting you can change — it is an assumption, not a quoted market figure.
 * For a jeweller's or IBJA rate, enter it manually.
 */
export async function fetchGoldRate(dutyPct: number, signal?: AbortSignal): Promise<GoldRateQuote> {
  const [gold, fx] = await Promise.all([
    fetch('https://api.gold-api.com/price/XAU', { signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Gold price service returned ${r.status}`)))),
    fetch('https://open.er-api.com/v6/latest/USD', { signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Exchange-rate service returned ${r.status}`)))),
  ])
  const spot = Number(gold?.price)
  const inr = Number(fx?.rates?.INR)
  if (!(spot > 0) || !(inr > 0)) throw new Error('The rate services did not return usable prices.')
  return quoteFromSpot(spot, inr, dutyPct, 'gold-api.com (spot XAU/USD) × open.er-api.com (USD/INR) + import duty', gold?.updatedAt ?? new Date().toISOString())
}
