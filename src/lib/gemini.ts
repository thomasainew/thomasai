/**
 * Gemini API client — receipt and document scanning, statement import,
 * spending analysis, natural-language entry and category suggestion.
 *
 * SECURITY: the key ships in the browser bundle, so anyone who can open the
 * app can read it and spend against your quota. That is acceptable for a
 * personal build; before putting this anywhere public, move the calls behind a
 * Supabase Edge Function and keep the key server-side. At minimum, restrict the
 * key to your own domain in Google Cloud Console.
 *
 * QUOTA: the free tier is counted per project *per model per day* — around 20
 * requests a day for a full flash model. Light, frequent work therefore runs on
 * a separate lite model, which both costs less and draws on its own allowance.
 */
import type { Purchase } from '@/types'

const KEY_RAW = __GEMINI_API_KEY__
const KEY = KEY_RAW || undefined
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Vision and reasoning: scanning, statements, analysis, questions. */
const MODEL = __GEMINI_MODEL__ || 'gemini-3.6-flash'
/** Short, frequent text calls: categorising one line, parsing one sentence. */
const FAST_MODEL = __GEMINI_FAST_MODEL__ || 'gemini-3.1-flash-lite'

export const hasGemini = Boolean(KEY)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Google returns how long to wait in a RetryInfo detail, e.g. "5.5s". Honour
 * it — the free tier allows only a handful of requests per minute, and a
 * shorter fixed backoff just burns the remaining attempts.
 */
function retryDelayMs(error: any, attempt: number) {
  const info = (error?.details ?? []).find((d: any) => String(d['@type'] ?? '').endsWith('RetryInfo'))
  const seconds = Number(String(info?.retryDelay ?? '').replace('s', ''))
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000 + 250, 30_000)
  return (attempt + 1) * 1500
}

/** Turn Google's wording into something a user can act on. */
function friendlyError(status: number, message: string, error?: any) {
  if (status === 429) {
    const violation = (error?.details ?? [])
      .flatMap((d: any) => d.violations ?? [])
      .find((v: any) => v?.quotaId)
    const perDay = String(violation?.quotaId ?? '').includes('PerDay')
    if (perDay) {
      return `Gemini's free daily limit for this model (${violation?.quotaValue ?? 'a few'} requests) is used up. It resets tomorrow, or you can enable billing on the Google Cloud project for a much higher limit.`
    }
    return 'Gemini is rate limiting — only a few requests a minute are allowed on the free tier. Wait a moment and try again.'
  }
  if (status === 503) return 'Gemini is busy right now. Try again in a moment.'
  if (status === 400 && /API key/i.test(message)) return 'That Gemini API key was rejected. Check GEMINI_API_KEY.'
  return message
}

export class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'GeminiError'
  }
}

interface CallOptions {
  parts: unknown[]
  schema?: unknown
  model?: string
  temperature?: number
  signal?: AbortSignal
  /** Retries cost quota; skip them for optional, best-effort calls. */
  retries?: number
}

/**
 * One request to Gemini, returning the parsed JSON body of the reply.
 * 503 (overloaded) and 429 (rate limited) are retried using Google's own hint.
 */
async function callGemini<T>({ parts, schema, model, temperature = 0, signal, retries = 2 }: CallOptions): Promise<T> {
  if (!KEY) throw new GeminiError('No Gemini API key — set GEMINI_API_KEY (or VITE_GEMINI_API_KEY) and rebuild.', 0)

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature,
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
  }

  let lastError = ''
  let lastStatus = 0

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${ENDPOINT}/${model ?? MODEL}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

    if (res.ok) {
      const json = await res.json()
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new GeminiError('Gemini returned an empty reply.', 200)
      if (!schema) return text as T
      try {
        return JSON.parse(text) as T
      } catch {
        throw new GeminiError('Gemini returned a reply that could not be read.', 200)
      }
    }

    const detail = await res.json().catch(() => null)
    lastStatus = res.status
    lastError = friendlyError(res.status, detail?.error?.message ?? `Request failed (${res.status})`, detail?.error)

    if (res.status !== 503 && res.status !== 429) break
    // A daily cap will not clear by waiting a few seconds.
    if (lastError.includes('daily limit')) break
    if (attempt < retries) await sleep(retryDelayMs(detail?.error, attempt))
  }

  throw new GeminiError(lastError || 'Gemini could not be reached.', lastStatus)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Strip the `data:*;base64,` prefix a FileReader data URL carries. */
const toBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1)

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

const filePart = (dataUrl: string, mimeType: string) => ({
  inline_data: { mime_type: mimeType, data: toBase64(dataUrl) },
})

/** Categories the model may choose from — kept in step with the expense form. */
export const PURCHASE_CATEGORIES = [
  'Electronics', 'Furniture', 'Appliances', 'Groceries', 'Kids',
  'Automotive', 'Business', 'Clothing', 'Health', 'Other',
] as const

const CURRENCY_ENUM = ['AED', 'INR', 'USD']
const METHOD_ENUM = ['Bank Transfer', 'Cash', 'Card', 'Credit Card', 'Cheque', 'Auto Debit', 'Online']

// ---------------------------------------------------------------------------
// Receipt scanning
// ---------------------------------------------------------------------------

export interface ScannedItem {
  /** Item / product code printed on the line, e.g. "002064". */
  itemCode?: string
  item: string
  /** Manufacturer or brand printed on the line, e.g. "Al Ain", "Nestle". */
  brand?: string
  category: string
  /** Finer item group, e.g. "Frozen Chicken", "Dairy". */
  itemGroup?: string
  /** Unit of measure the line is sold in: CTN, PCS, KG… */
  uom?: string
  qty: number
  /** Unit price (per UOM) BEFORE VAT, in the receipt's own currency. */
  price: number
  /** Inner packs per UOM: the 20 in "20 × 450 g". */
  packCount?: number
  /** Size of one inner pack: the 450 in "20 × 450 g". */
  packSize?: number
  packUnit?: string
  /** VAT rate for this line, in percent. */
  vatRate?: number
  /** True when part of the line was unreadable or ambiguous. */
  uncertain?: boolean
}

export interface ScannedBill {
  store: string
  /** Receipt or invoice number, if the receipt shows one. */
  invoiceNumber?: string
  branch?: string
  salesperson?: string
  date: string
  currency: Purchase extends { currency: infer C } ? C : string
  /** VAT/tax amount printed as its own line, if any. */
  vat?: number
  total: number
  items: ScannedItem[]
}

const BILL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    store: { type: 'STRING', description: 'Supplier, shop or merchant name' },
    invoiceNumber: { type: 'STRING', description: 'Receipt or invoice number printed on the bill, if any. Omit if absent.' },
    branch: { type: 'STRING', description: 'Customer branch / delivery location printed on the invoice, if any. Omit if absent.' },
    salesperson: { type: 'STRING', description: 'Supplier salesperson name printed on the invoice, if any. Omit if absent.' },
    date: { type: 'STRING', description: 'Purchase date as yyyy-MM-dd' },
    currency: { type: 'STRING', enum: CURRENCY_ENUM },
    vat: { type: 'NUMBER', description: 'Total VAT/tax amount on the bill, if shown. Omit if not shown.' },
    total: { type: 'NUMBER', description: 'Grand total paid, including tax' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          itemCode: { type: 'STRING', description: 'Item/product code printed on the line. Omit if absent.' },
          item: { type: 'STRING' },
          brand: { type: 'STRING', description: 'Manufacturer or brand name printed on the line, e.g. "Al Ain", "Nestle". Omit if not visible.' },
          category: { type: 'STRING', enum: PURCHASE_CATEGORIES as unknown as string[] },
          itemGroup: { type: 'STRING', description: 'Short item group, e.g. "Frozen Chicken", "Dairy", "Sauces & Condiments".' },
          uom: { type: 'STRING', description: 'Unit of measure the qty is counted in, e.g. CTN, BOX, PKT, PCS, KG, BTL.' },
          qty: { type: 'NUMBER' },
          price: { type: 'NUMBER', description: 'Unit price per UOM BEFORE VAT: pre-VAT line amount divided by qty' },
          packCount: { type: 'NUMBER', description: 'Inner packs per UOM, e.g. 20 for "20 x 450g". Omit if absent.' },
          packSize: { type: 'NUMBER', description: 'Size of one inner pack, e.g. 450 for "20 x 450g", 10 for "Rice 10kg". Omit if absent.' },
          packUnit: { type: 'STRING', enum: ['g', 'kg', 'ml', 'L', 'pcs'] },
          vatRate: { type: 'NUMBER', description: 'VAT percent applied to this line, e.g. 5. 0 if exempt.' },
          uncertain: { type: 'BOOLEAN', description: 'true if any value on this line was hard to read or guessed' },
        },
        required: ['item', 'category', 'qty', 'price'],
      },
    },
  },
  required: ['store', 'date', 'currency', 'total', 'items'],
}

