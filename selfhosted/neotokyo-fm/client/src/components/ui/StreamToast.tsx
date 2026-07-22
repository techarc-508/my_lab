import { useState, useEffect } from 'react'
import { emit, on } from '../../services/eventBus'

interface Toast { id: number; message: string; type: 'error' | 'success' | 'info' }

let toastId = 0

export function showToast(message: string, type: 'error' | 'success' | 'info' = 'info') {
  emit('admin', 'toast', { id: ++toastId, message, type })
}

export default function StreamToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const unsub = on('admin', 'toast', (_event, data) => {
      const t = data as Toast
      setToasts(prev => [...prev.slice(-4), t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000)
    })
    return unsub
  }, [])

  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-20 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className={`px-3 py-2 rounded text-xs border ${
          t.type === 'error' ? 'bg-red-900/80 border-red-500/50 text-red-200'
          : t.type === 'success' ? 'bg-green-900/80 border-green-500/50 text-green-200'
          : 'bg-surface-card border-border-subtle text-content-secondary'
        }`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
