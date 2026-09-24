// One place that turns the household's records into the dashboard figures.
// Pure (no store, no browser) so every number can be unit-tested.
import type { Account, Asset, Bill, Currency, Doc, Loan, Note, Settings, Transaction, Transfer, BudgetItem } from '@/types'
import { assetsOwned, valuationAge } from '@/lib/assets'
import { isLiability, ledgerByAccount, netWorthParts, plEntries, summarise } from '@/lib/ledger'
import { buildMonthItems } from '@/lib/smartBudget'
import { statusCaveats, statusScore, tierFor, DEFAULT_TIERS, type StatusInput } from '@/lib/status'

export interface SnapshotInput {
  today: string
  settings: Pick<Settings, 'extra'>
  accounts: Account[]
  transactions: Transaction[]
  transfers: Transfer[]
  loans: Loan[]
  assets: Asset[]
  bills: Bill[]
  documents: Doc[]
  notes: Note[]
  budgetItems: BudgetItem[]
  people: string[]
  /** Convert an amount to the reporting currency. */
  toReport: (amount: number, c: Currency) => number
  /** Convert between two currencies (for ledger maths). */
  fx: (amount: number, from: Currency, to: Currency) => number
}

const ym = (d: string) => d.slice(0, 7)
const addMonth = (key: string, n: number) => {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const lastDay = (key: string) => `${key}-${String(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
const r2 = (n: number) => Math.round(n * 100) / 100

export function buildSnapshot(i: SnapshotInput) {
  const month = ym(i.today)
  const range = (m: string) => ({ from: `${m}-01`, to: lastDay(m) })

  // ---- net worth: owned assets (incl. cash/bank) minus liabilities, each counted once
  const owned = assetsOwned(i.assets, i.toReport)
  const nw = netWorthParts({ accounts: i.accounts, loans: i.loans, assetsOwned: owned }, i.toReport)
  const availableFunds = r2(Math.max(0, nw.cashAndBank))

  // ---- this month's profit & loss, and last month's
  const plNow = summarise(plEntries(i.transactions, i.transfers, i.accounts, range(month)), i.toReport)
  const prevMonth = addMonth(month, -1)
  const plPrev = summarise(plEntries(i.transactions, i.transfers, i.accounts, range(prevMonth)), i.toReport)

  // ---- cash flow: what actually moved in cash & bank accounts this month.
  // Differs from the P&L on purpose: borrowing, principal repayments, asset
  // purchases and card repayments move cash without being income or expense.
  const inMonth = (d: string) => d >= `${month}-01` && d <= lastDay(month)
  const ledger = ledgerByAccount(i.accounts, i.transactions.filter((t) => inMonth(t.date)), i.transfers.filter((t) => inMonth(t.date)), i.loans, i.fx)
  const cashFlow = r2(
    i.accounts.filter((a) => !isLiability(a.type)).reduce((n, a) => n + i.toReport(ledger.get(a.id) ?? 0, a.currency), 0),
  )

  // ---- upcoming payments (EMIs, bills, schedules, renewals) in the next 30 days
  const horizon = new Date(i.today + 'T00:00:00').getTime() + 30 * 86400000
  const ctx = { today: i.today, loans: i.loans, bills: i.bills, documents: i.documents, notes: i.notes, stored: i.budgetItems, txns: i.transactions, people: i.people, accounts: i.accounts }
  const upcoming = [month, addMonth(month, 1)]
    .flatMap((m) => buildMonthItems({ ...ctx, month: m }))
    .filter((x) => (x.status === 'Planned' || x.status === 'Overdue') && x.dueDate && new Date(x.dueDate + 'T00:00:00').getTime() <= horizon)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  const upcomingTotal = r2(upcoming.reduce((n, x) => n + (x.amount !== undefined ? i.toReport(x.amount, x.currency) : 0), 0))

  // ---- financial status inputs: averages over the last 3 months that have data
  const months = [month, addMonth(month, -1), addMonth(month, -2), addMonth(month, -3)]
  const perMonth = months.map((m) => ({ m, s: summarise(plEntries(i.transactions, i.transfers, i.accounts, range(m)), i.toReport) }))
  const withData = perMonth.filter((x) => x.s.income > 0 || x.s.expenses > 0)
  // Prefer complete months; fall back to the current partial one.
  const basis = withData.filter((x) => x.m !== month).length ? withData.filter((x) => x.m !== month).slice(0, 3) : withData
  const avg = (k: 'income' | 'expenses') => (basis.length ? basis.reduce((n, x) => n + x.s[k], 0) / basis.length : 0)
  const monthlyIncome = r2(avg('income'))
  const monthlyExpenses = r2(avg('expenses'))
  const activeLoans = i.loans.filter((l) => l.status !== 'Closed')
  const monthlyDebtPayments = r2(activeLoans.reduce((n, l) => n + i.toReport(l.emi, l.currency), 0))
  const valuationAges = i.assets.map((a) => valuationAge(a, i.today))
  const statusInput: StatusInput = {
    netWorth: nw.netWorth, monthlyIncome, monthlyExpenses, availableFunds, monthlyDebtPayments, totalDebt: nw.liabilities,
    hasAccounts: i.accounts.length > 0, monthsOfData: withData.length,
    oldestValuationDays: valuationAges.length ? Math.max(...valuationAges) : 0, hasAssets: i.assets.length > 0,
  }
  const status = statusScore(statusInput)
  const tiers = i.settings.extra?.statusTiers?.length ? i.settings.extra.statusTiers : DEFAULT_TIERS
  const tier = tierFor(status.score, tiers)

  return {
    month, netWorth: nw, availableFunds, plNow, plPrev, cashFlow,
    upcoming, upcomingTotal, monthlyIncome, monthlyExpenses, monthlyDebtPayments,
    status: { ...status, tier, tiers, caveats: statusCaveats(statusInput), input: statusInput },
    // The one line of guidance most worth acting on, from the records only.
    signals: {
      overdue: upcoming.filter((x) => x.status === 'Overdue').length,
      deficit: plNow.net < 0,
      cardDebt: nw.cardDebt,
    },
  }
}

export type Snapshot = ReturnType<typeof buildSnapshot>

export type MonthSituation = 'Healthy' | 'Stable' | 'Tight' | 'Attention Required' | 'Deficit'

/**
 * A month's plain-language situation from its expected balance against its
 * income — used by My Financial Status and the Financial Forecast, so both
 * describe a month the same way. Never from balance alone: the same shortfall
 * means less against a bigger income.
 */
export function monthlySituation(expectedBalance: number, income: number): MonthSituation {
  if (expectedBalance < 0) return income > 0 && Math.abs(expectedBalance) / income >= 0.15 ? 'Deficit' : 'Attention Required'
  if (income <= 0) return expectedBalance > 0 ? 'Stable' : 'Tight'
  const ratio = expectedBalance / income
  if (ratio >= 0.25) return 'Healthy'
  if (ratio >= 0.1) return 'Stable'
  return 'Tight'
}

export const SITUATION_TONE: Record<MonthSituation, string> = {
  Healthy: 'green', Stable: 'blue', Tight: 'amber', 'Attention Required': 'amber', Deficit: 'red',
}

/** The theme's own colour for a situation (see Settings → Appearance → Financial Status Colours). */
export function situationColor(situation: MonthSituation, statusColors?: import('@/types').StatusColors): string | undefined {
  if (!statusColors) return undefined
  const key = { Healthy: 'healthy', Stable: 'stable', Tight: 'tight', 'Attention Required': 'warning', Deficit: 'deficit' } as const
  return statusColors[key[situation]]
}
