import { useMemo, useState } from 'react'
import { SmartBudget } from '@/components/SmartBudget'
import { CopyPlus, Gauge, History, Pencil, PiggyBank, Plus, Target, Trash2, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '@/store/useStore'
import { Card, CardHead, PageHeader, Progress, StatCard, Empty, Switch } from '@/components/ui/Primitives'
import { Donut, DonutLegend } from '@/components/charts/Charts'
import { Modal, Field } from '@/components/ui/Modal'
import { compact, convert, money, pct } from '@/lib/format'
import { budgetsWithSpend, categoriesOf, currentMonthLabel, subcategoriesOf, unbudgetedSpend } from '@/lib/selectors'
import { suggestBudgets } from '@/lib/budgetSuggest'
import type { BudgetCategory, Currency } from '@/types'

const ICON_OPTIONS = [
  { label: 'Wallet', icon: '👛' },
  { label: 'Groceries', icon: '🛒' },
  { label: 'Home', icon: '🏠' },
  { label: 'Transport', icon: '🚗' },
  { label: 'Health', icon: '➕' },
  { label: 'Shopping', icon: '🛍️' },
  { label: 'Restaurants', icon: '🍽️' },
  { label: 'Entertainment', icon: '🎬' },
  { label: 'Education', icon: '🎓' },
  { label: 'Family', icon: '👨‍👩‍👦' },
  { label: 'Other', icon: '📦' },
]
const PERIODS: BudgetCategory['period'][] = ['Monthly', 'Weekly', 'Yearly']
const THRESHOLDS = [50, 60, 70, 80, 90, 100]

const blankForm = (currency: Currency = 'AED') => ({
  name: '',
  icon: ICON_OPTIONS[0].icon,
  budget: '',
  currency,
  color: '#3b82f6',
  period: 'Monthly' as BudgetCategory['period'],
  categoryName: '',
  subcategoryName: '',
  autoMatch: true,
  rollover: false,
  alertThreshold: 80,
})

function CategoryBudgets() {
  const {
    budgets: rawBudgets, transactions, settings, categories, subcategories,
    addBudget, updateBudget, removeBudget, updateSettings, addSubcategory,
  } = useStore()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<BudgetCategory | null>(null)
  const [form, setForm] = useState(blankForm(settings.baseCurrency))
  const [newSub, setNewSub] = useState<string | null>(null)

  const expenseCategories = useMemo(() => categoriesOf(categories, 'expense'), [categories])
  const activeCategory = expenseCategories.find((c) => c.name === form.categoryName)
  const subOptions = useMemo(() => subcategoriesOf(subcategories, activeCategory?.id), [subcategories, activeCategory])

  // Spend is derived from this month's expenses, so recording one moves the bar.
  const budgets = useMemo(() => budgetsWithSpend(transactions, rawBudgets), [transactions, rawBudgets])
  const unbudgeted = useMemo(() => unbudgetedSpend(transactions, rawBudgets), [transactions, rawBudgets])
  const advice = useMemo(() => suggestBudgets(transactions, rawBudgets), [transactions, rawBudgets])
  const [dismissedAdvice, setDismissedAdvice] = useState<string[]>([])
  const openSuggestions = advice.suggestions.filter((s) => !dismissedAdvice.includes(s.name))

  const applySuggestion = (s: (typeof advice.suggestions)[number]) => {
    // s.suggested is base-currency; a budget denominated in another currency
    // needs it converted back before it means the same thing in that field.
    if (s.id) {
      const target = rawBudgets.find((b) => b.id === s.id)
      const suggested = Math.round(convert(s.suggested, 'AED', target?.currency ?? 'AED'))
      updateBudget(s.id, { budget: suggested })
    } else {
      addBudget({ name: s.name, icon: '📦', budget: s.suggested, currency: settings.baseCurrency, spent: 0, color: '#3b82f6' })
    }
    setDismissedAdvice((d) => [...d, s.name])
  }

  const totalBudget = budgets.reduce((a, b) => a + b.budgetBase, 0)
  const totalSpent = budgets.reduce((a, b) => a + b.spent, 0)
  const remaining = totalBudget - totalSpent
  const onTrack = totalSpent <= totalBudget

  const chart = useMemo(
    () => budgets.map((b) => ({ name: b.name.split(' ')[0], Budget: b.budgetBase, Actual: b.spent })),
    [budgets],
  )
  const donut = budgets.map((b) => ({ name: b.name, value: b.spent }))
  const colors = budgets.map((b) => b.color)

  const openAdd = () => {
    setEditing(null)
    setForm(blankForm(settings.baseCurrency))
    setNewSub(null)
    setModal(true)
  }

  const openEdit = (b: BudgetCategory) => {
    setEditing(b)
    setForm({
      name: b.name,
      icon: b.icon || ICON_OPTIONS[0].icon,
      budget: String(b.budget),
      currency: b.currency ?? 'AED',
      color: b.color,
      period: b.period ?? 'Monthly',
      categoryName: b.categoryName ?? '',
      subcategoryName: b.subcategoryName ?? '',
      autoMatch: b.autoMatch ?? true,
      rollover: b.rollover ?? false,
      alertThreshold: b.alertThreshold ?? 80,
    })
    setNewSub(null)
    setModal(true)
  }

  const save = () => {
    if (!form.name.trim() || !Number(form.budget)) return
    const payload = {
      name: form.name.trim(),
      icon: form.icon || '📦',
      color: form.color,
      period: form.period,
      categoryName: form.categoryName || undefined,
      subcategoryName: form.subcategoryName || undefined,
      autoMatch: form.autoMatch,
      rollover: form.rollover,
      alertThreshold: form.alertThreshold,
      budget: Number(form.budget),
      currency: form.currency,
    }
    if (editing) updateBudget(editing.id, payload)
    else addBudget({ ...payload, spent: 0 })
    setForm(blankForm(settings.baseCurrency))
    setEditing(null)
    setNewSub(null)
    setModal(false)
  }

  const createSubcategory = () => {
    const name = (newSub ?? '').trim()
    if (!name || !activeCategory) return
    addSubcategory({ categoryId: activeCategory.id, name, sort: subOptions.length })
    setForm((f) => ({ ...f, subcategoryName: name }))
    setNewSub(null)
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <PageHeader
        title="Budget"
        subtitle="Plan your spending, stay in control and reach your goals."
        actions={
          <button className="btn-primary" onClick={() => openAdd()}>
            <Plus size={15} /> Create Budget
          </button>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Budget" value={money(totalBudget)} icon={<Wallet size={20} />} tint="#10b981" footer={<span className="text-slate-400">This Month</span>} />
        <StatCard label="Total Spent" value={money(totalSpent)} icon={<Gauge size={20} />} tint="#3b82f6"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{pct(totalSpent, totalBudget)}% of budget</div><Progress value={totalSpent} max={totalBudget} color="#3b82f6" height={5} /></div>} />
        <StatCard label="Remaining" value={money(remaining)} icon={<PiggyBank size={20} />} tint="#f43f5e"
          footer={<div><div className="text-[10px] text-slate-400 mb-1">{100 - pct(totalSpent, totalBudget)}% left</div><Progress value={remaining} max={totalBudget} color="#22c55e" height={5} /></div>} />
        <StatCard label="On Track" value={onTrack ? 'Yes' : 'No'} icon={<Target size={20} />} tint="#8b5cf6"
          footer={<span className={onTrack ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{onTrack ? 'You are within budget' : 'Over budget this month'}</span>} />
      </div>

      {openSuggestions.length > 0 && (
        <Card>
          <CardHead
            title="Suggested from your history"
            sub={`Typical monthly spend over the last ${advice.monthsAvailable} complete month${advice.monthsAvailable === 1 ? '' : 's'} — calculated from your own figures, not estimated`}
            right={
              <button
                className="btn-soft h-8 px-3 text-[12px]"
                onClick={() => openSuggestions.forEach(applySuggestion)}
              >
                <History size={13} /> Apply all
              </button>
            }
          />
          <div className="px-5 pb-5 space-y-2">
            {openSuggestions.map((s) => (
              <div
                key={s.name}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eef2f8] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-slate-800">
                    {s.name}
                    {!s.id && <span className="chip bg-blue-50 text-blue-700 ml-2">No budget yet</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Typically {money(s.median)} a month across {s.monthsObserved} month
                    {s.monthsObserved === 1 ? '' : 's'}
                    {s.highest > s.median * 1.5 ? `, once as high as ${money(s.highest)}` : ''}.
                  </p>
                </div>
                <p className="text-[12.5px] tabular-nums whitespace-nowrap">
                  <span className="text-slate-400">{s.id ? money(s.current) : '—'}</span>
                  <span className="text-slate-400 mx-1.5">→</span>
                  <b className={s.delta > 0 ? 'text-rose-600' : 'text-emerald-600'}>{money(s.suggested)}</b>
                </p>
                <button className="btn-soft h-8 px-3 text-[12px]" onClick={() => applySuggestion(s)}>
                  Apply
                </button>
                <button
                  onClick={() => setDismissedAdvice((d) => [...d, s.name])}
                  className="text-[11.5px] text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHead title="Budget vs Actual" />
          <div className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chart} margin={{ top: 5, right: 5, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => compact(v)} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e8edf5', fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} verticalAlign="top" align="right" />
                <Bar isAnimationActive={false} dataKey="Budget" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar isAnimationActive={false} dataKey="Actual" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHead title="Spending Overview" />
          <div className="px-5 pb-5 flex flex-col items-center gap-4">
            <Donut data={donut} colors={colors} size={175} centerValue={money(totalSpent)} centerLabel="Total Spent" />
            <div className="w-full">
              <DonutLegend data={donut} total={totalSpent} colors={colors} showValue={false} />
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHead title="Budget Progress" right={<span className="chip bg-slate-100 text-slate-500">{currentMonthLabel()}</span>} />
          <div className="px-5 pb-5 space-y-3.5">
            {budgets.map((b) => (
              <div key={b.id}>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-[15px] w-5">{b.icon}</span>
                  <span className="flex-1 text-[12.5px] font-semibold text-slate-700 truncate">{b.name}</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {b.spent.toLocaleString()} / {b.budgetBase.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 w-9 text-right">{pct(b.spent, b.budgetBase)}%</span>
                </div>
                <Progress value={b.spent} max={b.budgetBase} color={b.color} height={7} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHead title="Budget Categories" sub="Budget is editable; spent is calculated from this month's expenses" />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Category</th>
                  <th className="th text-right">Budget</th>
                  <th className="th text-right">Spent</th>
                  <th className="th text-right">Remaining</th>
                  <th className="th w-56">Progress</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {budgets.map((b) => (
                  <tr key={b.id} className="row-hover">
                    <td className="td font-semibold text-slate-800"><span className="mr-2">{b.icon}</span>{b.name}</td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-[10px] font-semibold text-slate-400">{b.currency ?? 'AED'}</span>
                        <input
                          type="number"
                          value={b.budget}
                          onChange={(e) => updateBudget(b.id, { budget: Number(e.target.value) || 0 })}
                          className="w-20 h-8 rounded-lg border border-transparent hover:border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 outline-none px-2 text-right font-bold tabular-nums bg-transparent"
                        />
                      </div>
                    </td>
                    <td className="td text-right font-semibold tabular-nums text-slate-600">
                      {b.spent.toLocaleString()}
                    </td>
                    <td className={`td text-right font-bold tabular-nums ${b.budgetBase - b.spent < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {(b.budgetBase - b.spent).toLocaleString()}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Progress value={b.spent} max={b.budgetBase} color={b.color} height={7} />
                        <span className="text-[11px] font-bold text-slate-400 w-9 text-right">{pct(b.spent, b.budgetBase)}%</span>
                      </div>
                    </td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(b)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => removeBudget(b.id)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {budgets.length === 0 && <Empty text="No budget categories yet." />}
          </div>
          <div className="px-5 py-4 border-t border-[#f1f5f9] flex flex-wrap items-center gap-3">
            <button className="btn-soft" onClick={() => openAdd()}><Plus size={14} /> Add Category</button>
            {unbudgeted > 0 && (
              <p className="text-[11.5px] text-slate-500">
                <b className="text-slate-700">{money(unbudgeted)}</b> spent this month in categories no budget covers.
              </p>
            )}
          </div>
        </Card>

        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHead title="Monthly Budget" sub="Changes save as you type" />
            <div className="px-5 pb-5 space-y-3">
              <Field label={`Total Budget (${settings.baseCurrency})`}>
                <input
                  className="input"
                  type="number"
                  value={settings.monthlyBudget}
                  onChange={(e) => updateSettings({ monthlyBudget: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Start Date">
                <input className="input" type="date" value={settings.periodStart} onChange={(e) => updateSettings({ periodStart: e.target.value })} />
              </Field>
              <Field label="End Date">
                <input className="input" type="date" value={settings.periodEnd} onChange={(e) => updateSettings({ periodEnd: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Quick Actions" />
            <div className="px-5 pb-5 grid grid-cols-1 gap-2.5">
              <button className="btn-ghost justify-start h-11" onClick={() => openAdd()}><Plus size={15} /> Add Category</button>
              <button
                className="btn-ghost justify-start h-11"
                onClick={() => {
                  const total = Number(settings.monthlyBudget) || 0
                  if (!total || !budgets.length) return
                  const share = total / budgets.length
                  budgets.forEach((b) =>
                    updateBudget(b.id, { budget: Math.round(convert(share, settings.baseCurrency, b.currency ?? 'AED')) }),
                  )
                }}
              >
                <CopyPlus size={15} /> Split Monthly Budget Evenly
              </button>
              <Link to="/goals" className="btn-ghost justify-start h-11"><Target size={15} /> Set Savings Goal</Link>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); setNewSub(null) }}
        title={editing ? 'Edit Budget' : 'Add Budget'}
        subtitle={editing ? "Update this category's limit and matching." : 'Set a spending limit and organize transactions automatically.'}
        width="max-w-2xl"
        footer={
          <>
            <button className="btn-ghost" onClick={() => { setModal(false); setEditing(null); setNewSub(null) }}>Cancel</button>
            <button className="btn-primary" disabled={!form.name.trim() || !Number(form.budget)} onClick={save}>
              {editing ? 'Save Changes' : 'Create Budget'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="text-[12.5px] font-bold text-slate-800 mb-3">Budget Details</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Budget Name *" className="col-span-3 sm:col-span-1">
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Groceries" autoFocus />
              </Field>
              <Field label="Monthly Budget *">
                <div className="flex">
                  <select
                    className="input w-20 rounded-r-none border-r-0 px-1.5 text-slate-500 font-semibold"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}
                  >
                    <option>AED</option>
                    <option>INR</option>
                    <option>USD</option>
                  </select>
                  <input
                    className="input rounded-l-none"
                    type="number"
                    min="0"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    placeholder="1,000"
                  />
                </div>
              </Field>
              <Field label="Budget Period">
                <select className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as BudgetCategory['period'] })}>
                  {PERIODS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <p className="text-[12.5px] font-bold text-slate-800 mb-3">Category Matching</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category *">
                <select
                  className="input"
                  value={form.categoryName}
                  onChange={(e) => { setForm({ ...form, categoryName: e.target.value, subcategoryName: '' }); setNewSub(null) }}
                >
                  <option value="">No category — match by name only</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Subcategory">
                <select
                  className="input disabled:bg-slate-50 disabled:text-slate-400"
                  disabled={!activeCategory}
                  value={form.subcategoryName}
                  onChange={(e) => setForm({ ...form, subcategoryName: e.target.value })}
                >
                  <option value="">{activeCategory ? 'All sub-categories' : 'Choose a category first'}</option>
                  {subOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            {activeCategory && (
              newSub !== null ? (
                <div className="flex gap-2 mt-2">
                  <input
                    className="input h-8 text-[12.5px]"
                    autoFocus
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createSubcategory()}
                    placeholder="e.g. Vegetables"
                  />
                  <button className="btn-soft h-8 px-3 text-[12px]" onClick={createSubcategory}>Add</button>
                  <button className="text-[11.5px] text-slate-400 hover:text-slate-600 cursor-pointer" onClick={() => setNewSub(null)}>Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setNewSub('')}
                  className="mt-2 text-[12px] font-semibold text-brand-600 hover:text-brand-700 cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus size={13} /> Create new subcategory
                </button>
              )
            )}

            <div className="mt-3 rounded-xl bg-slate-50 border border-[#eef2f8] p-3.5 flex items-start gap-3">
              <Switch checked={form.autoMatch} onChange={(v) => setForm({ ...form, autoMatch: v })} />
              <div>
                <p className="text-[12.5px] font-bold text-slate-800">Auto-match transactions</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  Transactions matching this category and subcategory will automatically update this budget.
                </p>
              </div>
            </div>
            {form.categoryName && (
              <p className="mt-2 text-[11.5px] text-slate-500 bg-blue-50/60 border border-blue-100 rounded-xl px-3 py-2">
                If no match is found, the transaction will be marked Uncategorised for your review.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Icon">
              <select className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
                {ICON_OPTIONS.map((o) => <option key={o.label} value={o.icon}>{o.icon} {o.label}</option>)}
              </select>
            </Field>
            <Field label="Colour">
              <div className="flex gap-2 flex-wrap items-center h-10">
                {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#eab308'].map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`h-7 w-7 rounded-lg cursor-pointer ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>

          <div className="rounded-xl border border-[#eef2f8] p-3.5 flex items-start gap-3">
            <Switch checked={form.rollover} onChange={(v) => setForm({ ...form, rollover: v })} />
            <div>
              <p className="text-[12.5px] font-bold text-slate-800">Carry unused amount to next month</p>
              <p className="text-[11.5px] text-slate-500 mt-0.5">Roll over any unspent amount to your next month's budget.</p>
            </div>
          </div>

          <Field label="Alert me when spending reaches">
            <select
              className="input w-32"
              value={form.alertThreshold}
              onChange={(e) => setForm({ ...form, alertThreshold: Number(e.target.value) })}
            >
              {THRESHOLDS.map((t) => <option key={t} value={t}>{t}%</option>)}
            </select>
          </Field>

          {Number(form.budget) > 0 && (
            <div className="rounded-xl bg-brand-50/70 border border-brand-100 px-3.5 py-2.5 flex items-center gap-2.5">
              <span className="text-[13px]">📅</span>
              <p className="text-[12.5px] text-slate-700">
                <b>{money(Number(form.budget), form.currency)} per {form.period === 'Monthly' ? 'month' : form.period === 'Weekly' ? 'week' : 'year'}</b>
                <span className="text-slate-400"> — This is your {form.period?.toLowerCase()} limit for this category.</span>
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

/** Two views of the same money: monthly category limits, and the smart plan built from your commitments. */
export default function Budget() {
  const [tab, setTab] = useState<'smart' | 'categories'>('smart')
  return (
    <div className="space-y-5 max-w-[1600px]">
      <div className="flex gap-1 border-b border-[#e8edf5]">
        {([['smart', 'Smart Monthly Budget'], ['categories', 'Category Budgets']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 h-10 text-[13px] font-semibold border-b-2 transition cursor-pointer ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
        ))}
      </div>
      {tab === 'smart' ? <SmartBudget /> : <CategoryBudgets />}
    </div>
  )
}
