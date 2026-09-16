import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('card', className)}>{children}</div>
}

export function CardHead({
  title,
  right,
  sub,
}: {
  title: string
  sub?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h3 className="card-title leading-tight">{title}</h3>
        {sub && <p className="text-[11.5px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
      View All <ChevronRight size={14} />
    </Link>
  )
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
}

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={cx('chip', TONES[tone] ?? TONES.slate)}>{children}</span>
}

export function statusTone(status: string) {
  const s = status.toLowerCase()
  if (['paid', 'valid', 'on track', 'active', 'done', 'delivered', 'yes'].includes(s)) return 'green'
  if (['overdue', 'expired', 'returned'].includes(s)) return 'red'
  if (['due soon', 'expiring soon', 'pending', 'ordered'].includes(s)) return 'amber'
  if (['in progress', 'available', 'planned'].includes(s)) return 'blue'
  return 'slate'
}

export function Progress({
  value,
  max = 100,
  color = '#3b82f6',
  height = 8,
}: {
  value: number
  max?: number
  color?: string
  height?: number
}) {
  const p = Math.min(100, Math.max(0, max ? (value / max) * 100 : 0))
  return (
    <div className="w-full rounded-full bg-slate-100 overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${p}%`, background: color }}
      />
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  tint = '#3b82f6',
  footer,
}: {
  label: string
  value: string
  icon: ReactNode
  tint?: string
  footer?: ReactNode
}) {
  return (
    <div className="card p-4 flex items-start gap-2.5 hover:-translate-y-0.5 transition-transform duration-200">
      <div
        className="h-9 w-9 shrink-0 rounded-xl grid place-items-center"
        style={{ background: `${tint}1a`, color: tint }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-500 truncate" title={label}>
          {label}
        </p>
        <p className="text-[clamp(15px,1.35vw,20px)] font-extrabold tracking-tight text-slate-900 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
          {value}
        </p>
        {footer && <div className="mt-1.5 text-[10.5px] leading-snug">{footer}</div>}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer',
        checked ? 'bg-brand-600' : 'bg-slate-200',
      )}
    >
      <span
        className={cx(
          // left-0.5 pins the resting position explicitly — without it the
          // browser falls back to a static-position guess for this
          // absolutely positioned knob, which can land far enough right
          // that translate-x-5 pushes it past the switch into whatever
          // sits next to it.
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}

export function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center text-[13px] text-slate-400">{text}</div>
}

export function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('animate-fade-up', className)}>{children}</div>
}
