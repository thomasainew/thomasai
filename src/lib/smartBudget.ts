// ============================================================================
// Smart Monthly Budget.
//
// A month's budget is BUILT from what the app already knows — loans, bills,
// document expiries, notes and payment schedules — rather than typed in again.
// Confirmed, scheduled payments (EMIs, bills, schedule instalments) are added
// automatically; things only *detected* (a note about exam fees, a visa about
// to expire) are Suggested, for the user to approve. An amount that isn't
// known stays empty and is asked for — it is never invented.
//
// "Deduct" means only "deduct in this budget calculation". Nothing here can
// move money.
//
// Items are DERIVED each time from the source records and merged with the few
// things the user actually decided (approve / dismiss / edit / add / mark
// paid), which are what get stored. That is why nothing can be duplicated and
// every device shows the same month.
//
// Pure (type imports only) so it is unit-tested in plain Node.
// ============================================================================
import type { Bill, BudgetItem, Currency, Doc, Loan, Note, Transaction } from '@/types'

export type EffectiveStatus = 'Suggested' | 'Planned' | 'Paid' | 'Overdue' | 'Dismissed'

export interface MonthItem {
  key: string // month|sourceKey
  month: string
  name: string
  category: string
  amount?: number
  currency: Currency
  dueDate?: string
  person?: string
  sourceKind: BudgetItem['sourceKind']
  sourceId?: string
  sourceKey: string
  status: EffectiveStatus
  /** Amount actually paid, from the matched transaction — kept apart from `amount`. */
  actual?: number
  txnId?: string
  /** True when the plan amount has to be entered by the user. */
  needsInput: boolean
  /** Why it is here, in words. */
  reason: string
  /** A stored decision exists for it (approved / edited / dismissed / paid). */
  stored?: BudgetItem
  /** The user changed the amount or date from what the source says. */
  edited: boolean
}

export interface BudgetContext {
  month: string
  today: string
  loans: Loan[]
  bills: Bill[]
  documents: Doc[]
  notes: Note[]
  stored: BudgetItem[]
  txns: Transaction[]
  people: string[]
  accounts?: { id: string; owner?: string }[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ഀ-ൿ ]+/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['the', 'and', 'for', 'fee', 'fees', 'pay', 'payment', 'due', 'of', 'to', 'a', 'in', 'my', 'new'])
const tokens = (s: string) => norm(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t))
const month = (d: string) => d.slice(0, 7)

export function clampDay(ym: string, day: number) {
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()
  return `${ym}-${String(Math.min(Math.max(1, day), last)).padStart(2, '0')}`
}
const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1

// ---------------------------------------------------------------------------
// Reading a note for a commitment.
// ---------------------------------------------------------------------------
const KEYWORDS = /\b(fee|fees|tuition|exam|examination|college|school|university|admission|hostel|premium|insurance|renewal|visa|licen[cs]e|emirates id|registration|instal?lment|installment|emi|rent|subscription|membership|deposit|fine|tax)\b/i

const CURRENCY_MARK: [RegExp, Currency][] = [
  [/(?:aed|dhs?|dirhams?|د\.إ)/i, 'AED'],
  [/(?:inr|rs\.?|rupees?|₹)/i, 'INR'],
  [/(?:usd|\$)/i, 'USD'],
]

export interface Commitment {
  isCommitment: boolean
  amount?: number
  currency?: Currency
  category: string
  person?: string
}

