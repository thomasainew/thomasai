import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'
import { useStore } from '@/store/useStore'
import { accountLabel, isAssetAccount } from '@/lib/accounting'
import { money, TODAY } from '@/lib/format'
import type { Transfer, TransferKind, TransferPurpose } from '@/types'

/** Optional starting point, so other screens can open this form already pointed somewhere. */
export interface TransferPreset {
  fromAccountId?: string
  /** A card or loan account to pay into. */
  toAccountId?: string
  /** A loan record to repay. */
  toLoanId?: string
  purpose?: TransferPurpose
}

type Mode = 'move' | 'card' | 'loan' | 'borrow'

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'move', label: 'Move money', hint: 'Between bank, cash or family accounts' },
  { key: 'card', label: 'Pay credit card', hint: 'Reduces card debt and the paying account' },
  { key: 'loan', label: 'Repay loan / EMI', hint: 'Principal reduces debt; interest and fees are expenses' },
  { key: 'borrow', label: 'Borrow money', hint: 'Money received from a loan — not income' },
]

function modeFor(p?: TransferPreset | null): Mode {
  if (!p) return 'move'
  if (p.toLoanId || p.purpose === 'Loan payment') return 'loan'
  if (p.purpose === 'Credit card payment') return 'card'
  if (p.purpose === 'Loan drawdown') return 'borrow'
  return 'move'
}

/**
 * A movement of value between two of your own accounts. Never income or
 * expense: transfers only ever show in transfer history. The one exception is
 * a loan repayment's interest and fees, which ARE expenses — and are recorded
 * on the same transfer so nothing is entered twice.
 */
