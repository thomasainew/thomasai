import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthGate } from '@/components/AuthGate'
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Accounts = lazy(() => import('@/pages/Accounts'))
const Income = lazy(() => import('@/pages/Income'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const ExpenseReport = lazy(() => import('@/pages/ExpenseReport'))
const Categories = lazy(() => import('@/pages/Categories'))
const Budget = lazy(() => import('@/pages/Budget'))
const Loans = lazy(() => import('@/pages/Loans'))
const People = lazy(() => import('@/pages/People'))
const Bills = lazy(() => import('@/pages/Bills'))
const Documents = lazy(() => import('@/pages/Documents'))
const Notes = lazy(() => import('@/pages/Notes'))
const PriceTracker = lazy(() => import('@/pages/PriceTracker'))
const Shopping = lazy(() => import('@/pages/Shopping'))
const Goals = lazy(() => import('@/pages/Goals'))
const Reports = lazy(() => import('@/pages/Reports'))
const ProfitLoss = lazy(() => import('@/pages/ProfitLoss'))
const Assets = lazy(() => import('@/pages/Assets'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const AIAdvisor = lazy(() => import('@/pages/AIAdvisor'))
const TrainAdvisors = lazy(() => import('@/pages/TrainAdvisors'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
        <Suspense fallback={<div className="p-10 text-center text-[13px] text-slate-400">Loading…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="income" element={<Income />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="expense-report" element={<ExpenseReport />} />
            {/* Purchases merged into the expense report; keep old links working. */}
            <Route path="purchases" element={<Navigate to="/expense-report" replace />} />
            <Route path="budget" element={<Budget />} />
            <Route path="loans" element={<Loans />} />
            <Route path="people" element={<People />} />
            <Route path="bills" element={<Bills />} />
            <Route path="documents" element={<Documents />} />
            <Route path="notes" element={<Notes />} />
            <Route path="price-tracker" element={<PriceTracker />} />
            <Route path="shopping" element={<Shopping />} />
            <Route path="goals" element={<Goals />} />
            <Route path="reports" element={<Reports />} />
            <Route path="profit-loss" element={<ProfitLoss />} />
            <Route path="assets" element={<Assets />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="ai-advisor" element={<AIAdvisor />} />
            <Route path="ai-advisor/train" element={<TrainAdvisors />} />
            <Route path="categories" element={<Categories />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </Suspense>
      </HashRouter>
    </AuthGate>
  )
}
