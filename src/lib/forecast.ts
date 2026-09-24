// Financial Forecast — projects buildMonthItems() forward across many months,
// with loans dropping off the moment their own amortization schedule says
// they are paid off (see src/lib/amortization.ts), so a loan that finishes in
// June contributes no EMI from July even though nothing else changed.
// Pure (type imports only) so it is unit-tested in plain Node.
import type { Account, Bill, BudgetItem, Currency, Doc, Loan, Note } from '@/types'
import { buildMonthItems, type MonthItem } from '@/lib/smartBudget'
import { amortizationSchedule } from '@/lib/amortization'
import { monthlySituation, type MonthSituation } from '@/lib/financials'

export interface ForecastMonth {
  month: string
  income: number
  budget: number
  loanEmi: number
  installments: number
  otherPlanned: number
  totalNeed: number
  expectedBalance: number
  situation: MonthSituation
  items: MonthItem[]
}

export interface ForecastInput {
  months: string[] // ordered yyyy-MM, e.g. the next 6 or 12
  today: string
  loans: Loan[]
  bills: Bill[]
  documents: Doc[]
  notes: Note[]
  budgetItems: BudgetItem[]
  people: string[]
  txns: import('@/types').Transaction[]
  accounts: Account[]
  /** Planned monthly budget/spending, and expected income — both already in the reporting currency. */
  budget: number
  expectedIncome: number
  toReport: (amount: number, currency: Currency) => number
}

/** Per loan, the months it still has a balance for, and what the EMI actually is that month. */
function loanSchedules(loans: Loan[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const l of loans) {
    if (l.status === 'Closed' || l.emi <= 0 || l.outstanding <= 0) continue
    const rows = amortizationSchedule(l)
    out.set(l.id, new Map(rows.map((r) => [r.month, r.emi])))
  }
  return out
}

export function buildForecast(i: ForecastInput): ForecastMonth[] {
  const schedules = loanSchedules(i.loans)
  const ctx = { today: i.today, loans: i.loans, bills: i.bills, documents: i.documents, notes: i.notes, stored: i.budgetItems, txns: i.txns, people: i.people, accounts: i.accounts }

  return i.months.map((month) => {
    const raw = buildMonthItems({ ...ctx, month }).filter((it) => it.status !== 'Dismissed')
    // A loan past its own payoff month contributes nothing; one still active
    // is shown at its amortization-schedule EMI (handles the smaller final payment).
    const items = raw
      .filter((it) => it.sourceKind !== 'loan' || schedules.get(it.sourceId ?? '')?.has(month))
      .map((it): MonthItem => {
        if (it.sourceKind !== 'loan') return it
        const emi = schedules.get(it.sourceId ?? '')?.get(month)
        return emi !== undefined ? { ...it, amount: emi } : it
      })

    const sum = (kind: string) => items.filter((it) => it.sourceKind === kind).reduce((n, it) => n + (it.amount !== undefined ? i.toReport(it.amount, it.currency) : 0), 0)
    const loanEmi = sum('loan')
    const installments = sum('schedule')
    const otherPlanned = sum('bill') + sum('document') + sum('note') + sum('manual')
    const totalNeed = i.budget + loanEmi + installments + otherPlanned
    const expectedBalance = i.expectedIncome - totalNeed

    return {
      month, income: i.expectedIncome, budget: i.budget, loanEmi, installments, otherPlanned, totalNeed, expectedBalance,
      situation: monthlySituation(expectedBalance, i.expectedIncome), items,
    }
  })
}

/** Factual, comparison-based sentences — never a claim the numbers do not support. */
export function forecastSuggestions(months: ForecastMonth[], monthLabel: (ym: string) => string): string[] {
  const out: string[] = []
  for (let k = 1; k < months.length; k++) {
    const prev = months[k - 1]
    const cur = months[k]
    const diff = cur.totalNeed - prev.totalNeed
    if (Math.abs(diff) >= 50) {
      out.push(`Your ${monthLabel(cur.month)} commitments are ${diff > 0 ? Math.round(diff) : Math.round(-diff)} higher than ${monthLabel(prev.month)}.`)
    }
    if (cur.loanEmi > prev.loanEmi + 1) {
      out.push(`Your ${monthLabel(cur.month)} balance is expected to be lower because a new or larger EMI starts this month.`)
    }
    if (cur.loanEmi < prev.loanEmi - 1 && cur.loanEmi === 0) {
      out.push(`A loan is scheduled to finish before ${monthLabel(cur.month)} — no EMI is expected from then on.`)
    }
  }
  const deficits = months.filter((m) => m.expectedBalance < 0)
  if (deficits.length) out.push(`${deficits.length} of the next ${months.length} months ${deficits.length > 1 ? 'are' : 'is'} expected to run a deficit: ${deficits.map((m) => monthLabel(m.month)).join(', ')}.`)
  return out.slice(0, 6)
}
