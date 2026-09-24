import type { ReactNode } from 'react'
import type { Account } from '@/types'
import { maskNumber, styleFor } from '@/data/banks'
import { cardFigures } from '@/lib/ledger'
import { money } from '@/lib/format'

const TYPE_LABEL = {
  bank: 'Bank Account', cash: 'Cash Wallet', savings: 'Savings Account', investment: 'Investment Account',
  card: 'Credit Card', loan: 'Loan Account',
} as const

function Chip() {
  return (
    <svg width="38" height="28" viewBox="0 0 38 28" aria-hidden="true">
      <rect x=".5" y=".5" width="37" height="27" rx="5" fill="#e8c766" stroke="#b8942f" />
      <path d="M1 9.5h11M1 18.5h11M26 9.5h11M26 18.5h11M12 1v26M26 1v26M12 14h14" stroke="#b8942f" strokeWidth=".9" fill="none" />
    </svg>
  )
}

function Contactless() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M8 8.5a5 5 0 0 1 0 7M11.5 6a8.5 8.5 0 0 1 0 12M15 3.5a12 12 0 0 1 0 17" />
    </svg>
  )
}

/**
 * An account drawn as a bank card. The figure shown depends on what the
 * account IS: a bank balance, card debt (with available credit kept apart),
 * or an outstanding loan. The number is always masked.
 */
export function BankCard({ account: a, footer }: { account: Account; footer?: ReactNode }) {
  const style = styleFor(a)
  const isCard = a.type === 'card'
  const isLoan = a.type === 'loan'
  const card = isCard ? cardFigures(a) : null
  const mark = style.mark || a.bank || a.name
  const number = maskNumber(a.details, isCard ? 'card' : 'account')
  const overdrawn = !isCard && !isLoan && a.balance < 0

  return (
    <div className="rounded-2xl overflow-hidden shadow-[0_14px_30px_-14px_rgba(15,23,42,0.55)]">
      <div
        className="relative p-4 min-h-[190px] flex flex-col justify-between"
        style={{ background: style.bg, color: style.fg }}
      >
        {/* decorative rings, like a printed card */}
        <span className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[22px] opacity-[0.10]" style={{ borderColor: style.accent }} />
        <span className="absolute -right-2 top-14 h-28 w-28 rounded-full border-[14px] opacity-[0.08]" style={{ borderColor: style.accent }} />

        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[17px] font-black tracking-tight leading-none truncate" style={{ fontStyle: mark.length <= 4 ? 'italic' : 'normal' }}>
              {mark}
            </p>
            <p className="text-[10.5px] opacity-75 mt-1 truncate">{a.name} · {TYPE_LABEL[a.type]}</p>
          </div>
          <span className="chip bg-white/20 text-[10px] font-bold shrink-0">● {a.status}</span>
        </div>

        <div className="relative flex items-center gap-2.5 mt-3">
          <Chip />
          <span className="opacity-80"><Contactless /></span>
        </div>

        <div className="relative">
          {number && <p className="font-mono text-[13px] tracking-[0.14em] opacity-90">{number}</p>}
          <div className="flex items-end justify-between gap-3 mt-1.5">
            <div className="min-w-0">
              <p className="text-[9.5px] uppercase tracking-wider opacity-70">Card holder</p>
              <p className="text-[12px] font-bold uppercase truncate">{a.owner || 'Not set'}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9.5px] uppercase tracking-wider opacity-70">
                {isCard ? 'Outstanding debt' : isLoan ? 'Outstanding loan' : overdrawn ? 'Overdrawn' : 'Available balance'}
              </p>
              <p className={`text-[21px] font-extrabold tracking-tight leading-tight ${overdrawn ? 'text-rose-200' : ''}`}>
                {money(isCard ? card!.owed : isLoan ? Math.max(0, a.balance) : a.balance, a.currency)}
              </p>
              {isCard && (
                <p className="text-[10.5px] opacity-80">
                  {card!.credit > 0
                    ? `Credit balance ${money(card!.credit, a.currency)}`
                    : card!.available !== undefined
                      ? `Available credit ${money(card!.available, a.currency)}`
                      : 'Set a credit limit to see available credit'}
                  {card!.limit ? ` · limit ${money(card!.limit, a.currency)}` : ''}
                </p>
              )}
              {!isCard && <p className="text-[10px] opacity-70 mt-0.5">{a.currency}</p>}
            </div>
          </div>
        </div>
      </div>
      {footer && <div className="bg-white border border-t-0 border-[#e8edf5] rounded-b-2xl p-2">{footer}</div>}
    </div>
  )
}
