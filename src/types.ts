export type Currency = 'AED' | 'INR' | 'USD'

export type AccountType = 'bank' | 'cash' | 'savings' | 'investment' | 'card' | 'loan'

export interface Account {
  id: string
  name: string
  type: AccountType
  details: string
  balance: number
  currency: Currency
  status: 'Active' | 'Available' | 'Closed'
  color: string
  bank?: string
  /** Whose account this is, for households tracking more than one person's accounts. */
  owner?: string
  /** Cards only: day of month the statement closes (25 = period runs 26th–25th). */
  statementDay?: number
  /** Cards only: day of the following month the payment falls due. */
  dueDay?: number
  /**
   * Balance on the day tracking began. The shown `balance` is always
   * opening + everything in the ledger, so it can never drift from the
   * transactions. Debt accounts (card, loan) hold what you OWE as a positive.
   */
  openingBalance?: number
  /** False until the owner has confirmed the opening figure (see Balance check). */
  openingConfirmed?: boolean
  /** Cards only: the credit limit, so available credit can be shown apart from debt. */
  creditLimit?: number
  /** Key into src/data/banks.ts, used to style the account as a bank card. */
  bankStyle?: string
}

export type TxnType = 'income' | 'expense'

/**
 * What a transaction means beyond its direction:
 *  - normal          ordinary income or expense
 *  - refund          money back for an earlier purchase — reverses spending, is not income
 *  - asset_purchase  buys something kept as an asset — cash leaves, but it is not a household expense
 */
export type TxnKind = 'normal' | 'refund' | 'asset_purchase'

export interface Transaction {
  id: string
  type: TxnType
  date: string // yyyy-MM-dd
  description: string
  category: string
  accountId: string
  amount: number
  currency: Currency
  person?: string
  method?: string
  notes?: string
  /** Merchant the money went to. Drives the by-store breakdown. */
  store?: string
  /** Units bought. `amount` is always the line total, so unit price is amount / qty. */
  qty?: number
  /** Warranty length in months, for purchases worth tracking afterwards. */
  warrantyMonths?: number
  /** Narrower classification within `category`, e.g. Groceries → Rice. */
  subcategory?: string
  /** How much product was bought, in `weightUnit`. Independent of `qty`. */
  weight?: number
  weightUnit?: WeightUnit
  kind?: TxnKind
  /** Lines from one supermarket receipt share this id. Absent = a stand-alone entry. */
  receiptId?: string
  brand?: string
  /** Size of one pack, in `packUnit` — with `qty` this gives the total quantity bought. */
  packSize?: number
  packUnit?: PackUnit
  /** Refunds point at the purchase they reverse, when known. */
  refundOf?: string
  /** The smart-budget item this payment settled. Links, never duplicates. */
  budgetItemId?: string
  assetId?: string
}

export type PackUnit = 'g' | 'kg' | 'ml' | 'L' | 'pcs'
export const PACK_UNITS: PackUnit[] = ['pcs', 'g', 'kg', 'ml', 'L']

/** Units allowed for `Transaction.weight`, matching the database constraint. */
export type WeightUnit = 'kg' | 'g' | 'lb' | 'oz' | 'L' | 'ml'
export const WEIGHT_UNITS: WeightUnit[] = ['kg', 'g', 'lb', 'oz', 'L', 'ml']

export interface BudgetCategory {
  id: string
  name: string
  icon: string
  budget: number
  /** Currency the limit above is denominated in. `spent` is always base-currency. */
  currency?: Currency
  spent: number
  color: string
  /** How often `budget` applies. Spend tracking is always monthly regardless. */
  period?: 'Monthly' | 'Weekly' | 'Yearly'
  /** Wires this budget to one of your own categories, for exact spend matching. */
  categoryName?: string
  subcategoryName?: string
  /** When false, transactions never auto-post to this budget's spend. */
  autoMatch?: boolean
  /** Roll unspent amount into next month's budget. Not yet applied automatically. */
  rollover?: boolean
  /** Percent of budget at which a warning appears. */
  alertThreshold?: number
}

export interface Loan {
  id: string
  name: string
  lender: string
  outstanding: number
  principal: number
  emi: number
  nextPayment: string
  currency: Currency
  status: 'On Track' | 'Due Soon' | 'Overdue' | 'Closed'
  rate: number
  icon: string
  /** The loan account this borrowing sits on. When set, `outstanding` is derived from it. */
  accountId?: string
  startDate?: string
}

