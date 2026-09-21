import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { DEFAULT_THEME, applyTheme, readCachedTheme, resetTheme } from '@/lib/theme'
import { canOpen } from '@/lib/access'
import { Lock } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const theme = useStore((s) => s.settings.extra?.theme)
  const membership = useStore((s) => s.membership)

  // The saved theme (synced across devices) wins; until it loads, use the one cached on this device.
  useEffect(() => {
    applyTheme(theme ? { ...DEFAULT_THEME, ...theme } : readCachedTheme())
    if (theme?.mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme({ ...DEFAULT_THEME, ...theme })
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])
  // Leaving the app (sign-out) returns the page to the always-light public look.
  useEffect(() => () => resetTheme(), [])

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="relative animate-pop">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setOpen(true)} />
        <main key={pathname} className="flex-1 overflow-y-auto scroll-thin p-4 lg:p-6 animate-fade-up">
          {canOpen(membership, pathname) ? (
            <Outlet />
          ) : (
            <div className="card max-w-md mx-auto mt-16 p-8 text-center">
              <Lock size={26} className="mx-auto text-slate-400" />
              <p className="text-[15px] font-bold text-slate-800 mt-3">You don't have access to this section</p>
              <p className="text-[12.5px] text-slate-500 mt-1">Ask the account owner to allow it under Settings → Family Users.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
