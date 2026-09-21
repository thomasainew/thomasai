import type { Installment, Note } from '@/types'

export type InstallmentStatus = 'Planned' | 'Paid' | 'Overdue'

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * An instalment is Paid once it points at a payment that still exists (or the
 * user marked it paid by hand), Overdue once its date has passed unpaid, and
 * Planned otherwise. Derived, so it can never disagree with the transactions.
 */
export function installmentStatus(i: Installment, today: string, txnExists: (id: string) => boolean): InstallmentStatus {
  if ((i.paidTxnId && txnExists(i.paidTxnId)) || (!i.paidTxnId && i.paidAmount !== undefined && i.paidDate)) return 'Paid'
  return i.dueDate < today ? 'Overdue' : 'Planned'
}

export function scheduleSummary(note: Pick<Note, 'schedule'>, today: string, txnExists: (id: string) => boolean) {
  const list = [...(note.schedule ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  let total = 0
  let paid = 0
  for (const i of list) {
    total += i.amount
    if (installmentStatus(i, today, txnExists) === 'Paid') paid += i.paidAmount ?? i.amount
  }
  const next = list.find((i) => installmentStatus(i, today, txnExists) !== 'Paid')
  return {
    list,
    total: r2(total),
    paid: r2(paid),
    outstanding: r2(Math.max(0, total - paid)),
    next,
    nextDate: next?.dueDate,
    overdue: list.filter((i) => installmentStatus(i, today, txnExists) === 'Overdue').length,
  }
}

/** Instalments that need a reminder now: due within their reminder window and not paid. */
export function dueReminders(notes: Note[], today: string, txnExists: (id: string) => boolean) {
  const out: { note: Note; installment: Installment; days: number }[] = []
  for (const note of notes) {
    if (note.done) continue
    for (const i of note.schedule ?? []) {
      if (installmentStatus(i, today, txnExists) === 'Paid') continue
      const days = Math.round((new Date(i.dueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
      if (days <= (i.remindDays ?? 7)) out.push({ note, installment: i, days })
    }
  }
  return out.sort((a, b) => a.days - b.days)
}