export interface Person {
  id: string
  name: string
  relation: string
  color: string
  spent: number
  theyOwe: number
  iOwe: number
  phone?: string
  /** Small avatar image as a data URL. Optional — falls back to a colour initial. */
  photo?: string
}

export interface Bill {
  id: string
  name: string
  category: string
  amount: number
  dueDate: string
  frequency: 'Monthly' | 'Quarterly' | 'Yearly' | 'Weekly'
  status: 'Paid' | 'Pending' | 'Overdue'
  autopay: boolean
  icon: string
}

export interface Doc {
  id: string
  name: string
  type: string
  expiry: string
  owner: string
  status: 'Valid' | 'Expiring Soon' | 'Expired'
  icon: string
  /** Path inside the private `cloudbasket` storage bucket, when a file is attached. */
  storagePath?: string
  fileName?: string
  mimeType?: string
  sizeBytes?: number
  uploadedAt?: string
  links?: DocLink[]
  /** What renewing costs, if known — feeds the smart budget. Never guessed. */
  renewalCost?: number
  renewalCurrency?: Currency
}

export interface DocLink {
  kind: 'transaction' | 'account' | 'loan' | 'asset' | 'property'
  id: string
}

/** One dated payment inside a note / follow-up, e.g. a college-fee instalment. */
export interface Installment {
  id: string
  label: string
  dueDate: string
  amount: number
  currency: Currency
  /** Days before the due date to remind. */
  remindDays?: number
  /** Set once a payment is matched or recorded; the instalment is then Paid. */
  paidTxnId?: string
  paidAmount?: number
  paidDate?: string
}

export interface Note {
  id: string
  title: string
  category: 'Personal' | 'Work' | 'Family' | 'Car' | 'Loan'
  dueDate: string
  status: 'Pending' | 'In Progress' | 'Planned' | 'Done'
  done: boolean
  /** Who the commitment is for, e.g. the child whose fees these are. */
  person?: string
  /** A single amount, when the note is a one-off commitment. */
  amount?: number
  currency?: Currency
  feeCategory?: string
  /** Multiple dated payments under this one record. */
  schedule?: Installment[]
  /** Interest or extra charge on top of the schedule/amount — informational, shown alongside the total. */
  extraCharge?: number
  /** When false, this note's amount/schedule is a reminder only and never affects the monthly budget or forecast. Defaults to true. */
  autoAddToBudget?: boolean
}

export interface Goal {
  id: string
  name: string
  target: number
  saved: number
  deadline: string
  icon: string
  color: string
}

export interface Purchase {
  id: string
  item: string
  store: string
  category: string
  price: number
  qty: number
  date: string
  person: string
  status: 'Planned' | 'Ordered' | 'Delivered' | 'Returned'
  warrantyMonths?: number
  notes?: string
}

