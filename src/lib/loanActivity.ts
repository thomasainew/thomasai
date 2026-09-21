import type { Account, Loan, Transaction, Transfer } from '@/types'
import { transferCost, transferDestAccountId, transferPrincipal } from '@/lib/ledger'

export type LoanActivityKind = 'Borrowed' | 'Spent borrowed money' | 'Repayment'

export interface LoanActivity {
  id: string
  date: string
  kind: LoanActivityKind
  description: string
  accountName: string
  amount: number
  currency: string
  /** Repayments only. */
  principal?: number
  interestFees?: number
  source: { type: 'transaction'; txn: Transaction } | { type: 'transfer'; transfer: Transfer }
}

/**
 * Everything that touched a loan, from the records themselves — nothing is
 * copied into the loan, so it can never be duplicated or fall out of date:
 *  - borrowing: a drawdown transfer out of the loan account
 *  - spending borrowed money: an expense charged to the loan account
 *  - repayment: a transfer into the loan (its principal reduces the debt)
 */
export function loanActivity(
  loan: Loan,
  accounts: Account[],
  loans: Loan[],
  txns: Transaction[],
  transfers: Transfer[],
): LoanActivity[] {
  const accountId = loan.accountId
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—'
  const out: LoanActivity[] = []

  if (accountId) {
    for (const t of txns) {
      if (t.accountId !== accountId) continue
      out.push({
        id: t.id, date: t.date, kind: 'Spent borrowed money', description: t.description,
        accountName: name(t.accountId), amount: t.amount, currency: t.currency, source: { type: 'transaction', txn: t },
      })
    }
  }

  for (const tr of transfers) {
    const dest = transferDestAccountId(tr, loans)
    const toThisLoan = (tr.toKind === 'loan' && tr.toId === loan.id) || (Boolean(accountId) && dest === accountId)
    const fromThisLoan = Boolean(accountId) && tr.fromAccountId === accountId

    if (toThisLoan) {
      out.push({
        id: tr.id, date: tr.date, kind: 'Repayment',
        description: tr.notes || (transferCost(tr) > 0 ? 'EMI (principal + interest/fees)' : 'Repayment'),
        accountName: name(tr.fromAccountId), amount: tr.amount, currency: tr.currency,
        principal: transferPrincipal(tr), interestFees: transferCost(tr),
        source: { type: 'transfer', transfer: tr },
      })
    } else if (fromThisLoan) {
      out.push({
        id: tr.id, date: tr.date, kind: 'Borrowed', description: tr.notes || 'Loan drawdown',
        accountName: name(tr.toKind === 'account' ? tr.toId : ''), amount: tr.amount, currency: tr.currency,
        source: { type: 'transfer', transfer: tr },
      })
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date))
}
