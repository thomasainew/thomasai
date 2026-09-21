# CloudBasket 360 — Your Money. Smarter Life.

Personal and family finance, household shopping and asset management in one private, cloud-synced app.

**Live:** <https://www.cloudbasket.net> (Vercel, deployed from `main`)

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 7, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, CSS-variable themes (light/dark, 6 colours, 3 card styles) |
| State | Zustand, persisted locally, written through to Supabase |
| Backend | Supabase — Postgres + Auth + Storage + one Edge Function |
| Charts / export | Recharts · `write-excel-file` (real `.xlsx`, loaded on demand) |
| Routing | React Router 7, hash routes for the app; static HTML for public pages |

## Setup

### 1. Database — run every migration in order

**Supabase → SQL Editor → New query**, run each file in [`supabase/migrations/`](supabase/migrations) in order.
`0015_cloudbasket360_v2.sql` is the current one. It is **additive** (nothing is dropped or rewritten) and safe
to re-run.

| Migration | Adds |
|---|---|
| `0001`–`0014` | Base tables, per-user keys, categories, transfers, budgets, advisor personas… |
| `0015_cloudbasket360_v2.sql` | Opening balances, credit limits, bank styles · transaction kinds (refund, asset purchase), receipts, brand / pack size · interest & fees on transfers · loan ↔ loan-account link · assets, valuations, gold rates · smart-budget items and note payment schedules · document files · **family users with row-level permissions** · private storage bucket · public `site_config` |

> The app detects whether 0015 has been applied (`public.schema_info`). Until it has, it keeps working in a
> compatibility mode (old columns only) and shows a "Database update needed" notice, so deploying the code
> before running the migration is safe. Themes, gold rates, files, family users and the like need 0015.

### 2. Family-user edge function

Creating a login needs the service-role key, which must never reach a browser, so it lives in
[`supabase/functions/family-admin`](supabase/functions/family-admin/index.ts):

```bash
supabase functions deploy family-admin      # SUPABASE_URL / SERVICE_ROLE_KEY are provided automatically
```

The function verifies the caller from their token, refuses anyone who is themselves a family member, and only
touches members belonging to that owner.

### 3. Environment

`.env.local` (git-ignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Only the **anon** key belongs here.
`GEMINI_API_KEY` (optional) enables bill scanning, AI insights and the advisor. In **Authentication → URL
Configuration** set Site URL `https://www.cloudbasket.net` and add `https://www.cloudbasket.net/**` and
`http://localhost:5180/**` to the redirect URLs.

### 4. Run

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # dist/ — the app + static public pages + sitemap.xml + robots.txt
npm test           # 100+ accounting / pricing / budget / P&L / gold checks (plain Node)
npm run test:rls   # runs the real migrations in an in-process Postgres and tests family permissions
```

## How the money is calculated

Balances are **never stored and nudged**. Every balance is `opening balance + everything in the ledger`
(`src/lib/ledger.ts`), so editing or deleting a transaction, or using two devices, cannot make it drift.

* Cash / bank: income and refunds in, expenses out. Cards and loans hold **what you owe** as a positive number.
* A **card purchase** raises debt and is counted once; paying the card is a **transfer** that lowers card debt and
  the paying account — never a second expense.
* A **loan** links to its loan account. Borrowing and loan-funded spending raise the debt; a repayment splits into
  **principal** (lowers debt, not an expense) and **interest / fees** (expenses).
* **Transfers** (including wife → husband) are one linked record: money out of one account, into another. Never
  income or expense.
* **Refunds** credit the account and reverse spending — they are not income. **Asset purchases** move cash but are
  not household expenses.
* **Net worth** = owned assets (cash & bank + your ownership share of each asset) − card debt − loan debt, each
  counted once. Unused credit limits are not money you own.
* Accounts made before opening balances existed get an implied opening balance (nothing visibly changes) and a
  **Balance check** banner asks you to confirm each one — that is how the "AED 0 − AED 2,000 should be −AED 2,000"
  drift is corrected without silently rewriting money.

## Features

Dashboard with personal status & summary · bank-style account cards (FAB, ENBD, ADCB, HDFC, SBI…) · loans linked to
loan accounts with EMI split · expenses grouped **one per receipt** · automatic **price tracker** (per kg / litre /
unit, dated history, merge duplicates) · **shopping assistant** (search everything bought, plan quantities, estimate
with stale-price warnings, monthly needs from history) · **Expense Report** with combined filters, grouping,
sorting and printing · **Monthly P&L** with drill-down, comparison, print / PDF / Excel · **Smart Monthly Budget**
built from EMIs, bills, payment schedules, document expiry and notes · **payment schedules** in Notes & Follow-ups ·
documents with private cloud upload, preview, download and links · **Assets & Properties** by ownership share with
valuation history · **gold valuation** (weight × purity × rate) · **Family Advisor** with your profile · family users
with permissions · themes · SEO & analytics.

## Deploying

Pushing to `main` deploys to Vercel. Vite inlines environment variables at build time, so change them in
**Vercel → Settings → Environment Variables** and redeploy. `vercel.json` provides clean URLs
(`/features`, `/security`, `/faq`) and cache / security headers.

## SEO and analytics

Public pages only: the sign-in landing, `/features`, `/security`, `/faq`. `vite.seo.ts` generates their static HTML,
`sitemap.xml`, `robots.txt`, canonical URLs, Open Graph / Twitter tags and JSON-LD from
[`seo.config.json`](seo.config.json); **Settings → SEO & Analytics** edits that (download the file, replace it, redeploy).
The signed-in app is marked `noindex`. Analytics / ad pixels (GA4, GTM, Meta, Google Ads, TikTok, LinkedIn, Clarity,
Bing UET) load only on public pages, after consent where required, once per event, and stop the moment someone signs in —
nothing from the app is ever sent to them. Indexing takes time and rankings are never guaranteed.

## External services

| Service | Used for | Credentials |
|---|---|---|
| Supabase | Database, auth, storage, edge function | anon key in env; service role only inside the edge function |
| Gemini | Bill scanning, insights, advisor | `GEMINI_API_KEY` (optional) |
| gold-api.com + open.er-api.com | Live gold and USD/INR (keyless) | none — **estimate**: spot × USD/INR + an assumed import-duty %. Enter a manual rate for a jeweller's / IBJA figure |
| open.er-api.com | Exchange rates on request | none |

## Security notes

- Only the anon key is bundled; row level security makes it useless without a session.
- Family permissions (per section and per account) are enforced **in the database**, verified by `npm run test:rls`.
- Files live in a private bucket under `<owner id>/…` and open through short-lived signed links.
- If a service-role key is ever exposed, rotate it in **Supabase → Settings → API**.
