// Run: node scripts/test-people.mjs
import assert from 'node:assert/strict'
import { peopleReport } from '../src/lib/peopleStats.ts'
import { plEntries, summarise } from '../src/lib/ledger.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 }
}
const id = (a) => a
const accounts = [
  { id: 'me', name: 'FAB Thomas', type: 'bank', owner: 'Thomas' },
  { id: 'wf', name: 'FAB Wife', type: 'bank', owner: 'Wife' },
  { id: 'cc', name: 'Card', type: 'card', owner: 'Thomas' },
]
const tx = (i, type, amount, person, extra = {}) => ({ id: i, type, date: '2026-09-05', description: i, category: type === 'income' ? 'Salary' : 'Groceries', accountId: 'me', amount, currency: 'AED', person, ...extra })
const txns = [tx('s1', 'income', 9000, 'Thomas'), tx('s2', 'income', 6000, 'Wife', { accountId: 'wf' }), tx('e1', 'expense', 500, 'Thomas'), tx('e2', 'expense', 300, 'Wife', { accountId: 'wf' })]
const transfer = { id: 't1', date: '2026-09-11', fromAccountId: 'wf', toKind: 'account', toId: 'me', amount: 2000, currency: 'AED', purpose: 'Family transfer' }

console.log('People & family')
const entries = plEntries(txns, [transfer], accounts)
const rep = peopleReport(entries, [transfer], accounts, [], ['Thomas', 'Wife'], id)
const p = (n) => rep.people.find((x) => x.name === n)

test('how much my wife earned in the period', () => assert.equal(p('Wife').income, 6000))
test('income, expenses and transfers are kept separate per person', () => {
  assert.equal(p('Wife').expenses, 300)
  assert.equal(p('Wife').transfersOut, 2000)
  assert.equal(p('Thomas').transfersIn, 2000)
  assert.equal(p('Thomas').income, 9000)
})
test('the transfer is NOT income or an expense for either of them', () => {
  assert.equal(p('Thomas').income, 9000)
  assert.equal(p('Wife').expenses, 300)
})
test('one linked family transfer: out of hers, into mine', () => {
  assert.equal(rep.family.length, 1)
  assert.equal(rep.family[0].from, 'Wife')
  assert.equal(rep.family[0].to, 'Thomas')
  assert.equal(rep.family[0].fromAccount, 'FAB Wife')
  assert.equal(rep.family[0].toAccount, 'FAB Thomas')
})
test('household combined equals the P&L exactly (no double counting)', () => {
  const s = summarise(entries, id)
  assert.equal(rep.household.income, s.income)
  assert.equal(rep.household.expenses, s.expenses)
  assert.equal(rep.household.income, 15000)
  assert.equal(rep.household.expenses, 800)
})
test('a card repayment is not a family transfer', () => {
  const pay = { id: 't2', date: '2026-09-12', fromAccountId: 'me', toKind: 'account', toId: 'cc', amount: 100, currency: 'AED', purpose: 'Credit card payment' }
  assert.equal(peopleReport(entries, [pay], accounts, [], ['Thomas'], id).family.length, 0)
})
test('interest on a loan repayment is the payer’s expense', () => {
  const repay = { id: 't3', date: '2026-09-12', fromAccountId: 'me', toKind: 'loan', toId: 'l1', amount: 1000, currency: 'AED', purpose: 'Loan payment', interest: 100, fees: 20 }
  const e = plEntries([], [repay], accounts)
  assert.equal(peopleReport(e, [repay], accounts, [{ id: 'l1' }], ['Thomas'], id).people[0].expenses, 120)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`)
