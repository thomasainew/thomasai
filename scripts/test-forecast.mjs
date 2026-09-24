// Run: node --import ./scripts/register.mjs scripts/test-forecast.mjs
import assert from 'node:assert/strict'
import { amortizationSchedule, amortizes } from '../src/lib/amortization.ts'
import { monthlySituation } from '../src/lib/financials.ts'
import { incomeForMonth, occursIn } from '../src/lib/income.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 }
}

console.log('Loan amortization')
test('zero-interest loan: principal only, ends exactly at outstanding / emi months', () => {
  const rows = amortizationSchedule({ outstanding: 3000, emi: 500, rate: 0, nextPayment: '2026-10-15', currency: 'AED' })
  assert.equal(rows.length, 6)
  assert.equal(rows[0].opening, 3000)
  assert.equal(rows[0].interest, 0)
  assert.equal(rows[0].principal, 500)
  assert.equal(rows[5].closing, 0)
})
test('interest reduces the principal portion of each EMI, balance still reaches zero', () => {
  const rows = amortizationSchedule({ outstanding: 100000, emi: 3000, rate: 12, nextPayment: '2026-10-01', currency: 'AED' })
  assert.equal(rows[0].interest, 1000) // 100000 * 12%/12
  assert.equal(rows[0].principal, 2000)
  assert.equal(rows[0].closing, 98000)
  assert.ok(rows[rows.length - 1].closing === 0)
  // total principal repaid across the schedule equals the original balance
  const totalPrincipal = rows.reduce((n, r) => n + r.principal, 0)
  assert.ok(Math.abs(totalPrincipal - 100000) < 1)
})
test('the final month is a smaller top-up payment, not a full EMI', () => {
  const rows = amortizationSchedule({ outstanding: 1100, emi: 500, rate: 0, nextPayment: '2026-10-01', currency: 'AED' })
  assert.equal(rows.length, 3)
  assert.equal(rows[2].emi, 100)
  assert.equal(rows[2].closing, 0)
})
test('an EMI that does not cover interest never amortizes, and is flagged rather than looping', () => {
  const rows = amortizationSchedule({ outstanding: 100000, emi: 100, rate: 24, nextPayment: '2026-10-01', currency: 'AED' }, 600)
  assert.equal(amortizes({ outstanding: 100000, emi: 100, rate: 24 }), false)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].principal, 0)
})
test('amortizes() is true exactly when the EMI exceeds the interest due', () => {
  assert.equal(amortizes({ outstanding: 100000, emi: 1500, rate: 12 }), true) // interest = 1000
  assert.equal(amortizes({ outstanding: 100000, emi: 1000, rate: 12 }), false) // interest = 1000, EMI does not exceed it
})

console.log('Monthly situation')
test('a comfortable surplus relative to income is Healthy', () => {
  assert.equal(monthlySituation(3000, 10000), 'Healthy') // 30%
})
test('a thin but positive balance is Tight', () => {
  assert.equal(monthlySituation(300, 10000), 'Tight') // 3%
})
test('a small deficit is Attention Required, a large one is Deficit', () => {
  assert.equal(monthlySituation(-500, 10000), 'Attention Required') // -5%
  assert.equal(monthlySituation(-2000, 10000), 'Deficit') // -20%
})

console.log('Income planning')
test('a monthly salary occurs every month from its start date, an inactive one never occurs', () => {
  const salary = { frequency: 'Monthly', startDate: '2026-06-01', active: true }
  assert.equal(occursIn(salary, '2026-05'), false)
  assert.equal(occursIn(salary, '2026-06'), true)
  assert.equal(occursIn(salary, '2027-01'), true)
  assert.equal(occursIn({ ...salary, active: false }, '2026-07'), false)
})
test('a one-time payment occurs only in its own month', () => {
  const bonus = { frequency: 'One-Time', startDate: '2026-12-01', active: true }
  assert.equal(occursIn(bonus, '2026-11'), false)
  assert.equal(occursIn(bonus, '2026-12'), true)
  assert.equal(occursIn(bonus, '2027-01'), false)
})
test('quarterly and yearly land only on their own cycle, and stop at an end date', () => {
  const q = { frequency: 'Quarterly', startDate: '2026-01-01', endDate: '2026-09-30', active: true }
  assert.equal(occursIn(q, '2026-01'), true)
  assert.equal(occursIn(q, '2026-03'), false)
  assert.equal(occursIn(q, '2026-04'), true)
  assert.equal(occursIn(q, '2026-10'), false) // past the end date
})
test('incomeForMonth sums every source that occurs that month, converted to the reporting currency', () => {
  const sources = [
    { frequency: 'Monthly', startDate: '2026-01-01', active: true, amount: 8000, currency: 'AED' },
    { frequency: 'One-Time', startDate: '2026-10-01', active: true, amount: 1000, currency: 'AED' },
    { frequency: 'Monthly', startDate: '2026-01-01', active: false, amount: 5000, currency: 'AED' }, // inactive
  ]
  const toReport = (a) => a // identity conversion for the test
  assert.equal(incomeForMonth(sources, '2026-10', toReport), 9000)
  assert.equal(incomeForMonth(sources, '2026-11', toReport), 8000)
})
