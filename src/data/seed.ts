import type {
  Account, Bill, BudgetCategory, Doc, Goal, Loan, Note, Person, PriceWatch, Purchase, Settings, Transaction,
} from '@/types'
/**
 * First and last day of the current month.
 *
 * Deliberately computed here rather than imported from lib/format: format.ts
 * imports FX from this file, so reaching back into it would make the two
 * modules circular and leave TODAY uninitialised at load time depending on
 * which one the bundler evaluates first.
 */
function currentPeriod(d = new Date()) {
  const y = d.getFullYear()
  const m = d.getMonth()
  const mm = String(m + 1).padStart(2, '0')
  const last = new Date(y, m + 1, 0).getDate()
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

const period = currentPeriod()

/**
 * Defaults for a brand-new account. Everything starts empty and at zero —
 * figures only appear once you enter your own.
 */
export const SETTINGS: Settings = {
  userName: 'Thomas',
  accountLabel: 'Personal Account',
  phone: '',
  baseCurrency: 'AED',
  monthlyIncomeTarget: 0,
  monthlyBudget: 0,
  periodStart: period.start,
  periodEnd: period.end,
}

/** Conversion rates into the AED base. Edit these to match your own. */
export const FX: Record<string, number> = { AED: 1, INR: 0.0434, USD: 3.6725 }

export const ACCOUNTS: Account[] = []
export const TRANSACTIONS: Transaction[] = []
export const BUDGETS: BudgetCategory[] = []
export const LOANS: Loan[] = []
export const PEOPLE: Person[] = []
export const BILLS: Bill[] = []
export const DOCUMENTS: Doc[] = []
export const NOTES: Note[] = []
export const GOALS: Goal[] = []
export const PURCHASES: Purchase[] = []
export const PRICE_WATCH: PriceWatch[] = []
