import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Account, AdvisorMessage, AdvisorPersona, Asset, AssetValuation, Bill, BudgetCategory, BudgetItem, Category, Doc,
  EmployeeMessage, Goal, GoldRate, HouseholdMember, IncomeSource, ItemAlias, Loan, Note, Person, PriceWatch, Receipt,
  Settings, Subcategory, Transaction, Transfer, VerificationQuestion,
} from '@/types'
import {
  ACCOUNTS, BILLS, BUDGETS, DOCUMENTS, GOALS, LOANS, NOTES, PEOPLE, PRICE_WATCH, SETTINGS, TRANSACTIONS,
} from '@/data/seed'
import { convert, setBaseCurrency, setFxRates, uid } from '@/lib/format'
import { freezeOpenings, withDerivedBalances, withDerivedLoans, transferPrincipal, round2 } from '@/lib/ledger'
import { methodFor } from '@/lib/accounting'
import { DEFAULT_CATEGORIES } from '@/data/categories'
import type { Analysis } from '@/lib/gemini'
import { hasSupabase } from '@/lib/supabase'
import { deleteRow, upsertRow, upsertSettings, type RemoteData, type SessionContext } from '@/lib/sync'
import type { Collection } from '@/lib/mappers'

/** A recorded payment. With `loanId`, it is a repayment towards that loan rather than an expense. */
export interface PaymentInput { accountId: string; date: string; amount: number; loanId?: string; interest?: number }

interface State {
  // ---- data
  settings: Settings
  accounts: Account[]
  transactions: Transaction[]
  transfers: Transfer[]
  advisorMessages: AdvisorMessage[]
  advisorPersonas: AdvisorPersona[]
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
  receipts: Receipt[]
  itemAliases: ItemAlias[]
  assets: Asset[]
  assetValuations: AssetValuation[]
  goldRates: GoldRate[]
  budgetItems: BudgetItem[]
  verificationQuestions: VerificationQuestion[]
  incomeSources: IncomeSource[]
  /** Chat with AI employees — kept in this browser only, not synced to the cloud (see AIEmployees.tsx). */
  employeeMessages: EmployeeMessage[]

  // ---- household / schema (set at sign-in, never persisted)
  schemaV2: boolean
  schemaV3: boolean
  schemaV4: boolean
  ownerId: string | null
  membership: HouseholdMember | null
  setContext: (c: SessionContext) => void

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

  addTransaction: (t: Omit<Transaction, 'id'>) => string
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransaction: (id: string) => void
  /** Save one supermarket receipt: a header plus its item lines, all sharing one receipt id. */
  addReceipt: (header: Omit<Receipt, 'id'>, lines: Omit<Transaction, 'id' | 'receiptId'>[]) => string
  updateReceipt: (id: string, patch: Partial<Receipt>) => void
  removeReceipt: (id: string) => void

  /** Double-entry movement between accounts (or into a loan) — never income or expense. */
  addTransfer: (t: Omit<Transfer, 'id'>) => string
  updateTransfer: (id: string, patch: Partial<Transfer>) => void
  removeTransfer: (id: string) => void

  addItemAlias: (a: Omit<ItemAlias, 'id'>) => void
  removeItemAlias: (id: string) => void

  addAsset: (a: Omit<Asset, 'id'>, firstValuation?: boolean) => string
  updateAsset: (id: string, patch: Partial<Asset>) => void
  removeAsset: (id: string) => void
  /** Record a new estimated whole-asset value, keeping the history. */
  addValuation: (v: Omit<AssetValuation, 'id'>) => void
  removeValuation: (id: string) => void
  addGoldRate: (g: Omit<GoldRate, 'id'>) => void

  /**
   * Record a decision about one item of a month's smart budget — approve,
   * dismiss, edit, mark paid, or add a manual one. Creates the stored row on
   * first use; later calls update it (one row per month + source, always).
   */
  saveBudgetItem: (month: string, sourceKey: string, patch: Partial<BudgetItem>, base?: Partial<BudgetItem>) => void
  /** Pay one instalment of a note's schedule: records the expense and marks both records. */
  payInstallment: (noteId: string, installmentId: string, p: PaymentInput) => string | null
  /** Record a payment for a smart-budget item that has no schedule (EMI, bill, renewal, manual). */
  payBudgetItem: (item: { month: string; sourceKey: string; name: string; category: string; currency: Transaction['currency']; person?: string; sourceKind: BudgetItem['sourceKind']; sourceId?: string }, p: { accountId: string; date: string; amount: number }) => string | null
  addBudgetItem: (b: Omit<BudgetItem, 'id'>) => void
  /** Insert items whose sourceKey is not already in that month — the de-dupe guard. */
  addBudgetItems: (items: Omit<BudgetItem, 'id'>[]) => number
  updateBudgetItem: (id: string, patch: Partial<BudgetItem>) => void
  removeBudgetItem: (id: string) => void

