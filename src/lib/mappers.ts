import type {
  Account, AdvisorMessage, AdvisorPersona, Asset, AssetValuation, Bill, BudgetCategory, BudgetItem, Category, Doc,
  Goal, GoldRate, IncomeSource, ItemAlias, Loan, Note, Person, PriceWatch, Receipt, Settings, Subcategory, Transaction,
  Transfer, VerificationQuestion,
} from '@/types'

/** Every syncable collection in the store, and the table that backs it. */
export const TABLES = {
  accounts: 'accounts',
  transactions: 'transactions',
  transfers: 'transfers',
  advisorMessages: 'advisor_messages',
  advisorPersonas: 'advisor_personas',
  budgets: 'budgets',
  loans: 'loans',
  people: 'people',
  bills: 'bills',
  documents: 'documents',
  notes: 'notes',
  goals: 'goals',
  priceWatch: 'price_watch',
  categories: 'categories',
  subcategories: 'subcategories',
  receipts: 'receipts',
  itemAliases: 'item_aliases',
  assets: 'assets',
  assetValuations: 'asset_valuations',
  goldRates: 'gold_rates',
  budgetItems: 'budget_items',
  verificationQuestions: 'verification_questions',
  incomeSources: 'income_sources',
} as const

/** Tables that only exist once migration 0015 has been run. */
export const V2_TABLES: Collection[] = ['receipts', 'itemAliases', 'assets', 'assetValuations', 'goldRates', 'budgetItems']

/** Tables that only exist once migration 0016 has been run. */
export const V3_TABLES: Collection[] = ['verificationQuestions', 'incomeSources']

/** Columns added to older tables by 0015 — stripped from writes until it has run. */
export const V2_COLUMNS: Partial<Record<Collection, string[]>> = {
  accounts: ['opening_balance', 'opening_confirmed', 'credit_limit', 'bank_style'],
  transactions: ['kind', 'receipt_id', 'brand', 'pack_size', 'pack_unit', 'refund_of', 'budget_item_id', 'asset_id'],
  transfers: ['kind', 'interest', 'fees'],
  loans: ['account_id', 'start_date'],
  documents: ['storage_path', 'file_name', 'mime_type', 'size_bytes', 'uploaded_at', 'links', 'renewal_cost', 'renewal_currency'],
  notes: ['schedule', 'person', 'amount', 'currency', 'fee_category'],
}

/** Columns added to older tables by 0016 — stripped from writes until it has run. */
export const V3_COLUMNS: Partial<Record<Collection, string[]>> = {
  notes: ['extra_charge', 'auto_add_to_budget'],
}

export type Collection = keyof typeof TABLES

type Row = Record<string, any>

const num = (v: any, fallback = 0) => (v == null || v === '' ? fallback : Number(v))

/**
 * Column mapping per collection. `to` builds the DB row (minus user_id, which
 * the sync layer stamps on), `from` rebuilds the domain object. Postgres numeric
 * can arrive as a string, so every numeric field goes through Number().
 */
