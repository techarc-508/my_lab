import { useState, useEffect } from 'react'

const SHORTCUTS = [
  { keys: 'Space', desc: 'Play / Pause' },
  { keys: '← →', desc: 'Seek ±5s' },
  { keys: '↑ ↓', desc: 'Volume ±10%' },
  { keys: '+ / -', desc: 'Volume ±10%' },
  { keys: 'S', desc: 'Toggle Shuffle' },
  { keys: '⇧+S', desc: 'Toggle Scanlines' },
  { keys: 'R', desc: 'Cycle Repeat' },
  { keys: 'M', desc: 'Toggle Mute' },
  { keys: 'E', desc: 'Toggle Equalizer' },
  { keys: 'L', desc: 'Toggle Lyrics' },
  { keys: '?', desc: 'Toggle this cheatsheet' },
  { keys: 'Esc', desc: 'Close overlay / panel' },
  { keys: 'Media keys', desc: 'Play / Prev / Next' },
]

export default function ShortcutCheatsheet() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target as HTMLElement)?.matches('input, textarea, select')) { setOpen(v => !v) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="bg-surface-raised border border-border-default/50 rounded-xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-content-primary mb-4">Keyboard Shortcuts</h3>
        <div className="space-y-2">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="flex justify-between text-xs">
              <span className="text-content-secondary">{s.desc}</span>
              <kbd className="px-1.5 py-0.5 bg-surface-sunken rounded text-brand font-mono border border-border-default/30">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
