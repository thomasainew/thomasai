import defaults from '../../seo.config.json'
import { db, hasSupabase } from '@/lib/supabase'

export interface PageSeo { path: string; title: string; description: string; changefreq?: string; priority?: string; ogTitle?: string; ogDescription?: string; ogImage?: string }
export interface SeoConfig {
  siteName: string
  baseUrl: string
  locale?: string
  ogImage: string
  twitterHandle?: string
  contactEmail?: string
  googleVerification?: string
  bingVerification?: string
  pages: Record<'home' | 'features' | 'security' | 'faq', PageSeo>
  faqs: { q: string; a: string }[]
}

export interface AnalyticsConfig {
  ga4?: string
  gtm?: string
  metaPixel?: string
  googleAdsId?: string
  googleAdsLabel?: string
  tiktok?: string
  linkedin?: string
  clarity?: string
  bingUet?: string
  /** When true nothing loads until the visitor accepts. */
  consentRequired: boolean
}

export const DEFAULT_SEO = defaults as unknown as SeoConfig
export const DEFAULT_ANALYTICS: AnalyticsConfig = { consentRequired: true }

/** Ids are pasted by a person and end up inside script URLs — accept only the exact shapes each service uses. */
export const ID_RULES: Record<Exclude<keyof AnalyticsConfig, 'consentRequired'>, { label: string; re: RegExp; example: string }> = {
  ga4: { label: 'Google Analytics 4', re: /^G-[A-Z0-9]{4,}$/, example: 'G-XXXXXXXXXX' },
  gtm: { label: 'Google Tag Manager', re: /^GTM-[A-Z0-9]{4,}$/, example: 'GTM-XXXXXXX' },
  metaPixel: { label: 'Meta Pixel', re: /^\d{5,20}$/, example: '123456789012345' },
  googleAdsId: { label: 'Google Ads conversion ID', re: /^AW-\d{5,}$/, example: 'AW-123456789' },
  googleAdsLabel: { label: 'Google Ads conversion label', re: /^[\w-]{4,}$/, example: 'AbC-D_efGh' },
  tiktok: { label: 'TikTok Pixel', re: /^[A-Z0-9]{8,}$/, example: 'C1234567890ABCDEF' },
  linkedin: { label: 'LinkedIn Insight partner ID', re: /^\d{4,}$/, example: '1234567' },
  clarity: { label: 'Microsoft Clarity', re: /^[a-z0-9]{6,}$/, example: 'abcd1234ef' },
  bingUet: { label: 'Microsoft Advertising (UET)', re: /^\d{5,}$/, example: '12345678' },
}

export function validId(key: keyof typeof ID_RULES, v?: string) {
  return !v || ID_RULES[key].re.test(v.trim())
}

/**
 * Public marketing settings. Read by ANYONE (the login page needs them before
 * sign-in), so the table holds only ids and text meant to be public. Falls back
 * to the bundled seo.config.json when the table is missing or empty.
 */
export async function loadSiteConfig(): Promise<{ seo: SeoConfig; analytics: AnalyticsConfig }> {
  const out = { seo: DEFAULT_SEO, analytics: DEFAULT_ANALYTICS }
  if (!hasSupabase) return out
  try {
    const { data } = await db().from('site_config').select('seo, analytics').order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (data) {
      out.seo = { ...DEFAULT_SEO, ...(data.seo ?? {}), pages: { ...DEFAULT_SEO.pages, ...(data.seo?.pages ?? {}) } }
      out.analytics = { ...DEFAULT_ANALYTICS, ...(data.analytics ?? {}) }
    }
  } catch { /* table not created yet — the bundled defaults are fine */ }
  return out
}

export async function saveSiteConfig(userId: string, seo: SeoConfig, analytics: AnalyticsConfig) {
  const { error } = await db().from('site_config').upsert({ user_id: userId, seo, analytics, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Update <title>, description, canonical and social tags for the page being shown. */
export function applySeoToDocument(seo: SeoConfig, page: keyof SeoConfig['pages'] = 'home') {
  const p = seo.pages[page]
  const url = seo.baseUrl.replace(/\/$/, '') + (p.path === '/' ? '/' : p.path)
  const image = (p.ogImage || seo.ogImage).startsWith('http') ? p.ogImage || seo.ogImage : seo.baseUrl.replace(/\/$/, '') + (p.ogImage || seo.ogImage)
  document.title = p.title
  const set = (sel: string, attr: string, key: string, value: string) => {
    let el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(sel)
    if (!el) {
      el = document.createElement(sel.startsWith('link') ? 'link' : 'meta') as any
      el!.setAttribute(attr, key)
      document.head.appendChild(el!)
    }
    el!.setAttribute(sel.startsWith('link') ? 'href' : 'content', value)
  }
  set('meta[name="description"]', 'name', 'description', p.description)
  set('link[rel="canonical"]', 'rel', 'canonical', url)
  set('meta[property="og:title"]', 'property', 'og:title', p.ogTitle || p.title)
  set('meta[property="og:description"]', 'property', 'og:description', p.ogDescription || p.description)
  set('meta[property="og:url"]', 'property', 'og:url', url)
  set('meta[property="og:image"]', 'property', 'og:image', image)
  set('meta[name="twitter:title"]', 'name', 'twitter:title', p.ogTitle || p.title)
  set('meta[name="twitter:description"]', 'name', 'twitter:description', p.ogDescription || p.description)
  set('meta[name="twitter:image"]', 'name', 'twitter:image', image)
  if (seo.googleVerification) set('meta[name="google-site-verification"]', 'name', 'google-site-verification', seo.googleVerification)
  if (seo.bingVerification) set('meta[name="msvalidate.01"]', 'name', 'msvalidate.01', seo.bingVerification)
}

/** Keep the signed-in app out of search results; the public pages stay indexable. */
export function setRobots(index: boolean) {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (!el) {
    el = document.createElement('meta')
    el.name = 'robots'
    document.head.appendChild(el)
  }
  el.content = index ? 'index,follow' : 'noindex,nofollow'
}