const BILL_PROMPT = `You are reading a shopping receipt, supplier invoice or delivery note.

Extract every purchased line item. Rules:
- price is the UNIT price per UOM BEFORE VAT: if a line shows a total for
  several units, divide by qty. If only VAT-inclusive prices are printed,
  remove the VAT using the line's VAT rate.
- itemCode is the product/item code printed on the line, exactly as printed
  (keep leading zeros). Omit when the line has none.
- uom is the unit the qty counts: CTN for cartons, PCS, KG, BOX, PKT, BTL…
- Pack details are part of the item's identity. "20 x 450g" is packCount 20,
  packSize 450, packUnit g. "Basmati Rice 10kg" is packSize 10, packUnit kg
  with no packCount. Never convert, round or estimate a size not written down.
- vatRate is the VAT percent for the line (UAE standard is 5). Use 0 for a
  zero-rated or exempt line.
- brand is the manufacturer or brand name printed on the line (e.g. "Al Ain",
  "Nestle"). Only report one if it is actually printed.
- itemGroup is a short, human item group such as "Frozen Chicken",
  "Frozen Foods", "Dairy", "Oils & Vinegar".
- Set uncertain true on any line where a value was unreadable or ambiguous.
- Skip subtotal, discount and rounding lines — items only.
- date must be yyyy-MM-dd. Receipts are usually DD/MM/YYYY; read the day first
  unless that gives an impossible month.
- If the currency is unclear, infer it from the merchant's country; default AED.
- If a field is genuinely unreadable, use an empty string for text and 0 for
  numbers. Never invent a value.`

export async function scanBill(dataUrl: string, mimeType: string, signal?: AbortSignal): Promise<ScannedBill> {
  const parsed = await callGemini<ScannedBill>({
    parts: [{ text: BILL_PROMPT }, filePart(dataUrl, mimeType)],
    schema: BILL_SCHEMA,
    signal,
  })
  return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] }
}

// ---------------------------------------------------------------------------
// Spending analysis
// ---------------------------------------------------------------------------

export type InsightKind = 'warning' | 'watch' | 'good'

export interface Insight {
  kind: InsightKind
  title: string
  detail: string
  /** The figure the point rests on, e.g. "AED 2,400 over budget". */
  metric?: string
  /** One concrete thing to do about it. */
  action?: string
}

export interface Analysis {
  headline: string
  outlook: string
  insights: Insight[]
  generatedAt: string
}

const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING', description: 'One sentence on what is happening with spending right now.' },
    outlook: { type: 'STRING', description: 'Where the month ends up if the current rate continues. Cite the projected figure.' },
    insights: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['warning', 'watch', 'good'] },
          title: { type: 'STRING', description: 'Six words or fewer.' },
          detail: { type: 'STRING', description: 'One or two sentences, citing the actual numbers.' },
          metric: { type: 'STRING', description: 'The key figure, formatted with its currency.' },
          action: { type: 'STRING', description: 'One concrete step. Omit for good news.' },
        },
        required: ['kind', 'title', 'detail'],
      },
    },
  },
  required: ['headline', 'outlook', 'insights'],
}

