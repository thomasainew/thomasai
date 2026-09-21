// Run: node --import ./scripts/register.mjs scripts/test-assets.mjs
import assert from 'node:assert/strict'
import { goldHoldingValue, quoteFromSpot, purity } from '../src/lib/gold.ts'
import { ownedShare, assetsOwned, valuationSteps, inrWords } from '../src/lib/assets.ts'
import { statusScore, tierFor, statusCaveats, DEFAULT_TIERS } from '../src/lib/status.ts'
import { netWorthParts } from '../src/lib/ledger.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 }
}
const id = (a) => a

console.log('Assets')
test('a Rs 1 crore property with 25% ownership contributes Rs 25 lakh before debt', () => {
  const p = { currentValue: 10_000_000, ownershipPct: 25, currency: 'INR' }
  assert.equal(ownedShare(p), 2_500_000)
  assert.equal(inrWords(ownedShare(p)), '₹25 lakh')
  assert.equal(inrWords(10_000_000), '₹1 crore')
  assert.equal(assetsOwned([p], id), 2_500_000)
})
test('the linked loan is subtracted ONCE in net worth, not inside the asset', () => {
  const asset = { currentValue: 10_000_000, ownershipPct: 25, currency: 'INR' }
  const loan = { id: 'l', outstanding: 800_000, status: 'On Track', currency: 'INR' }
  const nw = netWorthParts({ accounts: [], loans: [loan], assetsOwned: assetsOwned([asset], id) }, id)
  assert.equal(nw.assetsOwned, 2_500_000)
  assert.equal(nw.loanDebt, 800_000)
  assert.equal(nw.netWorth, 1_700_000)
})
test('valuation history keeps every step with money and percent change', () => {
  const steps = valuationSteps([
    { id: '1', assetId: 'a', date: '2026-01-01', value: 100, currency: 'AED', source: 'manual' },
    { id: '2', assetId: 'a', date: '2026-06-01', value: 80, currency: 'AED', source: 'manual' },
  ])
  assert.equal(steps.length, 2)
  assert.equal(steps[0].delta, -20); assert.equal(steps[0].pct, -20)
  assert.equal(steps[1].delta, undefined)
})

console.log('Gold')
test('purity: 24K=1, 22K=22/24, 18K=0.75', () => {
  assert.equal(purity(24), 1); assert.equal(purity(18), 0.75)
  assert.ok(Math.abs(purity(22) - 22 / 24) < 1e-12)
})
test('value uses weight, purity, rate and ownership share; making charges are excluded', () => {
  const v = goldHoldingValue({ grams: 100, karat: 22, perGram24k: 7000, ownershipPct: 50 })
  assert.equal(v.fullValue, 641666.67)
  assert.equal(v.myShare, 320833.33)
  assert.equal(v.perGramAtPurity, 6416.67)
  // a jewellery bill with 40,000 of making charges does not change the estimate
  assert.equal(goldHoldingValue({ grams: 100, karat: 22, perGram24k: 7000, ownershipPct: 50, makingCharges: 40000 }).fullValue, 641666.67)
})
test('spot XAU/USD × USD/INR (+ duty) gives INR per gram', () => {
  const q = quoteFromSpot(3110.34768, 80, 6, 'test', '2026-09-21T00:00:00Z')
  assert.equal(q.spotParityPerGram, 8000)        // 3110.34768/31.1034768 = 100 USD/g × 80
  assert.equal(q.perGram24k, 8480)               // + 6% duty
  assert.equal(q.currency, 'INR')
})

console.log('Financial status')
const healthy = { netWorth: 600000, monthlyIncome: 20000, monthlyExpenses: 10000, availableFunds: 70000, monthlyDebtPayments: 0, totalDebt: 0, hasAccounts: true, monthsOfData: 6, oldestValuationDays: 30, hasAssets: true }
test('healthy → Rich, thin → Middle, indebted → Poor', () => {
  assert.equal(tierFor(statusScore(healthy).score, DEFAULT_TIERS).key, 'rich')
  const thin = { ...healthy, netWorth: 60000, availableFunds: 25000, monthlyExpenses: 15000, monthlyDebtPayments: 2000, totalDebt: 30000 }
  assert.equal(tierFor(statusScore(thin).score, DEFAULT_TIERS).key, 'middle')
  const poor = { ...healthy, netWorth: -50000, availableFunds: 1000, monthlyExpenses: 19000, monthlyDebtPayments: 9000, totalDebt: 200000 }
  assert.equal(tierFor(statusScore(poor).score, DEFAULT_TIERS).key, 'poor')
})
test('asset value alone does not make someone “Rich”', () => {
  const assetRichCashPoor = { ...healthy, netWorth: 5_000_000, availableFunds: 0, monthlyIncome: 10000, monthlyExpenses: 12000, monthlyDebtPayments: 6000, totalDebt: 900000 }
  const s = statusScore(assetRichCashPoor)
  assert.ok(tierFor(s.score, DEFAULT_TIERS).key !== 'rich', `score ${s.score}`)
})
test('thresholds and labels are editable', () => {
  const tiers = [{ key: 'poor', label: 'Building', from: 0 }, { key: 'middle', label: 'Comfortable', from: 30 }, { key: 'rich', label: 'Thriving', from: 60 }]
  assert.equal(tierFor(65, tiers).label, 'Thriving')
  assert.equal(tierFor(45, tiers).label, 'Comfortable')
})
test('the score is explained in four parts that add up', () => {
  const s = statusScore(healthy)
  assert.equal(s.parts.length, 4)
  assert.equal(Math.round(s.parts.reduce((a, p) => a + p.points, 0)), s.score)
})
test('missing or stale information is called out', () => {
  assert.ok(statusCaveats({ ...healthy, hasAccounts: false }).length >= 1)
  assert.ok(statusCaveats({ ...healthy, monthsOfData: 1, oldestValuationDays: 400, monthlyIncome: 0 }).length === 3)
  assert.equal(statusCaveats(healthy).length, 0)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`)