export interface PriceWatch {
  id: string
  item: string
  store: string
  current: number
  previous: number
  target: number
  updated: string
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemeColor = 'blue' | 'emerald' | 'violet' | 'rose' | 'amber' | 'slate'
export type CardStyle = 'soft' | 'flat' | 'glass'
/** Dashboard card density — a single, app-wide choice rather than per-card resizing. */
export type CardSize = 'Compact' | 'Standard' | 'Wide' | 'Full'

/** Colour used for a category of figure wherever this app deliberately reads it from the theme. */
export interface CategoryColors {
  budget: string
  income: string
  loan: string
  installment: string
}

/** Colour used for a Financial Forecast / Financial Status situation label. */
export interface StatusColors {
  healthy: string
  stable: string
  tight: string
  warning: string
  deficit: string
}

/** One line of the shopping list. Kept in settings so it follows you across devices. */
export interface ShoppingListItem {
  id: string
  name: string
  /** Packs (or units) planned. */
  qty: number
  /** Price per pack used for the estimate, and the date that price is from. */
  price?: number
  priceDate?: string
  currency?: Currency
  brand?: string
  store?: string
  bought?: boolean
}

export interface StatusTier {
  /** Free-form slug — the tier set is user-editable, not fixed to three stages. */
  key: string
  label: string
  /** Score (0–100) at which this tier starts. */
  from: number
  photo?: string
}

export interface FamilyAdvisorProfile {
  /** What the advisor calls the user. */
  callMeBy: string
  /** What the user calls the advisor, e.g. "Achachan". */
  advisorName: string
  /** Only answer when the user addresses the advisor by name. */
  answerOnlyWhenAddressed: boolean
  character: string
  preferences: string
  familyNeeds: string
  goals: string
  responseStyle: string
}

/** Settings introduced after v1, kept in one JSON column so they sync as a unit. */
export interface SettingsExtra {
  theme?: {
    mode: ThemeMode; color: ThemeColor; cardStyle: CardStyle
    cardSize?: CardSize; categoryColors?: CategoryColors; statusColors?: StatusColors
  }
  profilePhoto?: string
  statusTiers?: StatusTier[]
  advisorProfile?: FamilyAdvisorProfile
  shoppingList?: ShoppingListItem[]
  /** Rates into AED, and the date they were set. */
  fx?: { rates: Record<string, number>; date: string; source: string }
  /** Net worth at the previous visit, to show the change since then. */
  lastVisit?: { date: string; netWorth: number; prev?: { date: string; netWorth: number } }
  /** Step-2 login security verification. Off by default until questions exist and this is not explicitly false. */
  security?: { enabled: boolean }
  /** Planned budget for a future month (yyyy-MM → base-currency amount), overriding the flat monthly budget in the Financial Forecast. */
  futureBudgets?: Record<string, number>
  /** Planned/expected income for a future month (yyyy-MM → base-currency amount), overriding the averaged estimate in the Financial Forecast. */
  futureIncome?: Record<string, number>
  /** Configurable AI "employee" characters — see src/pages/AIEmployees.tsx. */
  aiEmployees?: AIEmployee[]
}

export interface Settings {
  extra?: SettingsExtra
  userName: string
  accountLabel: string
  phone: string
  baseCurrency: Currency
  monthlyIncomeTarget: number
  monthlyBudget: number
  periodStart: string
  periodEnd: string
}

export type CategoryKind = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  icon: string
  color: string
  sort: number
}

export type AdvisorSpeaker = 'user' | 'achachan' | 'chachan'

/** A persona's own photo and personality notes — see src/pages/TrainAdvisors.tsx. */
export interface AdvisorPersona {
  id: 'achachan' | 'chachan'
  name: string
  photo?: string
  /** Guided question-and-answer pairs about this character, folded into the prompt. */
  qa?: { question: string; answer: string }[]
  /** Anything else, free text — folded into this persona's Gemini prompt alongside qa. */
  instructions?: string
}

/** One line in the AI Advisor chat — see src/pages/AIAdvisor.tsx. */
export interface AdvisorMessage {
  id: string
  from: AdvisorSpeaker
  text: string
  at: string
}

export interface Subcategory {
  id: string
  categoryId: string
  name: string
  sort: number
}

export type TransferPurpose =
  | 'Loan payment' | 'Credit card payment' | 'Cash withdrawal' | 'Family transfer' | 'Loan drawdown' | 'Other'

/** What a transfer is, which decides how the ledger and P&L treat it. */
export type TransferKind = 'transfer' | 'drawdown' | 'repayment' | 'card_payment'

/**
 * A movement of value between two of your own accounts (or into a loan).
 * Never income or expense — see src/lib/accounting.ts for the accounting rule.
 */
export interface Transfer {
  id: string
  date: string
  fromAccountId: string
  toKind: 'account' | 'loan'
  toId: string
  amount: number
  currency: Currency
  purpose: TransferPurpose
  notes?: string
  kind?: TransferKind
  /** Loan repayments: the part of `amount` that is interest. Interest and fees are expenses. */
  interest?: number
  fees?: number
}

export interface Receipt {
  id: string
  date: string
  store: string
  accountId?: string
  person?: string
  method?: string
  currency: Currency
  notes?: string
}

export interface ItemAlias {
  id: string
  alias: string
  canonical: string
}

export type AssetCategory =
  | 'Property' | 'Land' | 'Gold' | 'Vehicle' | 'Mobile & Electronics' | 'Investment' | 'Other' | (string & {})

