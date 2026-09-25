// Run: node scripts/test-billscan.mjs
import assert from 'node:assert/strict'
import { checkLine, packConflicts, packLabel, packTotal, lineTotal, beforeVat, vatOf, encodeLineNotes, decodeLineNotes } from '../src/lib/billScan.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 }
}
const line = (extra = {}) => ({
  id: 'x', include: true, code: '', item: 'Brazil Chicken Liver', category: 'Groceries', itemGroup: 'Frozen Chicken',
  packCount: 20, packSize: 450, packUnit: 'g', uom: 'CTN', qty: 3, price: 68.82, vatPct: 5, ...extra,
})
const t = (id, date, description, amount, extra = {}) => ({
  id, type: 'expense', date, description, category: 'Groceries', accountId: 'a', amount, currency: 'AED', ...extra,
})

console.log('Bill scan')
test('line maths: before VAT, VAT and total', () => {
  const l = line()
  assert.equal(beforeVat(l), 206.46)
  assert.equal(vatOf(l), 10.32)
  assert.equal(lineTotal(l), 216.78)
})
test('pack label and base-unit total', () => {
  assert.equal(packLabel(line()), '20 × 450 g')
  assert.deepEqual(packTotal(line()), { size: 9000, unit: 'g' })
  assert.deepEqual(packTotal(line({ packCount: 6, packSize: 2.5, packUnit: 'kg' })), { size: 15000, unit: 'g' })
  assert.equal(packLabel(line({ packCount: 0, packSize: 0 })), '')
})
test('notes round-trip', () => {
  const s = encodeLineNotes({ code: '002064', pack: '20 × 450 g', uom: 'CTN', vatPct: 5, invoice: 'PAB 0891' })
  assert.deepEqual(decodeLineNotes(s), { code: '002064', pack: '20 × 450 g', uom: 'CTN', vatPct: 5 })
})
test('new item when never bought', () => {
  assert.equal(checkLine([], line()).status, 'new')
})
test('price increase vs same pack, VAT removed from the past amount', () => {
  const past = t('1', '2026-08-01', 'Brazil Chicken Liver', 65.5 * 2 * 1.05, { qty: 2, notes: 'Pack 20 × 450 g · VAT 5%' })
  const c = checkLine([past], line())
  assert.equal(c.status, 'increased')
  assert.equal(c.oldPrice, 65.5)
  assert.equal(c.delta, 3.32)
  assert.equal(c.deltaPct, 5.07)
})
test('same name at a different pack is not compared', () => {
  const past = t('1', '2026-08-01', 'Brazil Chicken Liver', 124, { qty: 2, notes: 'Pack 20 × 400 g' })
  assert.equal(checkLine([past], line()).status, 'different-pack')
})
test('item code wins over name', () => {
  const past = t('1', '2026-08-01', 'CHKN LIVER BRZ', 68.82, { qty: 1, notes: 'Code 002064 · Pack 20 × 450 g' })
  assert.equal(checkLine([past], line({ code: '002064', vatPct: 0 })).status, 'matched')
})
test('pack stored only as packSize still matches by total content', () => {
  const past = t('1', '2026-08-01', 'Brazil Chicken Liver', 68.82, { qty: 1, packSize: 9, packUnit: 'kg' })
  assert.equal(checkLine([past], line({ vatPct: 0 })).status, 'matched')
})
test('unreadable or flagged lines need review', () => {
  assert.equal(checkLine([], line({ flagged: true })).status, 'review')
  assert.equal(checkLine([], line({ price: 0 })).status, 'review')
})
test('pack conflicts on the same bill', () => {
  assert.deepEqual(packConflicts([line(), line({ id: 'y', packSize: 400 })]), [['20 × 450 g', '20 × 400 g']])
  assert.deepEqual(packConflicts([line()]), [])
})
console.log(`${n} passed`)
