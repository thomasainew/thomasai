import type { BudgetCategory, Transaction } from '@/types'
import { addMonths } from '@/lib/format'
import { CURRENT_MONTH, budgetLimitBase, budgetSpend, byCategory, matchBudget } from '@/lib/selectors'

/**
 * Budget suggestions from actual spending history.
 *
 * Deliberately computed rather than asked of a model. "You spent this much in
 * each of the last six months" is arithmetic, and arithmetic should not be
 * approximated by something that might round it differently each time. The
 * only judgement here is which average to use, and that is stated plainly.
 */

export interface BudgetSuggestion {
  /** Present when this refines an existing budget; absent when it proposes a new one. */
  id?: string
  name: string
  current: number
  suggested: number
  /** Monthly spend behind the suggestion, oldest first. */
  history: number[]
  monthsObserved: number
  median: number
  highest: number
  /** suggested - current. Positive means the budget is too tight. */
  delta: number
}

const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Round to a figure a person would actually choose. */
function tidy(value: number) {
  if (value <= 0) return 0
  if (value < 100) return Math.ceil(value / 10) * 10
  if (value < 1000) return Math.ceil(value / 50) * 50
  return Math.ceil(value / 100) * 100
}

/**
 * The months to learn from: complete months only, so a half-finished current
 * month cannot drag every suggestion down.
 */
function pastMonths(count: number, from = CURRENT_MONTH) {
  return Array.from({ length: count }, (_, i) => addMonths(from, -(i + 1))).reverse()
}

export function suggestBudgets(
  transactions: Transaction[],
  budgets: BudgetCategory[],
  lookback = 6,
): { suggestions: BudgetSuggestion[]; monthsAvailable: number } {
  const months = pastMonths(lookback)

  // Spend per existing budget, month by month.
  const perBudget = new Map<string, number[]>(budgets.map((b) => [b.id, []]))
  const monthsWithData = new Set<string>()

  for (const month of months) {
    const spend = budgetSpend(transactions, budgets, month)
    let any = false
    for (const b of budgets) {
      const value = Math.round(spend.get(b.id) ?? 0)
      perBudget.get(b.id)!.push(value)
      if (value > 0) any = true
    }
    if (any || byCategory(transactions, 'expense', month).length) monthsWithData.add(month)
  }

  const suggestions: BudgetSuggestion[] = []

  for (const b of budgets) {
    const all = perBudget.get(b.id) ?? []
    // Ignore months with nothing recorded — they are absence of data, not zero spend.
    const active = all.filter((v) => v > 0)
    if (active.length < 2) continue

    const mid = median(active)
    const highest = Math.max(...active)
    // A little headroom above the typical month, without chasing the worst one.
    const suggested = tidy(mid * 1.1)
    // Both sides compared in base currency — a budget set in INR still has a
    // meaningful "too tight" comparison against base-currency spend history.
    const currentBase = Math.round(budgetLimitBase(b))
    if (!suggested || suggested === currentBase) continue

    suggestions.push({
      id: b.id,
      name: b.name,
      current: currentBase,
      suggested,
      history: all,
      monthsObserved: active.length,
      median: Math.round(mid),
      highest,
      delta: suggested - currentBase,
    })
  }

  // Categories with real spending and no budget at all.
  const covered = new Set(budgets.map((b) => b.name.toLowerCase()))
  const unbudgeted = new Map<string, number[]>()

  for (const month of months) {
    for (const c of byCategory(transactions, 'expense', month)) {
      if (matchBudget(c.name, budgets)) continue
      if (covered.has(c.name.toLowerCase())) continue
      const list = unbudgeted.get(c.name) ?? []
      list.push(Math.round(c.value))
      unbudgeted.set(c.name, list)
    }
  }

  for (const [name, values] of unbudgeted) {
    if (values.length < 2) continue
    const mid = median(values)
    const suggested = tidy(mid * 1.1)
    if (!suggested) continue
    suggestions.push({
      name,
      current: 0,
      suggested,
      history: values,
      monthsObserved: values.length,
      median: Math.round(mid),
      highest: Math.max(...values),
      delta: suggested,
    })
  }

  // Biggest correction first — that is where the attention is worth spending.
  suggestions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return { suggestions, monthsAvailable: monthsWithData.size }
}
