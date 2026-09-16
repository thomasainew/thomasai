import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Banknote, CreditCard, Landmark, Plus, Trash2, Wallet, PieChart, Pencil } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead, Badge, PageHeader, StatCard, statusTone } from '@/components/ui/Primitives'
import { Donut, DonutLegend } from '@/components/charts/Charts'
import { Modal, Field } from '@/components/ui/Modal'
import { TransferModal } from '@/components/TransferModal'
import { accountLabel } from '@/lib/accounting'
import { TODAY, fmtDate, money } from '@/lib/format'
import { accountTotals, inMonth } from '@/lib/selectors'
import type { Account, AccountType, Currency } from '@/types'

const TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank Account',
  cash: 'Cash Wallet',
  card: 'Credit Card',
  loan: 'Loan Account',
}

export default function Accounts() {
  const { accounts, transactions, transfers, loans, addAccount, updateAccount, removeAccount, removeTransfer } = useStore()
  const [tab, setTab] = useState<'all' | AccountType>('all')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [editBalances, setEditBalances] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const transferDest = (t: (typeof transfers)[number]) =>
    t.toKind === 'loan'
      ? loans.find((l) => l.id === t.toId)?.name ?? '—'
      : accounts.find((a) => a.id === t.toId)?.name ?? '—'

  /** Account list plus this month's movements, as a CSV statement. */
  const downloadStatement = () => {
    const rows = [
      ['Account', 'Type', 'Details', 'Balance', 'Currency', 'Status'],
      ...accounts.map((a) => [a.name, TYPE_LABEL[a.type], a.details, a.balance, a.currency, a.status]),
      [],
      ['Date', 'Description', 'Account', 'Type', 'Amount', 'Currency'],
      ...[...inMonth(transactions)]
        .sort((x, y) => y.date.localeCompare(x.date))
        .map((t) => [
          t.date, t.description, accounts.find((a) => a.id === t.accountId)?.name ?? '—',
          t.type, t.amount, t.currency,
        ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `thomas-accounts-${TODAY}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totals = useMemo(() => accountTotals(accounts), [accounts])
  const list = accounts.filter((a) => (tab === 'all' ? true : a.type === tab))

  const donut = [
    { name: 'Bank Accounts', value: totals.bank },
    { name: 'Cash Wallets', value: totals.cash },
    { name: 'Credit Cards', value: totals.card },
    { name: 'Loans', value: totals.loan },
  ]
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#ef4444']

  const recent = useMemo(
    () =>
      [...inMonth(transactions)]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 6)
        .map((t) => {
          const acc = accounts.find((a) => a.id === t.accountId)
          return { ...t, accountName: acc ? accountLabel(acc) : '—' }
        }),
    [transactions, accounts],
  )

  const tabs = [
    { key: 'all', label: `All Accounts (${accounts.length})` },
    { key: 'bank', label: `Bank Accounts (${accounts.filter((a) => a.type === 'bank').length})` },
    { key: 'cash', label: `Cash Wallets (${accounts.filter((a) => a.type === 'cash').length})` },
    { key: 'card', label: `Credit Cards (${accounts.filter((a) => a.type === 'card').length})` },
    { key: 'loan', label: `Loans (${accounts.filter((a) => a.type === 'loan').length})` },
  ] as const

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Accounts"
        subtitle="Manage all your bank accounts, wallets, cards and loans in one place."
        actions={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight size={15} /> Transfer
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null)
                setModal(true)
              }}
            >
              <Plus size={15} /> Add Account
            </button>
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Bank Accounts" value={money(totals.bank)} icon={<Landmark size={20} />} tint="#3b82f6"
          footer={<span className="text-slate-400">{accounts.filter((a) => a.type === 'bank').length} accounts</span>} />
        <StatCard label="Cash Wallets" value={money(totals.cash)} icon={<Wallet size={20} />} tint="#10b981"
          footer={<span className="text-slate-400">{accounts.filter((a) => a.type === 'cash').length} wallets</span>} />
        <StatCard label="Credit Cards" value={money(totals.card)} icon={<CreditCard size={20} />} tint="#8b5cf6"
          footer={<span className="text-slate-400">{accounts.filter((a) => a.type === 'card').length} cards</span>} />
        <StatCard label="Loans" value={money(totals.loan)} icon={<Banknote size={20} />} tint="#ef4444"
          footer={<span className="text-rose-500 font-semibold">↑ {accounts.filter((a) => a.type === 'loan').length} active loans</span>} />
        <StatCard label="Net Position" value={money(totals.net)} icon={<PieChart size={20} />} tint="#f59e0b"
          footer={<span className="text-slate-400">Bank + cash, less cards and loans</span>} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <div className="px-5 pt-4 flex gap-1 flex-wrap border-b border-[#f1f5f9]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 h-10 text-[12.5px] font-semibold rounded-t-lg border-b-2 transition cursor-pointer ${
                  tab === t.key
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Account Name</th>
                  <th className="th">Type</th>
                  <th className="th">Account Details</th>
                  <th className="th text-right">Balance</th>
                  <th className="th">Currency</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {list.map((a) => (
                  <tr key={a.id} className="row-hover">
                    <td className="td font-semibold text-slate-800">
                      <div className="flex items-center gap-2.5">
                        <span className="h-7 w-7 rounded-lg grid place-items-center text-white text-[11px] font-bold shrink-0" style={{ background: a.color }}>
                          {a.name.charAt(0)}
                        </span>
                        {a.name}
                      </div>
                    </td>
                    <td className="td text-slate-500">{TYPE_LABEL[a.type]}</td>
                    <td className="td text-slate-500 font-mono text-[12px]">{a.details}</td>
                    <td className="td text-right font-bold tabular-nums">
                      {editBalances ? (
                        <input
                          type="number"
                          value={a.balance}
                          onChange={(e) => updateAccount(a.id, { balance: Number(e.target.value) || 0 })}
                          className="w-28 h-8 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 outline-none px-2 text-right font-bold tabular-nums"
                        />
                      ) : (
                        a.balance.toLocaleString()
                      )}
                    </td>
                    <td className="td text-slate-500">{a.currency}</td>
                    <td className="td"><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditing(a); setModal(true) }}
                          className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => removeAccount(a.id)}
                          className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHead title="Account Balance Overview" />
            <div className="px-5 pb-5 flex flex-col sm:flex-row items-center gap-4">
              <Donut data={donut} colors={colors} size={165} centerValue={money(totals.total)} centerLabel="Gross Holdings" />
              <div className="flex-1 w-full">
                <DonutLegend data={donut} total={totals.total} colors={colors} showValue={false} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Recent Transactions" />
            <div className="px-5 pb-5 space-y-3">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-14 text-slate-400 shrink-0">{fmtDate(t.date).slice(0, 6)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-700 truncate">{t.description}</p>
                    <p className="text-[11px] text-slate-400 truncate">{t.accountName}</p>
                  </div>
                  <span className={`font-bold tabular-nums shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t.type === 'income' ? '+' : '-'}
                    {money(t.amount, t.currency)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHead title="Transfer History" sub="Movements between your own accounts — never counted as income or expense" />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className="th">Date</th>
                <th className="th">From</th>
                <th className="th">To</th>
                <th className="th">Purpose</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {transfers.length === 0 && (
                <tr><td className="td text-center text-slate-400 py-8" colSpan={6}>No transfers recorded yet.</td></tr>
              )}
              {transfers.map((t) => (
                <tr key={t.id} className="row-hover">
                  <td className="td text-slate-500">{fmtDate(t.date)}</td>
                  <td className="td font-semibold text-slate-800">{accounts.find((a) => a.id === t.fromAccountId)?.name ?? '—'}</td>
                  <td className="td font-semibold text-slate-800">{transferDest(t)}</td>
                  <td className="td text-slate-500">{t.purpose}</td>
                  <td className="td text-right font-bold tabular-nums">{money(t.amount, t.currency)}</td>
                  <td className="td text-right">
                    <button
                      onClick={() => removeTransfer(t.id)}
                      className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer ml-auto"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: '📄', title: 'Account Statements', desc: 'Download your accounts and this month’s transactions as CSV.', btn: 'Download Statements', color: '#10b981', onClick: downloadStatement },
          { icon: '🔄', title: 'Update Balances', desc: 'Edit every account balance inline in the table above.', btn: editBalances ? 'Done Editing' : 'Update All Balances', color: '#3b82f6', onClick: () => setEditBalances((v) => !v) },
          { icon: '🏦', title: 'Manage Loans', desc: 'View and manage your loan accounts and payments.', btn: 'View Loans', color: '#8b5cf6', to: '/loans' },
          { icon: '📊', title: 'Reports', desc: 'View spending and account reports with detailed insights.', btn: 'View Reports', color: '#f59e0b', to: '/reports' },
        ].map((c) => (
          <Card key={c.title} className="card-pad">
            <span className="h-10 w-10 rounded-xl grid place-items-center text-[18px] mb-3" style={{ background: `${c.color}1a` }}>
              {c.icon}
            </span>
            <p className="text-[13.5px] font-bold text-slate-800">{c.title}</p>
            <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed min-h-[32px]">{c.desc}</p>
            {c.to ? (
              <Link
                to={c.to}
                className="mt-3 h-9 w-full rounded-xl text-white text-[12px] font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition"
                style={{ background: c.color }}
              >
                {c.btn} →
              </Link>
            ) : (
              <button
                onClick={c.onClick}
                className="mt-3 h-9 w-full rounded-xl text-white text-[12px] font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition cursor-pointer"
                style={{ background: c.color }}
              >
                {c.btn} →
              </button>
            )}
          </Card>
        ))}
      </div>

      <AccountModal open={modal} onClose={() => setModal(false)} editing={editing} onSave={editing ? (patch) => updateAccount(editing.id, patch) : addAccount} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  )
}

function AccountModal({
  open,
  onClose,
  editing,
  onSave,
}: {
  open: boolean
  onClose: () => void
  editing: Account | null
  onSave: (a: any) => void
}) {
  const [form, setForm] = useState({
    name: '', type: 'bank' as AccountType, details: '', balance: '', currency: 'AED' as Currency, color: '#3b82f6',
    statementDay: '', dueDay: '',
  })

  useEffect(() => {
    if (open)
      setForm(
        editing
          ? {
              name: editing.name, type: editing.type, details: editing.details, balance: String(editing.balance),
              currency: editing.currency, color: editing.color,
              statementDay: editing.statementDay ? String(editing.statementDay) : '',
              dueDay: editing.dueDay ? String(editing.dueDay) : '',
            }
          : { name: '', type: 'bank', details: '', balance: '', currency: 'AED', color: '#3b82f6', statementDay: '', dueDay: '' },
      )
  }, [open, editing])

  const submit = () => {
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      type: form.type,
      details: form.details || '—',
      balance: Number(form.balance) || 0,
      currency: form.currency,
      color: form.color,
      status: form.type === 'card' ? 'Available' : 'Active',
      // Only cards have a billing cycle; clear it if the type changed away.
      statementDay: form.type === 'card' && form.statementDay ? Number(form.statementDay) : undefined,
      dueDay: form.type === 'card' && form.dueDay ? Number(form.dueDay) : undefined,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Account' : 'Add Account'}
      subtitle="Bank account, cash wallet, credit card or loan account"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>{editing ? 'Save Changes' : 'Add Account'}</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Account Name" className="col-span-2">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emirates NBD Savings" autoFocus />
        </Field>
        <Field label="Type">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
            <option value="bank">Bank Account</option>
            <option value="cash">Cash Wallet</option>
            <option value="card">Credit Card</option>
            <option value="loan">Loan Account</option>
          </select>
        </Field>
        <Field label="Account Details">
          <input className="input" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="**** 1234" />
        </Field>
        <Field label="Balance">
          <input className="input" type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="0" />
        </Field>
        <Field label="Currency">
          <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
            <option>AED</option><option>INR</option><option>USD</option>
          </select>
        </Field>
        {form.type === 'card' && (
          <>
            <Field label="Statement closes on">
              <input
                className="input"
                type="number"
                min="1"
                max="31"
                value={form.statementDay}
                onChange={(e) => setForm({ ...form, statementDay: e.target.value })}
                placeholder="25"
              />
            </Field>
            <Field label="Payment due on">
              <input
                className="input"
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                placeholder="15"
              />
            </Field>
            <p className="col-span-2 text-[11.5px] text-slate-500 -mt-1">
              Day of the month the statement closes, and the day of the following month the payment falls due. Set
              both to see the billing cycle when recording a credit card expense.
            </p>
          </>
        )}

        <Field label="Accent Colour" className="col-span-2">
          <div className="flex gap-2 flex-wrap">
            {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'].map((c) => (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                className={`h-8 w-8 rounded-lg cursor-pointer transition ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
