import type { Account, Currency, Loan, Transfer } from '@/types'
import { isLiability, transferDestAccountId, type PlEntry } from '@/lib/ledger'

export interface PersonStat {
  name: string
  /** Earned income (refunds and borrowed money are not income). */
  income: number
  /** Spending net of refunds, plus loan interest/fees. */
  expenses: number
  /** Money moved OUT of this person's accounts to someone else's. */
  transfersOut: number
  /** Money moved INTO this person's accounts from someone else's. */
  transfersIn: number
  net: number
}

export interface FamilyTransfer {
  id: string
  date: string
  from: string
  fromAccount: string
  to: string
  toAccount: string
  amount: number
  currency: Currency
  notes?: string
}

/**
 * Per-person income / expenses / transfers, kept apart. Every P&L entry
 * belongs to exactly ONE person, so the household total is just the sum of
 * the people — a shared record is never counted twice.
 */
export function peopleReport(
  entries: PlEntry[],
  transfers: Transfer[],
  accounts: Account[],
  loans: Loan[],
  names: string[],
  toReport: (amount: number, c: Currency) => number,
  range: { from?: string; to?: string } = {},
) {
  const stat = (name: string): PersonStat => ({ name, income: 0, expenses: 0, transfersOut: 0, transfersIn: 0, net: 0 })
  const map = new Map<string, PersonStat>(names.map((n) => [n, stat(n)]))
  const get = (n: string) => {
    let s = map.get(n)
    if (!s) map.set(n, (s = stat(n)))
    return s
  }

  for (const e of entries) {
    const s = get(e.person ?? 'Me')
    const v = toReport(e.amount, e.currency)
    if (e.kind === 'income') s.income += v
    else if (e.kind === 'refund') s.expenses -= v
    else s.expenses += v
  }

  const family: FamilyTransfer[] = []
  for (const tr of transfers) {
    if (range.from && tr.date < range.from) continue
    if (range.to && tr.date > range.to) continue
    const from = accounts.find((a) => a.id === tr.fromAccountId)
    const destId = transferDestAccountId(tr, loans)
    const dest = accounts.find((a) => a.id === destId)
    if (!from || !dest) continue
    // Only person-to-person movements between asset accounts: borrowing and
    // repayment involve a loan/card account and are not family transfers.
    if (isLiability(from.type) || isLiability(dest.type)) continue
    const a = from.owner ?? 'Me'
    const b = dest.owner ?? 'Me'
    if (a === b) continue
    const v = toReport(tr.amount, tr.currency)
    get(a).transfersOut += v
    get(b).transfersIn += v
    family.push({
      id: tr.id, date: tr.date, from: a, fromAccount: from.name, to: b, toAccount: dest.name,
      amount: tr.amount, currency: tr.currency, notes: tr.notes,
    })
  }

  const people = [...map.values()].map((s) => ({ ...s, net: Math.round((s.income - s.expenses) * 100) / 100 }))
  const total = people.reduce(
    (t, p) => ({
      income: t.income + p.income, expenses: t.expenses + p.expenses,
      // A family transfer leaves one person and arrives at another: it nets to zero.
      transfersOut: t.transfersOut + p.transfersOut, transfersIn: t.transfersIn + p.transfersIn,
    }),
    { income: 0, expenses: 0, transfersOut: 0, transfersIn: 0 },
  )
  return {
    people,
    household: { ...total, net: Math.round((total.income - total.expenses) * 100) / 100 },
    family: family.sort((x, y) => y.date.localeCompare(x.date)),
  }
}
