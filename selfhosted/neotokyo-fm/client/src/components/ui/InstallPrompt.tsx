import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { storageGet, storageSet } from '../../utils/storage'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [showIOS, setShowIOS] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const deferredRef = useRef<any>(null)

  useEffect(() => {
    if (isStandalone()) return

    const handler = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (isStandalone() || dismissed) return
    if (storageGet<boolean>('install-dismissed', false)) return

    const visits = storageGet<number>('visit-count', 0) + 1
    storageSet('visit-count', visits)

    const plays = storageGet<number>('play-count', 0)
    if (plays >= 2 || visits >= 2) {
      const timer = setTimeout(() => setShow(true), 2000)
      return () => clearTimeout(timer)
    }
  }, [dismissed])

  const handleInstall = async () => {
    if (isIOS()) {
      setShow(false)
      setShowIOS(true)
      return
    }
    const prompt = deferredRef.current
    if (!prompt) return
    prompt.prompt()
    const result = await prompt.userChoice
    if (result.outcome === 'accepted') {
      setShow(false)
      storageSet('install-dismissed', true)
    }
    deferredRef.current = null
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShow(false)
    setShowIOS(false)
    setDismissed(true)
    storageSet('install-dismissed', true)
  }

  if (showIOS) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-surface-raised border border-border-default/50 rounded-2xl p-6 shadow-glow-neon animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-hot-pink to-purple flex items-center justify-center text-white text-[10px] font-black">N</div>
              <span className="text-sm font-sans font-bold text-content-primary">Install NEOTOKYO FM</span>
            </div>
            <button onClick={handleDismiss} className="text-content-tertiary hover:text-content-primary"><X size={16} /></button>
          </div>
          <p className="text-xs text-content-secondary mb-4 font-body">iOS requires manual add to home screen:</p>
          <ol className="text-xs text-content-secondary space-y-2 list-decimal list-inside font-body">
            <li>Tap <span className="text-content-primary font-medium">Share</span> <span className="text-lg">⎙</span> in Safari</li>
            <li>Scroll and tap <span className="text-content-primary font-medium">Add to Home Screen</span></li>
            <li>Tap <span className="text-content-primary font-medium">Add</span></li>
          </ol>
          <button onClick={handleDismiss}
            className="mt-4 w-full py-2 rounded-xl bg-white/5 text-content-secondary text-xs hover:bg-white/10 font-body">
            Got it
          </button>
        </div>
      </div>
    )
  }

  if (!show) return null

  const canInstall = !!deferredRef.current

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-surface-raised border border-neon-pink/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(255,0,126,0.15),0_0_60px_rgba(58,134,255,0.1)]">
        <button onClick={handleDismiss} className="absolute top-3 right-3 text-content-tertiary hover:text-content-primary">
          <X size={16} />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-hot-pink to-purple flex items-center justify-center text-white text-2xl font-black mb-3 shadow-lg shadow-hot-pink/30">
            <svg viewBox="0 0 512 512" className="w-10 h-10">
              <rect x="64" y="112" width="384" height="288" rx="24" fill="#252445" stroke="#fff" strokeWidth="16"/>
              <rect x="96" y="144" width="320" height="160" rx="12" fill="#1b1a30" stroke="#ff006e" strokeWidth="8"/>
              <rect x="144" y="224" width="224" height="64" rx="32" fill="#0d0c1d" stroke="#fff" strokeWidth="4"/>
              <circle cx="192" cy="256" r="20" fill="none" stroke="#fff" strokeWidth="4"/>
              <circle cx="192" cy="256" r="8" fill="#ff006e"/>
              <circle cx="320" cy="256" r="20" fill="none" stroke="#fff" strokeWidth="4"/>
              <circle cx="320" cy="256" r="8" fill="#ff006e"/>
            </svg>
          </div>
          <h3 className="text-base font-sans font-bold text-content-primary tracking-tight">Install NEOTOKYO FM</h3>
          <p className="text-xs text-content-secondary mt-1 font-body max-w-[260px]">
            Install as an app for the full experience — works offline, opens fullscreen, and feels like a native player.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {canInstall ? (
            <button onClick={handleInstall}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-hot-pink to-purple text-white text-xs font-bold tracking-wider uppercase hover:brightness-110 active:brightness-90 transition-all shadow-lg shadow-hot-pink/20">
              Install Now
            </button>
          ) : (
            <button disabled
              className="w-full py-2.5 rounded-xl bg-white/5 text-content-tertiary text-xs font-bold tracking-wider uppercase cursor-not-allowed">
              {isIOS() ? 'Available via Safari Share' : 'Open in Chrome / Edge to install'}
            </button>
          )}
          <button onClick={handleDismiss}
            className="w-full py-2 text-xs text-content-tertiary hover:text-content-primary font-body transition-colors">
            Not now
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-center gap-3 text-[9px] text-content-tertiary font-body">
          <span>Windows</span>
          <span className="text-white/10">•</span>
          <span>macOS</span>
          <span className="text-white/10">•</span>
          <span>Android</span>
          <span className="text-white/10">•</span>
          <span>iOS</span>
        </div>
      </div>
    </div>
  )
}
