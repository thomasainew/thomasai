import type { CardStyle, ThemeColor, ThemeMode } from '@/types'

export interface ThemeSettings {
  mode: ThemeMode
  color: ThemeColor
  cardStyle: CardStyle
}

export const DEFAULT_THEME: ThemeSettings = { mode: 'light', color: 'blue', cardStyle: 'soft' }

export const COLOR_SWATCH: Record<ThemeColor, { label: string; from: string; to: string }> = {
  blue: { label: 'Ocean', from: '#3b82f6', to: '#1d4ed8' },
  emerald: { label: 'Emerald', from: '#10b981', to: '#047857' },
  violet: { label: 'Violet', from: '#8b5cf6', to: '#6d28d9' },
  rose: { label: 'Rose', from: '#f43f5e', to: '#be123c' },
  amber: { label: 'Amber', from: '#f59e0b', to: '#b45309' },
  slate: { label: 'Graphite', from: '#64748b', to: '#334155' },
}

const KEY = 'cloudbasket360-theme'

/** Last-used theme on THIS device, so the page never flashes the wrong look before settings load. */
export function readCachedTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) }
  } catch { /* private mode */ }
  return DEFAULT_THEME
}

export function applyTheme(t: ThemeSettings) {
  const dark = t.mode === 'dark' || (t.mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.color = t.color
  root.dataset.cards = t.cardStyle
  root.style.colorScheme = dark ? 'dark' : 'light'
  try { localStorage.setItem(KEY, JSON.stringify(t)) } catch { /* ignore */ }
}

/** The public login page is always light; only the signed-in app follows the theme. */
export function resetTheme() {
  const root = document.documentElement
  root.dataset.theme = 'light'
  root.dataset.color = 'blue'
  root.dataset.cards = 'soft'
  root.style.colorScheme = 'light'
}
