import { useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Modal, Field } from '@/components/ui/Modal'
import { useStore } from '@/store/useStore'
import { accountLabel } from '@/lib/accounting'
import { money, TODAY } from '@/lib/format'
import type { TransferPurpose } from '@/types'

const PURPOSES: TransferPurpose[] = ['Loan payment', 'Credit card payment', 'Cash withdrawal', 'Other']

/**
 * A movement of value between two of your own accounts. Never income or
 * expense — see the FINAL ACCOUNTING RULE in the corrections spec: transfers
 * only ever show up in transfer history, never in cash-flow totals.
 */
export function TransferModal({
  open,
  onClose,
  /** Preselect a loan repayment, e.g. from the Loans page "Record Payment" action. */
  presetLoanId,
  /** Preselect the source account, e.g. from an account card's "Transfer" button. */
  presetFromId,
}: {
  open: boolean
  onClose: () => void
  presetLoanId?: string | null
  presetFromId?: string | null
}) {
  const { accounts, loans, addTransfer } = useStore()
  const assetAccounts = accounts.filter((a) => a.type === 'bank' || a.type === 'cash')

  const [fromId, setFromId] = useState('')
  const [toKind, setToKind] = useState<'account' | 'loan'>('account')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(TODAY)
  const [purpose, setPurpose] = useState<TransferPurpose>('Other')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setFromId(presetFromId ?? assetAccounts[0]?.id ?? '')
    setAmount('')
    setDate(TODAY)
    setNotes('')
    if (presetLoanId) {
      setToKind('loan')
      setToId(presetLoanId)
      setPurpose('Loan payment')
    } else {
      setToKind('account')
      setToId('')
      setPurpose('Other')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetLoanId, presetFromId])

  const from = accounts.find((a) => a.id === fromId)
  // Never let the destination equal the source, and a card can't pay a card.
  const toAccountOptions = accounts.filter((a) => a.id !== fromId && (a.type === 'bank' || a.type === 'cash' || a.type === 'card'))
  const activeLoans = loans.filter((l) => l.status !== 'Closed')

  const amountValid = Number(amount) > 0
  const canSave = Boolean(from) && Boolean(toId) && amountValid

  const submit = () => {
    if (!canSave || !from) return
    addTransfer({
      date,
      fromAccountId: from.id,
      toKind,
      toId,
      amount: Number(amount),
      currency: from.currency,
      purpose,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer Money"
      subtitle="Move value between your own accounts — never counted as income or expense"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary disabled:opacity-50" disabled={!canSave} onClick={submit}>
            <ArrowLeftRight size={15} /> Record Transfer
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="From account">
            <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {assetAccounts.length === 0 && <option value="">No bank or cash account yet</option>}
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              <span className="input w-16 flex items-center justify-center bg-slate-50 text-slate-500 font-semibold">
                {from?.currency ?? 'AED'}
              </span>
            </div>
          </Field>
        </div>

        <Field label="To">
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => { setToKind('account'); setToId('') }}
              className={`chip cursor-pointer transition ${toKind === 'account' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Account
            </button>
            <button
              type="button"
              onClick={() => { setToKind('loan'); setToId(''); setPurpose('Loan payment') }}
              className={`chip cursor-pointer transition ${toKind === 'loan' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Loan
            </button>
          </div>
          {toKind === 'account' ? (
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Select the destination account</option>
              {toAccountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)} {a.type === 'card' ? '· reduces what you owe' : ''}
                </option>
              ))}
            </select>
          ) : (
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Select the loan</option>
              {activeLoans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} — {money(l.outstanding, l.currency)} outstanding
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Purpose">
            <select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value as TransferPurpose)}>
              {PURPOSES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Reference notes (optional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt number or description" />
        </Field>

        {from && toId && amountValid && (
          <p className="text-[11.5px] text-slate-500 rounded-xl bg-slate-50 px-3.5 py-2.5">
            This moves {money(Number(amount), from.currency)} — it will not appear as income or expense, only in
            transfer history.
          </p>
        )}
      </div>
    </Modal>
  )
}
