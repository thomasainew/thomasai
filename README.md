# CloudBasket 360 — Your Money. Smarter Life.

Personal and family finance workspace — money, purchases, expenses, income and accounts in one fast app.

**Live:** <https://www.cloudbasket.net> (Vercel, deployed from `main`)

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 7** | Instant HMR, ~4s production builds |
| UI | **React 19 + TypeScript** | Type-safe components, strict mode on |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) | No PostCSS config, CSS-first theme tokens |
| Charts | **Recharts 2** | Responsive donuts, bars and trend lines |
| State | **Zustand + persist** | Tiny store, auto-saves to localStorage |
| Backend | **Supabase** (Postgres + Auth) | 12 RLS-scoped tables, email/password sign-in |
| Routing | **React Router 7** (hash router) | Works from `file://` and any static host |
| Icons | **lucide-react** | Consistent 1.5px stroke icon set |

## Setup

### 1. Create the database tables

Open **Supabase → SQL Editor → New query** and run every migration in
[`supabase/migrations/`](supabase/migrations) **in order**:

| Migration | What it does |
|---|---|
| `0001_init.sql` | The 12 base tables, indexes, `updated_at` triggers and row level security |
| `0002_scope_primary_keys.sql` | Keys become `(user_id, id)`. Without it the **second person to sign up fails** |
| `0003_transaction_purchase_fields.sql` | `store`, `qty`, `warranty_months` on transactions |
| `0004_categories_and_card_cycles.sql` | `categories` + `subcategories` tables, `subcategory` column, card statement days |
| `0005_transaction_weight.sql` | `weight` and `weight_unit` on transactions |

Every policy matches `auth.uid() = user_id`, so a signed-in user can only ever touch their own rows
and the anon key alone reads nothing.

### 2. Point the app at your project

`.env.local` (git-ignored) holds:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Only the **anon** key belongs here. The service_role key bypasses RLS and must never reach the browser.

### 3. Tell Supabase where the app lives

**Supabase → Authentication → URL Configuration.** Confirmation and password-reset emails link to
whatever is set here, so it must match where the app actually runs:

- **Site URL** — `https://www.cloudbasket.net`
- **Redirect URLs** — add `https://www.cloudbasket.net/**`, `https://cloudbasket.net/**` and
  `http://localhost:5180/**` for local work

Leave this at its default and the links in those emails point somewhere the app is not.

### 4. Optional: bill scanning and spending analysis

Set `GEMINI_API_KEY` (or `VITE_GEMINI_API_KEY`) to enable *Scan Bill* and the AI insights panel.
Without it both features hide themselves and everything else works unchanged.

> **The key ships inside the browser bundle.** Vite inlines it at build time, so anyone who loads the
> site can read it — unlike the Supabase anon key, which row level security defends. At minimum,
> restrict it in **Google Cloud Console → Credentials** to HTTP referrers `cloudbasket.net/*` and
> `www.cloudbasket.net/*`. The real fix is to move the call behind a Supabase Edge Function so the key
> stays server-side.

### 5. Sign in

Create an account on the sign-in screen. A new account starts **empty** — add your accounts first,
then income and expenses. Settings → Categories offers a starter category set.

> Without the Supabase env vars the app still runs in **local-only mode** — no sign-in, data persists
> to localStorage. That makes the UI usable before the database exists.

## Run

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # dist/ — static, deploy anywhere
npm run preview  # serve the production build
npm run lint     # tsc type check
```

## Deploying

Vercel builds from `main` and serves <https://www.cloudbasket.net>. Environment variables are set in
**Vercel → Settings → Environment Variables**, and because Vite inlines them at build time a change
only takes effect on the **next deployment** — set the variable, then redeploy.

| Variable | Needed for |
|---|---|
| `VITE_SUPABASE_URL` | Sign-in and cloud sync |
| `VITE_SUPABASE_ANON_KEY` | Sign-in and cloud sync |
| `GEMINI_API_KEY` | Bill scanning and the AI insights panel |

## Features

- **Dashboard** — greeting, AI month plan, 5 KPI cards, income vs expenses, budget progress, spend by person, loan tracker, currency converter, document expiry, notes, savings goals, report shortcuts.
- **Accounts** — banks, cash wallets, credit cards and loan accounts; multi-currency balances rolled up into AED; balance-mix donut; add / edit / delete.
- **Income** — totals vs target, category donut, per-account split, monthly trend, full transaction ledger.
- **Expenses** — same ledger engine, plus payment-method breakdown and budget status.
- **Purchases** — purchase management: Planned → Ordered → Delivered → Returned, warranty months, per-store and per-category analysis.
- **Budget** — inline-editable category budgets, budget vs actual chart, spending overview, monthly period settings.
- **Loans** — outstanding, EMI, interest rate, repayment progress, record-a-payment, overdue alerts, multi-currency (AED + INR).
- **People** — who you spend on, who owes you, who you owe; click a person for their transactions.
- **Bills & Subscriptions** — due dates, autopay toggles, mark-paid, recurring totals.
- **Documents** — Emirates ID, visa, licence, mulkiya…; live expiry status and day counters.
- **Notes & Follow Up** — categorised to-dos with status and overdue tracking.
- **Price Tracker** — watchlist with previous/current/target prices; editing the current price keeps the old one for comparison.
- **Shopping Assistant** — build a list, see the total before you go, budget-aware suggestions.
- **Savings Goals** — targets, contributions, required monthly saving.
- **Reports** — monthly summary, category, loan, document-expiry and notes reports + CSV export.
- **Calendar** — every transaction, EMI, bill, expiry and note on a month grid.
- **Settings** — profile, targets, FX rates, JSON backup / restore / reset.

## Data flow

The Zustand store stays the single source of truth for the UI. Every mutation updates local state
immediately, then writes through to Postgres in the background — the UI never blocks on the network, and
a failed write surfaces in the user menu and on Settings rather than being silently lost.

```
page → store action → optimistic set()  → UI updates now
                    → upsert/delete     → Postgres (RLS-scoped)
```

On sign-in the app pulls all twelve tables in parallel, or seeds them if the account is new.
**Settings → Cloud Sync** exposes manual *Push to Cloud* / *Pull from Cloud* for when you want to force
either direction. `src/lib/mappers.ts` maps camelCase domain fields to snake_case columns.

Seed data lives in `src/data/seed.ts` (September 2026, AED base with INR at 0.0434). **Settings → Export**
writes a JSON backup; **Reset** restores the seed set.

## Structure

```
src/
  components/     Layout, Sidebar, Topbar, shared modals, LedgerPage
    ui/           Card, StatCard, Badge, Progress, Modal primitives
    charts/       Recharts wrappers (Donut, bars, trend line)
  pages/          One file per route
  store/          Zustand store with CRUD for every entity
  lib/            format.ts (money, dates) · selectors.ts (all derived totals)
  data/seed.ts    Demo dataset + FX rates
  types.ts        Domain types
supabase/
  migrations/     0001_init.sql — tables, indexes, triggers, RLS policies
```

## Security notes

- Only the anon key is bundled. RLS makes it useless without a session.
- `.env.local` is git-ignored; `.env.example` documents the shape.
- If a service_role key is ever exposed, rotate it in **Supabase → Settings → API**.
