// Filtering, grouping, sorting and print-building for the Expense Report.
// Pure (type imports only) so it is unit-tested in plain Node.
import type { Account, ItemAlias, Transaction } from '@/types'

export interface ExpRow {
  id: string
  date: string
  item: string
  category: string
  brand: string
  store: string
  method: string
  accountId: string
  accountName: string
  person: string
  /** Signed, in the reporting currency: refunds are negative. */
  amount: number
  currency: string
  receiptId?: string
  kind: 'expense' | 'refund' | 'asset'
  txn: Transaction
}

export interface ExpenseFilter {
  from?: string
  to?: string
  item?: string
  category?: string
  brand?: string
  store?: string
  method?: string
  accountId?: string
  person?: string
  min?: number
  max?: number
  /** Asset purchases are cash out but not spending; off by default. */
  includeAssets?: boolean
}

export type GroupBy = 'none' | 'category' | 'brand' | 'store' | 'method' | 'account' | 'person' | 'item' | 'month' | 'date'
export type SortKey = 'date' | 'item' | 'category' | 'brand' | 'store' | 'method' | 'account' | 'person' | 'amount'

const norm = (s: string) => s.trim().toLowerCase()

export function toRows(
  txns: Transaction[],
  accounts: Account[],
  aliases: ItemAlias[],
  toReport: (amount: number, c: Transaction['currency']) => number,
): ExpRow[] {
  const acc = new Map(accounts.map((a) => [a.id, a.name]))
  const alias = new Map(aliases.map((a) => [norm(a.alias), a.canonical]))
  const rows: ExpRow[] = []
  for (const t of txns) {
    const k = t.kind ?? 'normal'
    const isRefund = k === 'refund'
    if (t.type === 'income' && !isRefund) continue
    rows.push({
      id: t.id,
      date: t.date,
      item: alias.get(norm(t.description)) ?? t.description,
      category: t.category,
      brand: t.brand ?? '',
      store: t.store ?? '',
      method: t.method ?? '',
      accountId: t.accountId,
      accountName: acc.get(t.accountId) ?? '—',
      person: t.person ?? 'Me',
      amount: (isRefund ? -1 : 1) * toReport(t.amount, t.currency),
      currency: t.currency,
      receiptId: t.receiptId,
      kind: isRefund ? 'refund' : k === 'asset_purchase' ? 'asset' : 'expense',
      txn: t,
    })
  }
  return rows
}

export function applyFilter(rows: ExpRow[], f: ExpenseFilter): ExpRow[] {
  const item = f.item ? norm(f.item) : ''
  return rows.filter((r) => {
    if (r.kind === 'asset' && !f.includeAssets) return false
    if (f.from && r.date < f.from) return false
    if (f.to && r.date > f.to) return false
    if (item && !norm(r.item).includes(item)) return false
    if (f.category && r.category !== f.category) return false
    if (f.brand && norm(r.brand) !== norm(f.brand)) return false
    if (f.store && norm(r.store) !== norm(f.store)) return false
    if (f.method && r.method !== f.method) return false
    if (f.accountId && r.accountId !== f.accountId) return false
    if (f.person && r.person !== f.person) return false
    if (f.min !== undefined && Math.abs(r.amount) < f.min) return false
    if (f.max !== undefined && Math.abs(r.amount) > f.max) return false
    return true
  })
}

const sortValue = (r: ExpRow, k: SortKey): string | number => {
  switch (k) {
    case 'amount': return r.amount
    case 'account': return norm(r.accountName)
    case 'date': return r.date
    default: return norm(r[k])
  }
}

export function sortRows(rows: ExpRow[], key: SortKey, dir: 'asc' | 'desc'): ExpRow[] {
  const m = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key)
    const y = sortValue(b, key)
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return c * m || a.date.localeCompare(b.date) * -1 || a.id.localeCompare(b.id)
  })
}

export function totalsOf(rows: ExpRow[]) {
  const receipts = new Set(rows.map((r) => r.receiptId ?? r.id))
  const total = rows.reduce((n, r) => n + r.amount, 0)
  return { count: rows.length, receipts: receipts.size, total: Math.round(total * 100) / 100 }
}

export interface Group {
  key: string
  rows: ExpRow[]
  total: number
  count: number
}