const ANALYSIS_PROMPT = `You are a careful personal finance analyst reviewing one month of a
single person's own records. The JSON below is their real data.

Produce:
- headline: one sentence on what is actually happening with their spending.
- outlook: what the month looks like at this rate. Use projectedSpend and say
  plainly whether it lands over or under budget, and by how much.
- insights: between 3 and 6 points. Include at least one "good" when the data
  supports one, and mark genuine problems "warning". Use "watch" for things
  that are not yet a problem but are heading that way.

Rules that matter:
- Every claim must come from the numbers given. Cite them. Never invent a
  figure, a category or a merchant that is not in the data.
- Amounts are already in the base currency; write them with that currency code.
- daysElapsed of daysInMonth have passed. Early in a month a high projection is
  less certain — say so rather than alarming them over three days of data.
- If income is 0 they may simply not have recorded it yet. Do not conclude they
  have no income; note the gap instead.
- A category with no budget set is not overspending, it is unbudgeted.
- Be specific and brief. No generic advice like "make a budget" or "track your
  spending" — they already are. No greetings, no filler, no emoji.
- Address them as "you".`

export async function analyseFinances(snapshot: unknown, signal?: AbortSignal): Promise<Analysis> {
  const parsed = await callGemini<Analysis>({
    parts: [{ text: `${ANALYSIS_PROMPT}\n\nDATA:\n${JSON.stringify(snapshot)}` }],
    schema: ANALYSIS_SCHEMA,
    temperature: 0.2,
    signal,
  })
  return {
    headline: parsed.headline ?? '',
    outlook: parsed.outlook ?? '',
    insights: Array.isArray(parsed.insights) ? parsed.insights.filter((i) => i && i.title) : [],
    generatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Category suggestion (fallback for descriptions history has never seen)
// ---------------------------------------------------------------------------

export interface CategoryGuess {
  category: string
  subcategory?: string
  confidence: number
}

const GUESS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', description: 'Must be copied exactly from the allowed list.' },
    subcategory: { type: 'STRING', description: 'Only from the sub-categories of the chosen category. Omit if unsure.' },
    confidence: { type: 'NUMBER', description: '0 to 1.' },
  },
  required: ['category', 'confidence'],
}

/**
 * Place one description into the user's categories.
 * Returns null rather than throwing — history covers most cases and the field
 * stays editable, so a failed suggestion is not worth interrupting anyone for.
 */
export async function suggestCategory(
  description: string,
  options: { name: string; subcategories: string[] }[],
  examples: { description: string; category: string; subcategory?: string }[],
  signal?: AbortSignal,
): Promise<CategoryGuess | null> {
  if (!KEY || !description.trim() || !options.length) return null

  const prompt = `Classify one expense description into exactly one of the allowed categories.

ALLOWED CATEGORIES (copy the name exactly):
${JSON.stringify(options)}

${examples.length ? `HOW THIS PERSON HAS LABELLED THINGS BEFORE:\n${JSON.stringify(examples)}\n` : ''}
DESCRIPTION: ${JSON.stringify(description)}

Pick the single best category. Add a sub-category only if one clearly fits and
it belongs to the category you chose. Never invent a name that is not listed.
Set confidence honestly: below 0.5 when the description is too vague to place.`

  try {
    const parsed = await callGemini<CategoryGuess>({
      parts: [{ text: prompt }],
      schema: GUESS_SCHEMA,
      model: FAST_MODEL,
      retries: 0,
      signal,
    })
    const allowed = options.find((o) => o.name.toLowerCase() === String(parsed.category).toLowerCase())
    if (!allowed) return null
    const sub = parsed.subcategory
      ? allowed.subcategories.find((x) => x.toLowerCase() === String(parsed.subcategory).toLowerCase())
      : undefined
    return { category: allowed.name, subcategory: sub, confidence: Number(parsed.confidence) || 0 }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Natural-language entry
// ---------------------------------------------------------------------------

export interface QuickEntry {
  description: string
  amount: number
  currency?: string
  date?: string
  category?: string
  subcategory?: string
  store?: string
  person?: string
  method?: string
  type: 'expense' | 'income'
}

const QUICK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING', enum: ['expense', 'income'] },
    description: { type: 'STRING', description: 'Short label for the entry, e.g. "Groceries".' },
    amount: { type: 'NUMBER' },
    currency: { type: 'STRING', enum: CURRENCY_ENUM },
    date: { type: 'STRING', description: 'yyyy-MM-dd, resolved from words like yesterday.' },
    category: { type: 'STRING', description: 'Exactly one of the allowed categories.' },
    subcategory: { type: 'STRING' },
    store: { type: 'STRING', description: 'Merchant, if one is named.' },
    person: { type: 'STRING', description: 'Only if one of the known people is named.' },
    method: { type: 'STRING', enum: METHOD_ENUM },
  },
  required: ['type', 'description', 'amount'],
}