export const MAPPERS: {
  [K in Collection]: { to: (o: any) => Row; from: (r: Row) => any }
} = {
  accounts: {
    to: (a: Account) => ({
      id: a.id, name: a.name, type: a.type, details: a.details, balance: a.balance,
      currency: a.currency, status: a.status, color: a.color, bank: a.bank ?? null,
      statement_day: a.statementDay ?? null, due_day: a.dueDay ?? null, owner: a.owner ?? null,
      opening_balance: a.openingBalance ?? null, opening_confirmed: a.openingConfirmed ?? false,
      credit_limit: a.creditLimit ?? null, bank_style: a.bankStyle ?? null,
    }),
    from: (r): Account => ({
      id: r.id, name: r.name, type: r.type, details: r.details, balance: num(r.balance),
      currency: r.currency, status: r.status, color: r.color, bank: r.bank ?? undefined,
      statementDay: r.statement_day == null ? undefined : num(r.statement_day),
      dueDay: r.due_day == null ? undefined : num(r.due_day),
      owner: r.owner ?? undefined,
      openingBalance: r.opening_balance == null ? undefined : num(r.opening_balance),
      openingConfirmed: Boolean(r.opening_confirmed),
      creditLimit: r.credit_limit == null ? undefined : num(r.credit_limit),
      bankStyle: r.bank_style ?? undefined,
    }),
  },

  transactions: {
    to: (t: Transaction) => ({
      id: t.id, type: t.type, date: t.date, description: t.description, category: t.category,
      account_id: t.accountId, amount: t.amount, currency: t.currency,
      person: t.person ?? null, method: t.method ?? null, notes: t.notes ?? null,
      store: t.store ?? null, qty: t.qty ?? null, warranty_months: t.warrantyMonths ?? null,
      subcategory: t.subcategory ?? null,
      weight: t.weight ?? null, weight_unit: t.weightUnit ?? null,
      kind: t.kind ?? 'normal', receipt_id: t.receiptId ?? null, brand: t.brand ?? null,
      pack_size: t.packSize ?? null, pack_unit: t.packUnit ?? null, refund_of: t.refundOf ?? null,
      budget_item_id: t.budgetItemId ?? null, asset_id: t.assetId ?? null,
    }),
    from: (r): Transaction => ({
      id: r.id, type: r.type, date: r.date, description: r.description, category: r.category,
      accountId: r.account_id ?? '', amount: num(r.amount), currency: r.currency,
      person: r.person ?? undefined, method: r.method ?? undefined, notes: r.notes ?? undefined,
      store: r.store ?? undefined,
      qty: r.qty == null ? undefined : num(r.qty),
      warrantyMonths: r.warranty_months == null ? undefined : num(r.warranty_months),
      subcategory: r.subcategory ?? undefined,
      weight: r.weight == null ? undefined : num(r.weight),
      weightUnit: r.weight_unit ?? undefined,
      kind: r.kind ?? 'normal', receiptId: r.receipt_id ?? undefined, brand: r.brand ?? undefined,
      packSize: r.pack_size == null ? undefined : num(r.pack_size), packUnit: r.pack_unit ?? undefined,
      refundOf: r.refund_of ?? undefined, budgetItemId: r.budget_item_id ?? undefined,
      assetId: r.asset_id ?? undefined,
    }),
  },

  transfers: {
    to: (t: Transfer) => ({
      id: t.id, date: t.date, from_account_id: t.fromAccountId, to_kind: t.toKind, to_id: t.toId,
      amount: t.amount, currency: t.currency, purpose: t.purpose, notes: t.notes ?? null,
      kind: t.kind ?? 'transfer', interest: t.interest ?? 0, fees: t.fees ?? 0,
    }),
    from: (r): Transfer => ({
      id: r.id, date: r.date, fromAccountId: r.from_account_id, toKind: r.to_kind, toId: r.to_id,
      amount: num(r.amount), currency: r.currency, purpose: r.purpose, notes: r.notes ?? undefined,
      kind: r.kind ?? 'transfer', interest: num(r.interest), fees: num(r.fees),
    }),
  },

  advisorMessages: {
    to: (m: AdvisorMessage) => ({ id: m.id, from: m.from, text: m.text, at: m.at }),
    from: (r): AdvisorMessage => ({ id: r.id, from: r.from, text: r.text, at: r.at }),
  },

  advisorPersonas: {
    to: (p: AdvisorPersona) => ({
      id: p.id, name: p.name, photo: p.photo ?? null, instructions: p.instructions ?? null, qa: p.qa ?? [],
    }),
    from: (r): AdvisorPersona => ({
      id: r.id, name: r.name, photo: r.photo ?? undefined, instructions: r.instructions ?? undefined,
      qa: Array.isArray(r.qa) ? r.qa : [],
    }),
  },

  budgets: {
    to: (b: BudgetCategory) => ({
      id: b.id, name: b.name, icon: b.icon, budget: b.budget, currency: b.currency ?? 'AED', spent: b.spent, color: b.color,
      period: b.period ?? 'Monthly', category_name: b.categoryName ?? null, subcategory_name: b.subcategoryName ?? null,
      auto_match: b.autoMatch ?? true, rollover: b.rollover ?? false, alert_threshold: b.alertThreshold ?? 80,
    }),
    from: (r): BudgetCategory => ({
      id: r.id, name: r.name, icon: r.icon, budget: num(r.budget), currency: r.currency ?? 'AED', spent: num(r.spent), color: r.color,
      period: r.period ?? 'Monthly', categoryName: r.category_name ?? undefined, subcategoryName: r.subcategory_name ?? undefined,
      autoMatch: r.auto_match ?? true, rollover: Boolean(r.rollover), alertThreshold: r.alert_threshold == null ? 80 : num(r.alert_threshold),
    }),
  },

  loans: {
    to: (l: Loan) => ({
      id: l.id, name: l.name, lender: l.lender, outstanding: l.outstanding, principal: l.principal,
      emi: l.emi, next_payment: l.nextPayment, currency: l.currency, status: l.status,
      rate: l.rate, icon: l.icon, account_id: l.accountId ?? null, start_date: l.startDate ?? null,
    }),
    from: (r): Loan => ({
      id: r.id, name: r.name, lender: r.lender, outstanding: num(r.outstanding),
      principal: num(r.principal), emi: num(r.emi), nextPayment: r.next_payment,
      currency: r.currency, status: r.status, rate: num(r.rate), icon: r.icon,
      accountId: r.account_id ?? undefined, startDate: r.start_date ?? undefined,
    }),
  },

  people: {
    to: (p: Person) => ({
      id: p.id, name: p.name, relation: p.relation, color: p.color, spent: p.spent,
      they_owe: p.theyOwe, i_owe: p.iOwe, phone: p.phone ?? null, photo: p.photo ?? null,
    }),
    from: (r): Person => ({
      id: r.id, name: r.name, relation: r.relation, color: r.color, spent: num(r.spent),
      theyOwe: num(r.they_owe), iOwe: num(r.i_owe), phone: r.phone ?? undefined, photo: r.photo ?? undefined,
    }),
  },

  bills: {
    to: (b: Bill) => ({
      id: b.id, name: b.name, category: b.category, amount: b.amount, due_date: b.dueDate,
      frequency: b.frequency, status: b.status, autopay: b.autopay, icon: b.icon,
    }),
    from: (r): Bill => ({
      id: r.id, name: r.name, category: r.category, amount: num(r.amount), dueDate: r.due_date,
      frequency: r.frequency, status: r.status, autopay: Boolean(r.autopay), icon: r.icon,
    }),
  },

  documents: {
    to: (d: Doc) => ({
      id: d.id, name: d.name, type: d.type, expiry: d.expiry, owner: d.owner, status: d.status, icon: d.icon,
      storage_path: d.storagePath ?? null, file_name: d.fileName ?? null, mime_type: d.mimeType ?? null,
      size_bytes: d.sizeBytes ?? null, uploaded_at: d.uploadedAt ?? null, links: d.links ?? [],
      renewal_cost: d.renewalCost ?? null, renewal_currency: d.renewalCurrency ?? null,
    }),
    from: (r): Doc => ({
      id: r.id, name: r.name, type: r.type, expiry: r.expiry, owner: r.owner, status: r.status, icon: r.icon,
      storagePath: r.storage_path ?? undefined, fileName: r.file_name ?? undefined, mimeType: r.mime_type ?? undefined,
      sizeBytes: r.size_bytes == null ? undefined : num(r.size_bytes), uploadedAt: r.uploaded_at ?? undefined,
      links: Array.isArray(r.links) ? r.links : [],
      renewalCost: r.renewal_cost == null ? undefined : num(r.renewal_cost),
      renewalCurrency: r.renewal_currency ?? undefined,
    }),
  },

  notes: {
    to: (n: Note) => ({
      id: n.id, title: n.title, category: n.category, due_date: n.dueDate, status: n.status, done: n.done,
      schedule: n.schedule ?? [], person: n.person ?? null, amount: n.amount ?? null,
      currency: n.currency ?? null, fee_category: n.feeCategory ?? null,
      extra_charge: n.extraCharge ?? null, auto_add_to_budget: n.autoAddToBudget ?? true,
    }),
    from: (r): Note => ({
      id: r.id, title: r.title, category: r.category, dueDate: r.due_date,
      status: r.status, done: Boolean(r.done),
      schedule: Array.isArray(r.schedule) ? r.schedule : [], person: r.person ?? undefined,
      amount: r.amount == null ? undefined : num(r.amount), currency: r.currency ?? undefined,
      feeCategory: r.fee_category ?? undefined,
      extraCharge: r.extra_charge == null ? undefined : num(r.extra_charge),
      autoAddToBudget: r.auto_add_to_budget ?? true,
    }),
  },

  goals: {
    to: (g: Goal) => ({
      id: g.id, name: g.name, target: g.target, saved: g.saved, deadline: g.deadline,
      icon: g.icon, color: g.color,
    }),
    from: (r): Goal => ({
      id: r.id, name: r.name, target: num(r.target), saved: num(r.saved), deadline: r.deadline,
      icon: r.icon, color: r.color,
    }),
  },

  categories: {
    to: (c: Category) => ({
      id: c.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color, sort: c.sort,
    }),
    from: (r): Category => ({
      id: r.id, name: r.name, kind: r.kind, icon: r.icon, color: r.color, sort: num(r.sort),
    }),
  },

  subcategories: {
    to: (s: Subcategory) => ({
      id: s.id, category_id: s.categoryId, name: s.name, sort: s.sort,
    }),
    from: (r): Subcategory => ({
      id: r.id, categoryId: r.category_id, name: r.name, sort: num(r.sort),
    }),
  },

  receipts: {
    to: (r: Receipt) => ({
      id: r.id, date: r.date, store: r.store, account_id: r.accountId ?? null, person: r.person ?? null,
      method: r.method ?? null, currency: r.currency, notes: r.notes ?? null,
    }),
    from: (r): Receipt => ({
      id: r.id, date: r.date, store: r.store ?? '', accountId: r.account_id ?? undefined, person: r.person ?? undefined,
      method: r.method ?? undefined, currency: r.currency, notes: r.notes ?? undefined,
    }),
  },

  itemAliases: {
    to: (a: ItemAlias) => ({ id: a.id, alias: a.alias, canonical: a.canonical }),
    from: (r): ItemAlias => ({ id: r.id, alias: r.alias, canonical: r.canonical }),
  },

  assets: {
    to: (a: Asset) => ({
      id: a.id, name: a.name, category: a.category, owner: a.owner ?? null,
      purchase_date: a.purchaseDate ?? null, purchase_price: a.purchasePrice ?? null, currency: a.currency,
      current_value: a.currentValue, ownership_pct: a.ownershipPct, linked_loan_id: a.linkedLoanId ?? null,
      valuation_date: a.valuationDate ?? null, photos: a.photos ?? [], attachments: a.attachments ?? [],
      notes: a.notes ?? null, meta: a.meta ?? {},
    }),
    from: (r): Asset => ({
      id: r.id, name: r.name, category: r.category, owner: r.owner ?? undefined,
      purchaseDate: r.purchase_date ?? undefined,
      purchasePrice: r.purchase_price == null ? undefined : num(r.purchase_price), currency: r.currency,
      currentValue: num(r.current_value), ownershipPct: num(r.ownership_pct, 100),
      linkedLoanId: r.linked_loan_id ?? undefined, valuationDate: r.valuation_date ?? undefined,
      photos: Array.isArray(r.photos) ? r.photos : [], attachments: Array.isArray(r.attachments) ? r.attachments : [],
      notes: r.notes ?? undefined, meta: r.meta ?? {},
    }),
  },

  assetValuations: {
    to: (v: AssetValuation) => ({
      id: v.id, asset_id: v.assetId, date: v.date, value: v.value, currency: v.currency,
      source: v.source, note: v.note ?? null, rate: v.rate ?? null,
    }),
    from: (r): AssetValuation => ({
      id: r.id, assetId: r.asset_id, date: r.date, value: num(r.value), currency: r.currency,
      source: r.source, note: r.note ?? undefined, rate: r.rate == null ? undefined : num(r.rate),
    }),
  },

  goldRates: {
    to: (g: GoldRate) => ({
      id: g.id, date: g.date, per_gram_24k: g.perGram24k, currency: g.currency, source: g.source,
      manual: g.manual, fetched_at: g.fetchedAt,
    }),
    from: (r): GoldRate => ({
      id: r.id, date: r.date, perGram24k: num(r.per_gram_24k), currency: r.currency, source: r.source,
      manual: Boolean(r.manual), fetchedAt: r.fetched_at,
    }),
  },

  budgetItems: {
    to: (b: BudgetItem) => ({
      id: b.id, month: b.month, name: b.name, category: b.category, amount: b.amount ?? null, currency: b.currency,
      due_date: b.dueDate ?? null, person: b.person ?? null, source_kind: b.sourceKind, source_id: b.sourceId ?? null,
      source_key: b.sourceKey, status: b.status, txn_id: b.txnId ?? null, paid_amount: b.paidAmount ?? null,
      notes: b.notes ?? null,
    }),
    from: (r): BudgetItem => ({
      id: r.id, month: r.month, name: r.name, category: r.category,
      amount: r.amount == null ? undefined : num(r.amount), currency: r.currency, dueDate: r.due_date ?? undefined,
      person: r.person ?? undefined, sourceKind: r.source_kind, sourceId: r.source_id ?? undefined,
      sourceKey: r.source_key, status: r.status, txnId: r.txn_id ?? undefined,
      paidAmount: r.paid_amount == null ? undefined : num(r.paid_amount), notes: r.notes ?? undefined,
    }),
  },

  priceWatch: {
    to: (p: PriceWatch) => ({
      id: p.id, item: p.item, store: p.store, current_price: p.current,
      previous_price: p.previous, target_price: p.target, updated: p.updated,
    }),
    from: (r): PriceWatch => ({
      id: r.id, item: r.item, store: r.store, current: num(r.current_price),
      previous: num(r.previous_price), target: num(r.target_price), updated: r.updated,
    }),
  },

  verificationQuestions: {
    to: (q: VerificationQuestion) => ({
      id: q.id, question: q.question, scene: q.scene, correct_person_id: q.correctPersonId,
      other_person_ids: q.otherPersonIds ?? [], status: q.status, number_of_choices: q.numberOfChoices,
      shuffle_positions: q.shufflePositions, randomize: q.randomize, avoid_repeat_last: q.avoidRepeatLast,
      last_used_at: q.lastUsedAt ?? null, times_shown: q.timesShown ?? 0, times_correct: q.timesCorrect ?? 0,
    }),
    from: (r): VerificationQuestion => ({
      id: r.id, question: r.question, scene: r.scene ?? 'Airport', correctPersonId: r.correct_person_id,
      otherPersonIds: Array.isArray(r.other_person_ids) ? r.other_person_ids : [],
      status: r.status ?? 'Draft', numberOfChoices: num(r.number_of_choices, 12),
      shufflePositions: r.shuffle_positions ?? true, randomize: r.randomize ?? true,
      avoidRepeatLast: r.avoid_repeat_last ?? true, lastUsedAt: r.last_used_at ?? undefined,
      timesShown: num(r.times_shown), timesCorrect: num(r.times_correct),
    }),
  },

  incomeSources: {
    to: (s: IncomeSource) => ({
      id: s.id, name: s.name, category: s.category, amount: s.amount, currency: s.currency, frequency: s.frequency,
      start_date: s.startDate, end_date: s.endDate ?? null, person: s.person ?? null, active: s.active, notes: s.notes ?? null,
    }),
    from: (r): IncomeSource => ({
      id: r.id, name: r.name, category: r.category, amount: num(r.amount), currency: r.currency, frequency: r.frequency,
      startDate: r.start_date, endDate: r.end_date ?? undefined, person: r.person ?? undefined,
      active: r.active ?? true, notes: r.notes ?? undefined,
    }),
  },
}

export const settingsMapper = {
  to: (s: Settings) => ({
    user_name: s.userName,
    account_label: s.accountLabel,
    phone: s.phone,
    base_currency: s.baseCurrency,
    monthly_income_target: s.monthlyIncomeTarget,
    monthly_budget: s.monthlyBudget,
    period_start: s.periodStart,
    period_end: s.periodEnd,
    extra: s.extra ?? {},
  }),
  from: (r: Row): Settings => ({
    userName: r.user_name,
    accountLabel: r.account_label,
    phone: r.phone ?? '',
    baseCurrency: r.base_currency,
    monthlyIncomeTarget: num(r.monthly_income_target),
    monthlyBudget: num(r.monthly_budget),
    periodStart: r.period_start,
    periodEnd: r.period_end,
    extra: r.extra && typeof r.extra === 'object' ? r.extra : {},
  }),
}