export function groupRows(rows: ExpRow[], by: GroupBy): Group[] {
  if (by === 'none') return [{ key: 'All results', rows, total: totalsOf(rows).total, count: rows.length }]
  const keyOf = (r: ExpRow) => {
    switch (by) {
      case 'category': return r.category || 'Uncategorised'
      case 'brand': return r.brand || 'No brand'
      case 'store': return r.store || 'No store recorded'
      case 'method': return r.method || 'Other'
      case 'account': return r.accountName
      case 'person': return r.person
      case 'item': return r.item
      case 'month': return r.date.slice(0, 7)
      case 'date': return r.date
    }
  }
  const map = new Map<string, ExpRow[]>()
  for (const r of rows) {
    const k = keyOf(r)
    const g = map.get(k)
    if (g) g.push(r)
    else map.set(k, [r])
  }
  const groups = [...map.entries()].map(([key, rs]) => ({ key, rows: rs, total: totalsOf(rs).total, count: rs.length }))
  return by === 'month' || by === 'date'
    ? groups.sort((a, b) => b.key.localeCompare(a.key))
    : groups.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

/** One row per receipt (or stand-alone expense): what the "receipt summary" report lists. */
export function receiptSummaries(rows: ExpRow[]) {
  const map = new Map<string, ExpRow[]>()
  for (const r of rows) {
    const k = r.receiptId ?? r.id
    const g = map.get(k)
    if (g) g.push(r)
    else map.set(k, [r])
  }
  return [...map.entries()]
    .map(([key, items]) => ({
      key,
      date: items[0].date,
      store: items[0].store || items[0].item,
      person: items[0].person,
      account: items[0].accountName,
      method: items[0].method,
      items,
      total: Math.round(items.reduce((n, r) => n + r.amount, 0) * 100) / 100,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Human-readable list of the active filters, for report headings. */
export function describeFilter(f: ExpenseFilter, accounts: Account[]): string[] {
  const out: string[] = []
  if (f.from || f.to) out.push(`Dates: ${f.from ?? 'start'} → ${f.to ?? 'today'}`)
  if (f.item) out.push(`Item contains “${f.item}”`)
  if (f.category) out.push(`Category: ${f.category}`)
  if (f.brand) out.push(`Brand: ${f.brand}`)
  if (f.store) out.push(`Supermarket: ${f.store}`)
  if (f.method) out.push(`Payment method: ${f.method}`)
  if (f.accountId) out.push(`Account: ${accounts.find((a) => a.id === f.accountId)?.name ?? f.accountId}`)
  if (f.person) out.push(`Person: ${f.person}`)
  if (f.min !== undefined) out.push(`Amount ≥ ${f.min}`)
  if (f.max !== undefined) out.push(`Amount ≤ ${f.max}`)
  if (f.includeAssets) out.push('Including asset purchases')
  return out
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export interface PrintInput {
  title: string
  subtitle: string
  mode: 'summary' | 'detail'
  filters: string[]
  groupBy: GroupBy
  rows: ExpRow[]
  currency: string
  fmt: (n: number) => string
  fmtDate: (d: string) => string
  generatedOn: string
}

/** A self-contained, print-ready HTML document reflecting the current filters. */
export function buildPrintHtml(p: PrintInput): string {
  const t = totalsOf(p.rows)
  const filters = p.filters.length ? p.filters.map((f) => `<li>${esc(f)}</li>`).join('') : '<li>No filters — all expenses</li>'

  let body = ''
  if (p.mode === 'summary') {
    const list = receiptSummaries(p.rows)
    body = `<table><thead><tr><th>Date</th><th>Supermarket</th><th>Person</th><th>Account</th><th>Payment</th><th class="n">Items</th><th class="n">Total</th></tr></thead><tbody>${list
      .map(
        (r) =>
          `<tr><td>${esc(p.fmtDate(r.date))}</td><td>${esc(r.store)}</td><td>${esc(r.person)}</td><td>${esc(r.account)}</td><td>${esc(r.method)}</td><td class="n">${r.items.length}</td><td class="n">${esc(p.fmt(r.total))}</td></tr>`,
      )
      .join('')}</tbody><tfoot><tr><td colspan="5">Total — ${list.length} receipt${list.length === 1 ? '' : 's'}</td><td class="n">${t.count}</td><td class="n">${esc(p.fmt(t.total))}</td></tr></tfoot></table>`
  } else {
    const groups = groupRows(p.rows, p.groupBy)
    body = groups
      .map(
        (g) =>
          `${p.groupBy === 'none' ? '' : `<h2>${esc(g.key)} <span>${g.count} item${g.count === 1 ? '' : 's'} · ${esc(p.fmt(g.total))}</span></h2>`}<table><thead><tr><th>Date</th><th>Item</th><th>Brand</th><th>Category</th><th>Supermarket</th><th>Person</th><th>Account</th><th class="n">Amount</th></tr></thead><tbody>${g.rows
            .map(
              (r) =>
                `<tr><td>${esc(p.fmtDate(r.date))}</td><td>${esc(r.item)}${r.kind === 'refund' ? ' (refund)' : ''}</td><td>${esc(r.brand)}</td><td>${esc(r.category)}</td><td>${esc(r.store)}</td><td>${esc(r.person)}</td><td>${esc(r.accountName)}</td><td class="n">${esc(p.fmt(r.amount))}</td></tr>`,
            )
            .join('')}</tbody><tfoot><tr><td colspan="7">${p.groupBy === 'none' ? 'Total' : `Subtotal — ${esc(g.key)}`}</td><td class="n">${esc(p.fmt(g.total))}</td></tr></tfoot></table>`,
      )
      .join('')
    if (p.groupBy !== 'none') body += `<p class="grand">Grand total: <b>${esc(p.fmt(t.total))}</b> across ${t.count} items on ${t.receipts} receipt${t.receipts === 1 ? '' : 's'}</p>`
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>
  @page{margin:14mm} body{font:12px/1.45 Inter,Segoe UI,Arial,sans-serif;color:#0f172a}
  h1{font-size:20px;margin:0} .sub{color:#64748b;margin:2px 0 10px} h2{font-size:14px;margin:18px 0 6px;display:flex;justify-content:space-between;border-bottom:2px solid #1f6bff;padding-bottom:3px}
  h2 span{font-weight:500;color:#64748b} ul.f{margin:4px 0 12px;padding-left:18px;color:#334155}
  table{width:100%;border-collapse:collapse;margin-bottom:6px} th{background:#f1f5f9;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
  th,td{padding:5px 7px;border-bottom:1px solid #e2e8f0} .n{text-align:right;font-variant-numeric:tabular-nums} tfoot td{font-weight:700;background:#f8fafc}
  .grand{font-size:14px;margin-top:14px;text-align:right} .foot{color:#94a3b8;font-size:10px;margin-top:18px}
  </style></head><body><h1>${esc(p.title)}</h1><div class="sub">${esc(p.subtitle)} · Currency: ${esc(p.currency)}</div>
  <b>Filters applied</b><ul class="f">${filters}</ul>${body}<div class="foot">Generated ${esc(p.generatedOn)} · CloudBasket 360</div></body></html>`
}