/** Turn "240 at carrefour on groceries yesterday" into fields for the form. */
export async function parseQuickEntry(
  text: string,
  context: { today: string; currency: string; categories: { name: string; subcategories: string[] }[]; people: string[] },
  signal?: AbortSignal,
): Promise<QuickEntry> {
  const prompt = `Turn one line of natural language into a single money entry.

TODAY IS ${context.today}. Resolve "today", "yesterday", "last Friday" against it,
and never return a date in the future unless the text clearly states one.
DEFAULT CURRENCY: ${context.currency}. Only change it if the text names another.
ALLOWED CATEGORIES: ${JSON.stringify(context.categories)}
KNOWN PEOPLE: ${JSON.stringify(context.people)}

INPUT: ${JSON.stringify(text)}

Rules:
- type is "income" only for money coming in (salary, refund, payment received).
  Everything else is an expense.
- amount is a positive number, never negative.
- description is a short human label, not the raw sentence.
- category must be copied exactly from the allowed list; omit it if nothing fits.
- Only set person when one of the known people is actually named.
- Only set store when a merchant is named.
- Omit any field the text does not support. Never guess an amount.`

  const parsed = await callGemini<QuickEntry>({
    parts: [{ text: prompt }],
    schema: QUICK_SCHEMA,
    model: FAST_MODEL,
    signal,
  })

  if (!(Number(parsed.amount) > 0)) {
    throw new GeminiError('No amount found — try something like "240 groceries at Carrefour yesterday".', 200)
  }
  return { ...parsed, amount: Number(parsed.amount) }
}


// ---------------------------------------------------------------------------
// Bank / card statement import
// ---------------------------------------------------------------------------

export interface StatementRow {
  date: string
  description: string
  /** Always positive; `direction` says which way the money went. */
  amount: number
  direction: 'debit' | 'credit'
  balance?: number
}

export interface ParsedStatement {
  /** Account name or masked number printed on the statement. */
  account?: string
  currency?: string
  periodStart?: string
  periodEnd?: string
  rows: StatementRow[]
}

const STATEMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    account: { type: 'STRING', description: 'Account name or masked number on the statement.' },
    currency: { type: 'STRING', enum: CURRENCY_ENUM },
    periodStart: { type: 'STRING', description: 'yyyy-MM-dd' },
    periodEnd: { type: 'STRING', description: 'yyyy-MM-dd' },
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'yyyy-MM-dd' },
          description: { type: 'STRING', description: 'Merchant or narration, tidied but not invented.' },
          amount: { type: 'NUMBER', description: 'Positive value of the movement.' },
          direction: { type: 'STRING', enum: ['debit', 'credit'] },
          balance: { type: 'NUMBER', description: 'Running balance if the statement shows one.' },
        },
        required: ['date', 'description', 'amount', 'direction'],
      },
    },
  },
  required: ['rows'],
}

const STATEMENT_PROMPT = `You are reading a bank or credit card statement.

Extract EVERY transaction row, in the order they appear. For each:
- date as yyyy-MM-dd. Statements are usually DD/MM/YYYY — read the day first
  unless that gives an impossible month. If a row shows both a transaction date
  and a posting date, use the transaction date.
- description: the merchant or narration, tidied of padding and reference codes
  but never invented. Keep the merchant name.
- amount: always POSITIVE.
- direction: "debit" for money leaving the account (purchases, withdrawals,
  fees, card spending) and "credit" for money arriving (salary, refunds,
  transfers in, payments to a card).

Rules that matter:
- On a CREDIT CARD statement, a purchase is a debit and a payment you made to
  the card is a credit. Do not flip them.
- Skip opening and closing balance lines, sub-totals, headers repeated on each
  page, and any interest-rate or summary boxes. Rows only.
- Do not merge or split rows, and do not deduplicate — return them exactly as
  printed, even when two rows look identical.
- If the year is missing from a row, take it from the statement period.
- Return an empty rows array if this is not a statement.`

