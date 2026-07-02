import { useState, useEffect } from 'react'

interface Toast { id: number; message: string; type: 'error' | 'success' | 'info' }

let toastId = 0
const listeners: Set<(t: Toast) => void> = new Set()

export function showToast(message: string, type: 'error' | 'success' | 'info' = 'info') {
  const toast: Toast = { id: ++toastId, message, type }
  listeners.forEach(fn => fn(toast))
}

export default function StreamToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts(prev => [...prev.slice(-4), t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000)
    }
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-20 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className={`px-3 py-2 rounded text-xs border ${
          t.type === 'error' ? 'bg-red-900/80 border-red-500/50 text-red-200'
          : t.type === 'success' ? 'bg-green-900/80 border-green-500/50 text-green-200'
          : 'bg-[#1d1e31] border-[#2a2a4a] text-[#e1e0fb]'
        }`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
