import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, CardHead } from '@/components/ui/Primitives'
import { COLOR_SWATCH, DEFAULT_THEME, applyTheme } from '@/lib/theme'
import type { CardStyle, ThemeColor, ThemeMode } from '@/types'

const MODES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Light', icon: Sun }, { key: 'dark', label: 'Dark', icon: Moon }, { key: 'system', label: 'Match device', icon: Monitor },
]
const CARDS: { key: CardStyle; label: string; hint: string }[] = [
  { key: 'soft', label: 'Soft', hint: 'Gentle shadow (default)' },
  { key: 'flat', label: 'Flat', hint: 'Thin outline, no shadow' },
  { key: 'glass', label: 'Glass', hint: 'Frosted, translucent cards' },
]

/**
 * Change the look whenever you like. Only presentation changes — no data is
 * touched — and the choice is saved to your account, so every device follows.
 */
export function AppearanceTab() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const theme = { ...DEFAULT_THEME, ...(settings.extra?.theme ?? {}) }

  const set = (patch: Partial<typeof theme>) => {
    const next = { ...theme, ...patch }
    applyTheme(next) // instant
    updateSettings({ extra: { ...(settings.extra ?? {}), theme: next } }) // saved + synced
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead title="Mode" sub="Light, dark, or follow your device" />
        <div className="px-5 pb-5 grid grid-cols-3 gap-3 max-w-xl">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => set({ mode: key })} className={`rounded-xl border p-4 text-center cursor-pointer transition ${theme.mode === key ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-[#e2e8f0] hover:border-brand-200'}`}>
              <Icon size={20} className="mx-auto text-brand-600" />
              <p className="text-[12.5px] font-bold text-slate-800 mt-2">{label}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Colour theme" sub="Buttons, highlights and charts follow this colour" />
        <div className="px-5 pb-5 flex flex-wrap gap-3">
          {(Object.keys(COLOR_SWATCH) as ThemeColor[]).map((c) => (
            <button key={c} onClick={() => set({ color: c })} className="text-center cursor-pointer group">
              <span className="relative block h-14 w-14 rounded-2xl shadow-md group-hover:scale-105 transition" style={{ background: `linear-gradient(135deg, ${COLOR_SWATCH[c].from}, ${COLOR_SWATCH[c].to})` }}>
                {theme.color === c && <Check size={20} className="absolute inset-0 m-auto text-white" />}
              </span>
              <span className="text-[11px] font-semibold text-slate-600 mt-1.5 block">{COLOR_SWATCH[c].label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Card style" sub="How panels and dashboard cards look" />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
          {CARDS.map((c) => (
            <button key={c.key} onClick={() => set({ cardStyle: c.key })} className={`rounded-xl border p-4 text-left cursor-pointer transition ${theme.cardStyle === c.key ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-[#e2e8f0] hover:border-brand-200'}`}>
              <div className={`h-16 rounded-lg mb-3 ${c.key === 'soft' ? 'bg-white shadow-md border border-[#e8edf5]' : c.key === 'flat' ? 'bg-white border border-slate-300' : 'bg-white/50 backdrop-blur border border-white/70 shadow-lg'}`} style={c.key === 'glass' ? { background: 'linear-gradient(135deg, rgba(59,130,246,.25), rgba(255,255,255,.6))' } : undefined} />
              <p className="text-[13px] font-bold text-slate-800">{c.label}</p>
              <p className="text-[11px] text-slate-400">{c.hint}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => set(DEFAULT_THEME)}>Reset to default</button>
        <p className="text-[11.5px] text-slate-400">Saved to your account and applied on every device you sign in on. Your data is never affected.</p>
      </div>
    </div>
  )
}
