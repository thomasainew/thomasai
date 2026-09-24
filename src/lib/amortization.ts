// Loan amortization — projects a loan's OWN outstanding balance forward from
// today, month by month, splitting each EMI into interest and principal.
// Pure (type imports only) so it is unit-tested in plain Node.
import type { Loan } from '@/types'

export interface AmortizationRow {
  month: string // yyyy-MM
  opening: number
  interest: number
  principal: number
  emi: number
  closing: number
}

const addMonth = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Project a loan from its CURRENT outstanding balance and next payment date —
 * not the original principal — so the schedule always matches what is
 * actually owed today. Stops the month the balance reaches zero. Guards
 * against a loan that can never amortize (EMI at or below the interest due)
 * with a hard cap, rather than looping forever.
 */
export function amortizationSchedule(loan: Pick<Loan, 'outstanding' | 'emi' | 'rate' | 'nextPayment' | 'currency'>, maxMonths = 600): AmortizationRow[] {
  const rows: AmortizationRow[] = []
  let opening = loan.outstanding
  let month = loan.nextPayment.slice(0, 7)
  const monthlyRate = (loan.rate || 0) / 100 / 12

  for (let i = 0; i < maxMonths && opening > 0.005; i++) {
    const interest = r2(opening * monthlyRate)
    const principalPortion = Math.max(0, Math.min(loan.emi - interest, opening))
    if (principalPortion <= 0) {
      // The EMI does not even cover the interest — the balance would never
      // fall. Record one more row so the UI can show the shortfall, then stop.
      rows.push({ month, opening, interest, principal: 0, emi: loan.emi, closing: opening })
      break
    }
    const closing = r2(Math.max(0, opening - principalPortion))
    const emiThisMonth = r2(principalPortion + interest)
    rows.push({ month, opening: r2(opening), interest, principal: r2(principalPortion), emi: emiThisMonth, closing })
    opening = closing
    month = addMonth(month, 1)
  }
  return rows
}

/** Does this loan still amortize (will its EMI ever pay it off)? */
export function amortizes(loan: Pick<Loan, 'outstanding' | 'emi' | 'rate'>): boolean {
  const monthlyRate = (loan.rate || 0) / 100 / 12
  return loan.emi > loan.outstanding * monthlyRate
}
