// Build-time SEO: static public pages, sitemap.xml, robots.txt, and full meta +
// structured data in the root page. Search engines read static HTML far more
// reliably than a page that only exists after JavaScript runs, so the public
// marketing pages are generated as plain HTML from seo.config.json.
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

type Page = { path: string; title: string; description: string; changefreq?: string; priority?: string; ogTitle?: string; ogDescription?: string; ogImage?: string }
interface Cfg {
  siteName: string; baseUrl: string; locale?: string; ogImage: string; twitterHandle?: string
  googleVerification?: string; bingVerification?: string
  pages: Record<'home' | 'features' | 'security' | 'faq', Page>
  faqs: { q: string; a: string }[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const json = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c')

const FEATURES: { title: string; body: string }[] = [
  { title: 'Bank-style account cards', body: 'Bank accounts, cash, credit cards and loans as realistic cards. Card debt and available credit are shown apart, and account numbers are always masked.' },
  { title: 'Balances that cannot drift', body: 'Every balance is the opening balance plus its transactions and transfers, so editing or deleting a record updates everything and every device agrees.' },
  { title: 'Loans, EMIs and repayments', body: 'Link a loan to its loan account, separate borrowing, spending borrowed money and repayment, and split each EMI into principal and interest.' },
  { title: 'Receipts grouped by shop', body: 'One entry per supermarket receipt that opens to its items, while every item stays searchable for reports and price tracking.' },
  { title: 'Automatic price tracker', body: 'Each purchased item builds a dated price history. Compare price per kilogram, litre or unit, and see increases in money and percent over any period.' },
  { title: 'Shopping assistant', body: 'Search everything you have bought, plan quantities, estimate the total and get monthly needs suggested from your own history.' },
  { title: 'Monthly profit & loss', body: 'Income minus expenses for you or the whole household, with drill-down, month-on-month comparison, print, PDF and Excel export.' },
  { title: 'Smart monthly budget', body: 'Builds each month from EMIs, bills, payment schedules, document renewals and notes — approving suggestions, never inventing amounts.' },
  { title: 'Assets, property and gold', body: 'Track property, vehicles, electronics, investments and gold by your ownership share, with valuation history and clearly labelled estimates.' },
  { title: 'Family users', body: 'A separate login for each family member, with per-section and per-account permissions enforced in the database.' },
]

const SECURITY: { title: string; body: string }[] = [
  { title: 'Sign-in only', body: 'There is no public sign-up. Every account is created by the owner, and the app shows nothing until you sign in.' },
  { title: 'Permissions enforced in the database', body: 'What each family member may view or edit is checked by the database on every request. Hiding a menu is never the only protection.' },
  { title: 'Private file storage', body: 'Documents and photos are kept in a private bucket and opened through short-lived links, only for people with permission.' },
  { title: 'No financial data to advertisers', body: 'Analytics and advertising pixels run on public pages only, after consent where required. Dashboards, transactions, documents and family profiles are never sent to them.' },
  { title: 'Your data stays yours', body: 'Rows are scoped to your account. You can export a full backup at any time.' },
]

export function seoPlugin(): Plugin {
  const cfg: Cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'seo.config.json'), 'utf8'))
  const base = cfg.baseUrl.replace(/\/$/, '')
  const url = (p: string) => (p === '/' ? `${base}/` : `${base}${p}`)
  const image = (p: Page) => ((p.ogImage || cfg.ogImage).startsWith('http') ? p.ogImage || cfg.ogImage : base + (p.ogImage || cfg.ogImage))

  const head = (p: Page, extra = '') => `
    <title>${esc(p.title)}</title>
    <meta name="description" content="${esc(p.description)}" />
    <link rel="canonical" href="${url(p.path)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    ${cfg.googleVerification ? `<meta name="google-site-verification" content="${esc(cfg.googleVerification)}" />` : ''}
    ${cfg.bingVerification ? `<meta name="msvalidate.01" content="${esc(cfg.bingVerification)}" />` : ''}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(cfg.siteName)}" />
    <meta property="og:locale" content="${esc(cfg.locale ?? 'en_US')}" />
    <meta property="og:title" content="${esc(p.ogTitle || p.title)}" />
    <meta property="og:description" content="${esc(p.ogDescription || p.description)}" />
    <meta property="og:url" content="${url(p.path)}" />
    <meta property="og:image" content="${image(p)}" />
    <meta name="twitter:card" content="summary_large_image" />
    ${cfg.twitterHandle ? `<meta name="twitter:site" content="${esc(cfg.twitterHandle)}" />` : ''}
    <meta name="twitter:title" content="${esc(p.ogTitle || p.title)}" />
    <meta name="twitter:description" content="${esc(p.ogDescription || p.description)}" />
    <meta name="twitter:image" content="${image(p)}" />${extra}`

  const orgLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${base}/#org`, name: cfg.siteName, url: `${base}/`, logo: `${base}/favicon.svg` },
      { '@type': 'WebSite', '@id': `${base}/#site`, url: `${base}/`, name: cfg.siteName, publisher: { '@id': `${base}/#org` } },
      {
        '@type': 'SoftwareApplication', name: cfg.siteName, applicationCategory: 'FinanceApplication', operatingSystem: 'Web',
        url: `${base}/`, description: cfg.pages.home.description, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  }
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: cfg.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
  const crumb = (name: string, p: string) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: cfg.siteName, item: `${base}/` }, { '@type': 'ListItem', position: 2, name, item: url(p) }] })

  const nav = `<nav><a href="/">Sign in</a><a href="/features">Features</a><a href="/security">Security</a><a href="/faq">FAQ</a></nav>`
  const shell = (p: Page, h1: string, lead: string, body: string, ld: unknown) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#1f6bff" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" />${head(p, `\n    <script type="application/ld+json">${json(ld)}</script>`)}
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:linear-gradient(160deg,#eef5ff,#fff 60%)}
header{display:flex;flex-wrap:wrap;gap:12px 28px;align-items:center;justify-content:space-between;max-width:960px;margin:0 auto;padding:20px 20px 0}
.brand{font-weight:800;font-size:20px;color:#0b1b6b;text-decoration:none}.brand b{color:#1f6bff}
nav{display:flex;gap:20px;flex-wrap:wrap}nav a{color:#334155;text-decoration:none;font-weight:500}nav a:hover{color:#1f6bff}
main{max-width:960px;margin:0 auto;padding:40px 20px 64px}h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:0 0 12px;color:#0b1b6b;letter-spacing:-.02em}
.lead{font-size:18px;color:#334155;max-width:640px;margin:0 0 32px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;box-shadow:0 8px 24px -16px rgba(37,99,235,.25)}.card h2,.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:#475569;font-size:15px}
details{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:12px}summary{cursor:pointer;font-weight:700}details p{margin:10px 0 0;color:#475569}
.cta{display:inline-block;margin-top:32px;background:linear-gradient(#2d8bff,#0b5cf0);color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:12px}
footer{max-width:960px;margin:0 auto;padding:0 20px 40px;color:#64748b;font-size:13px}
</style></head><body>
<header><a class="brand" href="/">CloudBasket <b>360</b></a>${nav}</header>
<main><h1>${esc(h1)}</h1><p class="lead">${esc(lead)}</p>${body}<a class="cta" href="/">Sign in to CloudBasket 360</a></main>
<footer>© ${new Date().getFullYear()} ${esc(cfg.siteName)} · <a href="${base}/">${base.replace('https://', '')}</a></footer></body></html>`

  const cards = (items: { title: string; body: string }[]) => `<div class="grid">${items.map((i) => `<div class="card"><h2>${esc(i.title)}</h2><p>${esc(i.body)}</p></div>`).join('')}</div>`

  return {
    name: 'cloudbasket-seo',

    // Root page: meta tags, structured data, and readable content inside #root
    // (React replaces it on load) so crawlers see real text, not an empty shell.
    transformIndexHtml(html) {
      const p = cfg.pages.home
      const fallback = `<main style="max-width:720px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif"><h1>${esc(cfg.siteName)}</h1><p>${esc(p.description)}</p>${nav}</main>`
      return html
        .replace('<!--seo-head-->', head(p, `\n    <script type="application/ld+json">${json(orgLd)}</script>`))
        .replace('<!--seo-root-->', fallback)
    },

    generateBundle() {
      const emit = (fileName: string, source: string) => this.emitFile({ type: 'asset', fileName, source })

      emit('features/index.html', shell(cfg.pages.features, 'Everything your household money needs', cfg.pages.features.description, cards(FEATURES), crumb('Features', '/features')))
      emit('security/index.html', shell(cfg.pages.security, 'Privacy & security by design', cfg.pages.security.description, cards(SECURITY), crumb('Security', '/security')))
      emit('faq/index.html', shell(cfg.pages.faq, 'Frequently asked questions', cfg.pages.faq.description, cfg.faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join(''), faqLd))

      const today = new Date().toISOString().slice(0, 10)
      const urls = (Object.values(cfg.pages) as Page[])
        .map((p) => `  <url><loc>${url(p.path)}</loc><lastmod>${today}</lastmod><changefreq>${p.changefreq ?? 'monthly'}</changefreq><priority>${p.priority ?? '0.5'}</priority></url>`)
        .join('\n')
      emit('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
      emit('robots.txt', `User-agent: *\nAllow: /\n\n# The app itself sits behind sign-in and is not indexable content.\nSitemap: ${base}/sitemap.xml\n`)
    },
  }
}
