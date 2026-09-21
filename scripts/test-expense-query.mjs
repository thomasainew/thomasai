// Run: node scripts/test-expense-query.mjs
import assert from 'node:assert/strict'
import { toRows, applyFilter, sortRows, groupRows, totalsOf, receiptSummaries, buildPrintHtml } from '../src/lib/expenseQuery.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 }
}
const accounts = [{ id: 'a1', name: 'FAB' }, { id: 'a2', name: 'Cash' }]
const t = (id, date, description, amount, extra = {}) => ({
  id, type: 'expense', date, description, category: 'Groceries', accountId: 'a1', amount, currency: 'AED', person: 'Thomas', method: 'Bank Transfer', ...extra,
})
const txns = [
  t('1', '2026-09-01', 'Milk', 6, { brand: 'Almarai', store: 'Lulu', receiptId: 'R1' }),
  t('2', '2026-09-01', 'Bread', 4, { brand: 'Modern', store: 'Lulu', receiptId: 'R1' }),
  t('3', '2026-09-01', 'Rice', 30, { brand: 'Tilda', store: 'Lulu', receiptId: 'R2' }), // same shop, same day, SEPARATE receipt
  t('4', '2026-09-10', 'Detergent', 25, { category: 'Household', store: 'Carrefour', person: 'Wife', accountId: 'a2', method: 'Cash' }),
  t('5', '2026-09-12', 'Milk', 7, { brand: 'Almarai', store: 'Carrefour', person: 'Wife' }),
  { id: '6', type: 'income', kind: 'refund', date: '2026-09-15', description: 'Detergent', category: 'Household', accountId: 'a2', amount: 5, currency: 'AED', person: 'Wife', store: 'Carrefour', method: 'Cash' },
  { id: '7', type: 'income', date: '2026-09-01', description: 'Salary', category: 'Salary', accountId: 'a1', amount: 9000, currency: 'AED' },
  t('8', '2026-09-20', 'Laptop', 4000, { kind: 'asset_purchase', category: 'Electronics' }),
]
const rows = toRows(txns, accounts, [], (a) => a)

console.log('Expense report')
test('income is excluded; refunds are negative; assets are off by default', () => {
  assert.equal(rows.some((r) => r.item === 'Salary'), false)
  assert.equal(rows.find((r) => r.id === '6').amount, -5)
  assert.equal(applyFilter(rows, {}).some((r) => r.kind === 'asset'), false)
  assert.equal(applyFilter(rows, { includeAssets: true }).length, applyFilter(rows, {}).length + 1)
})
test('filters combine: person + category + date range', () => {
  const r = applyFilter(rows, { person: 'Wife', category: 'Household', from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(r.map((x) => x.id).sort(), ['4', '6'])
  assert.equal(totalsOf(r).total, 20) // 25 - 5 refund
})
test('filter by brand, supermarket, payment method, account and amount', () => {
  assert.equal(applyFilter(rows, { brand: 'almarai' }).length, 2)
  assert.equal(applyFilter(rows, { store: 'Carrefour', brand: 'Almarai' }).length, 1)
  assert.equal(applyFilter(rows, { method: 'Cash' }).length, 2)
  assert.equal(applyFilter(rows, { accountId: 'a2' }).length, 2)
  assert.equal(applyFilter(rows, { min: 20, max: 30 }).length, 2)
})
test('filtered totals are correct', () => {
  const r = applyFilter(rows, { store: 'Lulu' })
  assert.equal(totalsOf(r).total, 40)
  assert.equal(totalsOf(r).receipts, 2)
})
test('sorting by amount and item', () => {
  assert.equal(sortRows(applyFilter(rows, {}), 'amount', 'desc')[0].item, 'Rice')
  assert.equal(sortRows(applyFilter(rows, {}), 'item', 'asc')[0].item, 'Bread')
})
test('grouping subtotals add up to the grand total', () => {
  const r = applyFilter(rows, {})
  for (const by of ['category', 'brand', 'store', 'person', 'account', 'month', 'item']) {
    const g = groupRows(r, by)
    assert.equal(Math.round(g.reduce((n, x) => n + x.total, 0) * 100) / 100, totalsOf(r).total, by)
  }
})
test('receipt summaries keep same-day receipts from one shop separate', () => {
  const s = receiptSummaries(applyFilter(rows, { store: 'Lulu' }))
  assert.equal(s.length, 2)
  assert.deepEqual(s.map((x) => x.total).sort((a, b) => a - b), [10, 30])
})
test('printed report reflects the filters and includes headings and totals', () => {
  const f = { person: 'Wife' }
  const html = buildPrintHtml({
    title: 'Expense Report', subtitle: 'Sep 2026', mode: 'detail', filters: ['Person: Wife'], groupBy: 'store',
    rows: applyFilter(rows, f), currency: 'AED', fmt: (x) => `AED ${x}`, fmtDate: (d) => d, generatedOn: 'now',
  })
  assert.ok(html.includes('Person: Wife'))
  assert.ok(html.includes('Grand total'))
  assert.ok(html.includes('AED 27')) // 25 + 7 - 5
  assert.equal(html.includes('Rice'), false) // not Wife's
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`)