/**
 * Read a statement into rows. Accepts a PDF or an image; CSV and other text
 * should be passed through `parseStatementText` instead.
 */
export async function parseStatement(
  dataUrl: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<ParsedStatement> {
  const parsed = await callGemini<ParsedStatement>({
    parts: [{ text: STATEMENT_PROMPT }, filePart(dataUrl, mimeType)],
    schema: STATEMENT_SCHEMA,
    signal,
  })
  return { ...parsed, rows: Array.isArray(parsed.rows) ? parsed.rows : [] }
}

/** Same, for CSV or plain-text exports where column layouts vary by bank. */
export async function parseStatementText(text: string, signal?: AbortSignal): Promise<ParsedStatement> {
  const prompt = `${STATEMENT_PROMPT}

The statement below is delimited text exported from a bank. Work out which
columns hold the date, the narration and the amount. Some banks use separate
debit and credit columns; others use one signed column where a negative number
means money left the account.

STATEMENT:
${text}`

  const parsed = await callGemini<ParsedStatement>({
    parts: [{ text: prompt }],
    schema: STATEMENT_SCHEMA,
    signal,
  })
  return { ...parsed, rows: Array.isArray(parsed.rows) ? parsed.rows : [] }
}

// ---------------------------------------------------------------------------
// Identity / insurance document scanning
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  'Identity', 'Immigration', 'Vehicle', 'Insurance', 'Business', 'Education', 'Medical', 'Other',
] as const

export interface ScannedDocument {
  name: string
  type: string
  /** yyyy-MM-dd. Empty when the document shows no expiry. */
  expiry: string
  owner?: string
  /** Issue date if printed, for context only. */
  issued?: string
}

const DOCUMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'What the document is, e.g. "Emirates ID", "Passport", "Vehicle Registration".' },
    type: { type: 'STRING', enum: DOCUMENT_TYPES as unknown as string[] },
    expiry: { type: 'STRING', description: 'Expiry as yyyy-MM-dd. Empty string if none is shown.' },
    owner: { type: 'STRING', description: 'Name of the holder as printed.' },
    issued: { type: 'STRING', description: 'Issue date as yyyy-MM-dd, if printed.' },
  },
  required: ['name', 'type', 'expiry'],
}

const DOCUMENT_PROMPT = `You are reading an identity, vehicle, insurance or licence document.

Return:
- name: what the document is called, e.g. "Emirates ID", "Passport",
  "Driving Licence", "Vehicle Registration (Mulkiya)", "Health Insurance Card".
- type: the closest of the allowed types.
- expiry: the EXPIRY date as yyyy-MM-dd. Cards often print several dates —
  choose the one labelled expiry, valid until, or date of expiry, never the
  issue or date of birth. Dates are usually DD/MM/YYYY. If no expiry is shown,
  return an empty string.
- owner: the holder's name exactly as printed, if visible.
- issued: the issue date, if printed.

Read only what is on the document. Never infer an expiry from an issue date or
from a typical validity period. If a date is unreadable, return an empty string.`

