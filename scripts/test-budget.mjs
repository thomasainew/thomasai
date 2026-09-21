// Run: node --import ./scripts/register.mjs scripts/test-budget.mjs
import assert from 'node:assert/strict'
import { buildMonthItems, summarizeBudget, extractCommitment } from '../src/lib/smartBudget.ts'
import { scheduleSummary, installmentStatus, dueReminders } from '../src/lib/schedules.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1 }
}
const inst = (id, label, dueDate, amount, extra = {}) => ({ id, label, dueDate, amount, currency: 'AED', ...extra })
const college = {
  id: 'n1', title: 'College Fees', category: 'Family', dueDate: '2026-10-05', status: 'Pending', done: false, person: 'Aisha',
  schedule: [inst('i1', 'First installment', '2026-10-05', 2000), inst('i2', 'Second installment', '2026-11-05', 1500), inst('i3', 'Third installment', '2026-12-05', 1500)],
}
const base = (over = {}) => ({ month: '2026-10', today: '2026-09-21', loans: [], bills: [], documents: [], notes: [], stored: [], txns: [], people: ['Aisha', 'Thomas'], ...over })
const names = (items) => items.map((i) => i.name)

console.log('Payment schedules in notes')
test('October budget includes ONLY the AED 2,000 instalment, not the full fee', () => {
  const items = buildMonthItems(base({ notes: [college] }))
  assert.equal(items.length, 1)
  assert.equal(items[0].amount, 2000)
  assert.equal(items[0].dueDate, '2026-10-05')
  assert.equal(items[0].person, 'Aisha')
  assert.equal(items[0].sourceKind, 'schedule')
  assert.equal(items[0].status, 'Planned') // a confirmed schedule is auto-included, not just suggested
})
test('November and December pick up their own instalments; September has none', () => {
  assert.equal(buildMonthItems(base({ month: '2026-11', notes: [college] }))[0].amount, 1500)
  assert.equal(buildMonthItems(base({ month: '2026-12', notes: [college] }))[0].amount, 1500)
  assert.equal(buildMonthItems(base({ month: '2026-09', notes: [college] })).length, 0)
})
test('total, paid, outstanding and next payment date', () => {
  const s = scheduleSummary(college, '2026-09-21', () => false)
  assert.equal(s.total, 5000); assert.equal(s.paid, 0); assert.equal(s.outstanding, 5000); assert.equal(s.nextDate, '2026-10-05')
})
test('recording a payment marks it Paid on both records, counted once', () => {
  const paidTxn = { id: 't9', type: 'expense', date: '2026-10-05', description: 'College Fees — First installment', category: 'Education', accountId: 'a', amount: 2000, currency: 'AED', budgetItemId: 'x' }
  const note = { ...college, schedule: [{ ...college.schedule[0], paidTxnId: 't9', paidAmount: 2000, paidDate: '2026-10-05' }, ...college.schedule.slice(1)] }
  const items = buildMonthItems(base({ notes: [note], txns: [paidTxn] }))
  assert.equal(items.length, 1)
  assert.equal(items[0].status, 'Paid')
  assert.equal(items[0].actual, 2000)   // actual kept apart from planned
  assert.equal(items[0].amount, 2000)
  const s = scheduleSummary(note, '2026-10-06', (id) => id === 't9')
  assert.equal(s.paid, 2000); assert.equal(s.outstanding, 3000); assert.equal(s.nextDate, '2026-11-05')
  const sum = summarizeBudget(items, { expectedIncome: 10000, actualSpending: 2000, toBase: (a) => a })
  assert.equal(sum.actualSpending, 2000) // spending is the transaction; the item adds no second 2,000
  assert.equal(sum.unpaidCommitments, 0)
})
test('deleting the payment transaction reverts the instalment to Overdue/Planned', () => {
  const note = { ...college, schedule: [{ ...college.schedule[0], paidTxnId: 't9', paidAmount: 2000, paidDate: '2026-10-05' }] }
  const items = buildMonthItems(base({ notes: [note], txns: [], today: '2026-10-10' }))
  assert.equal(items[0].status, 'Overdue')
  assert.equal(installmentStatus(note.schedule[0], '2026-10-10', () => false), 'Overdue')
})
test('editing an instalment updates the budget item (no duplicate)', () => {
  const edited = { ...college, schedule: [inst('i1', 'First installment', '2026-10-12', 2200), ...college.schedule.slice(1)] }
  const items = buildMonthItems(base({ notes: [edited] }))
  assert.equal(items.length, 1); assert.equal(items[0].amount, 2200); assert.equal(items[0].dueDate, '2026-10-12')
})
test('moving an instalment to another month moves the item', () => {
  const moved = { ...college, schedule: [inst('i1', 'First installment', '2026-11-20', 2000), ...college.schedule.slice(1)] }
  assert.equal(buildMonthItems(base({ notes: [moved] })).length, 0)
  assert.equal(buildMonthItems(base({ month: '2026-11', notes: [moved] })).length, 2)
})
test('each instalment has its own reminder', () => {
  const r = dueReminders([{ ...college, schedule: college.schedule.map((i) => ({ ...i, remindDays: 7 })) }], '2026-10-01', () => false)
  assert.equal(r.length, 1); assert.equal(r[0].installment.id, 'i1'); assert.equal(r[0].days, 4)
})

