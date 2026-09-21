import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import type { Account, Transaction } from '@/types'
import type { ReceiptEntry } from '@/lib/receipts'
import { fmtDate, money } from '@/lib/format'
import { accountLabel } from '@/lib/accounting'

/**
 * The Expenses list: ONE row per receipt (or stand-alone expense). Click a row
 * to open the items bought on it.
 */
export function ReceiptList({
  entries,
  accounts,
  onEditItem,
  onEditReceipt,
  onDeleteReceipt,
  onDeleteItem,
}: {
  entries: ReceiptEntry[]
  accounts: Account[]
  onEditItem: (t: Transaction) => void
  onEditReceipt: (e: ReceiptEntry) => void
  onDeleteReceipt: (e: ReceiptEntry) => void
  onDeleteItem: (t: Transaction) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  const accountName = (id?: string) => {
    const a = accounts.find((x) => x.id === id)
    return a ? accountLabel(a) : '—'
  }

  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[760px]">
        <thead className="bg-slate-50/70">
          <tr>
            <th className="th w-8" />
            <th className="th">Date</th>
            <th className="th">Supermarket / Description</th>
            <th className="th">Person</th>
            <th className="th">Payment</th>
            <th className="th text-right">Total</th>
            <th className="th text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {entries.map((e) => {
            const expanded = open.has(e.key)
            const isReceipt = e.kind === 'receipt'
            return (
              <Fragment key={e.key}>
                <tr className="row-hover cursor-pointer" onClick={() => toggle(e.key)}>
                  <td className="td text-slate-400">
                    {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </td>
                  <td className="td text-slate-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="td font-semibold text-slate-800">
                    {e.store}
                    {isReceipt && (
                      <span className="chip bg-brand-50 text-brand-700 ml-2">{e.items.length} item{e.items.length === 1 ? '' : 's'}</span>
                    )}
                    {e.kind === 'refund' && <span className="chip bg-emerald-50 text-emerald-700 ml-2">Refund</span>}
                    {e.kind === 'asset' && <span className="chip bg-violet-50 text-violet-700 ml-2">Asset purchase</span>}
                  </td>
                  <td className="td text-slate-500">{e.person ?? 'Me'}</td>
                  <td className="td text-slate-500">
                    {accountName(e.accountId)}
                    {e.method && <span className="block text-[10.5px] text-slate-400">{e.method}</span>}
                  </td>
                  <td className={`td text-right font-bold tabular-nums whitespace-nowrap ${e.kind === 'refund' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {money(e.total, e.currency, 2)}
                  </td>
                  <td className="td" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        title={isReceipt ? 'Edit receipt details' : 'Edit'}
                        onClick={() => (isReceipt ? onEditReceipt(e) : onEditItem(e.items[0]))}
                        className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        title={isReceipt ? 'Delete the whole receipt' : 'Delete'}
                        onClick={() => onDeleteReceipt(e)}
                        className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>

                {expanded && (
                  <tr className="bg-slate-50/60">
                    <td />
                    <td colSpan={6} className="px-4 py-3">
                      <table className="w-full">
                        <thead>
                          <tr className="text-[10.5px] uppercase tracking-wide text-slate-400">
                            <th className="text-left font-semibold py-1">Item</th>
                            <th className="text-left font-semibold py-1">Brand</th>
                            <th className="text-left font-semibold py-1">Category</th>
                            <th className="text-right font-semibold py-1">Qty / pack</th>
                            <th className="text-right font-semibold py-1">Price</th>
                            <th className="w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {e.items.map((t) => (
                            <tr key={t.id} className="text-[12.5px] text-slate-700 border-t border-[#eef2f8]">
                              <td className="py-1.5 font-medium">{t.description}</td>
                              <td className="py-1.5 text-slate-500">{t.brand ?? '—'}</td>
                              <td className="py-1.5 text-slate-500">{t.category}</td>
                              <td className="py-1.5 text-right text-slate-500 tabular-nums">
                                {t.qty ? `${t.qty}×` : ''}
                                {t.packSize ? ` ${t.packSize}${t.packUnit ?? ''}` : ''}
                                {t.weight ? ` ${t.weight}${t.weightUnit ?? ''}` : ''}
                                {!t.qty && !t.packSize && !t.weight ? '—' : ''}
                              </td>
                              <td className="py-1.5 text-right font-semibold tabular-nums">{money(t.amount, t.currency, 2)}</td>
                              <td className="py-1.5">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => onEditItem(t)} className="h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer">
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => onDeleteItem(t)} className="h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {e.header?.notes && <p className="text-[11px] text-slate-400 mt-2">{e.header.notes}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
