import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Account, Bill, BudgetCategory, Category, Doc, Goal, Loan, Note, Person, PriceWatch, Settings,
  Subcategory, Transaction, Transfer,
} from '@/types'
import {
  ACCOUNTS, BILLS, BUDGETS, DOCUMENTS, GOALS, LOANS, NOTES, PEOPLE, PRICE_WATCH, SETTINGS, TRANSACTIONS,
} from '@/data/seed'
import { setBaseCurrency, uid } from '@/lib/format'
import { accountDelta, round2 } from '@/lib/accounting'
import { DEFAULT_CATEGORIES } from '@/data/categories'
import type { Analysis } from '@/lib/gemini'
import { hasSupabase } from '@/lib/supabase'
import { deleteRow, upsertRow, upsertSettings, type RemoteData } from '@/lib/sync'
import type { Collection } from '@/lib/mappers'

interface State {
  // ---- data
  settings: Settings
  accounts: Account[]
  transactions: Transaction[]
  transfers: Transfer[]
  budgets: BudgetCategory[]
  loans: Loan[]
  people: Person[]
  bills: Bill[]
  documents: Doc[]
  notes: Note[]
  goals: Goal[]
  priceWatch: PriceWatch[]
  categories: Category[]
  subcategories: Subcategory[]

  // ---- cloud session
  // ---- AI spending analysis (cached; regenerated on demand)
  analysis: Analysis | null
  analysing: boolean
  analysisError: string | null
  setAnalysis: (a: Analysis | null) => void
  setAnalysing: (v: boolean) => void
  setAnalysisError: (msg: string | null) => void

  userId: string | null
  userEmail: string | null
  syncing: boolean
  syncError: string | null
  lastSynced: string | null

  setSession: (userId: string | null, email: string | null) => void
  hydrate: (data: RemoteData) => void
  setSyncing: (v: boolean) => void
  setSyncError: (msg: string | null) => void

  updateSettings: (patch: Partial<Settings>) => void

  addTransaction: (t: Omit<Transaction, 'id'>) => void
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransaction: (id: string) => void

  /** Double-entry movement between accounts (or into a loan) — never income or expense. */
  addTransfer: (t: Omit<Transfer, 'id'>) => void
  removeTransfer: (id: string) => void

  addAccount: (a: Omit<Account, 'id'>) => void
  updateAccount: (id: string, patch: Partial<Account>) => void
  removeAccount: (id: string) => void

  addBudget: (b: Omit<BudgetCategory, 'id'>) => void
  updateBudget: (id: string, patch: Partial<BudgetCategory>) => void
  removeBudget: (id: string) => void

  addLoan: (l: Omit<Loan, 'id'>) => void
  updateLoan: (id: string, patch: Partial<Loan>) => void
  removeLoan: (id: string) => void

  addPerson: (p: Omit<Person, 'id'>) => void
  updatePerson: (id: string, patch: Partial<Person>) => void
  removePerson: (id: string) => void

  addBill: (b: Omit<Bill, 'id'>) => void
  updateBill: (id: string, patch: Partial<Bill>) => void
  removeBill: (id: string) => void
  payBill: (id: string) => void

  addDocument: (d: Omit<Doc, 'id'>) => void
  updateDocument: (id: string, patch: Partial<Doc>) => void
  removeDocument: (id: string) => void

  addNote: (n: Omit<Note, 'id'>) => void
  updateNote: (id: string, patch: Partial<Note>) => void
  removeNote: (id: string) => void
  toggleNote: (id: string) => void

  addGoal: (g: Omit<Goal, 'id'>) => void
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void
  contributeGoal: (id: string, amount: number) => void


  addCategory: (c: Omit<Category, 'id'>) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  removeCategory: (id: string) => void

  addSubcategory: (s: Omit<Subcategory, 'id'>) => void
  updateSubcategory: (id: string, patch: Partial<Subcategory>) => void
  removeSubcategory: (id: string) => void

  /** Write the built-in starter category set into the user's own list. */
  installDefaultCategories: () => void

  addPriceWatch: (p: Omit<PriceWatch, 'id'>) => void
  updatePriceWatch: (id: string, patch: Partial<PriceWatch>) => void
  removePriceWatch: (id: string) => void

  /** Empty every collection, locally. */
  clearAllData: () => void
  /** Wipe locally cached rows back to the seed set (used on sign-out). */
  clearLocalData: () => void
}

const seedState = () => ({
  settings: SETTINGS,
  accounts: ACCOUNTS,
  transactions: TRANSACTIONS,
  transfers: [] as Transfer[],
  budgets: BUDGETS,
  loans: LOANS,
  people: PEOPLE,
  bills: BILLS,
  documents: DOCUMENTS,
  notes: NOTES,
  goals: GOALS,
  priceWatch: PRICE_WATCH,
  categories: [],
  subcategories: [],
})