export function TransferModal({
  open,
  onClose,
  preset,
  /** Legacy shortcuts used by the Loans and Accounts pages. */
  presetLoanId,
  presetFromId,
  editing,
}: {
  open: boolean
  onClose: () => void
  preset?: TransferPreset | null
  presetLoanId?: string | null
  presetFromId?: string | null
  editing?: Transfer | null
}) {
  const { accounts, loans, addTransfer, updateTransfer } = useStore()

  const asset = useMemo(() => accounts.filter((a) => isAssetAccount(a.type)), [accounts])
  const cards = useMemo(() => accounts.filter((a) => a.type === 'card'), [accounts])
  const loanAccounts = useMemo(() => accounts.filter((a) => a.type === 'loan'), [accounts])
  const activeLoans = loans.filter((l) => l.status !== 'Closed')

  const [mode, setMode] = useState<Mode>('move')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('') // account id, or "loan:<id>"
  const [amount, setAmount] = useState('')
  const [interest, setInterest] = useState('')
  const [fees, setFees] = useState('')
  const [date, setDate] = useState(TODAY)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    const p: TransferPreset | null =
      preset ?? (presetLoanId ? { toLoanId: presetLoanId, purpose: 'Loan payment' } : presetFromId ? { fromAccountId: presetFromId } : null)

    if (editing) {
      const m: Mode =
        editing.kind === 'drawdown' ? 'borrow' : editing.kind === 'card_payment' ? 'card' : editing.kind === 'repayment' ? 'loan' : 'move'
      setMode(m)
      setFromId(editing.fromAccountId)
      setToId(editing.toKind === 'loan' ? `loan:${editing.toId}` : editing.toId)
      setAmount(String(editing.amount))
      setInterest(editing.interest ? String(editing.interest) : '')
      setFees(editing.fees ? String(editing.fees) : '')
      setDate(editing.date)
      setNotes(editing.notes ?? '')
      return
    }

    const m = modeFor(p)
    setMode(m)
    setAmount('')
    setInterest('')
    setFees('')
    setDate(TODAY)
    setNotes('')
    if (m === 'borrow') {
      setFromId(p?.fromAccountId ?? loanAccounts[0]?.id ?? '')
      setToId(asset[0]?.id ?? '')
    } else {
      setFromId(p?.fromAccountId && asset.some((a) => a.id === p.fromAccountId) ? p.fromAccountId : asset[0]?.id ?? '')
      const linked = p?.toAccountId ? loans.find((l) => l.accountId === p.toAccountId) : undefined
      setToId(p?.toLoanId ? `loan:${p.toLoanId}` : linked ? `loan:${linked.id}` : p?.toAccountId ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset, presetLoanId, presetFromId, editing])

  /** Switching mode clears a destination that no longer makes sense. */
  const chooseMode = (m: Mode) => {
    setMode(m)
    setToId('')
    if (m === 'borrow') {
      setFromId(loanAccounts[0]?.id ?? '')
      setToId(asset[0]?.id ?? '')
    } else if (!asset.some((a) => a.id === fromId)) setFromId(asset[0]?.id ?? '')
  }

  const from = accounts.find((a) => a.id === fromId)
  const num = (v: string) => Math.max(0, Number(v) || 0)
  const total = num(amount)
  const cost = mode === 'loan' ? num(interest) + num(fees) : 0
  const principal = Math.round((total - cost) * 100) / 100

  const canSave =
    Boolean(from) && Boolean(toId) && total > 0 && principal >= 0 && (mode !== 'move' || toId !== fromId)

  const destLabel = (() => {
    if (toId.startsWith('loan:')) return loans.find((l) => l.id === toId.slice(5))?.name
    const a = accounts.find((x) => x.id === toId)
    return a ? accountLabel(a) : undefined
  })()

  const submit = () => {
    if (!canSave || !from) return
    const toLoan = toId.startsWith('loan:')
    const kind: TransferKind = mode === 'borrow' ? 'drawdown' : mode === 'card' ? 'card_payment' : mode === 'loan' ? 'repayment' : 'transfer'
    const dest = accounts.find((a) => a.id === toId)
    const familyMove = mode === 'move' && Boolean(from.owner) && Boolean(dest?.owner) && from.owner !== dest?.owner
    const purpose: TransferPurpose =
      mode === 'borrow' ? 'Loan drawdown' : mode === 'card' ? 'Credit card payment' : mode === 'loan' ? 'Loan payment' : familyMove ? 'Family transfer' : 'Other'

    const payload = {
      date,
      fromAccountId: from.id,
      toKind: (toLoan ? 'loan' : 'account') as Transfer['toKind'],
      toId: toLoan ? toId.slice(5) : toId,
      amount: total,
      currency: from.currency,
      purpose,
      notes: notes.trim() || undefined,
      kind,
      interest: mode === 'loan' ? num(interest) : 0,
      fees: mode === 'loan' ? num(fees) : 0,
    }
    if (editing) updateTransfer(editing.id, payload)
    else addTransfer(payload)
    onClose()
  }

  const fromOptions = mode === 'borrow' ? loanAccounts : asset
  const toOptions =
    mode === 'move'
      ? accounts.filter((a) => a.id !== fromId && isAssetAccount(a.type))
      : mode === 'card'
        ? cards
        : mode === 'borrow'
          ? asset
          : []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Transfer' : 'Move Money'}
      subtitle="Between your own accounts — never counted as income or expense"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary disabled:opacity-50" disabled={!canSave} onClick={submit}>
            <ArrowLeftRight size={15} /> {editing ? 'Save Transfer' : 'Record'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => chooseMode(m.key)}
                className={`chip cursor-pointer transition ${mode === m.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-slate-500 mt-1.5">{MODES.find((m) => m.key === mode)?.hint}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={mode === 'borrow' ? 'Borrowed from (loan account)' : 'From account'}>
            <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {fromOptions.length === 0 && (
                <option value="">{mode === 'borrow' ? 'No loan account yet — add one in Accounts' : 'No bank or cash account yet'}</option>
              )}
              {fromOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                  {a.owner ? ` · ${a.owner}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={mode === 'loan' ? 'Total paid' : 'Amount'}>
            <div className="flex gap-2">
              <input className="input flex-1" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              <span className="input w-16 flex items-center justify-center bg-slate-50 text-slate-500 font-semibold">
                {from?.currency ?? 'AED'}
              </span>
            </div>
          </Field>
        </div>

        <Field label={mode === 'borrow' ? 'Money received into' : mode === 'loan' ? 'Loan being repaid' : mode === 'card' ? 'Credit card' : 'To account'}>
          {mode === 'loan' ? (
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Select the loan</option>
              {activeLoans.map((l) => (
                <option key={l.id} value={`loan:${l.id}`}>
                  {l.name} — {money(l.outstanding, l.currency)} outstanding
                </option>
              ))}
              {loanAccounts
                .filter((a) => !loans.some((l) => l.accountId === a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (loan account) — {money(a.balance, a.currency)}
                  </option>
                ))}
            </select>
          ) : (
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Select the account</option>
              {toOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                  {a.owner ? ` · ${a.owner}` : ''}
                  {a.type === 'card' ? ` — owed ${money(Math.max(0, a.balance), a.currency)}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        {mode === 'loan' && (
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3">
            <Field label="Interest">
              <input className="input" type="number" min="0" step="0.01" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Fees">
              <input className="input" type="number" min="0" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Principal">
              <div className={`input flex items-center bg-white font-bold ${principal < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                {principal.toLocaleString()}
              </div>
            </Field>
            <p className="col-span-3 text-[11.5px] text-slate-500">
              Only the principal reduces what you owe. Interest and fees are expenses; the principal is not.
              Leave both at 0 if you don't have the breakdown — the full amount then reduces the debt.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reference notes (optional)">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt no. or note" />
          </Field>
        </div>

        {from && toId && total > 0 && (
          <p className="text-[11.5px] text-slate-600 rounded-xl bg-slate-50 px-3.5 py-2.5 leading-relaxed">
            {mode === 'borrow' ? (
              <>
                {money(total, from.currency)} is borrowed on <b>{from.name}</b> (debt goes up) and lands in <b>{destLabel}</b>.
                It is not income.
              </>
            ) : (
              <>
                {money(total, from.currency)} leaves <b>{from.name}</b>
                {from.owner ? ` (${from.owner})` : ''} and {mode === 'loan' ? 'pays' : mode === 'card' ? 'pays down' : 'arrives in'}{' '}
                <b>{destLabel}</b>
                {mode === 'loan' && cost > 0 ? ` — ${money(cost, from.currency)} of it is interest/fees (an expense)` : ''}. One linked record;
                not income or expense{mode === 'loan' && cost > 0 ? ' apart from the interest/fees' : ''}.
              </>
            )}
          </p>
        )}
      </div>
    </Modal>
  )
}
