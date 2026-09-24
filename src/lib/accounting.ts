import type { Account, AccountType, TxnType } from '@/types'

// ============================================================================
// Single source of truth for "which account can this money move through, and
// what does it do to that account's balance". Every form that lets someone
// choose where money comes from or goes to should read from here, so the
// Account and Payment Method fields can never disagree with each other again.
// ============================================================================

/** Accounts that simply hold money you own — as opposed to debt (card, loan). */
const ASSET_TYPES: AccountType[] = ['bank', 'cash', 'savings', 'investment']
export const isAssetAccount = (t: AccountType) => ASSET_TYPES.includes(t)

/** An expense can be paid from cash/bank/savings/investment, charged to a card, or funded by a loan account. */
export function paymentAccounts(accounts: Account[]) {
  return accounts.filter((a) => isAssetAccount(a.type) || a.type === 'card' || a.type === 'loan')
}

/** Income lands in any account that simply holds money — bank, cash, savings or investment. */
export function depositAccounts(accounts: Account[]) {
  return accounts.filter((a) => isAssetAccount(a.type))
}

/** Short, unambiguous label for an account picker: "FAB Bank ••••8001", "Cash Wallet". */
export function accountLabel(a: Account) {
  if (a.type === 'cash') return a.name
  const last4 = (a.details ?? '').replace(/\D/g, '').slice(-4)
  return last4 ? `${a.name} ••••${last4}` : a.name
}

/**
 * Balance change a transaction causes on the account it posts to. A card's
 * balance is what you owe, so an expense increases it and asset accounts work
 * the other way round — this is the one place that rule is allowed to live.
 */
export function accountDelta(type: TxnType, accountType: AccountType, amount: number) {
  if (accountType === 'card') return type === 'expense' ? amount : -amount
  if (isAssetAccount(accountType)) return type === 'expense' ? -amount : amount
  return 0
}

/** The Payment Method value stored with a transaction, derived from the
 * chosen account so it can never contradict it. */
export function methodFor(accountType: AccountType) {
  if (accountType === 'cash') return 'Cash'
  if (accountType === 'savings') return 'Savings Account'
  if (accountType === 'investment') return 'Investment Account'
  if (accountType === 'card') return 'Credit Card'
  if (accountType === 'loan') return 'Loan'
  return 'Bank Transfer'
}

export { round2 } from '@/lib/ledger'