/** Read the key fields off a photo of a document. */
export async function scanDocument(
  dataUrl: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<ScannedDocument> {
  return callGemini<ScannedDocument>({
    parts: [{ text: DOCUMENT_PROMPT }, filePart(dataUrl, mimeType)],
    schema: DOCUMENT_SCHEMA,
    signal,
  })
}

// ---------------------------------------------------------------------------
// Free-text questions about your own money
// ---------------------------------------------------------------------------

export interface AskTurn {
  question: string
  answer: string
}

/**
 * Answer a question from the facts pack alone.
 *
 * Returns prose rather than JSON — the answers are read, not parsed, and a
 * schema would only make them stilted.
 */
export async function askMoney(
  question: string,
  facts: unknown,
  history: AskTurn[] = [],
  signal?: AbortSignal,
): Promise<string> {
  const prior = history
    .slice(-4)
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join('\n\n')

  const prompt = `You answer questions about one person's own financial records.
Everything you know is in the DATA below. Today is included there.

${prior ? `EARLIER IN THIS CONVERSATION:\n${prior}\n\n` : ''}QUESTION: ${question}

How to answer:
- Use only the DATA. If it does not cover the question — a period before their
  records begin, or a detail that is not there — say so plainly and state what
  you can see instead. Never estimate a number that is not derivable.
- Show the figures you used, with the currency code. Add them up when the
  question spans several months, and say which months you added.
- Two or three sentences. A short list is fine when comparing things.
- No preamble, no restating the question, no advice unless it was asked for.
- Plain text. No markdown headings, no bullets unless listing figures.

DATA:
${JSON.stringify(facts)}`

  const answer = await callGemini<string>({
    parts: [{ text: prompt }],
    temperature: 0.1,
    signal,
  })
  return String(answer).trim()
}

// ---------------------------------------------------------------------------
// AI Advisor — two family-elder personas discussing the same facts pack.
// ---------------------------------------------------------------------------

export interface AdvisorTurn {
  from: 'user' | 'achachan' | 'chachan'
  text: string
}

export interface AdvisorReply {
  achachan: string
  chachan: string
}

/** What the person told us about themselves and their family — applied to every reply. */
export interface AdvisorContext {
  callMeBy?: string
  advisorName?: string
  character?: string
  preferences?: string
  familyNeeds?: string
  goals?: string
  responseStyle?: string
}

/** The personal-profile block for a prompt, or '' when nothing has been filled in. */
export function profileBlock(c?: AdvisorContext): string {
  if (!c) return ''
  const lines = [
    c.callMeBy && `Call the person: ${c.callMeBy}`,
    c.advisorName && `The person calls you: ${c.advisorName}`,
    c.character && `About the person (character): ${c.character}`,
    c.preferences && `Their preferences: ${c.preferences}`,
    c.familyNeeds && `Family needs: ${c.familyNeeds}`,
    c.goals && `Their goals: ${c.goals}`,
    c.responseStyle && `How they want answers: ${c.responseStyle}`,
  ].filter(Boolean)
  return lines.length ? `WHAT THE PERSON TOLD US ABOUT THEMSELVES (respect it):\n${lines.join('\n')}\n\n` : ''
}

const ADVISOR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    achachan: { type: 'STRING', description: "Achachan's reply. Malayalam only." },
    chachan: { type: 'STRING', description: "Chachan's reply. Malayalam only." },
  },
  required: ['achachan', 'chachan'],
}

/**
 * Two replies to the same message, in two distinct voices, both grounded in
 * the same facts pack — never invent a number, category or merchant that
 * is not in DATA. Malayalam only; code-mixing a Latin name or a number is
 * normal and expected, exactly how a real family chat reads.
 */
export async function askAdvisors(
  message: string,
  facts: unknown,
  history: AdvisorTurn[] = [],
  signal?: AbortSignal,
  /** Free-text customisation per persona, from Train Advisors — added on top of the base character. */
  training?: { achachan?: string; chachan?: string },
  ctx?: AdvisorContext,
): Promise<AdvisorReply> {
  const prior = history
    .slice(-8)
    .map((t) => `${t.from}: ${t.text}`)
    .join('\n')

  const prompt = `You are writing two replies for a personal finance chat app, in the voice of two
different elder family members who both love this person and both know their real
financial records (in DATA below). This is a Malayali family, so both reply in
Malayalam only — no English sentences, though a Latin name, a brand or a number is
fine mixed in, exactly like a real family WhatsApp chat.

ACHACHAN — the grandfather. Warm, gentle, big-picture. He connects money habits to
life outcomes: security, peace of mind, the kind of future being built one habit at
a time. He encourages rather than scolds, and he is proud of real progress when the
DATA shows it.
${training?.achachan ? `Notes from the family on how Achachan specifically talks: ${training.achachan}` : ''}

CHACHAN — a sharp, practical family elder who actually manages money for a living.
Direct and specific. He names the exact category or merchant that is high, cites the
real figures from DATA, and gives one concrete, actionable step — a budget number, an
EMI plan, a saving target. He is caring but does not soften a real problem.
${training?.chachan ? `Notes from the family on how Chachan specifically talks: ${training.chachan}` : ''}

Ground every claim either persona makes in DATA. Never invent a category, merchant or
figure that is not there — if DATA does not cover something, have that persona say so
plainly rather than guess. When a recommendation depends on something essential that
is missing (how many people the household feeds, a dietary need, a target amount), ask
ONE short question instead of assuming. When you do recommend something, say which
records it rests on. Two or three sentences each. No headings, no markdown.

${profileBlock(ctx)}
${prior ? `CONVERSATION SO FAR:\n${prior}\n\n` : ''}THE PERSON'S MESSAGE: ${message}

DATA:
${JSON.stringify(facts)}`

  return callGemini<AdvisorReply>({
    parts: [{ text: prompt }],
    schema: ADVISOR_SCHEMA,
    temperature: 0.5,
    signal,
  })
}


