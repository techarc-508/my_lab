import { useState, useEffect } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { audioEngine } from '../../services/audioEngine'
import { Clock } from 'lucide-react'

const PRESETS = [
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: 'End', ms: -1 },
]

export default function SleepTimer() {
  const [open, setOpen] = useState(false)
  const sleepEnd = usePlayerStore(s => s.sleepEnd)
  const setSleepEnd = usePlayerStore(s => s.setSleepEnd)
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!sleepEnd) { setRemaining(''); return }
    const id = setInterval(() => {
      const diff = sleepEnd - Date.now()
      if (diff <= 0) { setSleepEnd(null); setRemaining(''); audioEngine.pause(); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [sleepEnd, setSleepEnd])

  const handlePreset = (ms: number) => {
    setOpen(false)
    if (ms === -1) return
    setSleepEnd(Date.now() + ms)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 text-[10px] ${sleepEnd ? 'text-pink-400' : 'text-text-muted'} hover:text-white`}>
        <Clock size={12} />
        {remaining || 'Sleep'}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 bg-surface-deep border border-border-subtle/50 rounded-lg p-2 shadow-xl z-50">
          <div className="flex gap-1">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => handlePreset(p.ms)}
                className="px-2 py-1 text-[10px] rounded bg-surface-card hover:bg-pink-500/20 hover:text-pink-300">
                {p.label}
              </button>
            ))}
          </div>
          {sleepEnd && (
            <button onClick={() => { setSleepEnd(null); setOpen(false) }}
              className="w-full text-[10px] text-red-400/60 hover:text-red-400 mt-1">
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