  addAdvisorMessage: (m: Omit<AdvisorMessage, 'id'>) => void
  clearAdvisorMessages: () => void
  upsertAdvisorPersona: (p: AdvisorPersona) => void

  addVerificationQuestion: (q: Omit<VerificationQuestion, 'id' | 'timesShown' | 'timesCorrect'>) => void
  updateVerificationQuestion: (id: string, patch: Partial<VerificationQuestion>) => void
  removeVerificationQuestion: (id: string) => void

  addIncomeSource: (s: Omit<IncomeSource, 'id'>) => void
  updateIncomeSource: (id: string, patch: Partial<IncomeSource>) => void
  removeIncomeSource: (id: string) => void

  addEmployeeMessage: (m: Omit<EmployeeMessage, 'id'>) => void
  clearEmployeeMessages: (employeeId: string) => void

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
  advisorMessages: [] as AdvisorMessage[],
  advisorPersonas: [] as AdvisorPersona[],
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
  receipts: [] as Receipt[],
  itemAliases: [] as ItemAlias[],
  assets: [] as Asset[],
  assetValuations: [] as AssetValuation[],
  goldRates: [] as GoldRate[],
  budgetItems: [] as BudgetItem[],
  verificationQuestions: [] as VerificationQuestion[],
  incomeSources: [] as IncomeSource[],
  employeeMessages: [] as EmployeeMessage[],
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

/** May this session write? A read-only family member may not. */
function canWrite() {
  const m = useStore.getState().membership
  return !m || m.canEdit
}

/**
 * Re-derive every account balance (and every linked loan's outstanding) from
 * opening balances plus the ledger, then push whatever changed. Called after
 * ANY change to transactions, transfers, accounts or loans, so a balance is
 * always exactly what the records say — never a number nudged up and down.
 */
function recompute() {
  const s = useStore.getState()
  const accounts = withDerivedBalances(s.accounts, s.transactions, s.transfers, s.loans, convert)
  const loans = withDerivedLoans(s.loans, accounts, convert)

  const accChanged = accounts.filter((a, i) => a.balance !== s.accounts[i]?.balance)
  const loanChanged = loans.filter(
    (l, i) => l.outstanding !== s.loans[i]?.outstanding || l.status !== s.loans[i]?.status,
  )
  if (!accChanged.length && !loanChanged.length) return

  useStore.setState({ accounts, loans })
  if (canWrite()) {
    accChanged.forEach((a) => push('accounts', a))
    loanChanged.forEach((l) => push('loans', l))
  }
}

/**
 * Legacy loans that are not linked to a loan account have no ledger to derive
 * from, so a repayment still lowers their outstanding balance directly.
 */
function nudgeLegacyLoan(loanId: string, delta: number) {
  const loan = useStore.getState().loans.find((l) => l.id === loanId)
  if (!loan || loan.accountId || !delta) return
  const outstanding = Math.max(0, round2(loan.outstanding + delta))
  const loans = useStore.getState().loans.map((l) =>
    l.id === loanId
      ? { ...l, outstanding, status: outstanding <= 0 ? ('Closed' as const) : l.status === 'Closed' ? ('On Track' as const) : l.status }
      : l,
  )
  useStore.setState({ loans })
  push('loans', loans.find((l) => l.id === loanId))
}

/** A payment that was matched to a budget item stops counting when its transaction is deleted. */
function unlinkBudgetPayment(txnId: string) {
  const s = useStore.getState()
  const hit = s.budgetItems.filter((b) => b.txnId === txnId)
  if (hit.length) {
    const budgetItems = s.budgetItems.map((b) => (b.txnId === txnId ? { ...b, txnId: undefined, paidAmount: undefined, status: 'Planned' as const } : b))
    useStore.setState({ budgetItems })
    hit.forEach((b) => push('budgetItems', budgetItems.find((x) => x.id === b.id)))
  }
  const notes = s.notes.map((n) =>
    n.schedule?.some((i) => i.paidTxnId === txnId)
      ? { ...n, schedule: n.schedule.map((i) => (i.paidTxnId === txnId ? { ...i, paidTxnId: undefined, paidAmount: undefined, paidDate: undefined } : i)) }
      : n,
  )
  const changed = notes.filter((n, i) => n !== s.notes[i])
  if (changed.length) {
    useStore.setState({ notes })
    changed.forEach((n) => push('notes', n))
  }
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

      schemaV2: false,
      schemaV3: false,
      schemaV4: false,
      ownerId: null,
      membership: null,
      setContext: (c) => set({ schemaV2: c.schemaV2, schemaV3: c.schemaV3, schemaV4: c.schemaV4, ownerId: c.ownerId, membership: c.membership }),

      setSession: (userId, userEmail) => set({ userId, userEmail }),
      hydrate: (data) => {
        setBaseCurrency(data.settings.baseCurrency)
        if (data.settings.extra?.fx?.rates) setFxRates(data.settings.extra.fx.rates)

        // Accounts made before opening balances existed get one worked out from
        // their stored balance (see freezeOpenings), then every balance is
        // re-derived from the ledger — so a stale or drifted number is replaced
        // by what the transactions actually add up to, once confirmed.
        const txns = data.transactions
        const transfers = data.transfers ?? []
        const frozen = freezeOpenings(data.accounts, txns, transfers, data.loans, convert)
        const accounts = withDerivedBalances(frozen, txns, transfers, data.loans, convert)
        const loans = withDerivedLoans(data.loans, accounts, convert)

        set({
          settings: data.settings,
          accounts,
          transactions: data.transactions,
          transfers,
          receipts: data.receipts ?? [],
          itemAliases: data.itemAliases ?? [],
          assets: data.assets ?? [],
          assetValuations: data.assetValuations ?? [],
          goldRates: data.goldRates ?? [],
          budgetItems: data.budgetItems ?? [],
          verificationQuestions: data.verificationQuestions ?? [],
          incomeSources: data.incomeSources ?? [],
          advisorMessages: data.advisorMessages ?? [],
          advisorPersonas: data.advisorPersonas ?? [],
          budgets: data.budgets,
          loans,
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

        // Persist opening balances / corrected balances that differ from what the
        // database held, so every device converges on the same figures.
        if (canWrite() && cloudOn()) {
          accounts.forEach((a, i) => {
            const before = data.accounts[i]
            if (
              a.balance !== before.balance ||
              a.openingBalance !== before.openingBalance ||
              a.openingConfirmed !== before.openingConfirmed
            )
              push('accounts', a)
          })
          loans.forEach((l, i) => {
            if (l.outstanding !== data.loans[i].outstanding || l.status !== data.loans[i].status) push('loans', l)
          })
        }
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
      // Balances are derived, so every change below just recomputes them —
      // editing or deleting a transaction can never leave a balance behind.
      addTransaction: (t) => {
        const item = { ...t, id: uid('t') }
        set({ transactions: [item, ...get().transactions] })
        push('transactions', item)
        recompute()
        return item.id
      },
      updateTransaction: (id, patch) => {
        set({ transactions: patchList(get().transactions, id, patch, 'transactions') })
        recompute()
      },
      removeTransaction: (id) => {
        const gone = get().transactions.find((t) => t.id === id)
        set({ transactions: get().transactions.filter((t) => t.id !== id) })
        drop('transactions', id)
        unlinkBudgetPayment(id)
        // A receipt with no items left is just an empty header — remove it too.
        if (gone?.receiptId && !get().transactions.some((t) => t.receiptId === gone.receiptId)) {
          set({ receipts: get().receipts.filter((r) => r.id !== gone.receiptId) })
          drop('receipts', gone.receiptId)
        }
        recompute()
      },

      addReceipt: (header, lines) => {
        const receipt = { ...header, id: uid('rc') }
        set({ receipts: [receipt, ...get().receipts] })
        push('receipts', receipt)
        const items = lines.map((l) => ({ ...l, id: uid('t'), receiptId: receipt.id }))
        set({ transactions: [...items, ...get().transactions] })
        items.forEach((i) => push('transactions', i))
        recompute()
        return receipt.id
      },
      updateReceipt: (id, patch) => {
        set({ receipts: patchList(get().receipts, id, patch, 'receipts') })
        // The header's store/date/account/person apply to every line on it.
        const lineFields: Partial<Transaction> = {}
        if (patch.store !== undefined) lineFields.store = patch.store
        if (patch.date !== undefined) lineFields.date = patch.date
        if (patch.accountId !== undefined) lineFields.accountId = patch.accountId
        if (patch.person !== undefined) lineFields.person = patch.person
        if (patch.method !== undefined) lineFields.method = patch.method
        if (Object.keys(lineFields).length) {
          const txns = get().transactions.map((t) => (t.receiptId === id ? { ...t, ...lineFields } : t))
          set({ transactions: txns })
          txns.filter((t) => t.receiptId === id).forEach((t) => push('transactions', t))
        }
        recompute()
      },
      removeReceipt: (id) => {
        const lines = get().transactions.filter((t) => t.receiptId === id)
        set({
          receipts: get().receipts.filter((r) => r.id !== id),
          transactions: get().transactions.filter((t) => t.receiptId !== id),
        })
        drop('receipts', id)
        lines.forEach((t) => {
          drop('transactions', t.id)
          unlinkBudgetPayment(t.id)
        })
        recompute()
      },

      // ----------------------------------------------------------- transfers
      addTransfer: (t) => {
        const item = { ...t, id: uid('tr') }
        set({ transfers: [item, ...get().transfers] })
        push('transfers', item)
        if (item.toKind === 'loan') nudgeLegacyLoan(item.toId, -transferPrincipal(item))
        recompute()
        return item.id
      },
      updateTransfer: (id, patch) => {
        const before = get().transfers.find((t) => t.id === id)
        set({ transfers: patchList(get().transfers, id, patch, 'transfers') })
        const after = get().transfers.find((t) => t.id === id)
        if (before?.toKind === 'loan') nudgeLegacyLoan(before.toId, transferPrincipal(before))
        if (after?.toKind === 'loan') nudgeLegacyLoan(after.toId, -transferPrincipal(after))
        recompute()
      },
      removeTransfer: (id) => {
        const item = get().transfers.find((t) => t.id === id)
        set({ transfers: get().transfers.filter((t) => t.id !== id) })
        drop('transfers', id)
        if (item?.toKind === 'loan') nudgeLegacyLoan(item.toId, transferPrincipal(item))
        // An instalment settled by this repayment is unpaid again.
        for (const n of get().notes) {
          if (!n.schedule?.some((i) => i.paidTransferId === id)) continue
          get().updateNote(n.id, {
            schedule: n.schedule.map((i) =>
              i.paidTransferId === id ? { ...i, paidTransferId: undefined, paidLoanId: undefined, paidAmount: undefined, paidDate: undefined } : i,
            ),
          })
        }
        recompute()
      },

      // ---------------------------------------------------------- item aliases
      addItemAlias: (a) => {
        const item = { ...a, id: uid('al') }
        set({ itemAliases: [...get().itemAliases.filter((x) => x.alias !== a.alias), item] })
        push('itemAliases', item)
      },
      removeItemAlias: (id) => {
        set({ itemAliases: get().itemAliases.filter((x) => x.id !== id) })
        drop('itemAliases', id)
      },

      // ----------------------------------------------------------------- assets
      addAsset: (a, firstValuation = true) => {
        const item = { ...a, id: uid('as') }
        set({ assets: [...get().assets, item] })
        push('assets', item)
        if (firstValuation && a.currentValue > 0) {
          get().addValuation({
            assetId: item.id, date: a.valuationDate ?? a.purchaseDate ?? new Date().toISOString().slice(0, 10),
            value: a.currentValue, currency: a.currency, source: 'manual', note: 'Initial value',
          })
        }
        return item.id
      },
      updateAsset: (id, patch) => set({ assets: patchList(get().assets, id, patch, 'assets') }),
      removeAsset: (id) => {
        const vals = get().assetValuations.filter((v) => v.assetId === id)
        set({
          assets: get().assets.filter((a) => a.id !== id),
          assetValuations: get().assetValuations.filter((v) => v.assetId !== id),
        })
        drop('assets', id)
        vals.forEach((v) => drop('assetValuations', v.id))
      },
      addValuation: (v) => {
        const item = { ...v, id: uid('av') }
        set({ assetValuations: [...get().assetValuations, item] })
        push('assetValuations', item)
        // The asset always shows its latest valuation; older ones stay in history.
        const asset = get().assets.find((a) => a.id === v.assetId)
        const latest = [...get().assetValuations, item]
          .filter((x) => x.assetId === v.assetId)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        if (asset && latest && (asset.currentValue !== latest.value || asset.valuationDate !== latest.date)) {
          set({ assets: patchList(get().assets, asset.id, { currentValue: latest.value, valuationDate: latest.date }, 'assets') })
        }
      },
      removeValuation: (id) => {
        set({ assetValuations: get().assetValuations.filter((v) => v.id !== id) })
        drop('assetValuations', id)
      },
      addGoldRate: (g) => {
        const item = { ...g, id: uid('gr') }
        set({ goldRates: [...get().goldRates, item] })
        push('goldRates', item)
      },

      // ---------------------------------------------------------- budget items
      saveBudgetItem: (month, sourceKey, patch, base = {}) => {
        const cur = get().budgetItems.find((b) => b.month === month && b.sourceKey === sourceKey)
        if (cur) {
          set({ budgetItems: patchList(get().budgetItems, cur.id, patch, 'budgetItems') })
          return
        }
        const item: BudgetItem = {
          id: uid('bi'), month, sourceKey, name: '', category: 'Other', currency: 'AED', sourceKind: 'manual',
          status: 'Planned', ...base, ...patch,
        }
        set({ budgetItems: [...get().budgetItems, item] })
        push('budgetItems', item)
      },
      payInstallment: (noteId, installmentId, p) => {
        const note = get().notes.find((n) => n.id === noteId)
        const inst = note?.schedule?.find((i) => i.id === installmentId)
        const account = get().accounts.find((a) => a.id === p.accountId)
        if (!note || !inst || !account) return null
        if (p.loanId) {
          // Paid towards a loan: a repayment transfer from the paying account
          // into the loan, which lowers what is owed. Only interest is an expense.
          const transferId = get().addTransfer({
            date: p.date, fromAccountId: p.accountId, toKind: 'loan', toId: p.loanId, amount: p.amount,
            currency: inst.currency, purpose: 'Loan payment', kind: 'repayment',
            interest: p.interest && p.interest > 0 ? Math.min(p.interest, p.amount) : undefined,
            notes: `${note.title} — ${inst.label}`,
          })
          const schedule = (note.schedule ?? []).map((i) =>
            i.id === installmentId
              ? { ...i, paidTxnId: undefined, paidTransferId: transferId, paidLoanId: p.loanId, paidAmount: p.amount, paidDate: p.date }
              : i,
          )
          get().updateNote(noteId, { schedule })
          return transferId
        }
        const txnId = get().addTransaction({
          type: 'expense', date: p.date, description: `${note.title} — ${inst.label}`,
          category: note.feeCategory ?? 'Education', accountId: p.accountId, amount: p.amount, currency: inst.currency,
          person: note.person, method: methodFor(account.type),
          budgetItemId: `${inst.dueDate.slice(0, 7)}|sched:${noteId}:${installmentId}`,
        })
        // The schedule and the transaction now point at each other; the expense exists once.
        const schedule = (note.schedule ?? []).map((i) =>
          i.id === installmentId ? { ...i, paidTxnId: txnId, paidAmount: p.amount, paidDate: p.date } : i,
        )
        get().updateNote(noteId, { schedule })
        return txnId
      },
      payBudgetItem: (item, p) => {
        const account = get().accounts.find((a) => a.id === p.accountId)
        if (!account) return null
        const txnId = get().addTransaction({
          type: 'expense', date: p.date, description: item.name, category: item.category, accountId: p.accountId,
          amount: p.amount, currency: item.currency, person: item.person, method: methodFor(account.type),
          budgetItemId: `${item.month}|${item.sourceKey}`,
        })
        get().saveBudgetItem(item.month, item.sourceKey, { status: 'Paid', txnId, paidAmount: p.amount }, {
          name: item.name, category: item.category, currency: item.currency, sourceKind: item.sourceKind, sourceId: item.sourceId,
        })
        return txnId
      },
      addBudgetItem: (b) => {
        get().addBudgetItems([b])
      },
      addBudgetItems: (items) => {
        const have = new Set(get().budgetItems.map((b) => `${b.month}|${b.sourceKey}`))
        const fresh: BudgetItem[] = []
        for (const b of items) {
          const key = `${b.month}|${b.sourceKey}`
          if (have.has(key)) continue // already in this month: never duplicate
          have.add(key)
          fresh.push({ ...b, id: uid('bi') })
        }
        if (!fresh.length) return 0
        set({ budgetItems: [...get().budgetItems, ...fresh] })
        fresh.forEach((b) => push('budgetItems', b))
        return fresh.length
      },
      updateBudgetItem: (id, patch) => set({ budgetItems: patchList(get().budgetItems, id, patch, 'budgetItems') }),
      removeBudgetItem: (id) => {
        set({ budgetItems: get().budgetItems.filter((b) => b.id !== id) })
        drop('budgetItems', id)
      },

      // ------------------------------------------------------- ai advisor chat
      addAdvisorMessage: (m) => {
        const item = { ...m, id: uid('adv') }
        set({ advisorMessages: [...get().advisorMessages, item] })
        push('advisorMessages', item)
      },
      clearAdvisorMessages: () => {
        get().advisorMessages.forEach((m) => drop('advisorMessages', m.id))
        set({ advisorMessages: [] })
      },
      upsertAdvisorPersona: (p) => {
        set({ advisorPersonas: [...get().advisorPersonas.filter((x) => x.id !== p.id), p] })
        push('advisorPersonas', p)
      },

      // ------------------------------------------------ verification questions
      addVerificationQuestion: (q) => {
        const item: VerificationQuestion = { ...q, id: uid('vq'), timesShown: 0, timesCorrect: 0 }
        set({ verificationQuestions: [...get().verificationQuestions, item] })
        push('verificationQuestions', item)
      },
      updateVerificationQuestion: (id, patch) =>
        set({ verificationQuestions: patchList(get().verificationQuestions, id, patch, 'verificationQuestions') }),
      removeVerificationQuestion: (id) => {
        set({ verificationQuestions: get().verificationQuestions.filter((q) => q.id !== id) })
        drop('verificationQuestions', id)
      },

      // ------------------------------------------------------- income sources
      addIncomeSource: (s) => {
        const item: IncomeSource = { ...s, id: uid('inc') }
        set({ incomeSources: [...get().incomeSources, item] })
        push('incomeSources', item)
      },
      updateIncomeSource: (id, patch) => set({ incomeSources: patchList(get().incomeSources, id, patch, 'incomeSources') }),
      removeIncomeSource: (id) => {
        set({ incomeSources: get().incomeSources.filter((s) => s.id !== id) })
        drop('incomeSources', id)
      },

      // ------------------------------------------------- AI employee chat (local only)
      addEmployeeMessage: (m) => {
        const item = { ...m, id: uid('em') }
        set({ employeeMessages: [...get().employeeMessages, item] })
      },
      clearEmployeeMessages: (employeeId) => {
        set({ employeeMessages: get().employeeMessages.filter((m) => m.employeeId !== employeeId) })
      },

      // -------------------------------------------------------------- accounts
      addAccount: (a) => {
        // What the form calls "balance" is the opening balance; the shown
        // balance is derived from it plus the ledger from then on.
        const opening = a.openingBalance ?? a.balance ?? 0
        const item = { ...a, id: uid('ac'), openingBalance: opening, openingConfirmed: true, balance: opening }
        set({ accounts: [...get().accounts, item] })
        push('accounts', item)
      },
      updateAccount: (id, patch) => {
        // `balance` is never written directly any more — it is derived.
        const { balance: _ignored, ...rest } = patch
        void _ignored
        set({ accounts: patchList(get().accounts, id, rest, 'accounts') })
        recompute()
      },
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
        recompute()
      },
      updateLoan: (id, patch) => {
        set({ loans: patchList(get().loans, id, patch, 'loans') })
        recompute()
      },
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
        if (!state) return
        setBaseCurrency(state.settings.baseCurrency)
        if (state.settings.extra?.fx?.rates) setFxRates(state.settings.extra.fx.rates)
        // Cached data is settled the same way as cloud data: opening balances are
        // worked out for old accounts, then every balance is re-derived.
        queueMicrotask(() => {
          const s = useStore.getState()
          useStore.setState({ accounts: freezeOpenings(s.accounts, s.transactions, s.transfers, s.loans, convert) })
          recompute()
        })
      },
      // Session fields are owned by Supabase auth, never by localStorage.
      partialize: (s) => {
        const {
          userId, userEmail, syncing, syncError, lastSynced, analysing, analysisError,
          schemaV2, schemaV3, schemaV4, ownerId, membership, ...data
        } = s
        void userId; void userEmail; void syncing; void syncError; void lastSynced
        void analysing; void analysisError; void schemaV2; void schemaV3; void schemaV4; void ownerId; void membership
        return data
      },
    },
  ),
)
