import type { Account, AccountType, TxnType } from '@/types'

// ============================================================================
// Single source of truth for "which account can this money move through, and
// what does it do to that account's balance". Every form that lets someone
// choose where money comes from or goes to should read from here, so the
// Account and Payment Method fields can never disagree with each other again.
// ============================================================================

/** An expense (or a transfer's source) can be paid from any real money account. */
export function paymentAccounts(accounts: Account[]) {
  return accounts.filter((a) => a.type === 'bank' || a.type === 'cash' || a.type === 'card')
}

/** Income only ever lands in a bank or cash account. */
export function depositAccounts(accounts: Account[]) {
  return accounts.filter((a) => a.type === 'bank' || a.type === 'cash')
}

/** Short, unambiguous label for an account picker: "FAB Bank ••••8001", "Cash Wallet". */
export function accountLabel(a: Account) {
  if (a.type === 'cash') return a.name
  const last4 = (a.details ?? '').replace(/\D/g, '').slice(-4)
  return last4 ? `${a.name} ••••${last4}` : a.name
}

/**
 * Balance change a transaction causes on the account it posts to. A card's
 * balance is what you owe, so an expense increases it and bank/cash work the
 * other way round — this is the one place that rule is allowed to live.
 */
export function accountDelta(type: TxnType, accountType: AccountType, amount: number) {
  if (accountType === 'card') return type === 'expense' ? amount : -amount
  if (accountType === 'bank' || accountType === 'cash') return type === 'expense' ? -amount : amount
  return 0
}

/** The Payment Method value stored with a transaction, derived from the
 * chosen account so it can never contradict it. */
export function methodFor(accountType: AccountType) {
  if (accountType === 'cash') return 'Cash'
  if (accountType === 'card') return 'Credit Card'
  return 'Bank Transfer'
}

/** Round to cents; every balance mutation goes through this to avoid drift. */
export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
