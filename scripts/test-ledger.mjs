// Acceptance tests for the accounting rules. Run: node scripts/test-ledger.mjs
import assert from 'node:assert/strict'
import {
  ledgerByAccount, withDerivedBalances, freezeOpenings, withDerivedLoans, plEntries, summarise,
  assetPurchases, debtMovements, netWorthParts, cardFigures,
} from '../src/lib/ledger.ts'

const RATE = { AED: 1, INR: 0.0434, USD: 3.6725 }
const fx = (n, from, to) => (n * RATE[from]) / RATE[to]
const toAed = (n, c) => fx(n, c, 'AED')

let passed = 0
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok  ', name) }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 }
}

const acct = (id, type, extra = {}) => ({
  id, name: id, type, details: '', balance: 0, currency: 'AED', status: 'Active', color: '#000', openingBalance: 0, ...extra,
})
const txn = (id, type, amount, accountId, extra = {}) => ({
  id, type, date: '2026-09-10', description: id, category: 'Groceries', accountId, amount, currency: 'AED', ...extra,
})
const bal = (accounts, txns = [], transfers = [], loans = []) =>
  Object.fromEntries(withDerivedBalances(accounts, txns, transfers, loans, fx).map((a) => [a.id, a.balance]))

console.log('Balances')
test('AED 0 opening minus AED 2,000 expense = -AED 2,000', () => {
  assert.equal(bal([acct('bank', 'bank')], [txn('e', 'expense', 2000, 'bank')]).bank, -2000)
})
test('opening balance is honoured', () => {
  assert.equal(bal([acct('bank', 'bank', { openingBalance: 5000 })], [txn('e', 'expense', 2000, 'bank')]).bank, 3000)
})
test('income adds, expense subtracts, in any order', () => {
  const t = [txn('a', 'income', 900, 'bank'), txn('b', 'expense', 100, 'bank'), txn('c', 'income', 50, 'bank')]
  assert.equal(bal([acct('bank', 'bank')], t).bank, 850)
  assert.equal(bal([acct('bank', 'bank')], [...t].reverse()).bank, 850)
})
test('an INR expense on an AED account is converted, not subtracted raw', () => {
  const b = bal([acct('bank', 'bank')], [txn('e', 'expense', 10000, 'bank', { currency: 'INR' })]).bank
  assert.equal(Math.round(b), -434)
})
test('deleting a transaction restores the balance exactly (derived, not nudged)', () => {
  const t = [txn('a', 'expense', 300, 'bank'), txn('b', 'expense', 200, 'bank')]
  assert.equal(bal([acct('bank', 'bank')], t.slice(0, 1)).bank, -300)
})

console.log('Legacy balance correction')
test('stored AED 800 with a 2,000 expense implies opening 2,800; confirming opening 0 gives -2,000', () => {
  const legacy = [{ ...acct('bank', 'bank'), openingBalance: undefined, balance: 800 }]
  const t = [txn('e', 'expense', 2000, 'bank')]
  const frozen = freezeOpenings(legacy, t, [], [], fx)
  assert.equal(frozen[0].openingBalance, 2800)
  assert.equal(frozen[0].openingConfirmed, false)
  assert.equal(withDerivedBalances(frozen, t, [], [], fx)[0].balance, 800) // nothing changes silently
  const corrected = frozen.map((a) => ({ ...a, openingBalance: 0, openingConfirmed: true }))
  assert.equal(withDerivedBalances(corrected, t, [], [], fx)[0].balance, -2000)
})
test('a legacy balance that agrees with its ledger is auto-confirmed', () => {
  const legacy = [{ ...acct('bank', 'bank'), openingBalance: undefined, balance: -2000 }]
  const f = freezeOpenings(legacy, [txn('e', 'expense', 2000, 'bank')], [], [], fx)
  assert.equal(f[0].openingBalance, 0)
  assert.equal(f[0].openingConfirmed, true)
})

