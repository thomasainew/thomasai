import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthGate } from '@/components/AuthGate'
import Dashboard from '@/pages/Dashboard'
import Accounts from '@/pages/Accounts'
import Income from '@/pages/Income'
import Expenses from '@/pages/Expenses'
import ExpenseReport from '@/pages/ExpenseReport'
import Categories from '@/pages/Categories'
import Budget from '@/pages/Budget'
import Loans from '@/pages/Loans'
import People from '@/pages/People'
import Bills from '@/pages/Bills'
import Documents from '@/pages/Documents'
import Notes from '@/pages/Notes'
import PriceTracker from '@/pages/PriceTracker'
import Shopping from '@/pages/Shopping'
import Goals from '@/pages/Goals'
import Reports from '@/pages/Reports'
import CalendarPage from '@/pages/CalendarPage'
import AIAdvisor from '@/pages/AIAdvisor'
import TrainAdvisors from '@/pages/TrainAdvisors'
import SettingsPage from '@/pages/SettingsPage'

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
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
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="ai-advisor" element={<AIAdvisor />} />
            <Route path="ai-advisor/train" element={<TrainAdvisors />} />
            <Route path="categories" element={<Categories />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthGate>
  )
}
