import type { Currency } from '@/types'
import { FX } from '@/data/seed'

export const SYMBOL: Record<Currency, string> = { AED: 'AED', INR: '₹', USD: '$' }

/**
 * The currency aggregate figures are shown in. Everything is computed in AED
 * internally; this only affects display. The store keeps it in step with
 * settings.baseCurrency, and every money-rendering screen subscribes to the
 * whole store, so switching it re-renders them.
 */
let BASE: Currency = 'AED'
export function setBaseCurrency(c: Currency) {
  BASE = c
}
export function getBaseCurrency() {
  return BASE
}

function format(value: number, currency: Currency, decimals: number) {
  // Rupee amounts use Indian digit grouping (12,34,567); the others use the usual thousands.
  const n = Math.abs(value).toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  const sign = value < 0 ? '-' : ''
  return currency === 'AED' ? `${sign}AED ${n}` : `${sign}${SYMBOL[currency]} ${n}`
}

/**
 * Format an amount. Pass `currency` for a raw figure already in that currency
 * (a single transaction, say). Omit it for an AED-denominated aggregate, which
 * is then converted into the active base currency for display.
 */
export function money(value: number, currency?: Currency, decimals = 0) {
  if (currency) return format(value, currency, decimals)
  if (BASE === 'AED') return format(value, 'AED', decimals)
  return format(convert(value, 'AED', BASE), BASE, BASE === 'INR' ? 0 : decimals)
}

export function compact(value: number) {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`
  return String(value)
}

/** Convert any amount into the base currency (AED). */
export function toBase(amount: number, from: Currency = 'AED') {
  return amount * (FX[from] ?? 1)
}

export function convert(amount: number, from: Currency, to: Currency) {
  return (amount * (FX[from] ?? 1)) / (FX[to] ?? 1)
}

export function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function shortDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
}

/** Local calendar date as yyyy-MM-dd. Uses the device clock, not UTC, so the
 *  day never flips early for users east of Greenwich. */
export function todayISO(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** App "today", resolved once per page load. */
export const TODAY = todayISO()

/** Shift a yyyy-MM key by n months, e.g. addMonths('2026-01', -1) -> '2025-12'. */
export function addMonths(key: string, n: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Short month label ('Sep') for a yyyy-MM or yyyy-MM-dd key. */
export function monthLabel(key: string) {
  return MONTHS[Number(key.slice(5, 7)) - 1] ?? key
}

export function daysLeft(iso: string, from: string = TODAY) {
  const a = new Date(from + 'T00:00:00').getTime()
  const b = new Date(iso + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export function monthKey(iso: string) {
  return iso.slice(0, 7)
}

export function greeting(hour = new Date().getHours()) {
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

/** Replace the conversion rates (into AED). Called once settings are loaded. */
export function setFxRates(rates: Record<string, number>) {
  for (const [k, v] of Object.entries(rates)) if (Number.isFinite(v) && v > 0) FX[k] = v
  FX.AED = 1
}
