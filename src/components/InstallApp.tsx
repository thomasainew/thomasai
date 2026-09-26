import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

/** Chrome/Edge/Samsung Internet's install prompt event (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The prompt can fire before React mounts, so catch it as early as this module loads.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** "Install app" button — hidden once the app is installed or when the browser can't install it. */
export function InstallAppButton({ className = '' }: { className?: string }) {
  const [, force] = useState(0)
  const [iosHelp, setIosHelp] = useState(false)

  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])

  if (isStandalone()) return null
  const ios = isIos()
  if (!deferred && !ios) return null

  const install = async () => {
    if (!deferred) return setIosHelp(true)
    await deferred.prompt()
    await deferred.userChoice.catch(() => null)
    deferred = null
    force((n) => n + 1)
  }

  return (
    <>
      <button
        onClick={install}
        className={`h-10 px-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 text-[12.5px] font-semibold inline-flex items-center gap-1.5 hover:bg-brand-100 cursor-pointer ${className}`}
        title="Install CloudBasket on this device"
      >
        <Download size={15} /> <span className="hidden sm:inline">Install app</span>
      </button>
      <Modal open={iosHelp} onClose={() => setIosHelp(false)} title="Install on iPhone / iPad" subtitle="Add CloudBasket to your Home Screen">
        <ol className="space-y-3 text-[13px] text-slate-700">
          <li className="flex items-start gap-2.5">
            <span className="h-6 w-6 shrink-0 rounded-full bg-brand-50 text-brand-700 grid place-items-center text-[12px] font-bold">1</span>
            <span>Open this page in <b>Safari</b>, then tap the <b>Share</b> button <Share size={14} className="inline -mt-0.5" /> at the bottom of the screen.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-6 w-6 shrink-0 rounded-full bg-brand-50 text-brand-700 grid place-items-center text-[12px] font-bold">2</span>
            <span>Scroll down and tap <b>Add to Home Screen</b> <SquarePlus size={14} className="inline -mt-0.5" />.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-6 w-6 shrink-0 rounded-full bg-brand-50 text-brand-700 grid place-items-center text-[12px] font-bold">3</span>
            <span>Tap <b>Add</b>. CloudBasket then opens full-screen from its own icon, like any other app.</span>
          </li>
        </ol>
      </Modal>
    </>
  )
}

/** Register the service worker in production builds. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* the app works without it */ })
  })
}