export interface Asset {
  id: string
  name: string
  category: AssetCategory
  owner?: string
  purchaseDate?: string
  purchasePrice?: number
  currency: Currency
  /** Estimated value of the WHOLE asset (not just the owner's share). */
  currentValue: number
  /** The user's share, in percent. */
  ownershipPct: number
  linkedLoanId?: string
  valuationDate?: string
  /** Paths in the private storage bucket. */
  photos: string[]
  attachments: string[]
  notes?: string
  /** Gold: { grams, karat, makingCharges, manualRate }. */
  meta?: Record<string, any>
}

export interface AssetValuation {
  id: string
  assetId: string
  date: string
  value: number
  currency: Currency
  source: 'manual' | 'gold-rate' | 'purchase'
  note?: string
  rate?: number
}

export interface GoldRate {
  id: string
  date: string
  perGram24k: number
  currency: Currency
  source: string
  manual: boolean
  fetchedAt: string
}

export type BudgetItemStatus = 'Suggested' | 'Planned' | 'Paid' | 'Overdue' | 'Dismissed'
export type BudgetItemSource = 'loan' | 'bill' | 'document' | 'note' | 'schedule' | 'manual'

/** One line of a monthly smart budget. Planned and actual amounts are kept apart. */
export interface BudgetItem {
  id: string
  month: string
  name: string
  category: string
  /** Planned amount. Undefined = unknown; the user must enter it, it is never invented. */
  amount?: number
  currency: Currency
  dueDate?: string
  person?: string
  sourceKind: BudgetItemSource
  sourceId?: string
  /** Stable identity of what this item came from — the de-duplication key. */
  sourceKey: string
  status: BudgetItemStatus
  txnId?: string
  paidAmount?: number
  notes?: string
}

export type VerificationStatus = 'Active' | 'Draft'

/** One admin-configured "which person…" login security question. See src/pages/settings/VerificationTab.tsx. */
export interface VerificationQuestion {
  id: string
  question: string
  /** Background scene shown behind the photo grid, e.g. 'Airport'. Decorative only. */
  scene: string
  /** Person.id of the correct answer. Never sent to the browser before it answers — see security-verify. */
  correctPersonId: string
  /** Other Person.id options shown alongside the correct one. */
  otherPersonIds: string[]
  status: VerificationStatus
  numberOfChoices: number
  shufflePositions: boolean
  randomize: boolean
  avoidRepeatLast: boolean
  lastUsedAt?: string
  timesShown: number
  timesCorrect: number
}

/** One row of the "Login Attempts" log, read-only — written by the security-verify edge function. */
export interface VerificationAttempt {
  id: string
  memberId: string
  memberName: string
  questionId: string
  questionText: string
  selectedPersonId: string
  correct: boolean
  at: string
}

export type IncomeCategory = 'Salary' | 'Other' | 'Variable' | 'One-Time' | 'Bonus' | (string & {})
export type IncomeFrequency = 'Monthly' | 'Quarterly' | 'Yearly' | 'One-Time'

/**
 * A PLANNED/expected income — salary, recurring or future — kept apart from
 * the actual transactions on the Income page. This is what the Financial
 * Forecast and My Financial Status project forward for months that have not
 * happened yet. See src/lib/income.ts.
 */
export interface IncomeSource {
  id: string
  name: string
  category: IncomeCategory
  amount: number
  currency: Currency
  frequency: IncomeFrequency
  /** First month this applies from (yyyy-MM-dd). */
  startDate: string
  /** Last month it applies to, inclusive — open-ended if unset. */
  endDate?: string
  person?: string
  active: boolean
  notes?: string
}

/** A configurable AI "employee" — see src/pages/AIEmployees.tsx. Text-only for now: no live voice or live research. */
export interface AIEmployee {
  id: string
  name: string
  role: string
  personality?: string
  knowledgeArea?: string
  /** Reply language, e.g. 'English', 'Malayalam', 'Arabic', 'Hindi'. */
  language: string
  avatar: string // an emoji, or a data URL photo
  active: boolean
}

/** One line of chat with an AI employee. Kept locally only (not synced to the cloud) for now. */
export interface EmployeeMessage {
  id: string
  employeeId: string
  from: 'user' | 'employee'
  text: string
  at: string
}

export interface HouseholdMember {
  memberId: string
  name: string
  email: string
  personName?: string
  active: boolean
  canEdit: boolean
  sections: string[]
  accountIds?: string[] | null
}
