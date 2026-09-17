import type {
  Account, AdvisorMessage, Bill, BudgetCategory, Category, Doc, Goal, Loan, Note, Person, PriceWatch,
  Settings, Subcategory, Transaction, Transfer,
} from '@/types'

/** Every syncable collection in the store, and the table that backs it. */
export const TABLES = {
  accounts: 'accounts',
  transactions: 'transactions',
  transfers: 'transfers',
  advisorMessages: 'advisor_messages',
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
} as const

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
    }),
    from: (r): Account => ({
      id: r.id, name: r.name, type: r.type, details: r.details, balance: num(r.balance),
      currency: r.currency, status: r.status, color: r.color, bank: r.bank ?? undefined,
      statementDay: r.statement_day == null ? undefined : num(r.statement_day),
      dueDay: r.due_day == null ? undefined : num(r.due_day),
      owner: r.owner ?? undefined,
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
    }),
  },

  transfers: {
    to: (t: Transfer) => ({
      id: t.id, date: t.date, from_account_id: t.fromAccountId, to_kind: t.toKind, to_id: t.toId,
      amount: t.amount, currency: t.currency, purpose: t.purpose, notes: t.notes ?? null,
    }),
    from: (r): Transfer => ({
      id: r.id, date: r.date, fromAccountId: r.from_account_id, toKind: r.to_kind, toId: r.to_id,
      amount: num(r.amount), currency: r.currency, purpose: r.purpose, notes: r.notes ?? undefined,
    }),
  },

  advisorMessages: {
    to: (m: AdvisorMessage) => ({ id: m.id, from: m.from, text: m.text, at: m.at }),
    from: (r): AdvisorMessage => ({ id: r.id, from: r.from, text: r.text, at: r.at }),
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
      rate: l.rate, icon: l.icon,
    }),
    from: (r): Loan => ({
      id: r.id, name: r.name, lender: r.lender, outstanding: num(r.outstanding),
      principal: num(r.principal), emi: num(r.emi), nextPayment: r.next_payment,
      currency: r.currency, status: r.status, rate: num(r.rate), icon: r.icon,
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
    }),
    from: (r): Doc => ({
      id: r.id, name: r.name, type: r.type, expiry: r.expiry, owner: r.owner, status: r.status, icon: r.icon,
    }),
  },

  notes: {
    to: (n: Note) => ({
      id: n.id, title: n.title, category: n.category, due_date: n.dueDate, status: n.status, done: n.done,
    }),
    from: (r): Note => ({
      id: r.id, title: r.title, category: r.category, dueDate: r.due_date,
      status: r.status, done: Boolean(r.done),
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
  }),
}
