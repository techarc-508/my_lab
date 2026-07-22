import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { storageGet, storageSet } from '../../utils/storage'

const PLAY_THRESHOLD = 3
const VISIT_THRESHOLD = 2

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

  useEffect(() => {
    if (isStandalone() || dismissed) return

    const visits = storageGet<number>('visit-count', 0) + 1
    storageSet('visit-count', visits)

    const plays = storageGet<number>('play-count', 0)
    const hasMetCriteria = plays >= PLAY_THRESHOLD || visits >= VISIT_THRESHOLD
    if (hasMetCriteria) {
      const alreadyInstalled = storageGet<boolean>('install-prompted', false)
      if (!alreadyInstalled) {
        setShow(true)
        storageSet('install-prompted', true)
      }
    }
  }, [dismissed])

  useEffect(() => {
    if (!show) return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [show])

  const handleInstall = async () => {
    if (isIOS()) {
      setShow(false)
      setShowIOS(true)
      return
    }
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShow(false)
    setShowIOS(false)
    setDismissed(true)
  }

  if (showIOS) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 bg-surface-raised border border-border-default/50 rounded-xl p-4 shadow-glow-combo animate-slide-up">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs font-body text-content-primary font-medium">Add to Home Screen</p>
          <button onClick={handleDismiss} className="text-content-tertiary hover:text-content-primary transition-colors">
            <X size={14} />
          </button>
        </div>
        <ol className="text-[10px] font-body text-content-secondary space-y-1.5 list-decimal list-inside">
          <li>Tap the <span className="text-content-primary font-medium">Share</span> button in Safari</li>
          <li>Scroll down and tap <span className="text-content-primary font-medium">Add to Home Screen</span></li>
          <li>Tap <span className="text-content-primary font-medium">Add</span> to confirm</li>
        </ol>
        <button onClick={handleDismiss}
          className="mt-3 text-[10px] font-body text-content-tertiary hover:text-content-primary transition-colors px-2 py-1">
          Got it
        </button>
      </div>
    )
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-surface-raised border border-border-default/50 rounded-xl p-4 shadow-glow-combo animate-slide-up">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-body text-content-primary">Install NEOTOKYO FM for the best experience</p>
        <button onClick={handleDismiss} className="text-content-tertiary hover:text-content-primary transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleInstall}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-[10px] font-body tracking-[1px] uppercase hover:brightness-110 active:brightness-90 transition-all">
          <Download size={12} /> Install
        </button>
        <button onClick={handleDismiss}
          className="text-[10px] font-body text-content-tertiary hover:text-content-primary transition-colors px-2 py-1">
          Not now
        </button>
      </div>
    </div>
  )
}