console.log('Loans, recurring bills, documents')
const loan = { id: 'l1', name: 'Car Loan', lender: 'FAB', outstanding: 20000, principal: 30000, emi: 1200, nextPayment: '2026-10-03', currency: 'AED', status: 'On Track', rate: 5, icon: '' }
test('EMIs due in the month are included automatically', () => {
  const [i] = buildMonthItems(base({ loans: [loan] }))
  assert.equal(i.amount, 1200); assert.equal(i.dueDate, '2026-10-03'); assert.equal(i.status, 'Planned')
})
test('no EMI before the loan first-payment month, none once closed', () => {
  assert.equal(buildMonthItems(base({ month: '2026-09', loans: [loan] })).length, 0)
  assert.equal(buildMonthItems(base({ loans: [{ ...loan, status: 'Closed' }] })).length, 0)
})
test('recurring bills: monthly, quarterly, yearly', () => {
  const bills = [
    { id: 'b1', name: 'Rent', category: 'Home / Rent', amount: 5000, dueDate: '2026-08-01', frequency: 'Monthly', status: 'Pending', autopay: false, icon: '' },
    { id: 'b2', name: 'Insurance', category: 'Insurance', amount: 900, dueDate: '2026-07-15', frequency: 'Quarterly', status: 'Pending', autopay: false, icon: '' },
    { id: 'b3', name: 'Domain', category: 'Subscriptions', amount: 60, dueDate: '2025-10-20', frequency: 'Yearly', status: 'Pending', autopay: false, icon: '' },
  ]
  const items = buildMonthItems(base({ bills }))
  assert.deepEqual(names(items).sort(), ['Domain', 'Insurance', 'Rent'])
  assert.equal(buildMonthItems(base({ month: '2026-11', bills })).length, 1) // only rent
})
test('a document expiring this month is a SUGGESTION and asks for the amount', () => {
  const docs = [{ id: 'd1', name: 'Visa', type: 'Residence', expiry: '2026-10-25', owner: 'Thomas', status: 'Valid', icon: '' }]
  const [i] = buildMonthItems(base({ documents: docs }))
  assert.equal(i.status, 'Suggested'); assert.equal(i.amount, undefined); assert.equal(i.needsInput, true)
  assert.equal(buildMonthItems(base({ documents: [{ ...docs[0], renewalCost: 650 }] }))[0].amount, 650)
})
test('an amount is never invented: missing amounts stay empty and are excluded from totals', () => {
  const docs = [{ id: 'd1', name: 'Visa', type: 'Residence', expiry: '2026-10-25', owner: 'Thomas', status: 'Valid', icon: '' }]
  const sum = summarizeBudget(buildMonthItems(base({ documents: docs })), { expectedIncome: 0, actualSpending: 0, toBase: (a) => a })
  assert.equal(sum.pendingSuggestions, 0); assert.equal(sum.needsInput, 1)
})

