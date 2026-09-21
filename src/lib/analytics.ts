// Analytics and advertising pixels — public pages only.
//
//  * Loads nothing until consent is given when the config says consent is required.
//  * Each script loads once and each event fires once (no duplicate tracking).
//  * Runs only while the visitor is on the public pages: stopAnalytics() is called
//    the moment someone signs in, and the signed-in app never sends anything, so
//    balances, transactions, documents and family data cannot reach these services.
import { validId, type AnalyticsConfig } from '@/lib/siteConfig'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...a: unknown[]) => void
    fbq?: (...a: unknown[]) => void
    ttq?: { track: (n: string, p?: unknown) => void; page: () => void }
    _linkedin_data_partner_ids?: string[]
    clarity?: (...a: unknown[]) => void
    uetq?: unknown[]
    [k: `ga-disable-${string}`]: boolean | undefined
  }
}

const loaded = new Set<string>()
const fired = new Set<string>()
let cfg: AnalyticsConfig | null = null
let stopped = false

function script(src: string, id: string) {
  if (loaded.has(id)) return
  loaded.add(id)
  const s = document.createElement('script')
  s.async = true
  s.src = src
  s.dataset.cb = id
  document.head.appendChild(s)
}

export const CONSENT_KEY = 'cloudbasket360-consent'
export const readConsent = (): 'granted' | 'denied' | null => {
  try { return (localStorage.getItem(CONSENT_KEY) as 'granted' | 'denied' | null) ?? null } catch { return null }
}
export const saveConsent = (v: 'granted' | 'denied') => { try { localStorage.setItem(CONSENT_KEY, v) } catch { /* ignore */ } }

/** Does this visitor still need to be asked? */
export const needsConsentPrompt = (c: AnalyticsConfig) => hasAnyService(c) && c.consentRequired && readConsent() === null

export function hasAnyService(c: AnalyticsConfig) {
  return Boolean(c.ga4 || c.gtm || c.metaPixel || c.googleAdsId || c.tiktok || c.linkedin || c.clarity || c.bingUet)
}

/** Start the configured services, if allowed. Safe to call repeatedly. */
export function startAnalytics(c: AnalyticsConfig) {
  cfg = c
  stopped = false
  if (!hasAnyService(c)) return
  if (c.consentRequired && readConsent() !== 'granted') return
  if (navigator.doNotTrack === '1') return

  // Google (GA4 and Ads share gtag)
  const gid = (c.ga4 && validId('ga4', c.ga4) && c.ga4) || (c.googleAdsId && validId('googleAdsId', c.googleAdsId) && c.googleAdsId) || ''
  if (gid) {
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function () { (window.dataLayer as unknown[]).push(arguments) }
    script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gid)}`, `gtag-${gid}`)
    if (!loaded.has('gtag-init')) {
      loaded.add('gtag-init')
      window.gtag('js', new Date())
      // Only page-level info; never send the hash route or anything from the signed-in app.
      if (c.ga4 && validId('ga4', c.ga4)) window.gtag('config', c.ga4, { send_page_view: true, page_location: location.origin + location.pathname, anonymize_ip: true })
      if (c.googleAdsId && validId('googleAdsId', c.googleAdsId)) window.gtag('config', c.googleAdsId)
    }
  }

  if (c.gtm && validId('gtm', c.gtm) && !loaded.has('gtm')) {
    loaded.add('gtm')
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
    script(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(c.gtm)}`, 'gtm-js')
  }

  if (c.metaPixel && validId('metaPixel', c.metaPixel) && !loaded.has('meta')) {
    loaded.add('meta')
    const w = window as any
    if (!w.fbq) {
      const n: any = (w.fbq = function (...a: unknown[]) { n.callMethod ? n.callMethod.apply(n, a) : n.queue.push(a) })
      if (!w._fbq) w._fbq = n
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
    }
    script('https://connect.facebook.net/en_US/fbevents.js', 'meta-js')
    window.fbq!('init', c.metaPixel)
    window.fbq!('track', 'PageView')
  }

  if (c.tiktok && validId('tiktok', c.tiktok) && !loaded.has('tiktok')) {
    loaded.add('tiktok')
    const w = window as any
    const t: any = (w.ttq = w.ttq || [])
    t.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']
    t.setAndDefer = (o: any, m: string) => { o[m] = function (...a: unknown[]) { o.push([m, ...a]) } }
    for (const m of t.methods) t.setAndDefer(t, m)
    t._i = t._i || {}
    t._i[c.tiktok] = []
    t._t = t._t || {}
    t._t[c.tiktok] = +new Date()
    script(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(c.tiktok)}&lib=ttq`, 'tiktok-js')
    t.page()
  }

  if (c.linkedin && validId('linkedin', c.linkedin) && !loaded.has('linkedin')) {
    loaded.add('linkedin')
    window._linkedin_data_partner_ids = [...(window._linkedin_data_partner_ids ?? []), c.linkedin]
    script('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'linkedin-js')
  }

  if (c.clarity && validId('clarity', c.clarity) && !loaded.has('clarity')) {
    loaded.add('clarity')
    const w = window as any
    w.clarity = w.clarity || function (...a: unknown[]) { (w.clarity.q = w.clarity.q || []).push(a) }
    script(`https://www.clarity.ms/tag/${encodeURIComponent(c.clarity)}`, 'clarity-js')
  }

  if (c.bingUet && validId('bingUet', c.bingUet) && !loaded.has('uet')) {
    loaded.add('uet')
    window.uetq = window.uetq || []
    script(`https://bat.bing.com/bat.js`, 'uet-js')
  }
}

/** Marketing events only. `key` makes an event fire at most once per page load. */
export type MarketingEvent = 'lead' | 'sign_up' | 'view_features'

export function trackEvent(name: MarketingEvent, key = name) {
  if (stopped || !cfg || fired.has(key)) return
  if (cfg.consentRequired && readConsent() !== 'granted') return
  fired.add(key)

  if (cfg.ga4 && window.gtag) window.gtag('event', name === 'lead' ? 'generate_lead' : name === 'sign_up' ? 'sign_up' : 'view_item_list', { method: 'website' })
  if (cfg.googleAdsId && cfg.googleAdsLabel && window.gtag && name !== 'view_features') window.gtag('event', 'conversion', { send_to: `${cfg.googleAdsId}/${cfg.googleAdsLabel}` })
  if (cfg.metaPixel && window.fbq) window.fbq('track', name === 'lead' ? 'Lead' : name === 'sign_up' ? 'CompleteRegistration' : 'ViewContent')
  if (cfg.tiktok && window.ttq) window.ttq.track(name === 'lead' ? 'SubmitForm' : name === 'sign_up' ? 'CompleteRegistration' : 'ViewContent')
  if (cfg.gtm) (window.dataLayer = window.dataLayer || []).push({ event: `cb_${name}` })
}

/** Called on sign-in: stop sending anything, and tell each service to stand down. */
export function stopAnalytics() {
  stopped = true
  if (cfg?.ga4) window[`ga-disable-${cfg.ga4}`] = true
  if (window.gtag && cfg?.googleAdsId) window.gtag('consent', 'update', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  if (window.fbq) window.fbq('consent', 'revoke')
  window.ttq?.track && (window as any).ttq.disableCookie?.()
}