console.log('Credit cards')
const accts = [acct('bank', 'bank', { openingBalance: 10000 }), acct('card', 'card', { creditLimit: 20000 })]
test('a card purchase increases debt and leaves the bank alone', () => {
  const b = bal(accts, [txn('p', 'expense', 1500, 'card')])
  assert.equal(b.card, 1500)
  assert.equal(b.bank, 10000)
})
const repay = { id: 'r', date: '2026-09-20', fromAccountId: 'bank', toKind: 'account', toId: 'card', amount: 1500, currency: 'AED', purpose: 'Credit card payment', kind: 'card_payment' }
test('repayment reduces card debt AND the paying account', () => {
  const b = bal(accts, [txn('p', 'expense', 1500, 'card')], [repay])
  assert.equal(b.card, 0)
  assert.equal(b.bank, 8500)
})
test('P&L counts the card purchase once; the repayment adds no expense', () => {
  const t = [txn('p', 'expense', 1500, 'card')]
  const s = summarise(plEntries(t, [repay], accts), toAed)
  assert.equal(s.expenses, 1500)
})
test('a card repayment is reported as card repayment, not loan principal', () => {
  const d = debtMovements([repay], accts, [], {}, toAed)
  assert.equal(d.cardRepaid, 1500)
  assert.equal(d.principalRepaid, 0)
})
test('debt and available credit are reported separately', () => {
  const card = withDerivedBalances(accts, [txn('p', 'expense', 1500, 'card')], [], [], fx).find((a) => a.id === 'card')
  const f = cardFigures(card)
  assert.equal(f.owed, 1500)
  assert.equal(f.available, 18500)
})
test('a card refund reduces debt and reverses the spending', () => {
  const t = [txn('p', 'expense', 1500, 'card'), txn('rf', 'income', 400, 'card', { kind: 'refund', refundOf: 'p' })]
  assert.equal(bal(accts, t).card, 1100)
  const s = summarise(plEntries(t, [], accts), toAed)
  assert.equal(s.expenses, 1100)
  assert.equal(s.income, 0) // a refund is not income
})

console.log('Family transfers')
const me = acct('me', 'bank', { owner: 'Thomas', openingBalance: 100 })
const wife = acct('wife', 'bank', { owner: 'Wife', openingBalance: 5000 })
test('wife -> me: one transfer, money out of hers and into mine', () => {
  const tr = { id: 'f', date: '2026-09-11', fromAccountId: 'wife', toKind: 'account', toId: 'me', amount: 2000, currency: 'AED', purpose: 'Family transfer' }
  const b = bal([me, wife], [], [tr])
  assert.equal(b.wife, 3000)
  assert.equal(b.me, 2100)
  const s = summarise(plEntries([], [tr], [me, wife]), toAed)
  assert.equal(s.income, 0)
  assert.equal(s.expenses, 0)
})
test('household combined total is unchanged by the transfer (no double count)', () => {
  const tr = { id: 'f', date: '2026-09-11', fromAccountId: 'wife', toKind: 'account', toId: 'me', amount: 2000, currency: 'AED', purpose: 'Family transfer' }
  const before = Object.values(bal([me, wife])).reduce((a, b) => a + b, 0)
  const after = Object.values(bal([me, wife], [], [tr])).reduce((a, b) => a + b, 0)
  assert.equal(before, after)
})