/**
 * Monthly shopping suggestions, shaped by purchase history AND what the family
 * told us (preferences, needs). The quantities come from history and are passed
 * in as DATA — the model may adjust or question them, never invent prices.
 */
export async function askShoppingAdvisor(
  request: string,
  data: unknown,
  ctx?: AdvisorContext,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = `You are a practical household-shopping adviser inside a family finance app.
Use ONLY the purchase history in DATA (items, usual monthly quantities, last known prices and
their dates). Never invent a price. If a price is old (see lastDate), say it is only an estimate.
Fit the suggestions to the family's preferences and needs below. If something essential is
missing (household size, dietary needs, a budget), ask one short question first.
Answer briefly as a plain list of lines: "item — quantity per month — why". No markdown headings.

${profileBlock(ctx)}REQUEST: ${request}

DATA:
${JSON.stringify(data)}`
  const answer = await callGemini<{ answer: string }>({
    parts: [{ text: prompt }],
    schema: { type: 'OBJECT', properties: { answer: { type: 'STRING' } }, required: ['answer'] },
    temperature: 0.3,
    signal,
  })
  return String(answer.answer ?? '').trim()
}

// ---------------------------------------------------------------------------
// AI Employees — configurable named characters with their own role and
// knowledge area (see src/pages/AIEmployees.tsx). Text-only for now: no live
// voice and no live web research, both of which need a provider/key the user
// has not chosen yet — see src/pages/AIEmployees.tsx for that note.
// ---------------------------------------------------------------------------

export interface EmployeePersona {
  name: string
  role: string
  personality?: string
  knowledgeArea?: string
  /** Reply in this language when possible, e.g. 'English', 'Malayalam', 'Arabic', 'Hindi'. */
  language?: string
}

export async function askEmployee(
  employee: EmployeePersona,
  message: string,
  facts: unknown,
  history: AskTurn[] = [],
  signal?: AbortSignal,
): Promise<string> {
  const prior = history.slice(-6).map((t) => `Q: ${t.question}\nA: ${t.answer}`).join('\n\n')
  const prompt = `You are ${employee.name}, ${employee.role}, an AI employee inside a family finance app called
Cloud Basket. ${employee.personality ? `Personality: ${employee.personality}.` : ''} ${employee.knowledgeArea ? `Your knowledge area: ${employee.knowledgeArea}.` : ''}

Ground every figure in the DATA below — this person's own financial records. Never invent a number,
date or fact that is not in DATA or something you are certain of as general knowledge; when asked
about live/current external information (rates, prices, news) that is not in DATA, say plainly that
you do not have live access to it right now, rather than guessing.
${employee.language ? `Reply in ${employee.language} where you reasonably can.` : ''}
Two to four sentences, plain text, no markdown headings.

${prior ? `EARLIER IN THIS CONVERSATION:\n${prior}\n\n` : ''}MESSAGE: ${message}

DATA:
${JSON.stringify(facts)}`

  const answer = await callGemini<string>({ parts: [{ text: prompt }], temperature: 0.2, signal })
  return String(answer).trim()
}
