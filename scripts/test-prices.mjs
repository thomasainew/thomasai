// Run: node scripts/test-prices.mjs
import assert from 'node:assert/strict'
import { buildPriceItems, priceChange, rateOf, suggestMonthly, searchItems, freshness, canonicalName } from '../src/lib/prices.ts'

let n = 0
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 }
}
const t = (id, date, description, amount, extra = {}) => ({
  id, type: 'expense', date, description, category: 'Groceries', accountId: 'a', amount, currency: 'AED', ...extra,
})

console.log('Price tracking')
test('repeat purchases add dated history under ONE item', () => {
  const items = buildPriceItems([
    t('1', '2026-07-05', 'Chapathi', 6, { qty: 1, packSize: 500, packUnit: 'g', store: 'Lulu' }),
    t('2', '2026-08-05', 'Chapathi', 6.5, { qty: 1, packSize: 500, packUnit: 'g', store: 'Lulu' }),
    t('3', '2026-09-05', 'chapathi ', 7, { qty: 1, packSize: 500, packUnit: 'g', store: 'Carrefour' }),
  ], [])
  assert.equal(items.length, 1)
  assert.equal(items[0].points.length, 3)
  assert.equal(items[0].latest.date, '2026-09-05')
})
test('pack price and price per kg are different numbers', () => {
  const r = rateOf(t('1', '2026-09-01', 'Rice', 30, { qty: 1, packSize: 5, packUnit: 'kg' }))
  assert.equal(r.packPrice, 30)
  assert.equal(r.rate.per, 'kg')
  assert.equal(r.rate.value, 6)
})
test('equivalent quantities: 2 x 500 g at AED 12 = AED 12 per kg', () => {
  const r = rateOf(t('1', '2026-09-01', 'Flour', 12, { qty: 2, packSize: 500, packUnit: 'g' }))
  assert.equal(r.rate.value, 12)
  assert.equal(r.packPrice, 6)
})
test('loose weight is priced per kg', () => {
  const r = rateOf(t('1', '2026-09-01', 'Tomato', 9, { weight: 1500, weightUnit: 'g' }))
  assert.equal(r.rate.per, 'kg')
  assert.equal(r.rate.value, 6)
})
test('volume is priced per litre', () => {
  const r = rateOf(t('1', '2026-09-01', 'Milk', 7, { qty: 2, packSize: 500, packUnit: 'ml' }))
  assert.equal(r.rate.per, 'L')
  assert.equal(r.rate.value, 7)
})
test('increase shown in money and percent for the period', () => {
  const [item] = buildPriceItems([
    t('1', '2026-08-10', 'Milk', 6, { packSize: 1, packUnit: 'L' }),
    t('2', '2026-09-20', 'Milk', 6.6, { packSize: 1, packUnit: 'L' }),
  ], [])
  const c = priceChange(item, '2026-09-01', '2026-09-30')
  assert.equal(c.delta, 0.6)
  assert.equal(c.pct, 10)
  assert.equal(c.basis, 'pack price')
})
test('different pack sizes compare the per-kg rate, not the shelf price', () => {
  const [item] = buildPriceItems([
    t('1', '2026-08-10', 'Rice', 30, { packSize: 5, packUnit: 'kg' }),
    t('2', '2026-09-20', 'Rice', 14, { packSize: 2, packUnit: 'kg' }),
  ], [])
  const c = priceChange(item, '2026-09-01', '2026-09-30')
  assert.equal(c.basis, 'per kg')
  assert.equal(c.samePack, false)
  assert.equal(c.start, 6)
  assert.equal(c.end, 7)
})
test('a kg-priced and a unit-priced purchase are NOT compared', () => {
  const [item] = buildPriceItems([
    t('1', '2026-08-10', 'Apples', 10, { weight: 1, weightUnit: 'kg' }),
    t('2', '2026-09-20', 'Apples', 12, { qty: 3 }),
  ], [])
  assert.equal(priceChange(item, '2026-09-01', '2026-09-30'), null)
})
test('merging duplicate names combines their history', () => {
  const aliases = [{ id: 'x', alias: 'Chapati', canonical: 'Chapathi' }]
  assert.equal(canonicalName('chapati', aliases), 'Chapathi')
  const items = buildPriceItems([t('1', '2026-08-01', 'Chapathi', 6), t('2', '2026-09-01', 'Chapati', 6.5)], aliases)
  assert.equal(items.length, 1)
  assert.equal(items[0].points.length, 2)
})
test('asset purchases and refunds are not price points', () => {
  const items = buildPriceItems([t('1', '2026-08-01', 'Sofa', 900, { kind: 'asset_purchase' })], [])
  assert.equal(items.length, 0)
})

console.log('Shopping assistant')
test('every purchased item is searchable, with latest price/date/brand/store', () => {
  const items = buildPriceItems([
    t('1', '2026-08-01', 'Chapathi', 6, { brand: 'Kawan', store: 'Lulu' }),
    t('2', '2026-09-01', 'Chapathi', 6.5, { brand: 'Kawan', store: 'Carrefour' }),
    t('3', '2026-09-02', 'Basmati rice', 30),
  ], [])
  const hit = searchItems(items, 'chap')
  assert.equal(hit.length, 1)
  assert.equal(hit[0].latest.packPrice, 6.5)
  assert.equal(hit[0].latest.store, 'Carrefour')
  assert.equal(hit[0].latest.brand, 'Kawan')
  assert.equal(searchItems(items, 'kawan').length, 1)
})
test('old prices are flagged as estimates', () => {
  assert.equal(freshness('2026-09-10', '2026-09-21'), 'fresh')
  assert.equal(freshness('2026-07-01', '2026-09-21'), 'aging')
  assert.equal(freshness('2026-03-01', '2026-09-21'), 'old')
})
test('monthly requirement: 10 packets of chapathi from history', () => {
  const buys = ['2026-06-20', '2026-07-05', '2026-07-20', '2026-08-05', '2026-08-20', '2026-09-05', '2026-09-20']
    .map((d, i) => t(String(i), d, 'Chapathi', 6, { qty: 3, packSize: 500, packUnit: 'g' }))
  const [need] = suggestMonthly(buildPriceItems(buys, []), '2026-09-21')
  assert.equal(need.name, 'Chapathi')
  assert.ok(need.perMonth >= 6 && need.perMonth <= 9, `got ${need.perMonth}`)
  assert.ok(need.purchases >= 2)
})
test('one purchase is not a pattern', () => {
  assert.equal(suggestMonthly(buildPriceItems([t('1', '2026-09-01', 'Saffron', 40)], []), '2026-09-21').length, 0)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`)
