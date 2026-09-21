// Run: node --import ./scripts/register.mjs scripts/test-financials.mjs
import assert from 'node:assert/strict'
import { buildSnapshot } from '../src/lib/financials.ts'
import { withDerivedBalances } from '../src/lib/ledger.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1 }
}
const id = (a) => a
const RATE = { AED: 1, INR: 0.0434, USD: 3.6725 }
const fx = (a, f, t) => (a * RATE[f]) / RATE[t]
const toAed = (a, c) => fx(a, c, 'AED')

const acc = [
  { id: 'bank', name: 'Bank', type: 'bank', currency: 'AED', openingBalance: 20000, details: '', balance: 0, status: 'Active', color: '' },
  { id: 'card', name: 'Card', type: 'card', currency: 'AED', openingBalance: 0, creditLimit: 30000, details: '', balance: 0, status: 'Active', color: '' },
  { id: 'loanacc', name: 'Loan', type: 'loan', currency: 'AED', openingBalance: 0, details: '', balance: 0, status: 'Active', color: '' },
]
const tx = (i, type, amount, date, extra = {}) => ({ id: i, type, date, description: i, category: type === 'income' ? 'Salary' : 'Groceries', accountId: 'bank', amount, currency: 'AED', ...extra })
const loan = { id: 'l1', name: 'Personal', lender: 'FAB', outstanding: 0, principal: 10000, emi: 1000, nextPayment: '2026-10-03', currency: 'AED', status: 'On Track', rate: 5, icon: '', accountId: 'loanacc' }

const txns = [
  tx('sal', 'income', 10000, '2026-09-01'),
  tx('food', 'expense', 1500, '2026-09-05'),
  tx('card-purchase', 'expense', 2000, '2026-09-06', { accountId: 'card' }),
  tx('car', 'expense', 8000, '2026-09-07', { kind: 'asset_purchase' }),
]
const transfers = [
  { id: 'draw', date: '2026-09-02', fromAccountId: 'loanacc', toKind: 'account', toId: 'bank', amount: 10000, currency: 'AED', purpose: 'Loan drawdown', kind: 'drawdown' },
  { id: 'cardpay', date: '2026-09-15', fromAccountId: 'bank', toKind: 'account', toId: 'card', amount: 500, currency: 'AED', purpose: 'Credit card payment', kind: 'card_payment' },
]
const accounts = withDerivedBalances(acc, txns, transfers, [loan], fx)
const loans = [{ ...loan, outstanding: accounts.find((a) => a.id === 'loanacc').balance }]
const assets = [{ id: 'a1', name: 'Flat', category: 'Property', currency: 'AED', currentValue: 1_000_000, ownershipPct: 25, photos: [], attachments: [], valuationDate: '2026-08-01' }]
const snap = buildSnapshot({ today: '2026-09-21', settings: { extra: {} }, accounts, transactions: txns, transfers, loans, assets, bills: [], documents: [], notes: [], budgetItems: [], people: [], toReport: toAed, fx })

console.log('Dashboard figures')
test('balances: bank 20,000 + 10,000 borrowed + 10,000 salary − 1,500 − 8,000 − 500 = 30,000', () => {
  assert.equal(accounts.find((a) => a.id === 'bank').balance, 30000)
})
test('card debt is 1,500 after a 500 repayment; loan debt is 10,000', () => {
  assert.equal(snap.netWorth.cardDebt, 1500)
  assert.equal(snap.netWorth.loanDebt, 10000) // the loan RECORD and its ACCOUNT are counted once
})
test('net worth = cash + owned assets − card debt − loan debt (no double counting, credit limit ignored)', () => {
  assert.equal(snap.netWorth.assetsOwned, 250000)
  assert.equal(snap.netWorth.netWorth, 30000 + 250000 - 1500 - 10000)
})
test('available funds = cash & bank only (not the 30,000 card limit)', () => {
  assert.equal(snap.availableFunds, 30000)
})
test('P&L: income 10,000, expenses 3,500 (1,500 food + 2,000 card purchase once), net 6,500', () => {
  assert.equal(snap.plNow.income, 10000)
  assert.equal(snap.plNow.expenses, 3500)
  assert.equal(snap.plNow.net, 6500)
})
test('cash flow differs from P&L: borrowing in, asset purchase and card repayment out', () => {
  // +10,000 salary +10,000 borrowed −1,500 food −8,000 car −500 card repayment = +10,000
  assert.equal(snap.cashFlow, 10000)
  assert.notEqual(snap.cashFlow, snap.plNow.net)
})
test('upcoming EMI in the next 30 days is listed', () => {
  assert.ok(snap.upcoming.some((u) => u.sourceKind === 'loan' && u.amount === 1000))
  assert.equal(snap.upcomingTotal, 1000)
})
test('status is derived from several signals and can be explained', () => {
  assert.equal(snap.status.parts.length, 4)
  assert.ok(['poor', 'middle', 'rich'].includes(snap.status.tier.key))
})
test('reporting in INR converts consistently', () => {
  const inr = buildSnapshot({ ...{ today: '2026-09-21', settings: { extra: {} }, accounts, transactions: txns, transfers, loans, assets, bills: [], documents: [], notes: [], budgetItems: [], people: [] }, toReport: (a, c) => fx(a, c, 'INR'), fx })
  assert.ok(Math.abs(inr.netWorth.netWorth - snap.netWorth.netWorth / 0.0434) < 1)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`)
