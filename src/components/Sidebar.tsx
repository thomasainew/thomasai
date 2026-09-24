import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3, Bot, CalendarDays, CreditCard, FileText, FolderTree, Gauge, Gem, Home, Landmark, LayoutDashboard, Scale,
  MinusCircle, PiggyBank, PlusCircle, ReceiptText, Repeat, Settings as SettingsIcon, ShoppingBag, ShoppingCart,
  Sparkles, StickyNote, Tags, TrendingUp, Users, Wallet,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { docStatus } from '@/lib/selectors'
import { hasGemini } from '@/lib/gemini'
import { AskModal } from '@/components/AskModal'
import { canOpen } from '@/lib/access'
import { CloudBasketMark } from '@/components/CloudBasketMark'
import { buildSnapshot } from '@/lib/financials'
import { tierTone } from '@/lib/status'
import { TODAY, convert, money } from '@/lib/format'
import type { Currency } from '@/types'

const NAV = [
  { to: '/', label: 'My Financial Status', icon: Home, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/income', label: 'Income', icon: PlusCircle },
  { to: '/income-planning', label: 'Income Planning', icon: Repeat },
  { to: '/expenses', label: 'Expenses', icon: MinusCircle },
  { to: '/expense-report', label: 'Expense Report', icon: ShoppingBag },
  { to: '/budget', label: 'Budget', icon: Gauge },
  { to: '/loans', label: 'Loans', icon: Landmark },
  { to: '/forecast', label: 'Financial Forecast', icon: TrendingUp },
  { to: '/installments', label: 'Installments', icon: ReceiptText },
  { to: '/assets', label: 'Assets & Properties', icon: Gem },
  { to: '/profit-loss', label: 'Monthly P&L', icon: Scale },
  { to: '/people', label: 'People', icon: Users },
  { to: '/bills', label: 'Bills & Subscriptions', icon: CreditCard },
  { to: '/documents', label: 'Documents', icon: FileText, badge: 'docs' },
  { to: '/notes', label: 'Notes & Follow Up', icon: StickyNote, badge: 'notes' },
  { to: '/price-tracker', label: 'Price Tracker', icon: Tags },
  { to: '/shopping', label: 'Shopping Assistant', icon: ShoppingCart },
  { to: '/goals', label: 'Savings Goals', icon: PiggyBank },
  { to: '/categories', label: 'Categories', icon: FolderTree },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/ai-advisor', label: 'Family Advisor', icon: Sparkles },
  { to: '/ai-employees', label: 'AI Employees', icon: Bot },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const s = useStore()
  const { documents, notes, settings, accounts, transactions, transfers, loans, assets, bills, budgetItems, people } = s

  const [ask, setAsk] = useState(false)

  const badges: Record<string, number> = {
    docs: documents.filter((d) => docStatus(d.expiry) !== 'Valid').length,
    notes: notes.filter((n) => !n.done && n.status === 'Pending').length,
  }

  const reporting = settings.baseCurrency
  const toReport = (a: number, c: Currency) => convert(a, c, reporting)
  const show = (v: number) => money(convert(v, reporting, 'AED'))
  const snap = useMemo(
    () => buildSnapshot({ today: TODAY, settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people: people.map((p) => p.name), toReport, fx: convert }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, accounts, transactions, transfers, loans, assets, bills, documents, notes, budgetItems, people],
  )
  const { tier, score, tiers } = snap.status

  return (
    <aside className="h-full w-[228px] shrink-0 bg-white border-r border-[#e8edf5] flex flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <CloudBasketMark className="h-9 w-auto shrink-0" />
          <div className="leading-tight min-w-0">
            <p className="text-[15.5px] font-extrabold tracking-tight truncate">
              <span className="text-slate-900">CloudBasket</span>
              <span className="text-brand-600"> 360</span>
            </p>
            <p className="text-[9.5px] text-slate-400 font-medium truncate">Your Money. Smarter Life.</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scroll-thin px-2.5 pb-2">
        {NAV.filter((n) => canOpen(useStore.getState().membership, n.to)).map(({ to, label, icon: Icon, ...rest }) => {
          const count = 'badge' in rest && rest.badge ? badges[rest.badge as string] : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest ? rest.end : false}
              onClick={onNavigate}
              title={label}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold transition-all',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/25'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? 'text-white shrink-0' : 'text-slate-400 group-hover:text-slate-600 shrink-0'} />
                  <span className="flex-1 truncate">{label}</span>
                  {count > 0 && (
                    <span
                      className={`h-4 min-w-4 px-1 grid place-items-center rounded-full text-[9.5px] font-bold shrink-0 ${
                        isActive ? 'bg-white/25 text-white' : 'bg-rose-500 text-white'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-2.5 pt-0">
        <NavLink
          to="/"
          onClick={onNavigate}
          className={`group relative block rounded-2xl overflow-hidden shadow-md bg-gradient-to-br ${tierTone(tier, tiers)} p-3.5`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[9.5px] font-bold text-white/75 uppercase tracking-wide">My Financial Status</p>
            {hasGemini && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAsk(true) }}
                title="Ask CloudBasket 360 about your money"
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-white/30 transition cursor-pointer"
              >
                <Sparkles size={9} /> Ask
              </button>
            )}
          </div>
          <p className="text-[16px] font-extrabold text-white leading-tight mt-1 truncate">{tier.label}</p>
          <p className="text-[10.5px] text-white/85 mt-1">
            {score}/100 · Available {show(snap.availableFunds)}
          </p>
        </NavLink>
        <p className="mt-2 text-center text-[9.5px] text-slate-300">v1.0.0</p>
      </div>

      <AskModal open={ask} onClose={() => setAsk(false)} />
    </aside>
  )
}
