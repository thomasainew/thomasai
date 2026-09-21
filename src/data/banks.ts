/**
 * Card styling per bank. These are colour schemes and plain-text wordmarks in
 * the spirit of each bank's own card — not their logos, which are trademarks.
 */
export interface BankStyle {
  key: string
  name: string
  /** Short wordmark shown on the card. */
  mark: string
  /** CSS gradient behind the card. */
  bg: string
  /** Text colour on the card. */
  fg: string
  /** Accent used for the chip highlights and pattern. */
  accent: string
  /** Words that identify this bank inside an account name. */
  match: string[]
}

export const BANKS: BankStyle[] = [
  { key: 'fab', name: 'First Abu Dhabi Bank (FAB)', mark: 'FAB', bg: 'linear-gradient(135deg,#00265c 0%,#0057a8 55%,#00a3e0 100%)', fg: '#ffffff', accent: '#7fd3ff', match: ['fab', 'first abu dhabi'] },
  { key: 'enbd', name: 'Emirates NBD', mark: 'Emirates NBD', bg: 'linear-gradient(135deg,#002d5b 0%,#0a4a94 60%,#ff7a1a 130%)', fg: '#ffffff', accent: '#ffb074', match: ['enbd', 'emirates nbd', 'emirates nbd'] },
  { key: 'adcb', name: 'ADCB', mark: 'ADCB', bg: 'linear-gradient(135deg,#7a0c12 0%,#c8151d 60%,#ff5a4d 120%)', fg: '#ffffff', accent: '#ffb3ad', match: ['adcb', 'abu dhabi commercial'] },
  { key: 'mashreq', name: 'Mashreq', mark: 'Mashreq', bg: 'linear-gradient(135deg,#a63a00 0%,#f26522 60%,#ffb347 120%)', fg: '#ffffff', accent: '#ffe0b3', match: ['mashreq'] },
  { key: 'dib', name: 'Dubai Islamic Bank', mark: 'DIB', bg: 'linear-gradient(135deg,#00382a 0%,#00693e 60%,#38b27a 120%)', fg: '#ffffff', accent: '#a5e8c6', match: ['dib', 'dubai islamic'] },
  { key: 'rakbank', name: 'RAKBANK', mark: 'RAKBANK', bg: 'linear-gradient(135deg,#0a2a6b 0%,#1d4ed8 55%,#e11d48 130%)', fg: '#ffffff', accent: '#fca5b5', match: ['rak'] },
  { key: 'hsbc', name: 'HSBC', mark: 'HSBC', bg: 'linear-gradient(135deg,#111111 0%,#2b2b2b 55%,#db0011 130%)', fg: '#ffffff', accent: '#ff8a93', match: ['hsbc'] },
  { key: 'scb', name: 'Standard Chartered', mark: 'Standard Chartered', bg: 'linear-gradient(135deg,#003b8e 0%,#0473ea 55%,#38d200 130%)', fg: '#ffffff', accent: '#b7f5a0', match: ['standard chartered', 'scb'] },
  { key: 'citi', name: 'Citibank', mark: 'citi', bg: 'linear-gradient(135deg,#00205b 0%,#0a4ea3 60%,#e4002b 130%)', fg: '#ffffff', accent: '#9ec5ff', match: ['citi'] },
  { key: 'sbi', name: 'State Bank of India', mark: 'SBI', bg: 'linear-gradient(135deg,#0b2c6b 0%,#1c4f9c 60%,#3aa0ff 120%)', fg: '#ffffff', accent: '#a9d2ff', match: ['sbi', 'state bank'] },
  { key: 'hdfc', name: 'HDFC Bank', mark: 'HDFC BANK', bg: 'linear-gradient(135deg,#00274d 0%,#004c8f 60%,#ed1c24 135%)', fg: '#ffffff', accent: '#ffa3a7', match: ['hdfc'] },
  { key: 'icici', name: 'ICICI Bank', mark: 'ICICI Bank', bg: 'linear-gradient(135deg,#5a1f00 0%,#b3410f 55%,#f37e20 120%)', fg: '#ffffff', accent: '#ffd0a6', match: ['icici'] },
  { key: 'axis', name: 'Axis Bank', mark: 'AXIS BANK', bg: 'linear-gradient(135deg,#4d0a26 0%,#97144d 60%,#d63a7a 120%)', fg: '#ffffff', accent: '#ffb4d0', match: ['axis'] },
  { key: 'kotak', name: 'Kotak Mahindra', mark: 'kotak', bg: 'linear-gradient(135deg,#7f0d13 0%,#ed1c24 60%,#003874 140%)', fg: '#ffffff', accent: '#ffb0b3', match: ['kotak'] },
  { key: 'federal', name: 'Federal Bank', mark: 'Federal Bank', bg: 'linear-gradient(135deg,#00406b 0%,#0072bc 60%,#ffc20e 130%)', fg: '#ffffff', accent: '#ffe08a', match: ['federal'] },
  { key: 'cash', name: 'Cash / Wallet', mark: 'CASH', bg: 'linear-gradient(135deg,#064e3b 0%,#059669 60%,#6ee7b7 130%)', fg: '#ffffff', accent: '#bbf7d0', match: ['cash', 'wallet'] },
  { key: 'generic', name: 'Other bank', mark: '', bg: 'linear-gradient(135deg,#1e293b 0%,#334155 60%,#64748b 130%)', fg: '#ffffff', accent: '#cbd5e1', match: [] },
]

export const bankByKey = (key?: string) => BANKS.find((b) => b.key === key)

/** Pick a bank from an account's name (or bank field) — "FAB Salary" → FAB. */
export function detectBank(text: string): BankStyle | undefined {
  const t = ` ${text.toLowerCase()} `
  return BANKS.find((b) => b.match.some((m) => new RegExp(`(^|[^a-z])${m.replace(/ /g, '\\s+')}([^a-z]|$)`).test(t)))
}

/** The style to draw an account with: chosen bank, else guessed from its name, else its own accent colour. */
export function styleFor(a: { bankStyle?: string; name: string; bank?: string; color: string; type: string }): BankStyle {
  const chosen = bankByKey(a.bankStyle)
  if (chosen) return chosen
  const guess = detectBank(`${a.name} ${a.bank ?? ''}`)
  if (guess) return guess
  if (a.type === 'cash') return bankByKey('cash')!
  return { ...bankByKey('generic')!, bg: `linear-gradient(135deg, ${a.color}, #0f172a)` }
}

/** Mask an account/card number: only the last four digits ever show. */
export function maskNumber(details: string, kind: 'card' | 'account') {
  const digits = (details ?? '').replace(/\D/g, '')
  if (digits.length < 2) return details && details !== '—' ? details : ''
  const last = digits.slice(-4)
  return kind === 'card' ? `•••• •••• •••• ${last}` : `•••• ${last}`
}
