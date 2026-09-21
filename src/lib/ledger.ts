// ============================================================================
// The ledger: the ONE place that decides what every transaction and transfer
// does to (a) an account's balance and (b) the profit & loss statement.
//
// Balances are never stored-then-nudged. They are always
//     balance = opening balance + everything in the ledger
// so they cannot drift from the transactions, however many devices edit them.
//
// Pure functions only, no imports at runtime — this file is unit-tested in
// plain Node (see scripts/test-ledger.mjs).
// ============================================================================
import type { Account, AccountType, Currency, Loan, Transaction, Transfer } from '@/types'

/** Converts an amount between currencies. Injected so this file stays pure. */
export type Fx = (amount: number, from: Currency, to: Currency) => number

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Cards and loans hold what you OWE, as a positive number. */
export const isLiability = (t: AccountType) => t === 'card' || t === 'loan'

/**
 * Signed change to a balance. 'out' = money leaves an asset account, or debt is
 * taken on a liability (a card purchase, a loan-funded expense, a drawdown).
 * 'in' = money arrives in an asset account, or debt is repaid.
 */
export function move(type: AccountType, dir: 'out' | 'in', amount: number) {
  if (isLiability(type)) return dir === 'out' ? amount : -amount
  return dir === 'out' ? -amount : amount
}

export const kindOf = (t: Transaction) => t.kind ?? 'normal'

/** The account a transfer's destination lands on, resolving a loan to its loan account. */
export function transferDestAccountId(t: Transfer, loans: Loan[]): string | undefined {
  if (t.toKind === 'account') return t.toId
  return loans.find((l) => l.id === t.toId)?.accountId
}

/** Interest + fees carried by a transfer (only repayments have them). */
export const transferCost = (t: Transfer) => round2((t.interest ?? 0) + (t.fees ?? 0))
/** The part of a transfer that reduces the destination's debt. */
export const transferPrincipal = (t: Transfer) => round2(t.amount - transferCost(t))

/**
 * Ledger movement per account id: the sum of everything posted to it, in the
 * account's own currency. Opening balance is NOT included.
 */
export function ledgerByAccount(
  accounts: Account[],
  txns: Transaction[],
  transfers: Transfer[],
  loans: Loan[],
  fx: Fx,
): Map<string, number> {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const out = new Map<string, number>(accounts.map((a) => [a.id, 0]))
  const add = (id: string | undefined, delta: number) => {
    if (id && out.has(id)) out.set(id, (out.get(id) ?? 0) + delta)
  }

  for (const t of txns) {
    const a = byId.get(t.accountId)
    if (!a) continue
    const amount = fx(t.amount, t.currency, a.currency)
    // Income and refunds bring value in; expenses (incl. asset purchases) send it out.
    add(a.id, move(a.type, t.type === 'income' ? 'in' : 'out', amount))
  }

  for (const tr of transfers) {
    const from = byId.get(tr.fromAccountId)
    if (from) add(from.id, move(from.type, 'out', fx(tr.amount, tr.currency, from.currency)))

    const destId = transferDestAccountId(tr, loans)
    const dest = destId ? byId.get(destId) : undefined
    if (dest) add(dest.id, move(dest.type, 'in', fx(transferPrincipal(tr), tr.currency, dest.currency)))
  }

  for (const [id, v] of out) out.set(id, round2(v))
  return out
}

/** Accounts with `balance` recomputed as opening + ledger. Legacy accounts with no opening are left as-is. */
export function withDerivedBalances(
  accounts: Account[],
  txns: Transaction[],
  transfers: Transfer[],
  loans: Loan[],
  fx: Fx,
): Account[] {
  const ledger = ledgerByAccount(accounts, txns, transfers, loans, fx)
  return accounts.map((a) =>
    a.openingBalance === undefined ? a : { ...a, balance: round2(a.openingBalance + (ledger.get(a.id) ?? 0)) },
  )
}

/**
 * One-time migration for accounts created before opening balances existed. The
 * stored balance was what the app showed, so we keep that number and work out
 * what opening figure it implies. Nothing visible changes; the owner is asked
 * to confirm (Balance check) because a drifted balance would be frozen in too.
 */