console.log('Notes and reminders')
test('extracts amount, person and category from a note', () => {
  const c = extractCommitment({ title: 'Aisha exam fee AED 1,250 due' }, ['Aisha', 'Thomas'])
  assert.equal(c.amount, 1250); assert.equal(c.currency, 'AED'); assert.equal(c.person, 'Aisha'); assert.equal(c.category, 'Education')
  assert.equal(extractCommitment({ title: 'School fees ₹15,000' }, []).currency, 'INR')
  assert.equal(extractCommitment({ title: 'Pay exam fee' }, []).amount, undefined) // no amount -> not guessed
  assert.equal(extractCommitment({ title: 'Buy milk' }, []).isCommitment, false)
})
test('a note about fees becomes a suggestion in its due month', () => {
  const notes = [{ id: 'n2', title: 'Aisha school fee AED 3,000', category: 'Family', dueDate: '2026-10-15', status: 'Pending', done: false }]
  const [i] = buildMonthItems(base({ notes }))
  assert.equal(i.status, 'Suggested'); assert.equal(i.amount, 3000); assert.equal(i.person, 'Aisha')
})
test('a note that repeats the loan EMI is NOT added twice', () => {
  const notes = [{ id: 'n3', title: 'Pay Car Loan EMI 1200', category: 'Loan', dueDate: '2026-10-03', status: 'Pending', done: false }]
  const items = buildMonthItems(base({ loans: [loan], notes }))
  assert.equal(items.length, 1); assert.equal(items[0].sourceKind, 'loan')
})
test('a note duplicating a schedule instalment is dropped', () => {
  const notes = [college, { id: 'n4', title: 'College fee AED 2,000', category: 'Family', dueDate: '2026-10-05', status: 'Pending', done: false }]
  assert.equal(buildMonthItems(base({ notes })).length, 1)
})

console.log('Approval, dismissal, payments')
test('approving a suggestion sets Planned with the amount; dismissing hides it', () => {
  const docs = [{ id: 'd1', name: 'Visa', type: 'Residence', expiry: '2026-10-25', owner: 'Thomas', status: 'Valid', icon: '' }]
  const key = 'doc:d1:2026-10-25'
  const approved = { id: 's1', month: '2026-10', name: 'Renew Visa', category: 'Government & Renewals', amount: 700, currency: 'AED', sourceKind: 'document', sourceKey: key, status: 'Planned', dueDate: '2026-10-25' }
  assert.equal(buildMonthItems(base({ documents: docs, stored: [approved] }))[0].status, 'Planned')
  assert.equal(buildMonthItems(base({ documents: docs, stored: [approved] }))[0].amount, 700)
  assert.equal(buildMonthItems(base({ documents: docs, stored: [{ ...approved, status: 'Dismissed' }] }))[0].status, 'Dismissed')
})
test('a manually added item appears; overdue items are flagged', () => {
  const manual = { id: 'm1', month: '2026-10', name: 'Gift', category: 'Personal', amount: 300, currency: 'AED', sourceKind: 'manual', sourceKey: 'manual:m1', status: 'Planned', dueDate: '2026-10-02' }
  assert.equal(buildMonthItems(base({ stored: [manual], today: '2026-10-09' }))[0].status, 'Overdue')
})
test('a matching transaction settles the item without being counted twice', () => {
  const txn = { id: 't1', type: 'expense', date: '2026-10-03', description: 'Car loan EMI', category: 'Loan Payment', accountId: 'a', amount: 1200, currency: 'AED' }
  const items = buildMonthItems(base({ loans: [loan], txns: [txn] }))
  assert.equal(items[0].status, 'Paid'); assert.equal(items[0].txnId, 't1')
  const s = summarizeBudget(items, { expectedIncome: 8000, actualSpending: 1200, toBase: (a) => a })
  assert.equal(s.actualSpending, 1200); assert.equal(s.unpaidCommitments, 0); assert.equal(s.paidOnPlan, 1200)
})
test('one transaction cannot settle two items', () => {
  const two = { ...loan, id: 'l2', name: 'Home Loan' }
  const txn = { id: 't1', type: 'expense', date: '2026-10-03', description: 'Car loan EMI', category: 'Loan Payment', accountId: 'a', amount: 1200, currency: 'AED' }
  const items = buildMonthItems(base({ loans: [loan, two], txns: [txn] }))
  assert.equal(items.filter((i) => i.status === 'Paid').length, 1)
})

console.log('Monthly dashboard')
test('expected income, planned, actual, unpaid, remaining and projected surplus', () => {
  const bills = [{ id: 'b1', name: 'Rent', category: 'Home / Rent', amount: 5000, dueDate: '2026-08-01', frequency: 'Monthly', status: 'Pending', autopay: false, icon: '' }]
  const items = buildMonthItems(base({ loans: [loan], bills, notes: [college] }))
  const s = summarizeBudget(items, { expectedIncome: 12000, actualSpending: 500, toBase: (a) => a })
  assert.equal(s.plannedExpenses, 1200 + 5000 + 2000)
  assert.equal(s.unpaidCommitments, 8200)
  assert.equal(s.remaining, 11500)
  assert.equal(s.projected, 12000 - 500 - 8200)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`)