/** Pull an amount, category and person out of free text. Returns no amount rather than guess one. */
export function extractCommitment(note: Pick<Note, 'title' | 'amount' | 'currency' | 'person' | 'feeCategory'>, people: string[]): Commitment {
  const text = note.title
  const isCommitment = KEYWORDS.test(text) || note.amount !== undefined || Boolean(note.feeCategory)

  let amount = note.amount
  let currency = note.currency
  if (amount === undefined) {
    // Only trust a number that carries a currency marker or sits right after "fee(s)".
    const withMark = text.match(/(?:aed|dhs?|inr|rs\.?|₹|\$|usd)\s*([\d][\d,]*(?:\.\d+)?)|([\d][\d,]*(?:\.\d+)?)\s*(?:aed|dhs?|inr|rs\.?|₹|usd|rupees?|dirhams?)/i)
    const afterFee = text.match(/\bfees?\s*[:\-]?\s*([\d][\d,]*(?:\.\d+)?)\b/i)
    const raw = withMark?.[1] ?? withMark?.[2] ?? afterFee?.[1]
    if (raw) {
      const n = Number(raw.replace(/,/g, ''))
      if (Number.isFinite(n) && n > 0) {
        amount = n
        const mark = withMark?.[0] ?? ''
        currency = CURRENCY_MARK.find(([re]) => re.test(mark))?.[1] ?? currency
      }
    }
  }

  const lower = text.toLowerCase()
  const person = note.person ?? people.find((p) => p && new RegExp(`\\b${p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower))
  const category =
    note.feeCategory ??
    (/(tuition|exam|college|school|university|admission|hostel)/i.test(text) ? 'Education'
      : /(insurance|premium)/i.test(text) ? 'Insurance'
        : /(visa|licen[cs]e|emirates id|registration|renewal)/i.test(text) ? 'Government & Renewals'
          : /\brent\b/i.test(text) ? 'Home / Rent'
            : /(emi|instal)/i.test(text) ? 'Loan Payment'
              : 'Other')
  return { isCommitment, amount, currency, category, person }
}

// ---------------------------------------------------------------------------
// Candidates from every source
// ---------------------------------------------------------------------------
type Candidate = Omit<MonthItem, 'key' | 'status' | 'actual' | 'txnId' | 'stored' | 'edited' | 'needsInput'> & {
  base: 'Planned' | 'Suggested'
  paidTxnId?: string
  paidAmount?: number
  paidHandMarked?: boolean
}

function loanCandidates(c: BudgetContext): Candidate[] {
  const out: Candidate[] = []
  for (const l of c.loans) {
    if (l.status === 'Closed' || l.emi <= 0 || l.outstanding <= 0) continue
    // A monthly EMI falls due every month from the next payment onwards.
    if (monthIndex(c.month) < monthIndex(month(l.nextPayment))) continue
    const day = Number(l.nextPayment.slice(8, 10)) || 1
    const owner = l.accountId ? c.accounts?.find((a) => a.id === l.accountId)?.owner : undefined
    out.push({
      month: c.month, name: `${l.name} — EMI`, category: 'Loan Payment', amount: l.emi, currency: l.currency,
      dueDate: clampDay(c.month, day), person: owner, sourceKind: 'loan', sourceId: l.id, sourceKey: `loan:${l.id}`,
      reason: `Monthly EMI on ${l.name} (${l.lender})`, base: 'Planned',
    })
  }
  return out
}

function billCandidates(c: BudgetContext): Candidate[] {
  const out: Candidate[] = []
  for (const b of c.bills) {
    const day = Number(b.dueDate.slice(8, 10)) || 1
    const diff = monthIndex(c.month) - monthIndex(month(b.dueDate))
    let due: string[] = []
    if (b.frequency === 'Monthly') due = diff >= 0 || month(b.dueDate) === c.month ? [clampDay(c.month, day)] : []
    else if (b.frequency === 'Quarterly') due = diff >= 0 && diff % 3 === 0 ? [clampDay(c.month, day)] : []
    else if (b.frequency === 'Yearly') due = diff >= 0 && diff % 12 === 0 ? [clampDay(c.month, day)] : []
    else if (b.frequency === 'Weekly') {
      // every 7 days from the due date, within this month
      const start = new Date(b.dueDate + 'T00:00:00')
      for (let d = new Date(start); month(d.toISOString().slice(0, 10)) <= c.month && due.length < 6; d = new Date(d.getTime() + 7 * 86400000)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (month(iso) === c.month) due.push(iso)
      }
    }
    for (const date of due) {
      const thisCycle = month(b.dueDate) === c.month
      out.push({
        month: c.month, name: b.name, category: b.category, amount: b.amount, currency: 'AED', dueDate: date,
        sourceKind: 'bill', sourceId: b.id, sourceKey: b.frequency === 'Weekly' ? `bill:${b.id}:${date}` : `bill:${b.id}`,
        reason: `${b.frequency} bill / subscription`, base: 'Planned',
        paidHandMarked: thisCycle && b.status === 'Paid', paidAmount: thisCycle && b.status === 'Paid' ? b.amount : undefined,
      })
    }
  }
  return out
}

function scheduleCandidates(c: BudgetContext): Candidate[] {
  const out: Candidate[] = []
  for (const n of c.notes) {
    if (n.autoAddToBudget === false) continue
    if (n.done && !n.schedule?.length) continue
    for (const i of n.schedule ?? []) {
      // ONLY the instalment due this month — never the whole fee.
      if (month(i.dueDate) !== c.month) continue
      const ex = extractCommitment(n, c.people)
      out.push({
        month: c.month, name: `${n.title} — ${i.label}`, category: ex.category, amount: i.amount, currency: i.currency,
        dueDate: i.dueDate, person: n.person ?? ex.person, sourceKind: 'schedule', sourceId: n.id,
        sourceKey: `sched:${n.id}:${i.id}`, reason: `Instalment from the payment schedule “${n.title}”`, base: 'Planned',
        paidTxnId: i.paidTxnId, paidAmount: i.paidAmount, paidHandMarked: !i.paidTxnId && i.paidAmount !== undefined && Boolean(i.paidDate),
      })
    }
  }
  return out
}

function documentCandidates(c: BudgetContext): Candidate[] {
  const out: Candidate[] = []
  for (const d of c.documents) {
    if (!d.expiry || month(d.expiry) !== c.month) continue
    out.push({
      month: c.month, name: `Renew ${d.name}`, category: 'Government & Renewals', amount: d.renewalCost,
      currency: d.renewalCurrency ?? 'AED', dueDate: d.expiry, person: d.owner || undefined, sourceKind: 'document', sourceId: d.id,
      sourceKey: `doc:${d.id}:${d.expiry}`, reason: `${d.type} expires on ${d.expiry}`, base: 'Suggested',
    })
  }
  return out
}

function noteCandidates(c: BudgetContext): Candidate[] {
  const out: Candidate[] = []
  for (const n of c.notes) {
    if (n.autoAddToBudget === false) continue
    if (n.done || n.schedule?.length) continue // schedules are handled per instalment
    if (!n.dueDate || month(n.dueDate) !== c.month) continue
    const ex = extractCommitment(n, c.people)
    if (!ex.isCommitment) continue
    out.push({
      month: c.month, name: n.title, category: ex.category, amount: ex.amount, currency: ex.currency ?? 'AED',
      dueDate: n.dueDate, person: ex.person, sourceKind: 'note', sourceId: n.id, sourceKey: `note:${n.id}`,
      reason: 'Detected from a note / follow-up', base: 'Suggested',
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// De-duplication and matching
// ---------------------------------------------------------------------------
const sameMoney = (a?: number, b?: number) => a !== undefined && b !== undefined && Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.005)
const dayDiff = (a?: string, b?: string) => (a && b ? Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000) : 99)
const overlap = (a: string, b: string) => {
  const tb = new Set(tokens(b))
  return tokens(a).some((t) => tb.has(t))
}

/**
 * Is `weak` really the same obligation as `strong`? A note saying "Pay car
 * loan EMI 1,200" next to the actual car-loan EMI, say. Same amount AND date
 * close AND (shared words or same category) — or it simply names the loan.
 */
export function isDuplicate(weak: Candidate, strong: Candidate, loans: Loan[]) {
  if (weak.sourceKey === strong.sourceKey) return true
  if (strong.sourceKind === 'loan') {
    const loan = loans.find((l) => l.id === strong.sourceId)
    if (loan && (overlap(weak.name, loan.name) || norm(weak.name).includes(norm(loan.lender)) && loan.lender.length > 2) && /emi|instal|loan/i.test(weak.name)) return true
  }
  const amountMatch = weak.amount === undefined || sameMoney(weak.amount, strong.amount)
  return amountMatch && dayDiff(weak.dueDate, strong.dueDate) <= 5 && (overlap(weak.name, strong.name) || weak.category === strong.category)
}

/** A transaction that plausibly IS this item's payment. Strong matches only. */
export function findPayment(item: Pick<Candidate, 'name' | 'category' | 'amount' | 'dueDate' | 'currency' | 'person'>, txns: Transaction[], taken: Set<string>): Transaction | undefined {
  if (item.amount === undefined) return undefined
  const ym = item.dueDate?.slice(0, 7)
  return txns.find((t) => {
    if (taken.has(t.id) || t.type !== 'expense' || (t.kind ?? 'normal') !== 'normal') return false
    if (t.currency !== item.currency || !sameMoney(t.amount, item.amount)) return false
    if (ym && month(t.date) !== ym && dayDiff(t.date, item.dueDate) > 10) return false
    return overlap(t.description, item.name) || overlap(`${t.store ?? ''} ${t.notes ?? ''}`, item.name) || (t.category === item.category && item.category !== 'Other')
  })
}

// ---------------------------------------------------------------------------
// Build the month
// ---------------------------------------------------------------------------
export function buildMonthItems(c: BudgetContext): MonthItem[] {
  // Strongest sources first, so a weaker duplicate is the one that gets dropped.
  const ranked: Candidate[] = [...loanCandidates(c), ...billCandidates(c), ...scheduleCandidates(c), ...documentCandidates(c), ...noteCandidates(c)]
  const kept: Candidate[] = []
  for (const cand of ranked) if (!kept.some((k) => isDuplicate(cand, k, c.loans))) kept.push(cand)

  const stored = c.stored.filter((s) => s.month === c.month)
  const byKey = new Map(stored.map((s) => [s.sourceKey, s]))
  const txnById = new Map(c.txns.map((t) => [t.id, t]))
  const taken = new Set<string>()
  // A payment already linked to an item can't be claimed by another.
  for (const s of stored) if (s.txnId) taken.add(s.txnId)
  for (const cand of kept) if (cand.paidTxnId) taken.add(cand.paidTxnId)

  const items: MonthItem[] = []

  for (const cand of kept.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))) {
    const st = byKey.get(cand.sourceKey)
    const edited = Boolean(st && ((st.amount !== undefined && st.amount !== cand.amount) || (st.dueDate && st.dueDate !== cand.dueDate)))
    const merged = {
      ...cand,
      name: st?.name && st.sourceKind !== 'schedule' ? st.name : cand.name,
      category: st?.category ?? cand.category,
      // Schedule items are edited on the schedule itself, so they never diverge from it.
      amount: cand.sourceKind === 'schedule' ? cand.amount : st?.amount ?? cand.amount,
      dueDate: cand.sourceKind === 'schedule' ? cand.dueDate : st?.dueDate ?? cand.dueDate,
      person: st?.person ?? cand.person,
    }

    // Payment, in order of authority: the schedule's own link, a stored link, a hand-marked payment, a strong match.
    let txn = cand.paidTxnId ? txnById.get(cand.paidTxnId) : st?.txnId ? txnById.get(st.txnId) : undefined
    let handPaid = (st?.status === 'Paid' && !st.txnId && st.paidAmount !== undefined) || Boolean(cand.paidHandMarked)
    if (!txn && !handPaid && st?.status !== 'Dismissed') {
      txn = findPayment(merged, c.txns, taken)
      if (txn) taken.add(txn.id)
    }

    let status: EffectiveStatus
    if (st?.status === 'Dismissed') status = 'Dismissed'
    else if (txn || handPaid) status = 'Paid'
    else if (cand.base === 'Suggested' && !(st && (st.status === 'Planned' || st.status === 'Overdue'))) status = 'Suggested'
    else status = merged.dueDate && merged.dueDate < c.today ? 'Overdue' : 'Planned'

    items.push({
      ...merged, key: `${c.month}|${cand.sourceKey}`, status, stored: st, edited,
      actual: txn ? txn.amount : handPaid ? st?.paidAmount ?? cand.paidAmount : undefined,
      txnId: txn?.id, needsInput: merged.amount === undefined,
    })
  }

  // Manual items, and stored rows whose source is gone (kept only if manual).
  for (const st of stored) {
    if (items.some((i) => i.sourceKey === st.sourceKey)) continue
    if (st.sourceKind !== 'manual') continue
    const txn = st.txnId ? txnById.get(st.txnId) : undefined
    const handPaid = st.status === 'Paid' && st.paidAmount !== undefined && !st.txnId
    let status: EffectiveStatus = st.status === 'Dismissed' ? 'Dismissed' : txn || handPaid ? 'Paid' : st.dueDate && st.dueDate < c.today ? 'Overdue' : 'Planned'
    if (st.status === 'Suggested') status = 'Suggested'
    items.push({
      key: `${st.month}|${st.sourceKey}`, month: st.month, name: st.name, category: st.category, amount: st.amount, currency: st.currency,
      dueDate: st.dueDate, person: st.person, sourceKind: 'manual', sourceId: st.sourceId, sourceKey: st.sourceKey, status, stored: st,
      actual: txn ? txn.amount : handPaid ? st.paidAmount : undefined, txnId: txn?.id, needsInput: st.amount === undefined,
      reason: 'Added by you', edited: false,
    })
  }

  return items.sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9') || a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------
export interface BudgetSummary {
  expectedIncome: number
  plannedExpenses: number
  /** All actual spending this month (from transactions) — planned or not. */
  actualSpending: number
  /** Actual paid against planned items only. */
  paidOnPlan: number
  unpaidCommitments: number
  /** Suggestions still awaiting approval (known amounts only). */
  pendingSuggestions: number
  /** Money left this month after what has been spent. */
  remaining: number
  /** Expected income − actual spending − unpaid commitments. */
  projected: number
  needsInput: number
  counts: Record<EffectiveStatus, number>
}

export function summarizeBudget(
  items: MonthItem[],
  o: { expectedIncome: number; actualSpending: number; toBase: (a: number, c: Currency) => number },
): BudgetSummary {
  const live = items.filter((i) => i.status !== 'Dismissed')
  const counts = { Suggested: 0, Planned: 0, Paid: 0, Overdue: 0, Dismissed: 0 } as Record<EffectiveStatus, number>
  for (const i of items) counts[i.status]++

  const plan = live.filter((i) => i.status !== 'Suggested')
  const planned = plan.reduce((n, i) => n + (i.amount !== undefined ? o.toBase(i.amount, i.currency) : 0), 0)
  const paidOnPlan = plan.filter((i) => i.status === 'Paid').reduce((n, i) => n + (i.actual !== undefined ? o.toBase(i.actual, i.currency) : 0), 0)
  const unpaid = plan
    .filter((i) => i.status === 'Planned' || i.status === 'Overdue')
    .reduce((n, i) => n + (i.amount !== undefined ? o.toBase(i.amount, i.currency) : 0), 0)
  const pending = live.filter((i) => i.status === 'Suggested').reduce((n, i) => n + (i.amount !== undefined ? o.toBase(i.amount, i.currency) : 0), 0)
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    expectedIncome: r(o.expectedIncome), plannedExpenses: r(planned), actualSpending: r(o.actualSpending), paidOnPlan: r(paidOnPlan),
    unpaidCommitments: r(unpaid), pendingSuggestions: r(pending), remaining: r(o.expectedIncome - o.actualSpending),
    projected: r(o.expectedIncome - o.actualSpending - unpaid), needsInput: live.filter((i) => i.needsInput).length, counts,
  }
}