export function freezeOpenings(
  accounts: Account[],
  txns: Transaction[],
  transfers: Transfer[],
  loans: Loan[],
  fx: Fx,
): Account[] {
  if (!accounts.some((a) => a.openingBalance === undefined)) return accounts
  const ledger = ledgerByAccount(accounts, txns, transfers, loans, fx)
  return accounts.map((a) => {
    if (a.openingBalance !== undefined) return a
    const implied = round2(a.balance - (ledger.get(a.id) ?? 0))
    return { ...a, openingBalance: implied, openingConfirmed: implied === 0 }
  })
}

/** Loans linked to a loan account take their outstanding balance from it. */
export function withDerivedLoans(loans: Loan[], accounts: Account[], fx: Fx): Loan[] {
  return loans.map((l) => {
    const acc = l.accountId ? accounts.find((a) => a.id === l.accountId) : undefined
    if (!acc) return l
    const outstanding = Math.max(0, round2(fx(acc.balance, acc.currency, l.currency)))
    const status = outstanding <= 0 ? 'Closed' : l.status === 'Closed' ? 'On Track' : l.status
    return { ...l, outstanding, status }
  })
}

// ---------------------------------------------------------------------------
// Card figures: debt and available credit are different things.
// ---------------------------------------------------------------------------
export function cardFigures(a: Account) {
  const owed = Math.max(0, a.balance)
  const credit = Math.max(0, -a.balance) // overpaid → the bank owes you
  const available = a.creditLimit && a.creditLimit > 0 ? Math.max(0, a.creditLimit - owed) : undefined
  return { owed, credit, available, limit: a.creditLimit }
}

// ---------------------------------------------------------------------------
// Profit & loss. Every figure is built from `PlEntry` rows, so a total and the
// transactions behind it can never disagree.
// ---------------------------------------------------------------------------
export type PlKind = 'income' | 'expense' | 'refund' | 'interest' | 'fee'

export interface PlEntry {
  id: string
  /** Where it came from, for drill-down. */
  ref: { type: 'transaction' | 'transfer'; id: string }
  date: string
  kind: PlKind
  /** Positive for income/expense; refunds are positive here and SUBTRACTED from expenses. */
  amount: number
  currency: Currency
  category: string
  description: string
  person?: string
  accountId?: string
}

export interface PlFilter {
  from?: string
  to?: string
  person?: string
  accountId?: string
  category?: string
}

export function plEntries(
  txns: Transaction[],
  transfers: Transfer[],
  accounts: Account[],
  filter: PlFilter = {},
): PlEntry[] {
  const entries: PlEntry[] = []

  for (const t of txns) {
    const k = kindOf(t)
    // Asset purchases are cash out but not household spending; they are
    // reported separately (assetPurchases) and never enter income/expense.
    if (k === 'asset_purchase') continue
    let kind: PlKind
    if (k === 'refund') kind = 'refund'
    else kind = t.type === 'income' ? 'income' : 'expense'
    entries.push({
      id: t.id, ref: { type: 'transaction', id: t.id }, date: t.date, kind, amount: t.amount,
      currency: t.currency, category: t.category, description: t.description,
      person: t.person, accountId: t.accountId,
    })
  }

  // Loan interest and fees are real costs; the principal is not (it just
  // shrinks the debt), and neither is the transfer itself.
  for (const tr of transfers) {
    const from = accounts.find((a) => a.id === tr.fromAccountId)
    if (tr.interest && tr.interest > 0)
      entries.push({
        id: `${tr.id}:interest`, ref: { type: 'transfer', id: tr.id }, date: tr.date, kind: 'interest',
        amount: tr.interest, currency: tr.currency, category: 'Loan Interest', description: 'Loan interest',
        person: from?.owner, accountId: tr.fromAccountId,
      })
    if (tr.fees && tr.fees > 0)
      entries.push({
        id: `${tr.id}:fees`, ref: { type: 'transfer', id: tr.id }, date: tr.date, kind: 'fee',
        amount: tr.fees, currency: tr.currency, category: 'Bank & Loan Fees', description: 'Loan fees',
        person: from?.owner, accountId: tr.fromAccountId,
      })
  }

  return entries.filter((e) => {
    if (filter.from && e.date < filter.from) return false
    if (filter.to && e.date > filter.to) return false
    if (filter.person && (e.person ?? 'Me') !== filter.person) return false
    if (filter.accountId && e.accountId !== filter.accountId) return false
    if (filter.category && e.category !== filter.category) return false
    return true
  })
}

export interface PlSummary {
  income: number
  expenses: number
  refunds: number
  net: number
  incomeBySource: { name: string; value: number }[]
  expenseByCategory: { name: string; value: number }[]
}