// ---------------------------------------------------------------------------
// Write-through helpers. The UI updates optimistically; the network call runs
// in the background and only surfaces if it fails, so nothing ever blocks on it.
// ---------------------------------------------------------------------------

function cloudOn() {
  return hasSupabase && Boolean(useStore.getState().userId)
}

function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  useStore.setState({ syncError: msg })
}

function ok() {
  useStore.setState({ syncError: null, lastSynced: new Date().toISOString() })
}

function push(collection: Collection, item: unknown) {
  if (!cloudOn() || !item) return
  upsertRow(collection, item, useStore.getState().userId!).then(ok, fail)
}

function drop(collection: Collection, id: string) {
  if (!cloudOn()) return
  deleteRow(collection, id).then(ok, fail)
}

/** Apply a patch to one item in a list, push the merged result, return the list. */
function patchList<T extends { id: string }>(
  list: T[],
  id: string,
  patch: Partial<T>,
  collection: Collection,
): T[] {
  const next = list.map((x) => (x.id === id ? { ...x, ...patch } : x))
  push(collection, next.find((x) => x.id === id))
  return next
}

/**
 * Move `delta` onto one account's balance and push the result. Every place
 * that changes an account's balance because of a transaction or transfer
 * goes through here, so "the account balance" and "what actually happened"
 * can never drift apart — see the FINAL ACCOUNTING RULE in the corrections spec.
 */
function applyAccountDelta(accountId: string, delta: number) {
  if (!delta) return
  const accounts = useStore.getState().accounts.map((a) =>
    a.id === accountId ? { ...a, balance: round2(a.balance + delta) } : a,
  )
  useStore.setState({ accounts })
  push('accounts', accounts.find((a) => a.id === accountId))
}