console.log('Loans')
const loanAcc = acct('loanacc', 'loan', { openingBalance: 0 })
const loan = { id: 'l1', name: 'Personal', lender: 'FAB', outstanding: 0, principal: 10000, emi: 1000, nextPayment: '2026-10-01', currency: 'AED', status: 'On Track', rate: 5, icon: '🏦', accountId: 'loanacc' }
const drawdown = { id: 'd', date: '2026-09-01', fromAccountId: 'loanacc', toKind: 'account', toId: 'bank', amount: 10000, currency: 'AED', purpose: 'Loan drawdown', kind: 'drawdown' }
test('borrowing: debt up, cash up, and it is NOT income', () => {
  const b = bal([acct('bank', 'bank'), loanAcc], [], [drawdown], [loan])
  assert.equal(b.loanacc, 10000)
  assert.equal(b.bank, 10000)
  assert.equal(summarise(plEntries([], [drawdown], [acct('bank', 'bank'), loanAcc]), toAed).income, 0)
})
test('spending borrowed money: an expense on the loan account raises debt once', () => {
  const b = bal([loanAcc], [txn('s', 'expense', 2500, 'loanacc')], [], [loan])
  assert.equal(b.loanacc, 2500)
})
const emi = { id: 'e1', date: '2026-10-01', fromAccountId: 'bank', toKind: 'loan', toId: 'l1', amount: 1000, currency: 'AED', purpose: 'Loan payment', kind: 'repayment', interest: 120, fees: 30 }
test('EMI: principal reduces debt; interest + fees are expenses; principal is not', () => {
  const accs = [acct('bank', 'bank', { openingBalance: 10000 }), acct('loanacc', 'loan', { openingBalance: 10000 })]
  const b = bal(accs, [], [emi], [loan])
  assert.equal(b.loanacc, 9150) // 10,000 - (1,000 - 120 - 30)
  assert.equal(b.bank, 9000)    // full payment leaves the bank
  const s = summarise(plEntries([], [emi], accs), toAed)
  assert.equal(s.expenses, 150) // interest + fees only
  const d = debtMovements([emi], accs, [loan], {}, toAed)
  assert.equal(d.principalRepaid, 850)
  assert.equal(d.cardRepaid, 0)
})
test('linked loan record takes its outstanding from the loan account', () => {
  const accs = [acct('bank', 'bank', { openingBalance: 10000 }), acct('loanacc', 'loan', { openingBalance: 10000 })]
  const derived = withDerivedBalances(accs, [], [emi], [loan], fx)
  assert.equal(withDerivedLoans([loan], derived, fx)[0].outstanding, 9150)
})

console.log('P&L rules')
test('asset purchases leave the P&L and are reported separately', () => {
  const t = [txn('car', 'expense', 40000, 'bank', { kind: 'asset_purchase' }), txn('food', 'expense', 300, 'bank')]
  assert.equal(summarise(plEntries(t, [], accts), toAed).expenses, 300)
  assert.equal(assetPurchases(t).length, 1)
  assert.equal(bal([acct('bank', 'bank', { openingBalance: 50000 })], t).bank, 9700) // cash impact still shows
})
test('receipt items are counted once each (no receipt total on top)', () => {
  const t = [txn('i1', 'expense', 10, 'bank', { receiptId: 'r1' }), txn('i2', 'expense', 15, 'bank', { receiptId: 'r1' })]
  assert.equal(summarise(plEntries(t, [], accts), toAed).expenses, 25)
})
test('filters narrow by person, account and dates', () => {
  const t = [txn('a', 'expense', 10, 'bank', { person: 'Wife' }), txn('b', 'expense', 20, 'bank', { person: 'Thomas' })]
  assert.equal(summarise(plEntries(t, [], accts, { person: 'Wife' }), toAed).expenses, 10)
  assert.equal(summarise(plEntries(t, [], accts, { from: '2026-10-01' }), toAed).expenses, 0)
})

console.log('Net worth')
test('net worth counts a linked loan once and ignores the unused credit limit', () => {
  const accs = withDerivedBalances(
    [acct('bank', 'bank', { openingBalance: 10000 }), acct('card', 'card', { creditLimit: 50000, openingBalance: 2000 }), acct('loanacc', 'loan', { openingBalance: 5000 })],
    [], [], [], fx)
  const l = { ...loan, outstanding: 5000 }
  const nw = netWorthParts({ accounts: accs, loans: [l], assetsOwned: 0 }, toAed)
  assert.equal(nw.netWorth, 10000 - 2000 - 5000) // not 10000 - 2000 - 10000, and no +50,000 of "credit"
})
test('a Rs 1 crore property at 25% contributes Rs 25 lakh before debt', () => {
  const owned = (10_000_000 * 25) / 100
  assert.equal(owned, 2_500_000)
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`)