/** Totals in the reporting currency. Expenses are NET of refunds. */
export function summarise(entries: PlEntry[], toReport: (amount: number, c: Currency) => number): PlSummary {
  let income = 0
  let expenses = 0
  let refunds = 0
  const inc = new Map<string, number>()
  const exp = new Map<string, number>()
  for (const e of entries) {
    const v = toReport(e.amount, e.currency)
    if (e.kind === 'income') {
      income += v
      inc.set(e.category, (inc.get(e.category) ?? 0) + v)
    } else if (e.kind === 'refund') {
      refunds += v
      exp.set(e.category, (exp.get(e.category) ?? 0) - v)
    } else {
      expenses += v
      exp.set(e.category, (exp.get(e.category) ?? 0) + v)
    }
  }
  const rows = (m: Map<string, number>) =>
    [...m.entries()].map(([name, value]) => ({ name, value: round2(value) })).sort((a, b) => b.value - a.value)
  const netExpenses = expenses - refunds
  return {
    income: round2(income),
    expenses: round2(netExpenses),
    refunds: round2(refunds),
    net: round2(income - netExpenses),
    incomeBySource: rows(inc),
    expenseByCategory: rows(exp).filter((r) => r.value !== 0),
  }
}

/** Cash that left for assets in the period — shown beside the P&L, never inside it. */
export function assetPurchases(txns: Transaction[], filter: PlFilter = {}) {
  return txns.filter(
    (t) =>
      kindOf(t) === 'asset_purchase' &&
      (!filter.from || t.date >= filter.from) &&
      (!filter.to || t.date <= filter.to),
  )
}

/** Borrowed money received and principal repaid — they move cash but not the P&L. */
export function debtMovements(
  transfers: Transfer[],
  accounts: Account[],
  loans: Loan[],
  filter: PlFilter,
  toReport: (amount: number, c: Currency) => number,
) {
  let borrowed = 0
  let principalRepaid = 0
  for (const tr of transfers) {
    if (filter.from && tr.date < filter.from) continue
    if (filter.to && tr.date > filter.to) continue
    const from = accounts.find((a) => a.id === tr.fromAccountId)
    const destId = transferDestAccountId(tr, loans)
    const dest = accounts.find((a) => a.id === destId)
    if (from && isLiability(from.type)) borrowed += toReport(tr.amount, tr.currency)
    if (dest && isLiability(dest.type)) principalRepaid += toReport(transferPrincipal(tr), tr.currency)
    else if (tr.toKind === 'loan') principalRepaid += toReport(transferPrincipal(tr), tr.currency)
  }
  return { borrowed: round2(borrowed), principalRepaid: round2(principalRepaid) }
}

// ---------------------------------------------------------------------------
// Net worth: owned assets (incl. cash/bank) minus outstanding liabilities,
// each thing counted once.
// ---------------------------------------------------------------------------
export interface NetWorthInput {
  accounts: Account[]
  loans: Loan[]
  /** Owned share of each asset, already in the reporting currency. */
  assetsOwned: number
}

export function netWorthParts(input: NetWorthInput, toReport: (amount: number, c: Currency) => number) {
  const { accounts, loans, assetsOwned } = input
  const sum = (types: AccountType[]) =>
    accounts.filter((a) => types.includes(a.type)).reduce((n, a) => n + toReport(a.balance, a.currency), 0)

  const cashAndBank = sum(['bank', 'cash'])
  const cardDebt = sum(['card'])
  const loanAccountDebt = sum(['loan'])
  // A loan RECORD linked to a loan ACCOUNT is the same debt — count it once.
  const linked = new Set(loans.map((l) => l.accountId).filter(Boolean) as string[])
  const loanRecordDebt = loans
    .filter((l) => l.status !== 'Closed' && !(l.accountId && accounts.some((a) => a.id === l.accountId)))
    .reduce((n, l) => n + toReport(l.outstanding, l.currency), 0)
  void linked

  const liabilities = cardDebt + loanAccountDebt + loanRecordDebt
  const assets = cashAndBank + assetsOwned
  return {
    cashAndBank: round2(cashAndBank),
    assetsOwned: round2(assetsOwned),
    cardDebt: round2(cardDebt),
    loanDebt: round2(loanAccountDebt + loanRecordDebt),
    liabilities: round2(liabilities),
    netWorth: round2(assets - liabilities),
  }
}