/** Reduce a loan's outstanding balance by `amount` and push the result. */
function applyLoanDelta(loanId: string, delta: number) {
  if (!delta) return
  const loans = useStore.getState().loans.map((l) =>
    l.id === loanId
      ? { ...l, outstanding: Math.max(0, round2(l.outstanding + delta)), status: l.outstanding + delta <= 0 ? ('Closed' as const) : l.status === 'Closed' ? ('On Track' as const) : l.status }
      : l,
  )
  useStore.setState({ loans })
  push('loans', loans.find((l) => l.id === loanId))
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seedState(),

      analysis: null,
      analysing: false,
      analysisError: null,
      setAnalysis: (analysis) => set({ analysis, analysisError: null }),
      setAnalysing: (analysing) => set({ analysing }),
      setAnalysisError: (analysisError) => set({ analysisError, analysing: false }),

      userId: null,
      userEmail: null,
      syncing: false,
      syncError: null,
      lastSynced: null,

      setSession: (userId, userEmail) => set({ userId, userEmail }),
      hydrate: (data) => {
        setBaseCurrency(data.settings.baseCurrency)
        set({
          settings: data.settings,
          accounts: data.accounts,
          transactions: data.transactions,
          transfers: data.transfers ?? [],
          budgets: data.budgets,
          loans: data.loans,
          people: data.people,
          bills: data.bills,
          documents: data.documents,
          notes: data.notes,
          goals: data.goals,
          priceWatch: data.priceWatch,
          categories: data.categories ?? [],
          subcategories: data.subcategories ?? [],
          lastSynced: new Date().toISOString(),
          syncError: null,
        })
      },
      setSyncing: (syncing) => set({ syncing }),
      setSyncError: (syncError) => set({ syncError }),

      updateSettings: (patch) => {
        const settings = { ...get().settings, ...patch }
        setBaseCurrency(settings.baseCurrency)
        set({ settings })
        if (cloudOn()) upsertSettings(settings, get().userId!).then(ok, fail)
      },

      // ---------------------------------------------------------- transactions
      addTransaction: (t) => {
        const item = { ...t, id: uid('t') }
        set({ transactions: [item, ...get().transactions] })
        push('transactions', item)
        const account = get().accounts.find((a) => a.id === item.accountId)
        if (account) applyAccountDelta(account.id, accountDelta(item.type, account.type, item.amount))
      },
      updateTransaction: (id, patch) => {
        const before = get().transactions.find((t) => t.id === id)
        set({ transactions: patchList(get().transactions, id, patch, 'transactions') })
        if (!before) return
        const after = { ...before, ...patch }
        // Reverse the old posting, then apply the new one — same account or
        // not, amount changed or not, this always lands on the right balance.
        const prevAccount = get().accounts.find((a) => a.id === before.accountId)
        if (prevAccount) applyAccountDelta(prevAccount.id, -accountDelta(before.type, prevAccount.type, before.amount))
        const nextAccount = get().accounts.find((a) => a.id === after.accountId)
        if (nextAccount) applyAccountDelta(nextAccount.id, accountDelta(after.type, nextAccount.type, after.amount))
      },
      removeTransaction: (id) => {
        const item = get().transactions.find((t) => t.id === id)
        set({ transactions: get().transactions.filter((t) => t.id !== id) })
        drop('transactions', id)
        if (!item) return
        const account = get().accounts.find((a) => a.id === item.accountId)
        if (account) applyAccountDelta(account.id, -accountDelta(item.type, account.type, item.amount))
      },

      // ----------------------------------------------------------- transfers
      addTransfer: (t) => {
        const item = { ...t, id: uid('tr') }
        set({ transfers: [item, ...get().transfers] })
        push('transfers', item)

        const from = get().accounts.find((a) => a.id === item.fromAccountId)
        if (from) applyAccountDelta(from.id, -item.amount)

        if (item.toKind === 'loan') {
          applyLoanDelta(item.toId, -item.amount)
        } else {
          const to = get().accounts.find((a) => a.id === item.toId)
          if (to) applyAccountDelta(to.id, to.type === 'card' ? -item.amount : item.amount)
        }
      },
      removeTransfer: (id) => {
        const item = get().transfers.find((t) => t.id === id)
        set({ transfers: get().transfers.filter((t) => t.id !== id) })
        drop('transfers', id)
        if (!item) return

        const from = get().accounts.find((a) => a.id === item.fromAccountId)
        if (from) applyAccountDelta(from.id, item.amount)

        if (item.toKind === 'loan') {
          applyLoanDelta(item.toId, item.amount)
        } else {
          const to = get().accounts.find((a) => a.id === item.toId)
          if (to) applyAccountDelta(to.id, to.type === 'card' ? item.amount : -item.amount)
        }
      },

      // -------------------------------------------------------------- accounts
      addAccount: (a) => {
        const item = { ...a, id: uid('ac') }
        set({ accounts: [...get().accounts, item] })
        push('accounts', item)
      },
      updateAccount: (id, patch) => set({ accounts: patchList(get().accounts, id, patch, 'accounts') }),
      removeAccount: (id) => {
        set({ accounts: get().accounts.filter((a) => a.id !== id) })
        drop('accounts', id)
      },

      // --------------------------------------------------------------- budgets
      addBudget: (b) => {
        const item = { ...b, id: uid('b') }
        set({ budgets: [...get().budgets, item] })
        push('budgets', item)
      },
      updateBudget: (id, patch) => set({ budgets: patchList(get().budgets, id, patch, 'budgets') }),
      removeBudget: (id) => {
        set({ budgets: get().budgets.filter((b) => b.id !== id) })
        drop('budgets', id)
      },

      // ----------------------------------------------------------------- loans
      addLoan: (l) => {
        const item = { ...l, id: uid('l') }
        set({ loans: [...get().loans, item] })
        push('loans', item)
      },
      updateLoan: (id, patch) => set({ loans: patchList(get().loans, id, patch, 'loans') }),
      removeLoan: (id) => {
        set({ loans: get().loans.filter((l) => l.id !== id) })
        drop('loans', id)
      },

      // ---------------------------------------------------------------- people
      addPerson: (p) => {
        const item = { ...p, id: uid('p') }
        set({ people: [...get().people, item] })
        push('people', item)
      },
      updatePerson: (id, patch) => set({ people: patchList(get().people, id, patch, 'people') }),
      removePerson: (id) => {
        set({ people: get().people.filter((p) => p.id !== id) })
        drop('people', id)
      },

      // ----------------------------------------------------------------- bills
      addBill: (b) => {
        const item = { ...b, id: uid('bl') }
        set({ bills: [...get().bills, item] })
        push('bills', item)
      },
      updateBill: (id, patch) => set({ bills: patchList(get().bills, id, patch, 'bills') }),
      removeBill: (id) => {
        set({ bills: get().bills.filter((b) => b.id !== id) })
        drop('bills', id)
      },
      payBill: (id) => set({ bills: patchList<Bill>(get().bills, id, { status: 'Paid' }, 'bills') }),

      // ------------------------------------------------------------- documents
      addDocument: (d) => {
        const item = { ...d, id: uid('d') }
        set({ documents: [...get().documents, item] })
        push('documents', item)
      },
      updateDocument: (id, patch) => set({ documents: patchList(get().documents, id, patch, 'documents') }),
      removeDocument: (id) => {
        set({ documents: get().documents.filter((d) => d.id !== id) })
        drop('documents', id)
      },

      // ----------------------------------------------------------------- notes
      addNote: (n) => {
        const item = { ...n, id: uid('n') }
        set({ notes: [item, ...get().notes] })
        push('notes', item)
      },
      updateNote: (id, patch) => set({ notes: patchList(get().notes, id, patch, 'notes') }),
      removeNote: (id) => {
        set({ notes: get().notes.filter((n) => n.id !== id) })
        drop('notes', id)
      },
      toggleNote: (id) => {
        const note = get().notes.find((n) => n.id === id)
        if (!note) return
        const done = !note.done
        set({
          notes: patchList<Note>(get().notes, id, { done, status: done ? 'Done' : 'Pending' }, 'notes'),
        })
      },

      // ----------------------------------------------------------------- goals
      addGoal: (g) => {
        const item = { ...g, id: uid('g') }
        set({ goals: [...get().goals, item] })
        push('goals', item)
      },
      updateGoal: (id, patch) => set({ goals: patchList(get().goals, id, patch, 'goals') }),
      removeGoal: (id) => {
        set({ goals: get().goals.filter((g) => g.id !== id) })
        drop('goals', id)
      },
      contributeGoal: (id, amount) => {
        const goal = get().goals.find((g) => g.id === id)
        if (!goal) return
        set({
          goals: patchList<Goal>(get().goals, id, { saved: Math.min(goal.target, goal.saved + amount) }, 'goals'),
        })
      },

      // ------------------------------------------------------------ categories
      addCategory: (c) => {
        const item = { ...c, id: uid('c') }
        set({ categories: [...get().categories, item] })
        push('categories', item)
      },
      updateCategory: (id, patch) => set({ categories: patchList(get().categories, id, patch, 'categories') }),
      removeCategory: (id) => {
        // The database cascades to sub-categories; mirror that locally.
        const kids = get().subcategories.filter((x) => x.categoryId === id)
        set({
          categories: get().categories.filter((c) => c.id !== id),
          subcategories: get().subcategories.filter((x) => x.categoryId !== id),
        })
        drop('categories', id)
        kids.forEach((k) => drop('subcategories', k.id))
      },

      addSubcategory: (sc) => {
        const item = { ...sc, id: uid('sc') }
        set({ subcategories: [...get().subcategories, item] })
        push('subcategories', item)
      },
      updateSubcategory: (id, patch) =>
        set({ subcategories: patchList(get().subcategories, id, patch, 'subcategories') }),
      removeSubcategory: (id) => {
        set({ subcategories: get().subcategories.filter((x) => x.id !== id) })
        drop('subcategories', id)
      },

      installDefaultCategories: () => {
        const existing = new Set(get().categories.map((c) => `${c.kind}:${c.name.toLowerCase()}`))
        const cats: Category[] = []
        const subs: Subcategory[] = []

        DEFAULT_CATEGORIES.forEach((d, i) => {
          if (existing.has(`${d.kind}:${d.name.toLowerCase()}`)) return
          const id = uid('c')
          cats.push({ id, name: d.name, kind: d.kind, icon: d.icon, color: d.color, sort: i })
          d.subs.forEach((n, j) => subs.push({ id: uid('sc'), categoryId: id, name: n, sort: j }))
        })
        if (!cats.length) return

        set({ categories: [...get().categories, ...cats], subcategories: [...get().subcategories, ...subs] })
        cats.forEach((c) => push('categories', c))
        subs.forEach((sc) => push('subcategories', sc))
      },

      // ----------------------------------------------------------- price watch
      addPriceWatch: (p) => {
        const item = { ...p, id: uid('pw') }
        set({ priceWatch: [...get().priceWatch, item] })
        push('priceWatch', item)
      },
      updatePriceWatch: (id, patch) => set({ priceWatch: patchList(get().priceWatch, id, patch, 'priceWatch') }),
      removePriceWatch: (id) => {
        set({ priceWatch: get().priceWatch.filter((p) => p.id !== id) })
        drop('priceWatch', id)
      },

      clearAllData: () => set(seedState()),
      clearLocalData: () => {
        setBaseCurrency(SETTINGS.baseCurrency)
        set({ ...seedState(), analysis: null, analysisError: null })
      },
    }),
    {
      name: 'thomas-finance-v1',
      onRehydrateStorage: () => (state) => {
        if (state) setBaseCurrency(state.settings.baseCurrency)
      },
      // Session fields are owned by Supabase auth, never by localStorage.
      partialize: (s) => {
        const { userId, userEmail, syncing, syncError, lastSynced, analysing, analysisError, ...data } = s
        void userId; void userEmail; void syncing; void syncError; void lastSynced
        void analysing; void analysisError
        return data
      },
    },
  ),
)
