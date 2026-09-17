import type { Account, Bill, BudgetCategory, Category, CategoryKind, Goal, Loan, Subcategory, Transaction } from '@/types'
import { toBase, monthKey, daysLeft, TODAY, addMonths, monthLabel } from '@/lib/format'

/** The live calendar month, so every "this month" figure follows the real clock. */
export const CURRENT_MONTH = TODAY.slice(0, 7)
export const PREV_MONTH = addMonths(CURRENT_MONTH, -1)

export function inMonth(txns: Transaction[], month = CURRENT_MONTH) {
  return txns.filter((t) => monthKey(t.date) === month)
}

export function sumBase(txns: Transaction[]) {
  return txns.reduce((acc, t) => acc + toBase(t.amount, t.currency), 0)
}

export function totals(txns: Transaction[], month = CURRENT_MONTH) {
  const m = inMonth(txns, month)
  const income = sumBase(m.filter((t) => t.type === 'income'))
  const expenses = sumBase(m.filter((t) => t.type === 'expense'))
  return { income, expenses, net: income - expenses, count: m.length }
}

export function byCategory(txns: Transaction[], type: 'income' | 'expense', month = CURRENT_MONTH) {
  const map = new Map<string, number>()
  for (const t of inMonth(txns, month)) {
    if (t.type !== type) continue
    map.set(t.category, (map.get(t.category) ?? 0) + toBase(t.amount, t.currency))
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export function byPerson(txns: Transaction[], month = CURRENT_MONTH) {
  const map = new Map<string, number>()
  for (const t of inMonth(txns, month)) {
    if (t.type !== 'expense') continue
    const key = t.person || 'Me'
    map.set(key, (map.get(key) ?? 0) + toBase(t.amount, t.currency))
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function byMethod(txns: Transaction[], month = CURRENT_MONTH) {
  const map = new Map<string, number>()
  for (const t of inMonth(txns, month)) {
    if (t.type !== 'expense') continue
    const key = t.method || 'Other'
    map.set(key, (map.get(key) ?? 0) + toBase(t.amount, t.currency))
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function byAccount(txns: Transaction[], type: 'income' | 'expense', accounts: Account[], month = CURRENT_MONTH) {
  const map = new Map<string, number>()
  for (const t of inMonth(txns, month)) {
    if (t.type !== type) continue
    map.set(t.accountId, (map.get(t.accountId) ?? 0) + toBase(t.amount, t.currency))
  }
  return [...map.entries()]
    .map(([id, value]) => ({ name: accounts.find((a) => a.id === id)?.name ?? 'Other', value }))
    .sort((a, b) => b.value - a.value)
}

/** Trailing 9 months ending on the current one, built from your transactions. */
export function monthlySeries(txns: Transaction[]) {
  return Array.from({ length: 9 }, (_, i) => {
    const key = addMonths(CURRENT_MONTH, i - 8)
    const live = totals(txns, key)
    return { month: monthLabel(key), income: Math.round(live.income), expenses: Math.round(live.expenses) }
  })
}

/** Month labels for the trailing 9-month window, oldest first. */
export function seriesRange() {
  const from = monthLabel(addMonths(CURRENT_MONTH, -8))
  const to = monthLabel(CURRENT_MONTH)
  return `${from} – ${to} ${CURRENT_MONTH.slice(0, 4)}`
}

/** Human label for the active month, e.g. 'September 2026'. */
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export function currentMonthLabel(key = CURRENT_MONTH) {
  return `${LONG_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

export function accountTotals(accounts: Account[]) {
  const sum = (type: Account['type']) =>
    accounts.filter((a) => a.type === type).reduce((acc, a) => acc + toBase(a.balance, a.currency), 0)
  const bank = sum('bank')
  const cash = sum('cash')
  const card = sum('card')
  const loan = sum('loan')
  return {
    bank, cash, card, loan,
    // Gross is what the four buckets add up to; net treats cards and loans as
    // the liabilities they are.
    total: bank + cash + card + loan,
    net: bank + cash - card - loan,
  }
}

/** Liquid balance = bank + cash, minus card outstanding. */
export function liquidBalance(accounts: Account[]) {
  const t = accountTotals(accounts)
  return t.bank + t.cash - t.card
}

/**
 * Money you can actually spend right now: bank + cash, full stop. Card debt
 * and loan debt are shown as their own figures rather than netted in here —
 * see the corrections spec, problem 6: a blended balance hides both.
 */
export function availableMoney(accounts: Account[]) {
  const t = accountTotals(accounts)
  return t.bank + t.cash
}

/** What you'd have left if every card and loan were paid off today. */
export function netPosition(accounts: Account[], loans: Loan[]) {
  const t = accountTotals(accounts)
  const loansOutstanding = loans
    .filter((l) => l.status !== 'Closed')
    .reduce((acc, l) => acc + toBase(l.outstanding, l.currency), 0)
  return t.bank + t.cash - t.card - loansOutstanding
}

export function loanSummary(loans: Loan[]) {
  const active = loans.filter((l) => l.status !== 'Closed')
  const outstanding = active.reduce((acc, l) => acc + toBase(l.outstanding, l.currency), 0)
  const monthlyEmi = active.reduce((acc, l) => acc + toBase(l.emi, l.currency), 0)
  const dueThisMonth = active.filter((l) => monthKey(l.nextPayment) === CURRENT_MONTH)
  const dueAmount = dueThisMonth.reduce((acc, l) => acc + toBase(l.emi, l.currency), 0)
  const overdue = active.filter((l) => l.status === 'Overdue')
  return { active, outstanding, monthlyEmi, dueThisMonth, dueAmount, overdue }
}

export function billSummary(bills: Bill[]) {
  const upcoming = bills.filter((b) => b.status !== 'Paid')
  const upcomingTotal = upcoming.reduce((acc, b) => acc + b.amount, 0)
  const overdue = bills.filter((b) => b.status === 'Overdue')
  const paidTotal = bills.filter((b) => b.status === 'Paid').reduce((acc, b) => acc + b.amount, 0)
  return { upcoming, upcomingTotal, overdue, paidTotal }
}

export function docStatus(expiry: string): 'Valid' | 'Expiring Soon' | 'Expired' {
  const d = daysLeft(expiry, TODAY)
  if (d < 0) return 'Expired'
  if (d <= 30) return 'Expiring Soon'
  return 'Valid'
}

/**
 * The "This Month Plan" figure on the dashboard. Every line is derived — the
 * savings line is what your goals need per month to land by their deadlines.
 */
export function monthPlan(txns: Transaction[], loans: Loan[], bills: Bill[], goals: Goal[] = []) {
  const t = totals(txns, CURRENT_MONTH)
  const requiredExpenses = Math.round(t.expenses)
  const upcomingLoans = Math.round(loanSummary(loans).dueAmount)
  const upcomingBills = Math.round(billSummary(bills).upcomingTotal)
  const savings = Math.round(
    goals.reduce((acc, g) => {
      const remaining = Math.max(0, g.target - g.saved)
      if (!remaining) return acc
      const months = Math.max(1, Math.round(daysLeft(g.deadline) / 30))
      return acc + remaining / months
    }, 0),
  )
  const totalRequired = requiredExpenses + upcomingLoans + upcomingBills + savings
  const expectedIncome = Math.round(t.income)
  return {
    requiredExpenses,
    upcomingLoans,
    upcomingBills,
    savings,
    totalRequired,
    expectedIncome,
    shortfall: Math.max(0, totalRequired - expectedIncome),
  }
}


// ---------------------------------------------------------------------------
// Budget spend is derived from transactions rather than stored, so every
// expense you record moves the matching budget bar on its own.
// ---------------------------------------------------------------------------

/** Keywords that tie a transaction category to a budget category name. */
const BUDGET_KEYWORDS: Record<string, string[]> = {
  'home / rent': ['home', 'rent', 'family', 'housing'],
  'family support': ['family', 'home', 'support'],
  groceries: ['grocer', 'food', 'supermarket'],
  transport: ['transport', 'fuel', 'car', 'travel'],
  utilities: ['utilit', 'bill'],
  subscriptions: ['subscription', 'bill', 'entertainment'],
  shopping: ['shopping', 'clothing'],
  restaurants: ['restaurant', 'dining', 'eat'],
  health: ['health', 'medical', 'pharmacy'],
  personal: ['personal', 'care'],
  education: ['education', 'school', 'tuition'],
  'loan payment': ['loan', 'emi', 'debt'],
}

/**
 * The budget a transaction category (and optionally sub-category) belongs
 * to. A budget explicitly wired to a category via "Category Matching" wins
 * outright and never falls through to name/keyword guessing — that's the
 * whole point of wiring it. Wiring with autoMatch off deliberately tracks
 * nothing, so its spend stays at zero until switched back on.
 */
export function matchBudget<T extends BudgetCategory>(category: string, budgets: T[], subcategory?: string) {
  const cat = category.trim().toLowerCase()
  const sub = (subcategory ?? '').trim().toLowerCase()

  const wired = budgets.find((b) => {
    if (!b.categoryName || b.autoMatch === false) return false
    if (b.categoryName.trim().toLowerCase() !== cat) return false
    return !b.subcategoryName || b.subcategoryName.trim().toLowerCase() === sub
  })
  if (wired) return wired

  const unwired = budgets.filter((b) => !b.categoryName)
  const keys = BUDGET_KEYWORDS[cat] ?? cat.split(/[^a-z]+/).filter((w) => w.length > 2)

  // An exact name match always wins over keyword matching.
  const exact = unwired.find((b) => b.name.trim().toLowerCase() === cat)
  if (exact) return exact

  return unwired.find((b) => {
    const name = b.name.toLowerCase()
    return keys.some((k) => name.includes(k))
  })
}

/** Actual spend per budget id for the given month, in AED. */
export function budgetSpend(txns: Transaction[], budgets: BudgetCategory[], month = CURRENT_MONTH) {
  const out = new Map<string, number>(budgets.map((b) => [b.id, 0]))
  for (const t of inMonth(txns, month)) {
    if (t.type !== 'expense') continue
    const b = matchBudget(t.category, budgets, t.subcategory)
    if (b) out.set(b.id, (out.get(b.id) ?? 0) + toBase(t.amount, t.currency))
  }
  return out
}

/** A budget's limit converted to base currency, for comparing against `spent`. */
export function budgetLimitBase(b: BudgetCategory) {
  return toBase(b.budget, b.currency ?? 'AED')
}

/**
 * Budgets with `spent` replaced by the live figure derived from transactions,
 * plus `budgetBase` — the limit in base currency, since a budget set in INR
 * still has to compare against spend that is always tallied in base currency.
 * `budget` and `currency` are left as entered, for displaying the limit back.
 */
export function budgetsWithSpend(txns: Transaction[], budgets: BudgetCategory[], month = CURRENT_MONTH) {
  const spend = budgetSpend(txns, budgets, month)
  return budgets.map((b) => ({
    ...b,
    spent: Math.round(spend.get(b.id) ?? 0),
    budgetBase: Math.round(budgetLimitBase(b)),
  }))
}

/** Expenses in the month that no budget category covers. */
export function unbudgetedSpend(txns: Transaction[], budgets: BudgetCategory[], month = CURRENT_MONTH) {
  return inMonth(txns, month)
    .filter((t) => t.type === 'expense' && !matchBudget(t.category, budgets, t.subcategory))
    .reduce((a, t) => a + toBase(t.amount, t.currency), 0)
}


// ---------------------------------------------------------------------------
// Expense report. Purchases used to be a separate table that no total read
// from; these all work off the same transactions everything else uses.
// ---------------------------------------------------------------------------

/** Group expenses by merchant for the given month, largest first. */
export function byStore(txns: Transaction[], month = CURRENT_MONTH) {
  const map = new Map<string, number>()
  for (const t of inMonth(txns, month)) {
    if (t.type !== 'expense') continue
    const key = (t.store ?? '').trim() || 'Unrecorded'
    map.set(key, (map.get(key) ?? 0) + toBase(t.amount, t.currency))
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

/** Every expense in a month, newest first, with its AED value resolved. */
export function expenseRows(txns: Transaction[], month = CURRENT_MONTH) {
  return inMonth(txns, month)
    .filter((t) => t.type === 'expense')
    .map((t) => ({ ...t, aed: toBase(t.amount, t.currency) }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Headline numbers for the expense report. */
export function expenseSummary(txns: Transaction[], month = CURRENT_MONTH) {
  const rows = expenseRows(txns, month)
  const total = rows.reduce((a, r) => a + r.aed, 0)
  const prev = totals(txns, addMonths(month, -1)).expenses
  const days = new Set(rows.map((r) => r.date)).size
  const cats = byCategory(txns, 'expense', month)
  const stores = byStore(txns, month)
  return {
    total,
    count: rows.length,
    prev,
    delta: prev ? Math.round(((total - prev) / prev) * 100) : 0,
    average: rows.length ? total / rows.length : 0,
    perDay: days ? total / days : 0,
    topCategory: cats[0],
    topStore: stores.find((s) => s.name !== 'Unrecorded'),
    largest: rows.reduce<(typeof rows)[number] | undefined>((m, r) => (!m || r.aed > m.aed ? r : m), undefined),
  }
}

/** Warranties still running, soonest to expire first. */
export function warranties(txns: Transaction[], from: string = TODAY) {
  return txns
    .filter((t) => t.type === 'expense' && t.warrantyMonths && t.warrantyMonths > 0)
    .map((t) => {
      const start = new Date(t.date + 'T00:00:00')
      const end = new Date(start)
      end.setMonth(end.getMonth() + (t.warrantyMonths as number))
      const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
      return { ...t, expires: iso, days: daysLeft(iso, from) }
    })
    .sort((a, b) => a.days - b.days)
}

/** The last `n` months as yyyy-MM keys, newest first — for the report month picker. */
export function addMonthsOptions(n = 12) {
  return Array.from({ length: n }, (_, i) => addMonths(CURRENT_MONTH, -i))
}

// ---------------------------------------------------------------------------
// Categories. The user's own list drives the pickers; the built-in names are
// only a fallback so the forms still work before any category is created.
// ---------------------------------------------------------------------------

/** Categories of one kind, in the user's chosen order. */
export function categoriesOf(categories: Category[], kind: CategoryKind) {
  return categories.filter((c) => c.kind === kind).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
}

/** Sub-categories belonging to one category, in order. */
export function subcategoriesOf(subcategories: Subcategory[], categoryId: string | undefined) {
  if (!categoryId) return []
  return subcategories
    .filter((s) => s.categoryId === categoryId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
}

/** Look a category up by the name stored on a transaction. */
export function findCategoryByName(categories: Category[], kind: CategoryKind, name: string) {
  const n = name.trim().toLowerCase()
  return categories.find((c) => c.kind === kind && c.name.trim().toLowerCase() === n)
}

// ---------------------------------------------------------------------------
// Credit card statement cycles.
// ---------------------------------------------------------------------------

/** Clamp a day to a month that may be shorter, so the 31st lands on the 30th. */
function onDay(year: number, monthIndex: number, day: number) {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  const d = new Date(year, monthIndex, Math.min(day, last))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Which statement a card expense falls on, and when that statement is due.
 * A statementDay of 25 means the period runs the 26th to the 25th; the
 * payment then falls on dueDay of the following month.
 */
export function statementFor(date: string, statementDay: number, dueDay: number) {
  const d = new Date(date + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null

  const y = d.getFullYear()
  const m = d.getMonth()
  // On or before the closing day it belongs to the statement closing this month.
  const closesThisMonth = d.getDate() <= Math.min(statementDay, new Date(y, m + 1, 0).getDate())
  const closeMonth = closesThisMonth ? m : m + 1

  const end = onDay(y, closeMonth, statementDay)
  // The period opens the day after the previous statement closed. Deriving it
  // by adding a day (rather than using statementDay + 1) keeps it correct when
  // the closing day is the 31st and the previous month is shorter.
  const prevClose = new Date(onDay(y, closeMonth - 1, statementDay) + 'T00:00:00')
  prevClose.setDate(prevClose.getDate() + 1)
  const start = onDay(prevClose.getFullYear(), prevClose.getMonth(), prevClose.getDate())
  const due = onDay(y, closeMonth + 1, dueDay)

  return { start, end, due }
}
